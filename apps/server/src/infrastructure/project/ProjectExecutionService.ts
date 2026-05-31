import { promises as fs } from "node:fs";
import { Buffer } from "node:buffer";
import { dirname, join, relative } from "node:path";
import type {
  HorusProjectConfig,
  ProjectCommandRun,
  ProjectExecutionPlan,
  ShellCommandOutputEvent,
} from "@u-build/shared";
import {
  ProjectCommandRunSchema,
  ProjectExecutionPlanSchema,
} from "@u-build/shared";
import { v4 as uuidv4 } from "uuid";
import { CliCommandPolicy } from "../tools/CliCommandPolicy.js";
import { ExecutionTaskRuntime } from "../tools/ExecutionTaskRuntime.js";
import { looksLikeDependencyFailure } from "./ProjectFailureAnalysisService.js";
import {
  isGitMetadataPath,
  isWritablePath,
  resolveInsideRoot,
} from "./ProjectPathSafety.js";
import {
  assertCodeChangeSetPathHasNoSymlink,
  resolveCodeChangeSetPath,
} from "../code/CodeChangeSetFileOperations.js";

export class ProjectExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectExecutionError";
  }
}

export interface ProjectExecutionResult {
  changedFiles: string[];
  commandRuns: ProjectCommandRun[];
}

export interface ProjectWorkspaceFileSnapshot {
  path: string;
  content: string;
  sizeBytes: number;
}

export interface ProjectWorkspaceContextSnapshot {
  root: string;
  projectStack: string;
  tree: string[];
  files: ProjectWorkspaceFileSnapshot[];
  commandCatalog: Array<{
    id: string;
    label?: string;
    executable: string;
    args: string[];
    cwd: string;
  }>;
  writeRoots: string[];
}

export class ProjectExecutionService {
  async buildWorkspaceContext(input: {
    projectRoot: string;
    config: HorusProjectConfig;
    maxFiles?: number;
    maxBytes?: number;
  }): Promise<ProjectWorkspaceContextSnapshot> {
    const maxFiles = input.maxFiles ?? 24;
    const maxBytes = input.maxBytes ?? 96_000;
    const tree: string[] = [];
    const files: ProjectWorkspaceFileSnapshot[] = [];
    let totalBytes = 0;

    const writeRoots = input.config.writeRoots.includes(".")
      ? ["."]
      : input.config.writeRoots;
    for (const writeRoot of writeRoots) {
      const rootPath = resolveInsideRoot(input.projectRoot, writeRoot);
      await this.collectWorkspaceFiles({
        projectRoot: input.projectRoot,
        currentPath: rootPath,
        tree,
        files,
        maxFiles,
        maxBytes,
        totalBytesRef: () => totalBytes,
        addBytes: (bytes) => {
          totalBytes += bytes;
        },
      });
    }

    return {
      root: input.projectRoot,
      projectStack: input.config.projectStack,
      tree: [...new Set(tree)].sort(),
      files,
      commandCatalog: input.config.commandCatalog.map((command) => ({
        id: command.id,
        ...(command.label ? { label: command.label } : {}),
        executable: command.executable,
        args: command.args,
        cwd: command.cwd,
      })),
      writeRoots: input.config.writeRoots,
    };
  }

  validatePlan(input: {
    roleName: string;
    plan: ProjectExecutionPlan;
    config: HorusProjectConfig;
    projectRoot: string;
  }): void {
    const plan = ProjectExecutionPlanSchema.parse(input.plan);
    const roleProfile = input.config.roleProfiles[input.roleName];
    if (!roleProfile) {
      throw new ProjectExecutionError(`Missing role profile: ${input.roleName}`);
    }

    for (const operation of plan.fileOperations) {
      const targetPath = resolveCodeChangeSetPath(input.projectRoot, operation.path);
      if (isGitMetadataPath(input.projectRoot, targetPath)) {
        throw new ProjectExecutionError(`Refusing to edit git metadata: ${operation.path}`);
      }
      if (!isWritablePath(input.projectRoot, targetPath, input.config.writeRoots)) {
        throw new ProjectExecutionError(
          `File operation is outside writeRoots: ${operation.path}`
        );
      }
      if (operation.operation === "write") {
        const hasText = operation.content != null;
        const hasBase64 =
          operation.contentBase64 != null && operation.contentBase64.length > 0;
        if (hasText === hasBase64) {
          throw new ProjectExecutionError(
            `Write operation must provide exactly one content payload: ${operation.path}`
          );
        }
      }
      if (operation.operation === "delete") {
        if (
          operation.content != null ||
          (operation.contentBase64 != null && operation.contentBase64.length > 0)
        ) {
          throw new ProjectExecutionError(
            `Delete operation must not include content: ${operation.path}`
          );
        }
      }
    }

    for (const request of plan.commandRequests) {
      this.ensureCommandAllowed(input.roleName, request.commandId, input.config);
    }
    for (const commandId of plan.validationCommandIds) {
      this.ensureCommandAllowed(input.roleName, commandId, input.config);
    }
  }

