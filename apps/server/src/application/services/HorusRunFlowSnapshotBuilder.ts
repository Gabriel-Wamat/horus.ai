import {
  HorusRunLocatorSchema,
  HorusRunSnapshotSchema,
  type AgentRunPhase,
  type HorusAgentEvidenceSummary,
  type HorusRunEventSnapshot,
  type HorusRunLocator,
  type HorusRunSnapshot,
  type HorusWorkflowStepSnapshot,
  type IStorageProvider,
  type WorkflowState,
} from "@u-build/shared";
import type { WorkflowEventLogRepository } from "../../infrastructure/repositories/contracts.js";
import {
  deriveAgentExecutions,
  HORUS_NODE_LABELS,
  resolveCurrentNode,
} from "./horusRunFlowMapping.js";
import { ValidationGateAggregator } from "./ValidationGateAggregator.js";

export class HorusRunFlowSnapshotBuilder {
  constructor(
    private readonly storage: IStorageProvider,
    private readonly events: WorkflowEventLogRepository,
    private readonly validationAggregator = new ValidationGateAggregator()
  ) {}

  async listRuns(): Promise<HorusRunLocator[]> {
    const threadIds = await this.storage.list();
    const states = await Promise.all(
      threadIds.map(async (threadId) => this.storage.load(threadId))
    );
    return states
      .filter((state): state is WorkflowState => Boolean(state))
      .map((state) => {
        const executions = deriveAgentExecutions(state);
        const currentNode = resolveCurrentNode(state, [], executions);
        const currentStory = state.userStories[state.currentUSIndex] ?? state.userStories[0];
        return HorusRunLocatorSchema.parse({
          threadId: state.threadId,
          workspaceFolderId: state.workspaceFolderId,
          workflowMode: state.workflowMode,
          status: state.status,
          title: currentStory?.title ?? state.threadId,
          startedAt: state.startedAt,
          completedAt: state.completedAt,
          currentNode,
        });
      })
      .sort((left, right) =>
        (right.completedAt ?? right.startedAt).localeCompare(
          left.completedAt ?? left.startedAt
        )
      );
  }

  async getRun(threadId: string): Promise<HorusRunSnapshot | null> {
    const state = await this.storage.load(threadId);
    if (!state) return null;
    const events = await this.events.list(threadId);
    return this.buildSnapshot(state, events);
  }

  async listEvents(threadId: string): Promise<HorusRunEventSnapshot[]> {
    return this.events.list(threadId);
  }

  async listEventsAfter(
    threadId: string,
    sequence: number
  ): Promise<HorusRunEventSnapshot[]> {
    return this.events.listAfter(threadId, sequence);
  }

  private buildSnapshot(
    state: WorkflowState,
    events: HorusRunEventSnapshot[]
  ): HorusRunSnapshot {
    const agentExecutions = deriveAgentExecutions(state);
    const currentStory = state.userStories[state.currentUSIndex] ?? null;
    const currentNode = resolveCurrentNode(state, events, agentExecutions);
    const validationSummary = this.validationAggregator.summarize(state.validationGates ?? []);
    return HorusRunSnapshotSchema.parse({
      threadId: state.threadId,
      workspaceFolderId: state.workspaceFolderId,
      workflowMode: state.workflowMode,
      status: state.status,
      currentPhase: events.at(-1)?.phase ?? phaseFromStatus(state.status),
      currentNode,
      currentUserStoryId: currentStory?.id ?? null,
      currentUserStoryTitle: currentStory?.title ?? null,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      errorMessage: state.errorMessage,
      userStories: state.userStories.map((story, index) => ({
        id: story.id,
        title: story.title,
        index,
        hasSpec: Boolean(state.specs[story.id]),
      })),
      steps: deriveSteps(state, events, agentExecutions),
      agentExecutions,
      events,
      evidenceSummaries: deriveEvidenceSummaries(state, events, agentExecutions),
      validationSummary,
      sourceState: state,
    });
  }
}

