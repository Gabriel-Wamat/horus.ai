import type {
  AgentArtifactCandidate,
  AgentExecutionOutboxEvent,
  AgentValidationGateType,
  AppendChatMessageInput,
  ChatMessage,
  CodeChangeSet,
  FrontendProject,
  HorusRunEventSnapshot,
  HumanFeedback,
  LlmSettings,
  ProjectConstructionRun,
  RuntimeValidationEvidence,
  Spec,
  UserStory,
  WorkflowEvent,
  WorkflowMode,
  WorkflowStatus,
  WorkspaceArtifactContext,
} from "@u-build/shared";

export interface StartWorkflowOptions {
  workspaceFolderId: string;
  userStories: UserStory[];
  workspaceArtifactContext?: Record<string, WorkspaceArtifactContext>;
  initialSpecs?: Record<string, Spec>;
  workflowMode?: WorkflowMode;
  sourceChatSessionId?: string;
  sourceChatMessageId?: string;
  executionBrief?: string;
  projectWorkspaceId?: string;
  frontendProjectId?: string;
  frontendProjectRootPath?: string;
  previewSessionId?: string;
  llmSettings?: LlmSettings;
  idempotencyKey?: string;
}

export interface StartChatCodeChangeOptions {
  workspaceFolderId: string;
  userStory: UserStory;
  spec: Spec;
  artifactContext: WorkspaceArtifactContext;
  project: FrontendProject;
  chatSessionId: string;
  sourceMessageId: string;
  executionBrief: string;
  previewSessionId?: string;
  llmSettings?: LlmSettings;
  idempotencyKey?: string;
}

export interface StartSpecGenerationOptions {
  workspaceFolderId: string;
  userStory: UserStory;
  chatSessionId: string;
  sourceMessageId: string;
  executionBrief: string;
  llmSettings?: LlmSettings;
  idempotencyKey?: string;
}

export interface ResumeWorkflowOptions {
  threadId: string;
  userStoryId: string;
  feedback: HumanFeedback;
}

export interface RetryDecisionOptions {
  threadId: string;
  userStoryId: string;
  continueRetry: boolean;
}

export interface CuratorReviewDecisionOptions {
  threadId: string;
  userStoryId: string;
  accepted: boolean;
}

export interface WorkspaceArtifactStore {
  saveSpec(folderId: string, storyId: string, spec: Spec): Promise<Spec>;
}

export interface ChatProgressSink {
  appendMessage(
    sessionId: string,
    input: AppendChatMessageInput & { role: "agent" }
  ): Promise<unknown>;
  listMessages?(
    sessionId: string,
    filter?: { afterSequence?: number }
  ): Promise<ChatMessage[]>;
}

export interface WorkflowCodeChangeSetSink {
  save(changeSet: CodeChangeSet): Promise<unknown>;
  listByWorkflow?(threadId: string): Promise<CodeChangeSet[]>;
}

export interface WorkflowCodeChangeSetApplier {
  apply(input: {
    changeSet: CodeChangeSet;
    projectRootPath: string;
  }): Promise<CodeChangeSet>;
}

export interface ProjectConstructionRunSink {
  getConstructionRun(runId: string): Promise<ProjectConstructionRun>;
  updateConstructionRun(run: ProjectConstructionRun): Promise<ProjectConstructionRun>;
}