  async executePlan(input: {
    constructionRunId: string;
    assignmentId?: string | null;
    roleName: string;
    plan: ProjectExecutionPlan;
    config: HorusProjectConfig;
    projectRoot: string;
  }): Promise<ProjectExecutionResult> {
    this.validatePlan(input);
    const changedFiles = await this.applyFileOperations({
      projectRoot: input.projectRoot,
      plan: input.plan,
      config: input.config,
    });
    const commandRuns = await this.executeCommandRequests(input);
    return { changedFiles, commandRuns };
  }

  async applyFileOperations(input: {
    projectRoot: string;
    plan: ProjectExecutionPlan;
    config: HorusProjectConfig;
  }): Promise<string[]> {
    const changedFiles: string[] = [];
    for (const operation of input.plan.fileOperations) {
      const targetPath = resolveCodeChangeSetPath(input.projectRoot, operation.path);
      await assertCodeChangeSetPathHasNoSymlink({
        projectRoot: input.projectRoot,
        targetPath,
      });
      if (isGitMetadataPath(input.projectRoot, targetPath)) {
        throw new ProjectExecutionError(`Refusing to edit git metadata: ${operation.path}`);
      }
      if (!isWritablePath(input.projectRoot, targetPath, input.config.writeRoots)) {
        throw new ProjectExecutionError(`Refusing to write outside writeRoots: ${operation.path}`);
      }

      if (operation.operation === "write") {
        await fs.mkdir(dirname(targetPath), { recursive: true });
        if (operation.contentBase64 != null && operation.contentBase64.length > 0) {
          await fs.writeFile(targetPath, Buffer.from(operation.contentBase64, "base64"));
        } else {
          await fs.writeFile(targetPath, operation.content ?? "", "utf-8");
        }
        changedFiles.push(operation.path);
      } else if (operation.operation === "delete") {
        await fs.unlink(targetPath).catch((err) => {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        });
        changedFiles.push(operation.path);
      }
    }
    return [...new Set(changedFiles)].sort();
  }