function deriveEvidenceSummaries(
  state: WorkflowState,
  events: HorusRunEventSnapshot[],
  executions: ReturnType<typeof deriveAgentExecutions>
): HorusAgentEvidenceSummary[] {
  const nodeIds = [...new Set([
    ...executions.map((execution) => execution.nodeId),
    ...events.flatMap((event) => (event.nodeId ? [event.nodeId] : [])),
  ])];
  return nodeIds.map((nodeId) => {
    const nodeEvents = events.filter((event) => event.nodeId === nodeId);
    const nodeExecutions = executions.filter((execution) => execution.nodeId === nodeId);
    const latestEvent = nodeEvents.at(-1) ?? null;
    const agentName = nodeExecutions.at(-1)?.agentName ?? latestEvent?.agentName;
    const filePaths = dedupe(nodeEvents.flatMap((event) => event.filePaths ?? []));
    const changedFiles = dedupe(
      nodeEvents
        .filter((event) => event.eventType === "patch_proposed" || event.eventType === "patch_applied")
        .flatMap((event) => event.filePaths ?? [])
    );
    const filesRead = filePaths.filter((path) => !changedFiles.includes(path));
    const toolNames = dedupe(
      nodeEvents
        .filter((event) => event.eventType.startsWith("tool_call_"))
        .map((event) => String(event.metadata?.["toolName"] ?? event.title))
    );
    const commandIds = dedupe(nodeEvents.flatMap((event) => event.commandIds ?? []));
    const errorMessages = dedupe(
      nodeEvents.flatMap((event) => event.errorMessage ? [event.errorMessage] : [])
    );
    return {
      id: `evidence:${nodeId}`,
      nodeId,
      ...(agentName ? { agentName } : {}),
      title: HORUS_NODE_LABELS[nodeId],
      phase: latestEvent?.phase ?? phaseFromStatus(state.status),
      status: nodeExecutions.at(-1)?.status ?? (latestEvent?.type === "error" ? "error" : state.status),
      latestEventTitle: latestEvent?.title ?? null,
      filesRead,
      filesChanged: changedFiles,
      toolNames,
      commandIds,
      validationGates: state.validationGates ?? [],
      errorMessages,
    };
  });
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function phaseFromStatus(status: WorkflowState["status"]): AgentRunPhase {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "error") return "failed";
  return status === "running" ? "received" : "planning";
}

function deriveSteps(
  state: WorkflowState,
  events: HorusRunEventSnapshot[],
  executions: ReturnType<typeof deriveAgentExecutions>
): HorusWorkflowStepSnapshot[] {
  const observed = new Map<string, HorusWorkflowStepSnapshot>();
  for (const execution of executions) {
    observed.set(execution.nodeId, {
      id: `step:${execution.nodeId}`,
      nodeId: execution.nodeId,
      label: HORUS_NODE_LABELS[execution.nodeId],
      status: execution.status,
      userStoryId: execution.userStoryId,
      latency_ms: execution.executionTimeMs ?? null,
      error_message: execution.errorMessage ?? null,
      created_at: execution.completedAt ?? state.startedAt,
    });
  }

  for (const event of events) {
    if (!event.nodeId || observed.has(event.nodeId)) continue;
    observed.set(event.nodeId, {
      id: `event-step:${event.sequence}:${event.nodeId}`,
      nodeId: event.nodeId,
      label: HORUS_NODE_LABELS[event.nodeId],
      status: event.type === "error" ? "error" : state.status,
      userStoryId: event.userStoryId ?? null,
      created_at: event.timestamp,
    });
  }

  if (state.status === "completed") {
    observed.set("finalize", {
      id: "step:finalize",
      nodeId: "finalize",
      label: HORUS_NODE_LABELS.finalize,
      status: "completed",
      created_at: state.completedAt ?? new Date().toISOString(),
    });
  }

  if (state.status === "error" || state.status === "cancelled") {
    observed.set("fail", {
      id: "step:fail",
      nodeId: "fail",
      label: HORUS_NODE_LABELS.fail,
      status: state.status,
      error_message: state.errorMessage ?? null,
      created_at: state.completedAt ?? new Date().toISOString(),
    });
  }

  return [...observed.values()].sort((left, right) =>
    left.created_at.localeCompare(right.created_at)
  );
}
