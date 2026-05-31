import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { v4 as uuidv4 } from "uuid";
import type {
  CodeChangeSet,
  CodeChangeValidationCommand,
  CodingValidationCommandKind,
  HorusProjectConfig,
  RuntimeValidationEvidence,
  ShellCommandOutputEvent,
} from "@u-build/shared";
import { RuntimeValidationEvidenceSchema } from "@u-build/shared";
import { classifyCommandKind } from "../../application/coding/ValidationCommandSelector.js";
import {
  applyPlannedCodeChangeOperations,
  planCodeChangeSetOperations,
} from "./CodeChangeSetFileOperations.js";
import { evaluateFrontendChangeSet } from "./FrontendChangeSetQualityGate.js";
import { ProjectDefaultContractBuilder } from "../project/ProjectDefaultContractBuilder.js";
import { ProjectExecutionService } from "../project/ProjectExecutionService.js";
import { ProjectFailureAnalysisService } from "../project/ProjectFailureAnalysisService.js";

export interface CodeChangeSetPreflightResult {
  passed: boolean;
  issues: string[];
  validation: CodeChangeValidationCommand[];
  runtimeEvidence: RuntimeValidationEvidence;
}

export interface CodeChangeSetPreflightTraceContext {
  traceId?: string | null;
  spanId?: string | null;
  parentSpanId?: string | null;
  toolCallId?: string | null;
  runId?: string | null;
  projectId?: string | null;
  agentId?: string | null;
  filePath?: string | null;
  diffId?: string | null;
}

export interface CodeChangeSetPreflightInput {
  changeSet: CodeChangeSet;
  projectRootPath: string;
  constructionRunId?: string | null;
  workflowThreadId?: string | null;
  userStoryId?: string | null;
  projectId?: string | null;
  trace?: CodeChangeSetPreflightTraceContext | undefined;
  onCommandOutput?: ((event: ShellCommandOutputEvent) => void) | undefined;
}

const VALIDATION_COMMAND_PRIORITY = [
  "type-check",
  "check",
  "test",
  "build",
  "lint",
] as const;

export class CodeChangeSetPreflightService {
  constructor(
    private readonly executionService = new ProjectExecutionService(),
    private readonly contractBuilder = new ProjectDefaultContractBuilder(),
    private readonly failureAnalysis = new ProjectFailureAnalysisService()
  ) {}

