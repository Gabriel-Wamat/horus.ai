import { promises as fs } from "node:fs";
import { Buffer } from "node:buffer";
import { dirname, join, relative } from "node:path";
import type {
  HorusProjectConfig,
  ProjectCommandRun,
  ProjectExecutionPlan,
} from "@u-build/shared";
import {
  ProjectCommandRunSchema,
  ProjectExecutionPlanSchema,
} from "@u-build/shared";
import { v4 as uuidv4 } from "uuid";
import { CliCommandPolicy } from "../tools/CliCommandPolicy.js";
import { SafeCliRunner } from "../tools/SafeCliRunner.js";
import {
  isGitMetadataPath,
  isWritablePath,
  resolveInsideRoot,
} from "./ProjectPathSafety.js";

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
      const targetPath = resolveInsideRoot(input.projectRoot, operation.path);
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
      const targetPath = resolveInsideRoot(input.projectRoot, operation.path);
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
  }): Promise<ProjectCommandRun[]> {
    const commandIds = [
      ...input.plan.commandRequests.map((request) => request.commandId),
      ...input.plan.validationCommandIds,
    ];
    const uniqueCommandIds = [...new Set(commandIds)];
    const runner = new SafeCliRunner({
      policy: new CliCommandPolicy({ allowedRoot: input.projectRoot }),
    });
    const runs: ProjectCommandRun[] = [];

    for (const commandId of uniqueCommandIds) {
      this.ensureCommandAllowed(input.roleName, commandId, input.config);
      const command = input.config.commandCatalog.find((item) => item.id === commandId);
      if (!command) throw new ProjectExecutionError(`Unknown command id: ${commandId}`);
      const startedAt = new Date().toISOString();
      const commandSpec = {
        id: command.id,
        executable: command.executable,
        args: command.args,
        cwd: resolveInsideRoot(input.projectRoot, command.cwd),
        env: command.env,
        ...(command.timeoutMs !== undefined ? { timeoutMs: command.timeoutMs } : {}),
      };
      const result = await runner.execute(commandSpec);
      runs.push(
        ProjectCommandRunSchema.parse({
          id: uuidv4(),
          assignmentId: input.assignmentId ?? null,
          constructionRunId: input.constructionRunId,
          commandId: command.id,
          command: [command.executable, ...command.args].join(" "),
          cwd: result.cwd,
          exitCode: result.exitCode,
          stdoutTail: result.stdout,
          stderrTail: result.stderr,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: result.durationMs,
          sandboxProfile: "safe-cli-runner",
        })
      );
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
