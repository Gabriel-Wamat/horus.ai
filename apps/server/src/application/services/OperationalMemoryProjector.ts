import {
  OperationalMemorySummarySchema,
  type AgentName,
  type AgentOperationProjection,
  type AgentProfileId,
  type AgentResult,
  type OperationalMemoryCommand,
  type OperationalMemoryCuratorDecision,
  type OperationalMemoryError,
  type OperationalMemoryAttempt,
  type OperationalMemoryFileChange,
  type OperationalMemoryFileRead,
  type OperationalMemoryNextStep,
  type OperationalMemorySummary,
} from "@u-build/shared";

interface CuratorDecisionInput {
  passed: boolean;
  score: number;
  notes: string;
  missingItems: string[];
  fixTarget: "front" | "qa" | "both";
}

export interface BuildOperationalMemoryInput {
  workflowThreadId: string;
  runId?: string | null | undefined;
  userStoryId?: string | null | undefined;
  agentResults?: readonly AgentResult[] | undefined;
  operationalProjections?: readonly AgentOperationProjection[] | undefined;
  curatorFeedback?: CuratorDecisionInput | null | undefined;
  retryCount?: number | undefined;
  now?: Date | undefined;
}

export class OperationalMemoryProjector {
  build(input: BuildOperationalMemoryInput): OperationalMemorySummary {
    const now = (input.now ?? new Date()).toISOString();
    const projections = [...(input.operationalProjections ?? [])];
    const results = [...(input.agentResults ?? [])];

    const filesRead = dedupeFilesRead([
      ...projections.flatMap((projection) =>
        projection.filesRead.map((file): OperationalMemoryFileRead => ({
          path: file.path,
          versionHash: file.versionHash ?? null,
          readAt: file.readAt,
        }))
      ),
      ...results.flatMap(readFilesFromAgentResult),
    ]);
    const filesChanged = dedupeFilesChanged([
      ...projections.flatMap((projection) =>
        projection.filesChanged.map((file): OperationalMemoryFileChange => ({
          path: file.path,
          changeType: file.changeType,
          patchStrategy: file.patchStrategy ?? null,
          diffPreview: file.diffPreview,
          changedAt: file.changedAt,
        }))
      ),
      ...results.flatMap(changedFilesFromAgentResult),
    ]);
    const commandsRun = dedupeCommands([
      ...projections.flatMap((projection) =>
        projection.commands.map((command): OperationalMemoryCommand => ({
          commandId: command.commandId,
          status: command.status,
          exitCode: command.exitCode ?? null,
          durationMs: command.durationMs ?? null,
          ranAt: command.ranAt,
        }))
      ),
      ...results.flatMap(commandsFromAgentResult),
    ]);
    const errorsSeen = [
      ...projections.flatMap((projection) =>
        projection.errors.map((error): OperationalMemoryError => ({
          message: error.message,
          source: "tool",
          occurredAt: error.occurredAt,
        }))
      ),
      ...results.flatMap(errorsFromAgentResult),
    ].slice(-20);
    const curatorDecisions = [
      ...results.flatMap(curatorDecisionsFromAgentResult),
      ...(input.curatorFeedback
        ? [
            {
              passed: input.curatorFeedback.passed,
              score: input.curatorFeedback.score,
              fixTarget: input.curatorFeedback.fixTarget,
              notes: input.curatorFeedback.notes,
              missingItems: input.curatorFeedback.missingItems,
              decidedAt: now,
            } satisfies OperationalMemoryCuratorDecision,
          ]
        : []),
    ].slice(-8);
    const attempts: OperationalMemoryAttempt[] = projections.map((projection) => ({
      attempt: projection.retryCount,
      status: projection.status,
      summary: projection.lastSummary ?? null,
      eventCount: projection.eventCount,
    }));
    if (attempts.length === 0 && input.retryCount !== undefined) {
      attempts.push({
        attempt: input.retryCount,
        status: latestResultStatus(results),
        summary: latestResultSummary(results),
        eventCount: results.length,
      });
    }

    const nextStep = inferNextStep({
      curatorDecision: curatorDecisions[curatorDecisions.length - 1],
      latestError: errorsSeen[errorsSeen.length - 1],
      filesChangedCount: filesChanged.length,
      commandsRunCount: commandsRun.length,
    });

    return OperationalMemorySummarySchema.parse({
      workflowThreadId: input.workflowThreadId,
      runId: input.runId ?? null,
      userStoryId: input.userStoryId ?? null,
      operationalSessionIds: [
        ...projections.map((projection) => projection.session.id),
        ...results.flatMap(operationalSessionIdsFromAgentResult),
      ],
      filesRead,
      filesChanged,
      commandsRun,
      diffsApplied: filesChanged.filter(
        (file) => file.changeType !== "unknown" || file.diffPreview.length > 0
      ),
      errorsSeen,
      attempts,
      curatorDecisions,
      nextStep,
      generatedAt: now,
    });
  }
}

