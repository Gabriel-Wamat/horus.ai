import { promises as fs } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type {
  CodeChangeSet,
  CodeChangeValidationCommand,
  HorusProjectConfig,
  RuntimeValidationEvidence,
} from "@u-build/shared";
import { RuntimeValidationEvidenceSchema } from "@u-build/shared";
import { evaluateFrontendChangeSet } from "./FrontendChangeSetQualityGate.js";
import { ProjectDefaultContractBuilder } from "../project/ProjectDefaultContractBuilder.js";
import { ProjectExecutionService } from "../project/ProjectExecutionService.js";

export interface CodeChangeSetPreflightResult {
  passed: boolean;
  issues: string[];
  validation: CodeChangeValidationCommand[];
  runtimeEvidence: RuntimeValidationEvidence;
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
    private readonly contractBuilder = new ProjectDefaultContractBuilder()
  ) {}

  async validate(input: {
    changeSet: CodeChangeSet;
    projectRootPath: string;
    workflowThreadId?: string | null;
    userStoryId?: string | null;
    projectId?: string | null;
  }): Promise<CodeChangeSetPreflightResult> {
    const projectRoot = resolve(input.projectRootPath);
    const staticGate = await evaluateFrontendChangeSet({
      projectRootPath: projectRoot,
      changeSet: input.changeSet,
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

    const appliedOperations: Array<{
      targetPath: string;
      beforeContent: string | null;
    }> = [];

    try {
      for (const operation of input.changeSet.operations) {
        const targetPath = resolveProjectPath(projectRoot, operation.targetPath);
        const beforeContent = await readExistingFile(targetPath);
        await fs.mkdir(dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, operation.afterContent, "utf8");
        appliedOperations.push({ targetPath, beforeContent });
      }

      const config = await this.contractBuilder.build({
        projectRoot,
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
        constructionRunId: input.changeSet.workflowThreadId,
        roleName: "curator",
        plan: {
          summary: "Run terminal preflight for candidate CodeChangeSet",
          fileOperations: [],
          commandRequests: [],
          validationCommandIds: commandIds,
          risks: [],
        },
        config,
        projectRoot,
      });
      const failedRuns = commandRuns.filter((run) => run.exitCode !== 0);
      const validation = commandRuns.map((run): CodeChangeValidationCommand => ({
        command: run.command,
        cwd: run.cwd,
        exitCode: run.exitCode,
        status: run.exitCode === 0 ? "passed" : "failed",
        stdout: run.stdoutTail,
        stderr: run.stderrTail,
      }));
      const issues = failedRuns.map((run) => {
        const detail = run.stderrTail || run.stdoutTail || "Command failed.";
        return `[terminal] ${run.commandId} failed with exit ${String(run.exitCode)}: ${detail}`;
      });

      return {
        passed: issues.length === 0,
        issues,
        validation,
        runtimeEvidence: buildRuntimeEvidence({
          workflowThreadId: input.workflowThreadId,
          userStoryId: input.userStoryId,
          projectId: input.projectId,
          status: issues.length === 0 ? "passed" : "failed",
          skippedReason: null,
          commands: commandRuns.map((run) => ({
            commandId: run.commandId,
            command: run.command,
            cwd: run.cwd,
            exitCode: run.exitCode,
            stdoutTail: run.stdoutTail,
            stderrTail: run.stderrTail,
            durationMs: run.durationMs,
          })),
          message:
            issues.length === 0
              ? "Terminal preflight passed."
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
          userStoryId: input.userStoryId,
          projectId: input.projectId,
          status: "failed",
          skippedReason: null,
          commands: [],
          message,
        }),
      };
    } finally {
      await rollbackAppliedOperations(appliedOperations);
    }
  }
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

async function rollbackAppliedOperations(
  appliedOperations: Array<{
    targetPath: string;
    beforeContent: string | null;
  }>
): Promise<void> {
  for (const operation of appliedOperations.reverse()) {
    if (operation.beforeContent === null) {
      await fs.rm(operation.targetPath, { force: true });
      continue;
    }
    await fs.writeFile(operation.targetPath, operation.beforeContent, "utf8");
  }
}

function buildRuntimeEvidence(input: {
  workflowThreadId?: string | null | undefined;
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
    constructionRunId: null,
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

function resolveProjectPath(projectRoot: string, targetPath: string): string {
  if (isAbsolute(targetPath)) {
    throw new Error(
      `CodeChangeSet target path must be relative to the selected project: ${targetPath}`
    );
  }

  const resolvedTarget = resolve(projectRoot, targetPath);
  const relativeTarget = relative(projectRoot, resolvedTarget);
  if (
    relativeTarget.length === 0 ||
    relativeTarget.startsWith("..") ||
    isAbsolute(relativeTarget)
  ) {
    throw new Error(
      `CodeChangeSet target path escapes the selected project: ${targetPath}`
    );
  }

  return resolvedTarget;
}

async function readExistingFile(targetPath: string): Promise<string | null> {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return null;
    throw err;
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
