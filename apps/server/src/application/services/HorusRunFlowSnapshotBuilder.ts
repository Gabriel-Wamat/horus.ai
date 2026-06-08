import {
  AgentFileOperationTelemetrySchema,
  HorusRunLocatorSchema,
  HorusRunSnapshotSchema,
  AgentToolNameSchema,
  AgentOperationTimelineGroupSchema,
  type AgentRunbookEntry,
  type AgentFileOperationTelemetry,
  type AgentFileOperationType,
  type AgentOperationTimelineGroup,
  type AgentOperationTimelineItem,
  type AgentOperationTimelineStatus,
  type AgentRunPhase,
  type HorusAgentEvidenceSummary,
  type HorusRunEventSnapshot,
  type HorusRunLocator,
  type HorusRunSnapshot,
  type HorusWorkflowStepSnapshot,
  type IStorageProvider,
  type WorkflowState,
  projectAgentOperationalFileOperations,
} from "@u-build/shared";
import type {
  AgentOperationalSessionRepository,
  WorkflowEventLogRepository,
} from "../ports/RepositoryPorts.js";
import {
  deriveAgentExecutions,
  HORUS_NODE_LABELS,
  resolveCurrentNode,
} from "./horusRunFlowMapping.js";
import { AgentRunbookService } from "./AgentRunbookService.js";
import { ValidationGateAggregator } from "./ValidationGateAggregator.js";

export class HorusRunFlowSnapshotBuilder {
  constructor(
    private readonly storage: IStorageProvider,
    private readonly events: WorkflowEventLogRepository,
    private readonly operationalSessions?: AgentOperationalSessionRepository,
    private readonly runbook = new AgentRunbookService(),
    private readonly validationAggregator = new ValidationGateAggregator()
  ) {}

  async listRuns(options: {
    projectId?: string;
    limit?: number;
    offset?: number;
    query?: string;
  } = {}): Promise<HorusRunLocator[]> {
    const threadIds = await this.storage.list();
    const states = await Promise.all(
      threadIds.map(async (threadId) => this.storage.load(threadId))
    );
    const runs = states
      .filter((state): state is WorkflowState => Boolean(state))
      .map((state) => {
        const executions = deriveAgentExecutions(state);
        const currentNode = resolveCurrentNode(state, [], executions);
        const currentStory = state.userStories[state.currentUSIndex] ?? state.userStories[0];
        return HorusRunLocatorSchema.parse({
          threadId: state.threadId,
          workspaceFolderId: state.workspaceFolderId,
          frontendProjectId: state.frontendProjectId,
          workflowMode: state.workflowMode,
          status: state.status,
          title: currentStory?.title ?? state.threadId,
          startedAt: state.startedAt,
          completedAt: state.completedAt,
          currentNode,
        });
      })
      .sort(compareRunLocatorsForHistory);
    const projectRuns = options.projectId
      ? runs.filter((run) => runBelongsToProject(run, options.projectId!))
      : runs;
    const queryRuns = options.query
      ? projectRuns.filter((run) => runMatchesQuery(run, options.query!))
      : projectRuns;
    const offset = options.offset ?? 0;
    return options.limit
      ? queryRuns.slice(offset, offset + options.limit)
      : queryRuns.slice(offset);
  }

