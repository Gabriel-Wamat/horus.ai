import { v4 as uuidv4 } from "uuid";
import type {
  HorusProjectConfig,
  ProjectQualityGate,
  ProjectCommandRun,
  RuntimeValidationEvidence,
} from "@u-build/shared";
import {
  ProjectQualityGateSchema,
  RuntimeValidationEvidenceSchema,
} from "@u-build/shared";
import { ProjectDiffAnalyzer } from "./ProjectDiffAnalyzer.js";
import { ProjectExecutionService } from "./ProjectExecutionService.js";

export class ProjectQualityGateService {
  constructor(
    private readonly executionService = new ProjectExecutionService(),
    private readonly diffAnalyzer = new ProjectDiffAnalyzer()
  ) {}

  async run(input: {
    constructionRunId: string;
    assignmentId?: string | null;
    roleName: string;
    config: HorusProjectConfig;
    projectRoot: string;
    commandIds?: string[];
  }): Promise<{
    qualityGate: ProjectQualityGate;
    commandRuns: ProjectCommandRun[];
    runtimeEvidence: RuntimeValidationEvidence;
  }> {
    const commandIds =
      input.commandIds ??
      input.config.roleProfiles[input.roleName]?.defaultValidationCommandIds ??
      [];
    const commandRuns =
      commandIds.length > 0
        ? await this.executionService.executeCommandRequests({
            constructionRunId: input.constructionRunId,
            ...(input.assignmentId !== undefined
              ? { assignmentId: input.assignmentId }
              : {}),
            roleName: input.roleName,
            plan: {
              summary: "Run project quality gate",
              fileOperations: [],
              commandRequests: [],
              validationCommandIds: commandIds,
              risks: [],
            },
            config: input.config,
            projectRoot: input.projectRoot,
          })
        : [];
    const failedChecks = commandRuns
      .filter((run) => run.exitCode !== 0)
      .map((run) => ({
        commandId: run.commandId,
        exitCode: run.exitCode,
        stderrTail: run.stderrTail,
      }));
    const diffStats = await this.diffAnalyzer.readDiffStats(input.projectRoot);
    const qualityGate = ProjectQualityGateSchema.parse({
      id: uuidv4(),
      constructionRunId: input.constructionRunId,
      assignmentId: input.assignmentId ?? null,
      status:
        commandIds.length === 0
          ? "skipped"
          : failedChecks.length === 0
            ? "passed"
            : "failed",
      checks: commandRuns.map((run) => ({
        commandId: run.commandId,
        exitCode: run.exitCode,
      })),
      failedChecks,
      diffStats,
      commitSha: null,
      createdAt: new Date().toISOString(),
    });
    const runtimeEvidence = RuntimeValidationEvidenceSchema.parse({
      id: uuidv4(),
      workflowThreadId: null,
      constructionRunId: input.constructionRunId,
      userStoryId: null,
      projectId: null,
      status:
        commandIds.length === 0
          ? "skipped"
          : failedChecks.length === 0
            ? "passed"
            : "failed",
      skippedReason:
        commandIds.length === 0
          ? `No default validation commands configured for role ${input.roleName}.`
          : null,
      commands: commandRuns.map((run) => ({
        commandId: run.commandId,
        command: run.command,
        cwd: run.cwd,
        exitCode: run.exitCode,
        stdoutTail: run.stdoutTail,
        stderrTail: run.stderrTail,
        durationMs: run.durationMs,
      })),
      preview: {
        status: "skipped",
        url: null,
        message: "Preview smoke was not executed by ProjectQualityGateService.",
        evidence: {
          title: null,
          bodySnippet: null,
          screenshotPath: null,
        },
      },
      createdAt: new Date().toISOString(),
    });
    return { qualityGate, commandRuns, runtimeEvidence };
  }
}