  async executeCommandRequests(input: {
    constructionRunId: string;
    assignmentId?: string | null;
    roleName: string;
    plan: ProjectExecutionPlan;
    config: HorusProjectConfig;
    projectRoot: string;
    signal?: AbortSignal;
    trace?: {
      traceId?: string | null;
      spanId?: string | null;
      parentSpanId?: string | null;
      toolCallId?: string | null;
      runId?: string | null;
      projectId?: string | null;
      agentId?: string | null;
      filePath?: string | null;
      diffId?: string | null;
    };
    onCommandOutput?: ((event: ShellCommandOutputEvent) => void) | undefined;
  }): Promise<ProjectCommandRun[]> {
    const commandIds = [
      ...input.plan.commandRequests.map((request) => request.commandId),
      ...input.plan.validationCommandIds,
    ];
    const uniqueCommandIds = [...new Set(commandIds)];
    const runner = new ExecutionTaskRuntime({
      policy: new CliCommandPolicy({
        allowedRoot: input.projectRoot,
        allowedExecutables: allowedExecutablesForConfig(input.config),
      }),
      outputBaseDir: join(input.projectRoot, ".horus", "execution-tasks"),
    });
    const runs: ProjectCommandRun[] = [];
    const repairedValidationCommands = new Set<string>();

    const runCommandById = async (commandId: string): Promise<ProjectCommandRun> => {
      this.ensureCommandAllowed(input.roleName, commandId, input.config);
      const command = input.config.commandCatalog.find((item) => item.id === commandId);
      if (!command) throw new ProjectExecutionError(`Unknown command id: ${commandId}`);
      const startedAt = new Date().toISOString();
      let outputSequence = 0;
      const commandSpec = {
        id: command.id,
        ...input.trace,
        executable: command.executable,
        args: command.args,
        cwd: resolveInsideRoot(input.projectRoot, command.cwd),
        env: command.env,
        ...(command.timeoutMs !== undefined ? { timeoutMs: command.timeoutMs } : {}),
        approved: true,
        approvedBy: "system:project-command-catalog",
        approvalReason: `Command ${command.id} is registered in the project command catalog and allowed for ${input.roleName}.`,
      };
      const result = await runner.run(commandSpec, {
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.onCommandOutput
          ? {
              onOutput: (event) => {
                input.onCommandOutput?.({
                  commandId: command.id,
                  taskId: event.taskId,
                  ...(event.traceId ? { traceId: event.traceId } : {}),
                  ...(event.spanId ? { spanId: event.spanId } : {}),
                  ...(event.parentSpanId ? { parentSpanId: event.parentSpanId } : {}),
                  ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
                  ...(event.runId ? { runId: event.runId } : {}),
                  ...(event.projectId ? { projectId: event.projectId } : {}),
                  ...(event.agentId ? { agentId: event.agentId } : {}),
                  ...(event.filePath ? { filePath: event.filePath } : {}),
                  ...(event.diffId ? { diffId: event.diffId } : {}),
                  stream: event.stream,
                  chunk: event.chunk,
                  sequence: outputSequence,
                  timestamp: new Date().toISOString(),
                });
                outputSequence += 1;
              },
            }
          : {}),
      });
      return ProjectCommandRunSchema.parse({
        id: uuidv4(),
        assignmentId: input.assignmentId ?? null,
        constructionRunId: input.constructionRunId,
        commandId: command.id,
        taskId: result.task.taskId,
        command: [command.executable, ...command.args].join(" "),
        cwd: result.task.cwd,
        approvalRequired: result.task.approvalRequired,
        risk: result.task.risk,
        policyReason: result.task.policyReason,
        approved: result.task.approved,
        approvedBy: result.task.approvedBy,
        approvalReason: result.task.approvalReason,
        exitCode: result.task.exitCode,
        stdoutTail: result.stdout,
        stderrTail: result.stderr,
        stdoutPath: result.task.stdoutPath,
        stderrPath: result.task.stderrPath,
        stdoutBytes: result.task.stdoutBytes,
        stderrBytes: result.task.stderrBytes,
        lastOutputAt: result.task.lastOutputAt,
        interactivePromptDetected: result.task.interactivePromptDetected,
        interactivePromptText: result.task.interactivePromptText,
        startedAt,
        finishedAt: result.task.finishedAt ?? new Date().toISOString(),
        durationMs: result.task.durationMs,
        sandboxProfile: "execution-task-runtime",
      });
    };

    for (const commandId of uniqueCommandIds) {
      const run = await runCommandById(commandId);
      runs.push(run);
      if (
        !this.shouldAttemptDependencyRepair({
          roleName: input.roleName,
          commandId,
          run,
          config: input.config,
          alreadyRepaired: repairedValidationCommands.has(commandId),
        })
      ) {
        continue;
      }

      const repairCommandIds = this.resolveDependencyRepairCommandIds({
        roleName: input.roleName,
        failedCommandId: commandId,
        config: input.config,
      });
      if (repairCommandIds.length === 0) continue;

      let repairSucceeded = true;
      for (const repairCommandId of repairCommandIds) {
        const repairRun = await runCommandById(repairCommandId);
        runs.push(repairRun);
        if (repairRun.exitCode !== 0) {
          repairSucceeded = false;
          break;
        }
      }

      if (repairSucceeded) {
        runs.push(await runCommandById(commandId));
        repairedValidationCommands.add(commandId);
      }
    }