  async validate(
    input: CodeChangeSetPreflightInput
  ): Promise<CodeChangeSetPreflightResult> {
    const candidateRoot = await createPreflightWorkspace(input.projectRootPath);

    try {
      const planned = await planCodeChangeSetOperations({
        changeSet: input.changeSet,
        projectRootPath: candidateRoot,
      });
      await applyPlannedCodeChangeOperations(planned.operations);

      const staticGate = await evaluateFrontendChangeSet({
        projectRootPath: candidateRoot,
        changeSet: planned.changeSet,
      });

      if (!staticGate.passed) {
        return {
          passed: false,
          issues: staticGate.issues,
          validation: [
            {
              command: "frontend-change-set-quality-gate",
              cwd: ".",
              exitCode: 1,
              status: "failed",
              stderr: staticGate.issues.join("\n"),
            },
          ],
          runtimeEvidence: buildRuntimeEvidence({
            workflowThreadId: input.workflowThreadId,
            constructionRunId: input.constructionRunId,
            userStoryId: input.userStoryId,
            projectId: input.projectId,
            status: "failed",
            skippedReason: null,
            commands: [],
            message:
              "Static frontend preflight failed before terminal validation.",
          }),
        };
      }

      const config = await this.contractBuilder.build({
        projectRoot: candidateRoot,
        projectName: "frontend-preflight",
        projectStack: "typescript-react",
        baseRef: "main",
      });
      const commandIds = selectValidationCommandIds(config);

      if (commandIds.length === 0) {
        return {
          passed: true,
          issues: [],
          validation: [
            {
              command: "terminal-preflight",
              cwd: ".",
              exitCode: null,
              status: "not_run",
              stdout:
                "No build, type-check, test, lint or check command was detected.",
            },
          ],
          runtimeEvidence: buildRuntimeEvidence({
            workflowThreadId: input.workflowThreadId,
            constructionRunId: input.constructionRunId,
            userStoryId: input.userStoryId,
            projectId: input.projectId,
            status: "skipped",
            skippedReason:
              "No deterministic terminal validation command was detected.",
            commands: [],
            message:
              "Terminal validation was skipped because no deterministic validation command was detected.",
          }),
        };
      }

      const commandRuns = await this.executionService.executeCommandRequests({
        constructionRunId:
          input.constructionRunId ?? input.changeSet.workflowThreadId,
        roleName: "curator",
        plan: {
          summary: "Run terminal preflight for candidate CodeChangeSet",
          fileOperations: [],
          commandRequests: [],
          validationCommandIds: commandIds,
          risks: [],
        },
        config,
        projectRoot: candidateRoot,
        trace: buildPreflightTraceContext(input),
        onCommandOutput: input.onCommandOutput,
      });
      const blockedRuns = commandRuns.filter(
        (run) =>
          run.interactivePromptDetected === true ||
          (run.approvalRequired === true && run.approved !== true)
      );
      const failedRuns = commandRuns.filter(
        (run) => run.exitCode !== 0 || blockedRuns.includes(run)
      );
      const validation = commandRuns.map((run): CodeChangeValidationCommand => ({
        command: run.command,
        cwd: run.cwd,
        exitCode: run.exitCode,
        status: run.exitCode === 0 ? "passed" : "failed",
        stdout: run.stdoutTail,
        stderr: run.stderrTail,
      }));
      const issues = failedRuns.map((run) => {
        const detail = formatCommandFailureDetail(run);
        const analysis = this.failureAnalysis.classify({
          commandId: run.commandId,
          kind: commandKind(config, run.commandId),
          output: `${run.stderrTail}\n${run.stdoutTail}`,
          exitCode: run.exitCode,
        });
        return `[terminal:${analysis.category}] ${run.commandId} failed with exit ${String(run.exitCode)}: ${detail}`;
      });

      return {
        passed: issues.length === 0,
        issues,
        validation,
        runtimeEvidence: buildRuntimeEvidence({
          workflowThreadId: input.workflowThreadId,
          constructionRunId: input.constructionRunId,
          userStoryId: input.userStoryId,
          projectId: input.projectId,
          status:
            issues.length === 0
              ? "passed"
              : blockedRuns.length > 0
                ? "blocked"
                : "failed",
          skippedReason: null,
          commands: commandRuns.map((run) => ({
            commandId: run.commandId,
            taskId: run.taskId,
            command: run.command,
            cwd: run.cwd,
            approvalRequired: run.approvalRequired ?? false,
            risk: run.risk ?? "low",
            policyReason: run.policyReason ?? null,
            approved: run.approved ?? false,
            approvedBy: run.approvedBy ?? null,
            approvalReason: run.approvalReason ?? null,
            exitCode: run.exitCode,
            stdoutTail: run.stdoutTail,
            stderrTail: run.stderrTail,
            stdoutPath: run.stdoutPath,
            stderrPath: run.stderrPath,
            interactivePromptDetected: run.interactivePromptDetected ?? false,
            interactivePromptText: run.interactivePromptText ?? null,
            durationMs: run.durationMs,
          })),
          message:
            issues.length === 0
              ? "Terminal preflight passed."
              : blockedRuns.length > 0
                ? "Terminal preflight is blocked pending operator action."
              : "Terminal preflight failed.",
        }),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown preflight error";
      return {
        passed: false,
        issues: [`[terminal] Preflight failed before delivery: ${message}`],
        validation: [
          {
            command: "terminal-preflight",
            cwd: ".",
            exitCode: 1,
            status: "failed",
            stderr: message,
          },
        ],
        runtimeEvidence: buildRuntimeEvidence({
          workflowThreadId: input.workflowThreadId,
          constructionRunId: input.constructionRunId,
          userStoryId: input.userStoryId,
          projectId: input.projectId,
          status: "failed",
          skippedReason: null,
          commands: [],
          message,
        }),
      };
    } finally {
      await fs.rm(candidateRoot, { recursive: true, force: true });
    }
  }
}

function buildPreflightTraceContext(
  input: CodeChangeSetPreflightInput
): CodeChangeSetPreflightTraceContext {
  const firstTouchedFile = input.changeSet.operations[0]?.targetPath ?? null;
  const workflowThreadId =
    input.workflowThreadId ?? input.changeSet.workflowThreadId;
  const preflightSpanId = `curator-preflight-${input.changeSet.id}`;

  return {
    traceId: input.trace?.traceId ?? workflowThreadId,
    spanId: input.trace?.spanId ?? preflightSpanId,
    parentSpanId: input.trace?.parentSpanId ?? null,
    toolCallId: input.trace?.toolCallId ?? preflightSpanId,
    runId: input.trace?.runId ?? workflowThreadId,
    projectId: input.trace?.projectId ?? input.projectId ?? null,
    agentId: input.trace?.agentId ?? "curator_agent",
    filePath: input.trace?.filePath ?? firstTouchedFile,
    diffId: input.trace?.diffId ?? input.changeSet.id,
  };
}

function selectValidationCommandIds(config: HorusProjectConfig): string[] {
  const eligible = config.commandCatalog.filter((command) =>
    VALIDATION_COMMAND_PRIORITY.some((kind) => command.id.startsWith(`${kind}-`))
  );
  return eligible
    .sort((left, right) => {
      const leftPriority = commandPriority(left.id);
      const rightPriority = commandPriority(right.id);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.id.localeCompare(right.id);
    })
    .map((command) => command.id);
}

function commandPriority(commandId: string): number {
  const index = VALIDATION_COMMAND_PRIORITY.findIndex((kind) =>
    commandId.startsWith(`${kind}-`)
  );
  return index === -1 ? VALIDATION_COMMAND_PRIORITY.length : index;
}

function commandKind(
  config: HorusProjectConfig,
  commandId: string
): CodingValidationCommandKind {
  const command = config.commandCatalog.find((item) => item.id === commandId);
  return command ? classifyCommandKind(command) : "unknown";
}

function formatCommandFailureDetail(run: {
  stdoutTail: string;
  stderrTail: string;
}): string {
  const stdout = run.stdoutTail.trim();
  const stderr = run.stderrTail.trim();
  if (!stdout && !stderr) return "Command failed.";

  const stderrOnlyWarnings =
    stderr.length > 0 &&
    stderr
      .split(/\r?\n/u)
      .every((line) => /^(npm|pnpm|yarn)\s+warn\b/i.test(line.trim()));

  if (stdout && (!stderr || stderrOnlyWarnings)) {
    return stderr ? `${stdout}\n${stderr}` : stdout;
  }

  if (stdout && stderr) return `${stderr}\n${stdout}`;
  return stderr || stdout;
}

function buildRuntimeEvidence(input: {
  workflowThreadId?: string | null | undefined;
  constructionRunId?: string | null | undefined;
  userStoryId?: string | null | undefined;
  projectId?: string | null | undefined;
  status: RuntimeValidationEvidence["status"];
  skippedReason: string | null;
  commands: RuntimeValidationEvidence["commands"];
  message: string;
}): RuntimeValidationEvidence {
  return RuntimeValidationEvidenceSchema.parse({
    id: uuidv4(),
    workflowThreadId: input.workflowThreadId ?? null,
    constructionRunId: input.constructionRunId ?? null,
    userStoryId: input.userStoryId ?? null,
    projectId: input.projectId ?? null,
    status: input.status,
    skippedReason: input.skippedReason,
    commands: input.commands,
    preview: {
      status: "skipped",
      url: null,
      message: input.message,
      evidence: {
        title: null,
        bodySnippet: null,
        screenshotPath: null,
      },
    },
    createdAt: new Date().toISOString(),
  });
}

async function createPreflightWorkspace(projectRootPath: string): Promise<string> {
  const projectRoot = resolve(projectRootPath);
  const candidateRoot = await fs.mkdtemp(join(tmpdir(), "horus-preflight-"));
  await fs.cp(projectRoot, candidateRoot, {
    recursive: true,
    force: false,
    errorOnExist: false,
    filter: (sourcePath) => shouldCopyPreflightPath(projectRoot, sourcePath),
  });
  return candidateRoot;
}

function shouldCopyPreflightPath(
  projectRootPath: string,
  sourcePath: string
): boolean {
  if (sourcePath === projectRootPath) return true;
  const relativePath = sourcePath.slice(projectRootPath.length + 1);
  const segments = splitPathSegments(relativePath);
  if ([".horus", ".turbo", "data"].includes(segments[0] ?? "")) {
    return false;
  }

  return !segments.some((segment) =>
    [
      ".git",
      "node_modules",
      "dist",
      "build",
      "coverage",
    ].includes(segment)
  ) && !isSensitivePreflightFile(segments.at(-1) ?? "");
}

function isSensitivePreflightFile(basename: string): boolean {
  const lowerBasename = basename.toLowerCase();
  if (lowerBasename === ".env" || lowerBasename.startsWith(".env.")) {
    return true;
  }
  return [".pem", ".key", ".crt", ".cer", ".p12", ".pfx"].some((extension) =>
    lowerBasename.endsWith(extension)
  );
}

function splitPathSegments(pathValue: string): string[] {
  const segments: string[] = [];
  let current = "";

  for (const char of pathValue) {
    if (char === "/" || char === "\\") {
      if (current.length > 0) {
        segments.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) segments.push(current);
  return segments;
}