  async getRun(threadId: string): Promise<HorusRunSnapshot | null> {
    const state = await this.storage.load(threadId);
    if (!state) return null;
    const events = await this.events.list(threadId);
    const [runbookEntries, fileOperations] = await Promise.all([
      this.buildRunbook(state, events),
      this.buildFileOperations(state, events),
    ]);
    return this.buildSnapshot(state, events, runbookEntries, fileOperations);
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

  async listFileOperations(threadId: string): Promise<AgentFileOperationTelemetry[]> {
    const state = await this.storage.load(threadId);
    if (!state) return [];
    const events = await this.events.list(threadId);
    return this.buildFileOperations(state, events);
  }

  async listFileOperationsAfter(
    threadId: string,
    sequence: number
  ): Promise<AgentFileOperationTelemetry[]> {
    return (await this.listFileOperations(threadId)).filter(
      (operation) => operation.sequence > sequence
    );
  }

  private buildSnapshot(
    state: WorkflowState,
    events: HorusRunEventSnapshot[],
    runbookEntries: AgentRunbookEntry[] = [],
    fileOperations: AgentFileOperationTelemetry[] = []
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
      operationTimeline: buildAgentOperationTimeline({
        events,
        fileOperations,
      }),
      runbookEntries,
      validationSummary,
      sourceState: state,
    });
  }

  private async buildRunbook(
    state: WorkflowState,
    events: HorusRunEventSnapshot[]
  ): Promise<AgentRunbookEntry[]> {
    const workflowEntries = this.runbook.buildFromWorkflowEvents(events);
    if (!this.operationalSessions) return workflowEntries;

    const sessions = await this.operationalSessions.listSessionsByWorkflowThread(
      state.threadId
    );
    const operationalEntries: AgentRunbookEntry[] = [];
    for (const session of sessions) {
      const [projection, sessionEvents] = await Promise.all([
        this.operationalSessions.getProjection(session.id),
        this.operationalSessions.listEvents(session.id),
      ]);
      if (!projection) continue;
      operationalEntries.push(
        ...this.runbook.buildFromOperationalProjection(projection, sessionEvents)
      );
    }
    return this.runbook.merge([...workflowEntries, ...operationalEntries]);
  }

  private async buildFileOperations(
    state: WorkflowState,
    events: HorusRunEventSnapshot[]
  ): Promise<AgentFileOperationTelemetry[]> {
    const workflowOperations = events.flatMap(fileOperationsFromRunEvent);
    const operationalOperations: AgentFileOperationTelemetry[] = [];
    if (this.operationalSessions) {
      const sessions = await this.operationalSessions.listSessionsByWorkflowThread(
        state.threadId
      );
      for (const session of sessions) {
        const sessionEvents = await this.operationalSessions.listEvents(session.id);
        operationalOperations.push(
          ...projectAgentOperationalFileOperations(session, sessionEvents)
        );
      }
    }

    return [...workflowOperations, ...operationalOperations]
      .sort((left, right) => {
        const byTime = left.timestamp.localeCompare(right.timestamp);
        if (byTime !== 0) return byTime;
        return left.id.localeCompare(right.id);
      })
      .map((operation, index) =>
        AgentFileOperationTelemetrySchema.parse({
          ...operation,
          sequence: index + 1,
        })
      );
  }
}

function fileOperationsFromRunEvent(
  event: HorusRunEventSnapshot
): AgentFileOperationTelemetry[] {
  if (!event.filePaths?.length) return [];
  const toolName = toolNameFromRunEvent(event);
  return event.filePaths.map((path, index) =>
    AgentFileOperationTelemetrySchema.parse({
      id: `${event.id}:file:${index}:${encodeURIComponent(path)}`,
      threadId: event.threadId,
      sequence: event.sequence,
      workflowSequence: event.sequence,
      operationalSequence: null,
      sourceEventId: event.id,
      sourceOperationEventId: null,
      operationalSessionId: stringMetadata(event, "operationalSessionId"),
      runId: null,
      attemptId: null,
      userStoryId: event.userStoryId ?? null,
      nodeId: event.nodeId ?? null,
      agentName: event.agentName ?? null,
      agentProfileId: event.agentProfileId ?? null,
      toolName,
      path,
      operationType: operationTypeFromRunEvent(event, toolName),
      status: operationStatusFromRunEvent(event, toolName),
      changeType: changeTypeFromToolName(toolName),
      commandIds: event.commandIds ?? [],
      errorMessage: event.errorMessage ?? null,
      summary: event.summary ?? event.title,
      timestamp: event.timestamp,
    })
  );
}

