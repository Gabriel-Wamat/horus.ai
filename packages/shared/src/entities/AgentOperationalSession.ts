import { z } from "zod";
import {
  AgentNameSchema,
  AgentProfileIdSchema,
  AgentToolCallStatusSchema,
  AgentToolNameSchema,
} from "./AgentResult.js";
import type { AgentToolName } from "./AgentResult.js";
import {
  AgentFileOperationTelemetrySchema,
  type AgentFileOperationTelemetry,
  type AgentFileOperationType,
  type HorusWorkflowNodeId,
} from "./HorusRunFlow.js";
import { HORUS_NODE_BY_AGENT } from "./HorusWorkflowProjection.js";
import { ProjectFileVersionSchema } from "./ProjectFiles.js";
import { ShellCommandStatusSchema } from "./ShellCommand.js";

export const AgentOperationalSessionStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "blocked",
  "cancelled",
]);

export const AgentOperationEventTypeSchema = z.enum([
  "session_started",
  "tool_started",
  "tool_succeeded",
  "tool_failed",
  "tool_blocked",
  "file_read",
  "file_changed",
  "command_ran",
  "diff_recorded",
  "retry_recorded",
  "decision_recorded",
  "session_finished",
]);

export const AgentOperationalFileReadEvidenceSchema = z.object({
  path: z.string().trim().min(1),
  versionHash: z.string().trim().min(16).nullable().default(null),
  baseVersion: ProjectFileVersionSchema.nullable().default(null),
  readAt: z.string().datetime(),
});

export const AgentOperationalFileChangeSchema = z.object({
  path: z.string().trim().min(1),
  changeType: z.enum(["create", "update", "delete", "unknown"]).default("unknown"),
  newVersionHash: z.string().trim().min(16).nullable().default(null),
  additions: z.number().int().nonnegative().nullable().default(null),
  deletions: z.number().int().nonnegative().nullable().default(null),
  replacementCount: z.number().int().nonnegative().nullable().default(null),
  diffPreview: z.string().default(""),
  patchStrategy: z.string().trim().min(1).nullable().default(null),
  structuralIntentKinds: z.array(z.string().trim().min(1)).default([]),
  structuralSymbolName: z.string().trim().min(1).nullable().default(null),
  structuralSymbolKind: z.string().trim().min(1).nullable().default(null),
  preconditionCount: z.number().int().nonnegative().default(0),
  preconditionHash: z.string().trim().min(8).nullable().default(null),
  changedAt: z.string().datetime(),
});

export const AgentOperationalCommandEvidenceSchema = z.object({
  commandId: z.string().trim().min(1),
  status: ShellCommandStatusSchema.or(z.enum(["succeeded", "failed"])),
  exitCode: z.number().int().nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  ranAt: z.string().datetime(),
});

export const AgentOperationalToolUsageSchema = z.object({
  toolName: AgentToolNameSchema,
  status: AgentToolCallStatusSchema,
  count: z.number().int().nonnegative(),
  lastUsedAt: z.string().datetime(),
});

export const AgentOperationalErrorSchema = z.object({
  eventId: z.string().uuid(),
  toolName: AgentToolNameSchema.nullable().default(null),
  message: z.string().trim().min(1),
  occurredAt: z.string().datetime(),
});

