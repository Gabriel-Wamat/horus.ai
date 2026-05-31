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
import { classifyCommandKind } from "../../application/coding/ValidationCommandSelector.js";
import { ProjectDiffAnalyzer } from "./ProjectDiffAnalyzer.js";
import { ProjectExecutionService } from "./ProjectExecutionService.js";
import { ProjectFailureAnalysisService } from "./ProjectFailureAnalysisService.js";

export class ProjectQualityGateService {
  constructor(
    private readonly executionService = new ProjectExecutionService(),
    private readonly diffAnalyzer = new ProjectDiffAnalyzer(),
    private readonly failureAnalysis = new ProjectFailureAnalysisService()
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
    const checks = commandRuns.map((run) =>
      this.buildCheck({ run, config: input.config })
    );
    const failedChecks = latestRunsByCommand(commandRuns)
      .filter((run) => run.exitCode !== 0)
      .map((run) => this.buildCheck({ run, config: input.config }));
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
      checks,
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
        taskId: run.taskId,
        command: run.command,
        cwd: run.cwd,
        approvalRequired: run.approvalRequired,
        risk: run.risk,
        policyReason: run.policyReason,
        approved: run.approved,
        approvedBy: run.approvedBy,
        approvalReason: run.approvalReason,
        exitCode: run.exitCode,
        stdoutTail: run.stdoutTail,
        stderrTail: run.stderrTail,
        stdoutPath: run.stdoutPath,
        stderrPath: run.stderrPath,
        interactivePromptDetected: run.interactivePromptDetected,
        interactivePromptText: run.interactivePromptText,
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

  private buildCheck(input: {
    run: ProjectCommandRun;
    config: HorusProjectConfig;
  }): Record<string, unknown> {
    const command = input.config.commandCatalog.find(
      (item) => item.id === input.run.commandId
    );
    const kind = command ? classifyCommandKind(command) : "unknown";
    const passed = input.run.exitCode === 0;
    const output = `${input.run.stderrTail}\n${input.run.stdoutTail}`;
    return {
      commandId: input.run.commandId,
      kind,
      command: input.run.command,
      cwd: input.run.cwd,
      exitCode: input.run.exitCode,
      passed,
      stdoutTail: input.run.stdoutTail,
      stderrTail: input.run.stderrTail,
      durationMs: input.run.durationMs,
      ...(passed
        ? {}
        : {
            failureAnalysis: this.failureAnalysis.classify({
              commandId: input.run.commandId,
              kind,
              output,
              exitCode: input.run.exitCode,
            }),
          }),
    };
  }
}

function latestRunsByCommand(commandRuns: readonly ProjectCommandRun[]): ProjectCommandRun[] {
  const latest = new Map<string, ProjectCommandRun>();
  for (const run of commandRuns) {
    latest.set(run.commandId, run);
  }
  return [...latest.values()];
}