    return runs;
  }

  private ensureCommandAllowed(
    roleName: string,
    commandId: string,
    config: HorusProjectConfig
  ): void {
    const roleProfile = config.roleProfiles[roleName];
    if (!roleProfile) throw new ProjectExecutionError(`Missing role profile: ${roleName}`);
    if (!roleProfile.allowedCommandIds.includes(commandId)) {
      throw new ProjectExecutionError(`Command ${commandId} is not allowed for ${roleName}`);
    }
    if (!config.commandCatalog.some((command) => command.id === commandId)) {
      throw new ProjectExecutionError(`Unknown command id: ${commandId}`);
    }
  }

  private shouldAttemptDependencyRepair(input: {
    roleName: string;
    commandId: string;
    run: ProjectCommandRun;
    config: HorusProjectConfig;
    alreadyRepaired: boolean;
  }): boolean {
    if (input.run.exitCode === 0) return false;
    if (input.alreadyRepaired) return false;
    if (!isDependencyRepairEligibleCommand(input.commandId, input.config)) return false;
    if (
      this.resolveDependencyRepairCommandIds({
        roleName: input.roleName,
        failedCommandId: input.commandId,
        config: input.config,
      }).length === 0
    ) {
      return false;
    }
    return looksLikeDependencyFailure(
      `${input.run.stdoutTail}\n${input.run.stderrTail}`.toLocaleLowerCase()
    );
  }

  private resolveDependencyRepairCommandIds(input: {
    roleName: string;
    failedCommandId: string;
    config: HorusProjectConfig;
  }): string[] {
    const roleProfile = input.config.roleProfiles[input.roleName];
    if (!roleProfile) return [];
    const allowed = new Set(roleProfile.allowedCommandIds);
    const catalogIds = new Set(input.config.commandCatalog.map((command) => command.id));
    const candidates: string[] = [];
    let stem = input.failedCommandId;
    for (const prefix of ["test-", "run-", "build-", "check-", "lint-", "smoke-"]) {
      if (stem.startsWith(prefix)) {
        stem = stem.slice(prefix.length);
        break;
      }
    }
    const parts = stem.split("-").filter(Boolean);
    for (let end = parts.length; end > 0; end -= 1) {
      const candidateStem = parts.slice(0, end).join("-");
      for (const commandId of [
        `install-${candidateStem}-dependencies`,
        `setup-${candidateStem}`,
      ]) {
        if (allowed.has(commandId) && catalogIds.has(commandId)) {
          candidates.push(commandId);
        }
      }
    }

    for (const commandId of [...allowed].sort()) {
      if (!catalogIds.has(commandId)) continue;
      const terms = splitCommandTerms(commandId);
      if (
        terms.some((term) => term === "install" || term === "setup") &&
        terms.some((term) =>
          ["dep", "deps", "dependencies", "package", "packages", "requirements"].includes(
            term
          )
        )
      ) {
        candidates.push(commandId);
      }
    }

    return [...new Set(candidates)];
  }

  private async collectWorkspaceFiles(input: {
    projectRoot: string;
    currentPath: string;
    tree: string[];
    files: ProjectWorkspaceFileSnapshot[];
    maxFiles: number;
    maxBytes: number;
    totalBytesRef: () => number;
    addBytes: (bytes: number) => void;
  }): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(input.currentPath, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const absolutePath = join(input.currentPath, entry.name);
      const relativePath = relative(input.projectRoot, absolutePath).split("\\").join("/");
      if (entry.isDirectory()) {
        await this.collectWorkspaceFiles({
          ...input,
          currentPath: absolutePath,
        });
        continue;
      }
      if (!entry.isFile()) continue;
      input.tree.push(relativePath);
      if (input.files.length >= input.maxFiles) continue;
      let content: string;
      try {
        content = await fs.readFile(absolutePath, "utf-8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EISDIR") continue;
        continue;
      }
      const sizeBytes = Buffer.byteLength(content, "utf-8");
      if (input.totalBytesRef() + sizeBytes > input.maxBytes) continue;
      input.addBytes(sizeBytes);
      input.files.push({ path: relativePath, content, sizeBytes });
    }
  }
}

function allowedExecutablesForConfig(config: HorusProjectConfig): string[] {
  return [
    "node",
    process.execPath,
    "pnpm",
    "npm",
    "yarn",
    "bun",
    ...config.commandCatalog.map((command) => command.executable),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function isTestCommand(commandId: string, config: HorusProjectConfig): boolean {
  if (config.testRunnerIds.includes(commandId)) return true;
  const command = config.commandCatalog.find((item) => item.id === commandId);
  const normalized = [
    commandId,
    command?.executable ?? "",
    ...(command?.args ?? []),
  ].flatMap(splitCommandTerms);
  return normalized.some((term) =>
    ["test", "pytest", "vitest", "jest"].includes(term)
  );
}

function isDependencyRepairEligibleCommand(
  commandId: string,
  config: HorusProjectConfig
): boolean {
  if (isTestCommand(commandId, config)) return true;
  const command = config.commandCatalog.find((item) => item.id === commandId);
  const normalized = [
    commandId,
    command?.executable ?? "",
    ...(command?.args ?? []),
  ].flatMap(splitCommandTerms);
  return normalized.some((term) =>
    [
      "build",
      "check",
      "compile",
      "dev",
      "lint",
      "preview",
      "run",
      "serve",
      "start",
      "tsc",
      "typecheck",
      "vite",
    ].includes(term)
  );
}

function splitCommandTerms(value: string): string[] {
  const terms: string[] = [];
  let current = "";

  for (const char of value.toLowerCase()) {
    if (isAsciiLetterOrDigit(char)) {
      current += char;
      continue;
    }

    if (current.length > 0) {
      terms.push(current);
      current = "";
    }
  }

  if (current.length > 0) terms.push(current);
  return terms;
}

function isAsciiLetterOrDigit(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}
