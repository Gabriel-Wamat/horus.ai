import { WorkflowStatusSchema } from "@u-build/shared";
import type {
  IStorageProvider,
  ProjectConstructionRun,
  UserStory,
  WorkflowCheckpointNode,
  WorkflowState,
  WorkflowStatus,
} from "@u-build/shared";

interface WorkflowGraphStateReader {
  getState(config: object): Promise<{ values: unknown; next?: readonly unknown[] }>;
}

interface ProjectConstructionRunSink {
  getConstructionRun(runId: string): Promise<ProjectConstructionRun>;
  updateConstructionRun(run: ProjectConstructionRun): Promise<ProjectConstructionRun>;
}

export class WorkflowStatePersister {
  constructor(
    private readonly storage: IStorageProvider,
    private readonly workflowGraph: WorkflowGraphStateReader,
    private readonly projectConstructionRuns?: ProjectConstructionRunSink
  ) {}

  async persist(input: {
    threadId: string;
    startedAt?: string;
    errorMessage?: string;
  }): Promise<WorkflowStatus | undefined> {
    try {
      const snapshot = await this.workflowGraph.getState({
        configurable: { thread_id: input.threadId },
      });
      const values = snapshot.values as Record<string, unknown>;

      const startedAt = input.startedAt ?? new Date().toISOString();
      const isError = Boolean(input.errorMessage);
      const now = new Date().toISOString();
      const pendingCheckpoints = extractPendingCheckpoints(
        snapshot.next,
        values,
        now
      );
      const status = resolvePersistedStatus({
        rawStatus: values["status"],
        pendingCheckpoints,
        isError,
      });

      const state: WorkflowState = {
        threadId: input.threadId,
        workflowMode:
          (values["workflowMode"] as WorkflowState["workflowMode"]) ??
          "standard",
        ...(typeof values["sourceChatSessionId"] === "string"
          ? { sourceChatSessionId: values["sourceChatSessionId"] }
          : {}),
        ...(typeof values["sourceChatMessageId"] === "string"
          ? { sourceChatMessageId: values["sourceChatMessageId"] }
          : {}),
        ...(typeof values["executionBrief"] === "string"
          ? { executionBrief: values["executionBrief"] }
          : {}),
        userStories: (values["userStories"] as WorkflowState["userStories"]) ?? [],
        currentUSIndex: (values["currentUSIndex"] as number) ?? 0,
        specs: (values["specs"] as WorkflowState["specs"]) ?? {},
        workspaceArtifactContext:
          (values["workspaceArtifactContext"] as WorkflowState["workspaceArtifactContext"]) ??
          {},
        humanFeedback: (values["humanFeedback"] as WorkflowState["humanFeedback"]) ?? {},
        agentResults: (values["agentResults"] as WorkflowState["agentResults"]) ?? {},
        pendingCheckpoints,
        validationGates:
          (values["validationGates"] as WorkflowState["validationGates"]) ?? [],
        status,
        startedAt,
        ...(isTerminalWorkflowStatus(status) ? { completedAt: now } : {}),
        ...(typeof values["workspaceFolderId"] === "string"
          ? { workspaceFolderId: values["workspaceFolderId"] }
          : {}),
        ...(typeof values["projectWorkspaceId"] === "string"
          ? { projectWorkspaceId: values["projectWorkspaceId"] }
          : {}),
        ...(typeof values["frontendProjectId"] === "string"
          ? { frontendProjectId: values["frontendProjectId"] }
          : {}),
        ...(typeof values["frontendProjectRootPath"] === "string"
          ? { frontendProjectRootPath: values["frontendProjectRootPath"] }
          : {}),
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      };

      await this.storage.save(state);
      await this.syncProjectConstructionRun(state, input.errorMessage);
      return state.status;
    } catch (saveErr) {
      console.error("[WorkflowStatePersister] Failed to persist state:", saveErr);
      return undefined;
    }
  }

  private async syncProjectConstructionRun(
    state: WorkflowState,
    errorMessage?: string
  ): Promise<void> {
    if (
      state.workflowMode !== "project_construction" ||
      !this.projectConstructionRuns
    ) {
      return;
    }

    const constructionRunId = Object.values(state.workspaceArtifactContext)
      .map((context) => context.constructionRunId)
      .find((value): value is string => typeof value === "string");
    if (!constructionRunId) return;

    const nextStatus =
      state.status === "completed"
        ? "passed"
        : state.status === "cancelled"
          ? "cancelled"
          : state.status === "error" ||
              state.status === "blocked" ||
              state.status === "failed_validation"
            ? "failed"
            : undefined;
    if (!nextStatus) return;

    const current = await this.projectConstructionRuns.getConstructionRun(
      constructionRunId
    );
    const finishedAt = state.completedAt ?? new Date().toISOString();
    await this.projectConstructionRuns.updateConstructionRun({
      ...current,
      status: nextStatus,
      finishedAt,
      error:
        nextStatus === "failed"
          ? errorMessage ?? state.errorMessage ?? current.error
          : null,
    });
  }
}

export function isTerminalWorkflowStatus(
  status: WorkflowStatus | undefined
): boolean {
  return (
    status === "completed" ||
    status === "completed_unverified" ||
    status === "failed_validation" ||
    status === "blocked" ||
    status === "cancelled" ||
    status === "error"
  );
}

function resolvePersistedStatus(input: {
  rawStatus: unknown;
  pendingCheckpoints: WorkflowCheckpointNode[];
  isError: boolean;
}): WorkflowStatus {
  if (input.isError) return "error";
  const parsed = WorkflowStatusSchema.safeParse(input.rawStatus);
  if (input.pendingCheckpoints.length > 0) return "awaiting_human";
  if (parsed.success && parsed.data !== "running" && parsed.data !== "idle") {
    return parsed.data;
  }
  return "completed_unverified";
}

function extractPendingCheckpoints(
  next: readonly unknown[] | undefined,
  values: Record<string, unknown>,
  createdAt: string
): WorkflowCheckpointNode[] {
  if (!Array.isArray(next) || next.length === 0) return [];

  const userStories = Array.isArray(values["userStories"])
    ? (values["userStories"] as UserStory[])
    : [];
  const currentUSIndex =
    typeof values["currentUSIndex"] === "number"
      ? values["currentUSIndex"]
      : 0;
  const currentUserStory = userStories[currentUSIndex];

  return next
    .filter(isWorkflowCheckpointNodeName)
    .map((nodeName) => ({
      nodeName,
      ...(currentUserStory?.id ? { userStoryId: currentUserStory.id } : {}),
      createdAt,
    }));
}

function isWorkflowCheckpointNodeName(
  value: unknown
): value is WorkflowCheckpointNode["nodeName"] {
  return (
    value === "hitlCheckpoint" ||
    value === "retryCheckpoint" ||
    value === "curatorReviewCheckpoint"
  );
}