function buildAgentOperationTimeline(input: {
  events: HorusRunEventSnapshot[];
  fileOperations: AgentFileOperationTelemetry[];
}): AgentOperationTimelineGroup[] {
  const groups = new Map<string, AgentOperationTimelineGroupDraft>();
  const ensureGroup = (seed: AgentOperationTimelineSeed) => {
    const groupKey = seed.operationalSessionId ?? seed.taskId ?? seed.toolCallId ?? seed.id;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.startedAt =
        seed.timestamp < existing.startedAt ? seed.timestamp : existing.startedAt;
      existing.finishedAt =
        !existing.finishedAt || seed.timestamp > existing.finishedAt
          ? seed.timestamp
          : existing.finishedAt;
      existing.status = mergeTimelineStatus(existing.status, seed.status);
      return existing;
    }
    const draft: AgentOperationTimelineGroupDraft = {
      id: `operation:${encodeURIComponent(groupKey)}`,
      threadId: seed.threadId,
      groupKey,
      operationalSessionId: seed.operationalSessionId,
      taskId: seed.taskId,
      agentName: seed.agentName,
      agentProfileId: seed.agentProfileId,
      nodeId: seed.nodeId,
      toolName: seed.toolName,
      title: seed.title,
      status: seed.status,
      startedAt: seed.timestamp,
      finishedAt: seed.status === "running" ? null : seed.timestamp,
      items: [],
    };
    groups.set(groupKey, draft);
    return draft;
  };

  for (const event of input.events) {
    const status = timelineStatusFromEvent(event);
    const toolName = toolNameFromRunEvent(event);
    const group = ensureGroup({
      id: event.id,
      threadId: event.threadId,
      timestamp: event.timestamp,
      status,
      title: event.agentName
        ? `${formatAgentName(event.agentName)} · ${toolName ?? event.title}`
        : event.title,
      operationalSessionId: stringMetadata(event, "operationalSessionId"),
      taskId: event.taskId ?? stringMetadata(event, "taskId"),
      toolCallId: event.toolCallId ?? stringMetadata(event, "toolCallId"),
      agentName: event.agentName ?? null,
      agentProfileId: event.agentProfileId ?? null,
      nodeId: event.nodeId ?? null,
      toolName,
    });
    const item = timelineItemFromEvent(event, status);
    if (item) group.items.push(item);
  }

  for (const operation of input.fileOperations) {
    const group = ensureGroup({
      id: operation.id,
      threadId: operation.threadId,
      timestamp: operation.timestamp,
      status: timelineStatusFromFileOperation(operation),
      title: operation.agentName
        ? `${formatAgentName(operation.agentName)} · arquivos`
        : "Arquivos",
      operationalSessionId: operation.operationalSessionId,
      taskId: null,
      toolCallId: null,
      agentName: operation.agentName,
      agentProfileId: operation.agentProfileId,
      nodeId: operation.nodeId,
      toolName: operation.toolName,
    });
    group.items.push({
      id: `timeline-file:${operation.id}`,
      kind: operation.operationType === "diff" ? "diff" : "file",
      status: timelineStatusFromFileOperation(operation),
      title: operation.path,
      detail: operation.summary ?? operation.errorMessage,
      timestamp: operation.timestamp,
      sourceEventId: operation.sourceEventId,
      operationId: operation.id,
      commandId: operation.commandIds[0] ?? null,
      taskId: null,
      filePath: operation.path,
      diffId: operation.diffPreview ? operation.id : null,
    });
  }

  return [...groups.values()]
    .map((group) =>
      AgentOperationTimelineGroupSchema.parse({
        ...group,
        items: group.items
          .sort((left, right) =>
            left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id)
          )
          .slice(-80),
      })
    )
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

interface AgentOperationTimelineGroupDraft
  extends Omit<AgentOperationTimelineGroup, "items"> {
  items: AgentOperationTimelineItem[];
}