export const AgentOperationalSessionSchema = z.object({
  id: z.string().uuid(),
  workflowThreadId: z.string().uuid(),
  projectId: z.string().uuid(),
  userStoryId: z.string().uuid(),
  runId: z.string().uuid().nullable().default(null),
  codeChangeSetId: z.string().uuid().nullable().default(null),
  agentName: AgentNameSchema,
  agentProfileId: AgentProfileIdSchema,
  status: AgentOperationalSessionStatusSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable().default(null),
  lastError: z.string().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const AgentOperationEventSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  type: AgentOperationEventTypeSchema,
  toolName: AgentToolNameSchema.nullable().default(null),
  toolStatus: AgentToolCallStatusSchema.nullable().default(null),
  summary: z.string().nullable().default(null),
  filePaths: z.array(z.string().trim().min(1)).default([]),
  commandIds: z.array(z.string().trim().min(1)).default([]),
  errorMessage: z.string().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export const AgentOperationProjectionSchema = z.object({
  session: AgentOperationalSessionSchema,
  status: AgentOperationalSessionStatusSchema,
  filesRead: z.array(AgentOperationalFileReadEvidenceSchema).default([]),
  filesChanged: z.array(AgentOperationalFileChangeSchema).default([]),
  toolsUsed: z.array(AgentOperationalToolUsageSchema).default([]),
  commands: z.array(AgentOperationalCommandEvidenceSchema).default([]),
  errors: z.array(AgentOperationalErrorSchema).default([]),
  retryCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  lastEventAt: z.string().datetime().nullable().default(null),
  lastSummary: z.string().nullable().default(null),
});

export type AgentOperationalSessionStatus = z.infer<
  typeof AgentOperationalSessionStatusSchema
>;
export type AgentOperationEventType = z.infer<
  typeof AgentOperationEventTypeSchema
>;
export type AgentOperationalFileReadEvidence = z.infer<
  typeof AgentOperationalFileReadEvidenceSchema
>;
export type AgentOperationalFileChange = z.infer<
  typeof AgentOperationalFileChangeSchema
>;
export type AgentOperationalCommandEvidence = z.infer<
  typeof AgentOperationalCommandEvidenceSchema
>;
export type AgentOperationalToolUsage = z.infer<
  typeof AgentOperationalToolUsageSchema
>;
export type AgentOperationalError = z.infer<
  typeof AgentOperationalErrorSchema
>;
export type AgentOperationalSession = z.infer<
  typeof AgentOperationalSessionSchema
>;
export type AgentOperationEvent = z.infer<typeof AgentOperationEventSchema>;
export type AgentOperationProjection = z.infer<
  typeof AgentOperationProjectionSchema
>;

export function projectAgentOperationalSession(
  session: AgentOperationalSession,
  events: readonly AgentOperationEvent[]
): AgentOperationProjection {
  const orderedEvents = [...events].sort((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    return left.createdAt.localeCompare(right.createdAt);
  });
  const filesRead = new Map<string, AgentOperationalFileReadEvidence>();
  const filesChanged = new Map<string, AgentOperationalFileChange>();
  const toolsUsed = new Map<string, AgentOperationalToolUsage>();
  const commands = new Map<string, AgentOperationalCommandEvidence>();
  const errors: AgentOperationalError[] = [];
  let retryCount = 0;
  let lastEventAt: string | null = null;
  let lastSummary: string | null = null;

  for (const event of orderedEvents) {
    lastEventAt = event.createdAt;
    if (event.summary) lastSummary = event.summary;

    if (event.toolName && event.toolStatus) {
      const previous = toolsUsed.get(event.toolName);
      toolsUsed.set(event.toolName, {
        toolName: event.toolName,
        status: event.toolStatus,
        count:
          event.type === "tool_started"
            ? (previous?.count ?? 0) + 1
            : previous?.count ?? 1,
        lastUsedAt: event.createdAt,
      });
    }

    if (event.type === "file_read") {
      const evidence = readEvidenceFromEvent(event);
      if (evidence) filesRead.set(evidence.path, evidence);
    }

    if (event.type === "file_changed") {
      const change = fileChangeFromEvent(event);
      if (change) filesChanged.set(change.path, change);
    }

    if (event.type === "command_ran") {
      const command = commandEvidenceFromEvent(event);
      if (command) commands.set(command.commandId, command);
    }

    if (event.type === "retry_recorded") retryCount += 1;

    if (event.errorMessage) {
      errors.push(
        AgentOperationalErrorSchema.parse({
          eventId: event.id,
          toolName: event.toolName,
          message: event.errorMessage,
          occurredAt: event.createdAt,
        })
      );
    }
  }

  return AgentOperationProjectionSchema.parse({
    session,
    status: session.status,
    filesRead: [...filesRead.values()],
    filesChanged: [...filesChanged.values()],
    toolsUsed: [...toolsUsed.values()],
    commands: [...commands.values()],
    errors,
    retryCount,
    eventCount: orderedEvents.length,
    lastEventAt,
    lastSummary,
  });
}

export function findAgentOperationalReadEvidence(
  projection: AgentOperationProjection,
  path: string
): AgentOperationalFileReadEvidence | undefined {
  const normalized = normalizeOperationalPath(path);
  return projection.filesRead.find(
    (evidence) => normalizeOperationalPath(evidence.path) === normalized
  );
}

export function projectAgentOperationalFileOperations(
  session: AgentOperationalSession,
  events: readonly AgentOperationEvent[]
): AgentFileOperationTelemetry[] {
  const nodeId = HORUS_NODE_BY_AGENT[session.agentName] ?? null;
  return [...events]
    .sort((left, right) => {
      if (left.sequence !== right.sequence) return left.sequence - right.sequence;
      return left.createdAt.localeCompare(right.createdAt);
    })
    .flatMap((event) => fileOperationsFromOperationalEvent(session, event, nodeId));
}

function fileOperationsFromOperationalEvent(
  session: AgentOperationalSession,
  event: AgentOperationEvent,
  nodeId: HorusWorkflowNodeId | null
): AgentFileOperationTelemetry[] {
  if (event.type === "file_read") {
    const evidence = readEvidenceFromEvent(event);
    if (!evidence) return [];
    return [
      buildOperation(session, event, evidence.path, {
        nodeId,
        operationType: "read",
        status: "read",
        toolName: "read_file",
        versionHash: evidence.versionHash,
        summary: event.summary ?? `Leu ${evidence.path}.`,
      }),
    ];
  }

  if (event.type === "file_changed") {
    const change = fileChangeFromEvent(event);
    if (!change) return [];
    return [
      buildOperation(session, event, change.path, {
        nodeId,
        operationType: operationTypeFromChangeType(change.changeType),
        status: "changed",
        changeType: change.changeType,
        toolName: event.toolName ?? toolNameFromChangeType(change.changeType),
        newVersionHash: change.newVersionHash,
        additions: change.additions,
        deletions: change.deletions,
        replacementCount: change.replacementCount,
        diffPreview: change.diffPreview,
        patchStrategy: change.patchStrategy,
        structuralIntentKinds: change.structuralIntentKinds,
        structuralSymbolName: change.structuralSymbolName,
        structuralSymbolKind: change.structuralSymbolKind,
        preconditionCount: change.preconditionCount,
        preconditionHash: change.preconditionHash,
        summary: event.summary ?? `${change.changeType} em ${change.path}.`,
      }),
    ];
  }

  if (event.type === "tool_started") {
    return event.filePaths.map((path) =>
      buildOperation(session, event, path, {
        nodeId,
        operationType: operationTypeFromToolName(event.toolName),
        status: "running",
        toolName: event.toolName,
        summary: event.summary,
      })
    );
  }

  if (event.type === "tool_failed" || event.type === "tool_blocked") {
    return event.filePaths.map((path) =>
      buildOperation(session, event, path, {
        nodeId,
        operationType: operationTypeFromToolName(event.toolName),
        status: event.type === "tool_blocked" ? "blocked" : "failed",
        toolName: event.toolName,
        errorMessage: event.errorMessage,
        summary: event.summary,
      })
    );
  }

  if (event.type === "diff_recorded") {
    return event.filePaths.map((path) =>
      buildOperation(session, event, path, {
        nodeId,
        operationType: "diff",
        status: "validated",
        toolName: event.toolName ?? "get_git_diff",
        summary: event.summary,
      })
    );
  }

  if (event.type === "command_ran") {
    const command = commandEvidenceFromEvent(event);
    return event.filePaths.map((path) =>
      buildOperation(session, event, path, {
        nodeId,
        operationType: "validate",
        status: command?.status === "failed" ? "failed" : "validated",
        toolName: event.toolName ?? "run_validation_command",
        commandIds: event.commandIds,
        errorMessage: event.errorMessage,
        summary: event.summary,
      })
    );
  }

  if (event.type === "decision_recorded" && isNoopEditDecision(event)) {
    return event.filePaths.map((path) =>
      buildOperation(session, event, path, {
        nodeId,
        operationType: "update",
        status: "skipped",
        toolName: event.toolName ?? "edit_file",
        summary: event.summary ?? `Edição sem mudança real em ${path}.`,
      })
    );
  }

  return [];
}

function buildOperation(
  session: AgentOperationalSession,
  event: AgentOperationEvent,
  path: string,
  input: {
    nodeId: HorusWorkflowNodeId | null;
    operationType: AgentFileOperationType;
    status: AgentFileOperationTelemetry["status"];
    toolName?: AgentToolName | null;
    changeType?: AgentOperationalFileChange["changeType"] | null;
    versionHash?: string | null;
    newVersionHash?: string | null;
    additions?: number | null;
    deletions?: number | null;
    replacementCount?: number | null;
    diffPreview?: string;
    patchStrategy?: string | null;
    structuralIntentKinds?: string[];
    structuralSymbolName?: string | null;
    structuralSymbolKind?: string | null;
    preconditionCount?: number;
    preconditionHash?: string | null;
    commandIds?: string[];
    errorMessage?: string | null;
    summary?: string | null;
  }
): AgentFileOperationTelemetry {
  return AgentFileOperationTelemetrySchema.parse({
    id: `${session.id}:${event.sequence}:${event.type}:${encodeURIComponent(path)}`,
    threadId: session.workflowThreadId,
    sequence: event.sequence,
    workflowSequence: null,
    operationalSequence: event.sequence,
    sourceEventId: null,
    sourceOperationEventId: event.id,
    operationalSessionId: session.id,
    runId: session.runId,
    attemptId: null,
    userStoryId: session.userStoryId,
    nodeId: input.nodeId,
    agentName: session.agentName,
    agentProfileId: session.agentProfileId,
    toolName: input.toolName ?? event.toolName,
    path,
    operationType: input.operationType,
    status: input.status,
    changeType: input.changeType ?? null,
    versionHash: input.versionHash ?? null,
    newVersionHash: input.newVersionHash ?? null,
    additions: input.additions ?? null,
    deletions: input.deletions ?? null,
    replacementCount: input.replacementCount ?? null,
    diffPreview: input.diffPreview ?? "",
    patchStrategy: input.patchStrategy ?? operationPatchStrategy(event),
    structuralIntentKinds:
      input.structuralIntentKinds ?? operationStructuralIntentKinds(event),
    structuralSymbolName:
      input.structuralSymbolName ?? operationStructuralSymbolName(event),
    structuralSymbolKind:
      input.structuralSymbolKind ?? operationStructuralSymbolKind(event),
    preconditionCount: input.preconditionCount ?? operationPreconditionCount(event),
    preconditionHash: input.preconditionHash ?? operationPreconditionHash(event),
    commandIds: input.commandIds ?? event.commandIds,
    errorMessage: input.errorMessage ?? event.errorMessage,
    summary: input.summary ?? event.summary,
    timestamp: event.createdAt,
  });
}

function readEvidenceFromEvent(
  event: AgentOperationEvent
): AgentOperationalFileReadEvidence | null {
  const metadata = asRecord(event.metadata);
  const evidence = asRecord(metadata["evidence"]);
  const path = stringValue(evidence["path"]) ?? event.filePaths[0];
  if (!path) return null;
  const baseVersion = ProjectFileVersionSchema.safeParse(evidence["baseVersion"]);
  return AgentOperationalFileReadEvidenceSchema.parse({
    path,
    versionHash: stringValue(evidence["versionHash"]) ?? null,
    baseVersion: baseVersion.success ? baseVersion.data : null,
    readAt: stringValue(evidence["readAt"]) ?? event.createdAt,
  });
}

function fileChangeFromEvent(
  event: AgentOperationEvent
): AgentOperationalFileChange | null {
  const metadata = asRecord(event.metadata);
  const change = asRecord(metadata["change"]);
  const path = stringValue(change["path"]) ?? event.filePaths[0];
  if (!path) return null;
  return AgentOperationalFileChangeSchema.parse({
    path,
    changeType: changeTypeValue(change["changeType"]),
    newVersionHash: stringValue(change["newVersionHash"]) ?? null,
    additions: numberValue(change["additions"]),
    deletions: numberValue(change["deletions"]),
    replacementCount: numberValue(change["replacementCount"]),
    diffPreview: stringValue(change["diffPreview"]) ?? "",
    patchStrategy: stringValue(change["patchStrategy"]) ?? null,
    structuralIntentKinds: stringArrayValue(change["structuralIntentKinds"]),
    structuralSymbolName: stringValue(change["structuralSymbolName"]) ?? null,
    structuralSymbolKind: stringValue(change["structuralSymbolKind"]) ?? null,
    preconditionCount: integerValue(change["preconditionCount"]) ?? 0,
    preconditionHash: stringValue(change["preconditionHash"]) ?? null,
    changedAt: stringValue(change["changedAt"]) ?? event.createdAt,
  });
}

function commandEvidenceFromEvent(
  event: AgentOperationEvent
): AgentOperationalCommandEvidence | null {
  const metadata = asRecord(event.metadata);
  const command = asRecord(metadata["command"]);
  const commandId = stringValue(command["commandId"]) ?? event.commandIds[0];
  if (!commandId) return null;
  return AgentOperationalCommandEvidenceSchema.parse({
    commandId,
    status: stringValue(command["status"]) ?? "succeeded",
    exitCode: integerValue(command["exitCode"]),
    durationMs: integerValue(command["durationMs"]),
    ranAt: stringValue(command["ranAt"]) ?? event.createdAt,
  });
}

function operationTypeFromToolName(
  toolName: AgentToolName | null
): AgentFileOperationType {
  if (toolName === "read_file" || toolName === "read_file_readonly") return "read";
  if (toolName === "write_file") return "create";
  if (toolName === "edit_file" || toolName === "save_file" || toolName === "replace_file_range") {
    return "update";
  }
  if (toolName === "delete_file") return "delete";
  if (toolName === "apply_code_change_set") return "apply";
  if (toolName === "run_command" || toolName === "run_validation_command") return "validate";
  if (toolName === "get_git_diff") return "diff";
  return "unknown";
}

function operationTypeFromChangeType(
  changeType: AgentOperationalFileChange["changeType"]
): AgentFileOperationType {
  if (changeType === "create" || changeType === "update" || changeType === "delete") {
    return changeType;
  }
  return "unknown";
}

function toolNameFromChangeType(
  changeType: AgentOperationalFileChange["changeType"]
): AgentToolName | null {
  if (changeType === "create") return "write_file";
  if (changeType === "update") return "edit_file";
  if (changeType === "delete") return "delete_file";
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function changeTypeValue(value: unknown): AgentOperationalFileChange["changeType"] {
  return value === "create" || value === "update" || value === "delete"
    ? value
    : "unknown";
}

function operationMetadata(event: AgentOperationEvent): Record<string, unknown> {
  const metadata = asRecord(event.metadata);
  const direct = asRecord(metadata["codeChangeOperation"]);
  if (Object.keys(direct).length > 0) return direct;

  const change = asRecord(metadata["change"]);
  const nested = asRecord(change["codeChangeOperation"]);
  if (Object.keys(nested).length > 0) return nested;
  return change;
}

function operationPatchStrategy(event: AgentOperationEvent): string | null {
  return stringValue(operationMetadata(event)["patchStrategy"]) ?? null;
}

function operationStructuralIntentKinds(event: AgentOperationEvent): string[] {
  return stringArrayValue(operationMetadata(event)["structuralIntentKinds"]);
}

function operationStructuralSymbolName(event: AgentOperationEvent): string | null {
  return stringValue(operationMetadata(event)["structuralSymbolName"]) ?? null;
}

function operationStructuralSymbolKind(event: AgentOperationEvent): string | null {
  return stringValue(operationMetadata(event)["structuralSymbolKind"]) ?? null;
}

function operationPreconditionCount(event: AgentOperationEvent): number {
  return integerValue(operationMetadata(event)["preconditionCount"]) ?? 0;
}

function operationPreconditionHash(event: AgentOperationEvent): string | null {
  return stringValue(operationMetadata(event)["preconditionHash"]) ?? null;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function isNoopEditDecision(event: AgentOperationEvent): boolean {
  const metadata = asRecord(event.metadata);
  return metadata["decisionType"] === "noop_edit_skipped";
}

function normalizeOperationalPath(path: string): string {
  return path.trim().split("\\").join("/");
}