export interface AgentExecutionLedgerSink {
  createTurn(input: {
    id: string;
    chatSessionId: string;
    sourceMessageId?: string | null;
    idempotencyKey: string;
    intent?: Record<string, unknown>;
    status?: "pending" | "accepted" | "running" | "completed" | "blocked" | "failed" | "cancelled";
    createdAt?: string;
  }): Promise<{ id: string; status: string }>;
  updateTurnStatus(
    turnId: string,
    status: "pending" | "accepted" | "running" | "completed" | "blocked" | "failed" | "cancelled"
  ): Promise<unknown>;
  createRun(input: {
    id: string;
    turnId?: string | null;
    threadId: string;
    workflowMode: WorkflowMode;
    status?: WorkflowStatus;
    startedAt?: string | null;
    createdAt?: string;
  }): Promise<{
    id: string;
    threadId: string;
    status: WorkflowStatus;
    turnId?: string | null;
  }>;
  getRunByTurnId(turnId: string): Promise<{ id: string; threadId: string } | null>;
  getRunByThreadId(threadId: string): Promise<{
    id: string;
    threadId: string;
    status?: WorkflowStatus;
    turnId?: string | null;
  } | null>;
  listRecoverableRuns?(): Promise<Array<{
    id: string;
    turnId?: string | null;
    threadId: string;
    workflowMode: WorkflowMode;
    status: WorkflowStatus;
    startedAt?: string | null;
    updatedAt?: string | null;
    lastError?: string | null;
  }>>;
  updateRunStatus(input: {
    runId: string;
    status: WorkflowStatus;
    completedAt?: string | null;
    lastError?: string | null;
    leaseOwner?: string | null;
  }): Promise<unknown>;
  createAttempt(input: {
    id: string;
    runId: string;
    attemptNumber: number;
    startedAt?: string;
    status?: "pending" | "running" | "completed" | "failed" | "cancelled";
    failureClass?: string | null;
  }): Promise<{ id: string }>;
  updateAttemptStatus(input: {
    attemptId: string;
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    completedAt?: string | null;
    failureClass?: string | null;
  }): Promise<unknown>;
  enqueueOutbox(input: {
    id: string;
    eventType: string;
    dedupeKey: string;
    payload: Record<string, unknown>;
    availableAt?: string;
    createdAt?: string;
  }): Promise<AgentExecutionOutboxEvent>;
  claimNextOutbox(input: {
    ownerId: string;
    now?: string;
  }): Promise<AgentExecutionOutboxEvent | null>;
  completeOutbox(outboxId: string): Promise<unknown>;
  failOutbox(input: {
    outboxId: string;
    status?: "failed" | "dead_letter";
    error: string;
  }): Promise<unknown>;
}

export interface WorkflowGraphRunner {
  stream(
    input: unknown,
    config: object
  ): Promise<AsyncIterable<unknown>>;
  getState(config: object): Promise<{ values: unknown; next?: readonly unknown[] }>;
}

export interface WorkflowMemorySink {
  recordWorkflowEvent(event: WorkflowEvent): Promise<unknown>;
}

export interface WorkflowEventHistoryReader {
  list(threadId: string): Promise<HorusRunEventSnapshot[]>;
}

export interface WorkflowArtifactControlPlaneSink {
  recordCodeChangeCandidate(input: {
    changeSet: CodeChangeSet;
    execution?: { runId?: string | null; attemptId?: string | null };
    sourceResultId?: string | null;
  }): Promise<{ candidate: AgentArtifactCandidate; changeSet: CodeChangeSet }>;
  markCandidateStatus(input: {
    candidateId: string;
    status: AgentArtifactCandidate["status"];
  }): Promise<AgentArtifactCandidate | null>;
  recordCuratorEvidence(input: {
    candidate: AgentArtifactCandidate;
    passed: boolean;
    notes?: string;
    missingItems?: string[];
    fixTarget?: string;
  }): Promise<unknown>;
  recordRuntimeEvidence(input: {
    candidate: AgentArtifactCandidate;
    gateId: string;
    gateType: AgentValidationGateType;
    required: boolean;
    evidence: RuntimeValidationEvidence;
  }): Promise<unknown>;
  recordTraceSpan(input: {
    workflowThreadId: string;
    runId?: string | null;
    attemptId?: string | null;
    candidateId?: string | null;
    spanType: "llm" | "tool" | "gate" | "handoff" | "retry" | "approval" | "apply";
    name: string;
    status: "started" | "succeeded" | "failed" | "blocked";
    redactedInput?: Record<string, unknown>;
    redactedOutput?: Record<string, unknown>;
    errorMessage?: string | null;
  }): Promise<unknown>;
}