interface AgentOperationTimelineSeed {
  id: string;
  threadId: string;
  timestamp: string;
  status: AgentOperationTimelineStatus;
  title: string;
  operationalSessionId: string | null;
  taskId: string | null;
  toolCallId: string | null;
  agentName: AgentOperationTimelineGroup["agentName"];
  agentProfileId: AgentOperationTimelineGroup["agentProfileId"];
  nodeId: AgentOperationTimelineGroup["nodeId"];
  toolName: AgentOperationTimelineGroup["toolName"];
}

function timelineItemFromEvent(
  event: HorusRunEventSnapshot,
  status: AgentOperationTimelineStatus
): AgentOperationTimelineItem | null {
  const commandChunk = event.type === "command_output" ? event.chunk ?? "" : "";
  if (event.type === "command_output" && !commandChunk.trim()) return null;
  const kind = timelineItemKindFromEvent(event);
  return {
    id: `timeline-event:${event.id}`,
    kind,
    status,
    title: timelineItemTitle(event),
    detail:
      event.type === "command_output"
        ? commandChunk
        : event.errorMessage ?? event.summary ?? null,
    timestamp: event.timestamp,
    sourceEventId: event.id,
    operationId: null,
    commandId: event.commandId ?? event.commandIds?.[0] ?? null,
    taskId: event.taskId ?? stringMetadata(event, "taskId"),
    filePath: event.filePath ?? event.filePaths?.[0] ?? null,
    diffId: event.diffId ?? stringMetadata(event, "changeSetId"),
  };
}

function timelineItemKindFromEvent(
  event: HorusRunEventSnapshot
): AgentOperationTimelineItem["kind"] {
  if (event.type === "command_output" || event.commandId || event.commandIds?.length) {
    return "command";
  }
  if (event.type === "validation_evidence") return "validation";
  if (event.type === "retry_started" || event.type === "awaiting_retry_approval") {
    return "retry";
  }
  if (event.type === "patch_proposed" || event.type === "patch_applied") return "diff";
  if (event.type === "error") return "failure";
  if (event.filePaths?.length || event.filePath) return "file";
  return "event";
}

function timelineItemTitle(event: HorusRunEventSnapshot): string {
  if (event.type === "command_output") {
    const stream = event.stream ?? "stdout";
    return `${event.commandId ?? "command"} · ${stream}`;
  }
  if (event.commandId) return event.commandId;
  if (event.commandIds?.length) return event.commandIds.join(", ");
  return event.title;
}

function timelineStatusFromEvent(event: HorusRunEventSnapshot): AgentOperationTimelineStatus {
  if (event.type === "command_approval_requested" || event.eventType === "awaiting_approval") {
    return "awaiting_approval";
  }
  if (event.type === "tool_call_started") return "running";
  if (event.type === "tool_call_blocked") return "blocked";
  if (event.type === "error") return "failed";
  if (event.type === "tool_call_finished") {
    return event.errorMessage || event.eventType === "failed" ? "failed" : "succeeded";
  }
  if (event.eventType === "validation_failed" || event.eventType === "review_failed") {
    return "failed";
  }
  if (event.eventType === "validation_passed" || event.eventType === "review_passed") {
    return "succeeded";
  }
  return "info";
}

function timelineStatusFromFileOperation(
  operation: AgentFileOperationTelemetry
): AgentOperationTimelineStatus {
  if (operation.status === "running") return "running";
  if (operation.status === "failed") return "failed";
  if (operation.status === "blocked") return "blocked";
  if (
    operation.status === "changed" ||
    operation.status === "applied" ||
    operation.status === "validated" ||
    operation.status === "read" ||
    operation.status === "proposed"
  ) {
    return "succeeded";
  }
  return "info";
}

function mergeTimelineStatus(
  current: AgentOperationTimelineStatus,
  next: AgentOperationTimelineStatus
): AgentOperationTimelineStatus {
  const priority: AgentOperationTimelineStatus[] = [
    "failed",
    "blocked",
    "awaiting_approval",
    "running",
    "succeeded",
    "info",
  ];
  return priority.indexOf(next) < priority.indexOf(current) ? next : current;
}