function readFilesFromAgentResult(result: AgentResult): OperationalMemoryFileRead[] {
  if (result.status !== "success") return [];
  const output = result.output;
  const inspectedFiles = arrayOfStrings(output["inspectedFiles"]);
  const operationalSession = asRecord(output["toolLoop"])["operationalSession"];
  const sessionFiles = arrayOfStrings(asRecord(operationalSession)["filesRead"]);
  return [...new Set([...inspectedFiles, ...sessionFiles])].map((path) => ({
    path,
    versionHash: null,
    readAt: result.completedAt,
  }));
}

function changedFilesFromAgentResult(
  result: AgentResult
): OperationalMemoryFileChange[] {
  if (result.status !== "success") return [];
  const output = result.output;
  const toolLoop = asRecord(output["toolLoop"]);
  const toolLoopFiles = arrayOfStrings(toolLoop["changedFiles"]).map((path) => ({
    path,
    changeType: "unknown" as const,
    patchStrategy: "agent_tool_loop",
    diffPreview: "",
    changedAt: result.completedAt,
  }));
  const changeSet = asRecord(output["codeChangeSet"]);
  const operations = Array.isArray(changeSet["operations"])
    ? changeSet["operations"]
    : [];
  const codeChangeFiles = operations.flatMap(
    (operation): OperationalMemoryFileChange[] => {
      const record = asRecord(operation);
      const path = stringValue(record["targetPath"]);
      const changeType = changeTypeValue(record["changeType"]);
      if (!path || !changeType) return [];
      return [
        {
          path,
          changeType,
          patchStrategy: stringValue(asRecord(record["metadata"])["patchStrategy"]),
          diffPreview: boundedString(stringValue(record["diff"]) ?? "", 8_000),
          changedAt: result.completedAt,
        },
      ];
    }
  );
  return [...toolLoopFiles, ...codeChangeFiles];
}

function operationalSessionIdsFromAgentResult(result: AgentResult): string[] {
  if (result.status !== "success") return [];
  const toolLoop = asRecord(result.output["toolLoop"]);
  const id = stringValue(toolLoop["operationalSessionId"]);
  return id ? [id] : [];
}

function commandsFromAgentResult(result: AgentResult): OperationalMemoryCommand[] {
  if (result.status !== "success") return [];
  const output = result.output;
  const toolLoop = asRecord(output["toolLoop"]);
  const commandIds = [
    ...arrayOfStrings(toolLoop["validationCommandIds"]),
    ...arrayOfStrings(asRecord(toolLoop["operationalSession"])["commandIds"]),
  ];
  const runtimeEvidence = [
    asRecord(output["terminalRuntimeValidation"]),
    asRecord(output["runtimeValidation"]),
  ];
  const runtimeCommands = runtimeEvidence.flatMap((evidence) =>
    Array.isArray(evidence["commands"]) ? evidence["commands"] : []
  );
  return [
    ...commandIds.map((commandId) => ({
      commandId,
      status: "unknown",
      exitCode: null,
      durationMs: null,
      ranAt: result.completedAt,
    })),
    ...runtimeCommands.flatMap((command): OperationalMemoryCommand[] => {
      const record = asRecord(command);
      const commandId = stringValue(record["commandId"]);
      if (!commandId) return [];
      return [
        {
          commandId,
          status: stringValue(record["status"]) ?? "unknown",
          exitCode: integerValue(record["exitCode"]),
          durationMs: integerValue(record["durationMs"]),
          ranAt: result.completedAt,
        },
      ];
    }),
  ];
}

function errorsFromAgentResult(result: AgentResult): OperationalMemoryError[] {
  if (result.status === "error") {
    return [
      {
        message: result.errorMessage,
        source: "workflow",
        occurredAt: result.completedAt,
      },
    ];
  }
  if (result.status !== "success") return [];
  const output = result.output;
  const toolLoop = asRecord(output["toolLoop"]);
  const operationalSession = asRecord(toolLoop["operationalSession"]);
  const errors = [
    ...arrayOfStrings(toolLoop["errors"]),
    ...arrayOfStrings(operationalSession["errors"]),
  ].map(
    (message): OperationalMemoryError => ({
      message,
      source: "tool",
      occurredAt: result.completedAt,
    })
  );
  const validationErrors = [
    ...arrayOfStrings(asRecord(output["preflightValidation"])["issues"]),
    ...arrayOfStrings(output["missingItems"]),
  ].map((message): OperationalMemoryError => ({
    message,
    source: result.agentName === "curator" ? "curator" : "runtime",
    occurredAt: result.completedAt,
  }));
  return [...errors, ...validationErrors];
}

