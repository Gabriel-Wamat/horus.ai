import type {
  AgentName,
  AgentOperationEventType,
  AgentOperationProjection,
  AgentOperationalSessionStatus,
  AgentProfileId,
  AgentToolCallStatus,
  AgentToolName,
  CodeChangeSet,
} from "@u-build/shared";
import { randomUUID } from "node:crypto";
import type { AgentOperationalSessionRepository } from "../ports/RepositoryPorts.js";

export interface AgentToolLoopOperationalSessionInput {
  agentName: AgentName;
  agentProfileId: AgentProfileId;
  projectId: string;
  threadId: string;
  userStoryId: string;
  codeChangeSet: CodeChangeSet;
  operationalSessionRepository?: AgentOperationalSessionRepository | undefined;
}

export interface AgentToolLoopOperationEvent {
  type: AgentOperationEventType;
  toolName?: AgentToolName | null | undefined;
  toolStatus?: AgentToolCallStatus | null | undefined;
  summary?: string | null | undefined;
  filePaths?: string[] | undefined;
  commandIds?: string[] | undefined;
  errorMessage?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt?: string | undefined;
}

export interface AgentToolLoopOperationalSessionSummary {
  id: string;
  status: AgentOperationalSessionStatus;
  filesRead: string[];
  filesChanged: string[];
  toolsUsed: string[];
  commandIds: string[];
  errors: string[];
  eventCount: number;
  lastSummary: string | null;
}

export async function startOperationalSession(
  input: AgentToolLoopOperationalSessionInput
): Promise<string | undefined> {
  if (!input.operationalSessionRepository) return undefined;
  const sessionId = randomUUID();
  await input.operationalSessionRepository.createSession({
    id: sessionId,
    workflowThreadId: input.threadId,
    projectId: input.projectId,
    userStoryId: input.userStoryId,
    runId: input.codeChangeSet.runId ?? null,
    codeChangeSetId: input.codeChangeSet.id,
    agentName: input.agentName,
    agentProfileId: input.agentProfileId,
    metadata: {
      changeSetStatus: input.codeChangeSet.status,
      operationCount: input.codeChangeSet.operations.length,
    },
  });
  await recordOperation(input, sessionId, {
    type: "session_started",
    summary: `Sessão operacional iniciada para ${input.agentName}.`,
  });
  return sessionId;
}

export async function finishOperationalSession(
  input: AgentToolLoopOperationalSessionInput,
  sessionId: string | undefined,
  status: "completed" | "failed" | "blocked" | "cancelled",
  summary: string
): Promise<void> {
  if (!sessionId || !input.operationalSessionRepository) return;
  const finishedAt = new Date().toISOString();
  await input.operationalSessionRepository.updateSessionStatus({
    sessionId,
    status,
    finishedAt,
    lastError: status === "completed" ? null : summary,
  });
  await recordOperation(input, sessionId, {
    type: "session_finished",
    summary,
    errorMessage: status === "completed" ? null : summary,
    metadata: { terminalStatus: status },
    createdAt: finishedAt,
  });
}

export async function recordOperation(
  input: AgentToolLoopOperationalSessionInput,
  sessionId: string | undefined,
  event: AgentToolLoopOperationEvent
): Promise<void> {
  if (!sessionId || !input.operationalSessionRepository) return;
  await input.operationalSessionRepository.appendEvent({
    id: randomUUID(),
    sessionId,
    type: event.type,
    toolName: event.toolName ?? null,
    toolStatus: event.toolStatus ?? null,
    summary: event.summary ?? null,
    filePaths: event.filePaths ?? [],
    commandIds: event.commandIds ?? [],
    errorMessage: event.errorMessage ?? null,
    metadata: event.metadata ?? {},
    ...(event.createdAt ? { createdAt: event.createdAt } : {}),
  });
}

export async function operationalSessionSummary(
  input: AgentToolLoopOperationalSessionInput,
  sessionId: string | undefined
): Promise<{ operationalSession: AgentToolLoopOperationalSessionSummary } | {}> {
  if (!sessionId || !input.operationalSessionRepository) return {};
  const projection = await input.operationalSessionRepository.getProjection(sessionId);
  if (!projection) return {};
  return { operationalSession: summarizeOperationalSession(projection) };
}

function summarizeOperationalSession(
  projection: AgentOperationProjection
): AgentToolLoopOperationalSessionSummary {
  return {
    id: projection.session.id,
    status: projection.status,
    filesRead: projection.filesRead.map((file) => file.path),
    filesChanged: projection.filesChanged.map((file) => file.path),
    toolsUsed: projection.toolsUsed.map((tool) => tool.toolName),
    commandIds: projection.commands.map((command) => command.commandId),
    errors: projection.errors.map((error) => error.message),
    eventCount: projection.eventCount,
    lastSummary: projection.lastSummary,
  };
}