function formatAgentName(agentName: NonNullable<AgentOperationTimelineGroup["agentName"]>): string {
  if (agentName === "qa") return "QA";
  if (agentName === "odin") return "ODIN";
  return `${agentName.charAt(0).toUpperCase()}${agentName.slice(1)}`;
}

function runBelongsToProject(run: HorusRunLocator, projectId: string): boolean {
  return run.frontendProjectId === projectId || run.workspaceFolderId === projectId;
}

function compareRunLocatorsForHistory(
  left: HorusRunLocator,
  right: HorusRunLocator
): number {
  const byStatus = runHistoryStatusPriority(left.status) - runHistoryStatusPriority(right.status);
  if (byStatus !== 0) return byStatus;
  return (right.completedAt ?? right.startedAt).localeCompare(
    left.completedAt ?? left.startedAt
  );
}

function runHistoryStatusPriority(status: HorusRunLocator["status"]): number {
  if (status === "running") return 0;
  if (status === "awaiting_human") return 1;
  return 3;
}

function runMatchesQuery(run: HorusRunLocator, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const searchable = [
    run.title,
    run.threadId,
    run.threadId.slice(0, 8),
    run.status,
    run.workflowMode,
    run.currentNode ?? "",
  ];
  return searchable.some((value) => value.toLowerCase().includes(normalizedQuery));
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

function stringMetadata(
  event: HorusRunEventSnapshot,
  key: string
): string | null {
  const value = event.metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toolNameFromRunEvent(
  event: HorusRunEventSnapshot
): AgentFileOperationTelemetry["toolName"] {
  const value = event.metadata?.["toolName"];
  const parsed = AgentToolNameSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function operationTypeFromRunEvent(
  event: HorusRunEventSnapshot,
  toolName: AgentFileOperationTelemetry["toolName"]
): AgentFileOperationType {
  if (event.type === "patch_proposed" || event.type === "patch_applied") return "apply";
  if (event.type === "validation_evidence") return "validate";
  if (toolName === "read_file" || toolName === "read_file_readonly") return "read";
  if (toolName === "write_file") return "create";
  if (
    toolName === "edit_file" ||
    toolName === "replace_file_range" ||
    toolName === "save_file"
  ) {
    return "update";
  }
  if (toolName === "delete_file") return "delete";
  if (toolName === "apply_code_change_set") return "apply";
  if (toolName === "propose_code_change_set") return "apply";
  if (toolName === "run_command" || toolName === "run_validation_command") {
    return "validate";
  }
  if (toolName === "get_git_diff") return "diff";
  return "unknown";
}

function operationStatusFromRunEvent(
  event: HorusRunEventSnapshot,
  toolName: AgentFileOperationTelemetry["toolName"]
): AgentFileOperationTelemetry["status"] {
  if (event.type === "tool_call_started") return "running";
  if (event.type === "tool_call_blocked") return "blocked";
  if (event.type === "tool_call_finished") {
    if (event.eventType === "failed") return "failed";
    if (toolName === "propose_code_change_set") return "proposed";
    return toolName === "read_file" || toolName === "read_file_readonly"
      ? "read"
      : "changed";
  }
  if (event.type === "patch_proposed") return "proposed";
  if (event.type === "patch_applied") return "applied";
  if (event.type === "validation_evidence") {
    return event.eventType === "validation_failed" ? "failed" : "validated";
  }
  if (event.type === "error") return "failed";
  return "unknown";
}

function changeTypeFromToolName(
  toolName: AgentFileOperationTelemetry["toolName"]
): AgentFileOperationTelemetry["changeType"] {
  if (toolName === "write_file") return "create";
  if (
    toolName === "edit_file" ||
    toolName === "replace_file_range" ||
    toolName === "save_file"
  ) {
    return "update";
  }
  if (toolName === "delete_file") return "delete";
  if (toolName === "propose_code_change_set") return "unknown";
  return null;
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