function curatorDecisionsFromAgentResult(
  result: AgentResult
): OperationalMemoryCuratorDecision[] {
  if (result.status !== "success" || result.agentName !== "curator") return [];
  const output = result.output;
  if (typeof output["passed"] !== "boolean") return [];
  return [
    {
      passed: output["passed"],
      score: numberValue(output["score"]),
      fixTarget: fixTargetValue(output["fixTarget"]),
      notes: stringValue(output["notes"]),
      missingItems: arrayOfStrings(output["missingItems"]),
      decidedAt: result.completedAt,
    },
  ];
}

function inferNextStep(input: {
  curatorDecision?: OperationalMemoryCuratorDecision | undefined;
  latestError?: OperationalMemoryError | undefined;
  filesChangedCount: number;
  commandsRunCount: number;
}): OperationalMemoryNextStep {
  if (input.curatorDecision) {
    if (input.curatorDecision.passed) {
      return {
        reason: "Curator passed; continue to the next story or terminal output.",
        recommendedAgent: "odin",
        recommendedAgentProfileId: "odin_agent",
        blocked: false,
        source: "curator",
      };
    }
    const recommended = recommendedAgentForFix(input.curatorDecision.fixTarget);
    return {
      reason:
        input.curatorDecision.missingItems[0] ??
        input.curatorDecision.notes ??
        "Curator rejected the current output.",
      recommendedAgent: recommended.agent,
      recommendedAgentProfileId: recommended.profile,
      blocked: false,
      source: "curator",
    };
  }
  if (input.latestError) {
    return {
      reason: input.latestError.message,
      recommendedAgent: "front",
      recommendedAgentProfileId: "front_agent",
      blocked: false,
      source: input.latestError.source === "curator" ? "curator" : "runtime",
    };
  }
  if (input.filesChangedCount > 0 && input.commandsRunCount === 0) {
    return {
      reason: "Files changed; run validation commands before final approval.",
      recommendedAgent: "qa",
      recommendedAgentProfileId: "qa_agent",
      blocked: false,
      source: "inferred",
    };
  }
  return {
    reason: "Continue execution from the latest workflow state.",
    recommendedAgent: "odin",
    recommendedAgentProfileId: "odin_agent",
    blocked: false,
    source: "workflow",
  };
}

function recommendedAgentForFix(
  fixTarget: "front" | "qa" | "both" | null
): { agent: AgentName; profile: AgentProfileId } {
  if (fixTarget === "qa") return { agent: "qa", profile: "qa_agent" };
  if (fixTarget === "both") return { agent: "odin", profile: "odin_agent" };
  return { agent: "front", profile: "front_agent" };
}

function latestResultStatus(results: readonly AgentResult[]): string {
  const latest = results[results.length - 1];
  if (!latest) return "unknown";
  return latest.status;
}

function latestResultSummary(results: readonly AgentResult[]): string | null {
  const latest = results[results.length - 1];
  if (!latest || latest.status !== "success") return null;
  return stringValue(latest.output["notes"]) ?? stringValue(latest.output["summary"]);
}

function dedupeFilesRead(files: OperationalMemoryFileRead[]) {
  const byPath = new Map<string, OperationalMemoryFileRead>();
  for (const file of files) byPath.set(file.path, file);
  return [...byPath.values()];
}

function dedupeFilesChanged(files: OperationalMemoryFileChange[]) {
  const byPath = new Map<string, OperationalMemoryFileChange>();
  for (const file of files) byPath.set(file.path, file);
  return [...byPath.values()];
}

function dedupeCommands(commands: OperationalMemoryCommand[]) {
  const byId = new Map<string, OperationalMemoryCommand>();
  for (const command of commands) byId.set(command.commandId, command);
  return [...byId.values()];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function fixTargetValue(value: unknown): "front" | "qa" | "both" | null {
  return value === "front" || value === "qa" || value === "both" ? value : null;
}

function changeTypeValue(
  value: unknown
): "create" | "update" | "delete" | "unknown" | null {
  if (
    value === "create" ||
    value === "update" ||
    value === "delete" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function boundedString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}
