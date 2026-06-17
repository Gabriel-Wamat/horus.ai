import type {
  AgentArtifactCandidate,
  AgentArtifactCandidateStatus,
  AgentArtifactType,
  AgentExecutionOutboxEvent,
  AgentExecutionOutboxStatus,
  AgentExecutionTurn,
  AgentExecutionTurnStatus,
  AgentName,
  AgentOperationEvent,
  AgentOperationEventType,
  AgentOperationProjection,
  AgentOperationalSession,
  AgentOperationalSessionStatus,
  AgentProfileId,
  AgentMemoryItem,
  AgentMemoryKind,
  AgentMemoryLink,
  AgentMemoryScope,
  AgentMemorySummary,
  AgentSkill,
  AgentSkillBinding,
  AgentSkillFile,
  AgentSkillRevision,
  AgentSkillSourceType,
  AgentSkillStatus,
  AgentSkillUsageEvent,
  AgentSkillValidationReport,
  AgentTraceSpan,
  AgentValidationEvidenceRecord,
  AgentWorkflowAttempt,
  AgentWorkflowAttemptStatus,
  AgentWorkflowRun,
  AppendChatMessageInput,
  ChatAgentContextBundle,
  ChatMessage,
  ChatSession,
  CodeChangeSet,
  CreateChatSessionInput,
  FrontendProject,
  HorusRunEventSnapshot,
  PreviewEvent,
  PreviewSession,
  ProjectCommandRun,
  ProjectConstructionRun,
  ProjectQualityGate,
  ProjectWorkspace,
  Spec,
  UserStory,
  VisualInstructionDraft,
  WorkflowMode,
  WorkflowStatus,
  WorkspaceArtifactContext,
  WorkspaceFolder,
} from "@u-build/shared";
import type { WorkflowEvent } from "@u-build/shared";

export interface WorkspaceSpecArtifactMetadata {
  specId: string;
  spec?: Spec;
  revision: WorkspaceArtifactRevisionMetadata;
}

export interface WorkspaceUserStoryArtifactMetadata {
  story: UserStory;
  revision: WorkspaceArtifactRevisionMetadata;
  specs: WorkspaceSpecArtifactMetadata[];
}

export interface WorkspaceArtifactRevisionMetadata {
  activeRevision: number;
  revisions: Array<{
    revision: number;
    file: string;
    createdAt: string;
  }>;
}

export interface ResolvedWorkspaceStories {
  userStories: UserStory[];
  artifactContext: Record<string, WorkspaceArtifactContext>;
  initialSpecs: Record<string, Spec>;
}

export interface ActiveWorkspaceStoryContext {
  story: UserStory;
  spec?: Spec;
  artifactContext: WorkspaceArtifactContext;
}

export interface WorkspaceRepository {
  listFolders(): Promise<WorkspaceFolder[]>;
  saveFolder(folder: WorkspaceFolder): Promise<WorkspaceFolder>;
  createFolder(name: string): Promise<WorkspaceFolder>;
  listUserStories(folderId: string): Promise<UserStory[]>;
  listUserStoryArtifacts(
    folderId: string
  ): Promise<WorkspaceUserStoryArtifactMetadata[]>;
  resolveUserStoriesForWorkflow(
    folderId: string,
    submittedStories: UserStory[]
  ): Promise<ResolvedWorkspaceStories>;
  getActiveStoryContext(
    folderId: string,
    storyId: string
  ): Promise<ActiveWorkspaceStoryContext>;
  saveUserStories(folderId: string, userStories: UserStory[]): Promise<void>;
  updateUserStory(
    folderId: string,
    storyId: string,
    userStory: UserStory
  ): Promise<UserStory>;
  saveSpec(folderId: string, storyId: string, spec: Spec): Promise<Spec>;
  updateSpec(
    folderId: string,
    storyId: string,
    specId: string,
    spec: Spec
  ): Promise<Spec>;
  deleteUserStory(folderId: string, storyId: string): Promise<void>;
}

export interface ChatMemoryRepository {
  createSession(input: CreateChatSessionInput): Promise<ChatSession>;
  listSessions(filter?: {
    workspaceFolderId?: string;
    userStoryId?: string;
  }): Promise<ChatSession[]>;
  appendMessage(
    sessionId: string,
    input: AppendChatMessageInput
  ): Promise<ChatMessage>;
  listMessages(
    sessionId: string,
    filter?: { afterSequence?: number }
  ): Promise<ChatMessage[]>;
  buildAgentContext(sessionId: string): Promise<ChatAgentContextBundle>;
}

export interface FrontendProjectRepository {
  listProjects(): Promise<FrontendProject[]>;
  getProject(projectId: string): Promise<FrontendProject>;
  saveProject?(project: FrontendProject): Promise<FrontendProject>;
  registerProject?(input: {
    name: string;
    rootPath: string;
    defaultRoute?: string;
    devCommand?: string | null;
    previewUrl?: string | null;
    previewCommandId?: string | null;
    commandCatalog?: FrontendProject["commandCatalog"];
    projectKind?: FrontendProject["projectKind"];
    lifecycleStatus?: FrontendProject["lifecycleStatus"];
    visibility?: FrontendProject["visibility"];
    healthStatus?: FrontendProject["healthStatus"];
    healthReasons?: FrontendProject["healthReasons"];
    canonicalProjectId?: string | null;
    projectWorkspaceId?: string | null;
    appFingerprint?: string | null;
    lastHealthCheckedAt?: string | null;
    archivedAt?: string | null;
    archivedReason?: string | null;
  }): Promise<FrontendProject>;
}

export interface PreviewSessionRepository {
  saveSession(session: PreviewSession): Promise<PreviewSession>;
  getSession(sessionId: string): Promise<PreviewSession>;
  listSessions(): Promise<PreviewSession[]>;
  appendEvent(event: PreviewEvent): Promise<PreviewEvent>;
  listEvents(sessionId: string): Promise<PreviewEvent[]>;
  saveDraft(draft: VisualInstructionDraft): Promise<VisualInstructionDraft>;
  listDrafts(sessionId: string): Promise<VisualInstructionDraft[]>;
}

export interface CodeChangeSetRepository {
  save(changeSet: CodeChangeSet): Promise<CodeChangeSet>;
  listByWorkflow(threadId: string): Promise<CodeChangeSet[]>;
}

export interface AgentArtifactRepository {
  saveCandidate(candidate: AgentArtifactCandidate): Promise<AgentArtifactCandidate>;
  getCandidate(candidateId: string): Promise<AgentArtifactCandidate | null>;
  listCandidates(filter?: {
    workflowThreadId?: string;
    userStoryId?: string;
    status?: AgentArtifactCandidateStatus;
    artifactType?: AgentArtifactType;
  }): Promise<AgentArtifactCandidate[]>;
  saveEvidence(
    evidence: AgentValidationEvidenceRecord
  ): Promise<AgentValidationEvidenceRecord>;
  listEvidence(filter?: {
    candidateId?: string;
    workflowThreadId?: string;
  }): Promise<AgentValidationEvidenceRecord[]>;
  saveTraceSpan(span: AgentTraceSpan): Promise<AgentTraceSpan>;
  listTraceSpans(filter?: {
    candidateId?: string;
    workflowThreadId?: string;
  }): Promise<AgentTraceSpan[]>;
}

export interface WorkflowEventLogRepository {
  append(event: WorkflowEvent): Promise<HorusRunEventSnapshot>;
  list(threadId: string): Promise<HorusRunEventSnapshot[]>;
  listAfter(
    threadId: string,
    sequence: number
  ): Promise<HorusRunEventSnapshot[]>;
}

export interface CreateAgentExecutionTurnInput {
  id: string;
  chatSessionId: string;
  sourceMessageId?: string | null;
  idempotencyKey: string;
  intent?: Record<string, unknown>;
  status?: AgentExecutionTurnStatus;
  createdAt?: string;
}

export interface CreateAgentWorkflowRunInput {
  id: string;
  turnId?: string | null;
  threadId: string;
  workflowMode: WorkflowMode;
  status?: WorkflowStatus;
  startedAt?: string | null;
  createdAt?: string;
}

export interface CreateAgentWorkflowAttemptInput {
  id: string;
  runId: string;
  attemptNumber: number;
  startedAt?: string;
  status?: AgentWorkflowAttemptStatus;
  failureClass?: string | null;
}

export interface EnqueueAgentExecutionOutboxInput {
  id: string;
  eventType: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  availableAt?: string;
  createdAt?: string;
}

export interface AgentExecutionLedgerRepository {
  createTurn(input: CreateAgentExecutionTurnInput): Promise<AgentExecutionTurn>;
  updateTurnStatus(
    turnId: string,
    status: AgentExecutionTurnStatus
  ): Promise<AgentExecutionTurn>;
  createRun(input: CreateAgentWorkflowRunInput): Promise<AgentWorkflowRun>;
  getRunByThreadId(threadId: string): Promise<AgentWorkflowRun | null>;
  getRunByTurnId(turnId: string): Promise<AgentWorkflowRun | null>;
  listRuns(filter?: {
    status?: WorkflowStatus;
    limit?: number;
  }): Promise<AgentWorkflowRun[]>;
  listRecoverableRuns(): Promise<AgentWorkflowRun[]>;
  updateRunStatus(input: {
    runId: string;
    status: WorkflowStatus;
    completedAt?: string | null;
    lastError?: string | null;
    leaseOwner?: string | null;
  }): Promise<AgentWorkflowRun>;
  createAttempt(
    input: CreateAgentWorkflowAttemptInput
  ): Promise<AgentWorkflowAttempt>;
  updateAttemptStatus(input: {
    attemptId: string;
    status: AgentWorkflowAttemptStatus;
    completedAt?: string | null;
    failureClass?: string | null;
  }): Promise<AgentWorkflowAttempt>;
  enqueueOutbox(
    input: EnqueueAgentExecutionOutboxInput
  ): Promise<AgentExecutionOutboxEvent>;
  claimNextOutbox(input: {
    ownerId: string;
    now?: string;
  }): Promise<AgentExecutionOutboxEvent | null>;
  completeOutbox(outboxId: string): Promise<AgentExecutionOutboxEvent>;
  failOutbox(input: {
    outboxId: string;
    status?: Extract<AgentExecutionOutboxStatus, "failed" | "dead_letter">;
    error: string;
  }): Promise<AgentExecutionOutboxEvent>;
  listOutbox(filter?: {
    status?: AgentExecutionOutboxStatus;
    limit?: number;
  }): Promise<AgentExecutionOutboxEvent[]>;
}

export interface CreateAgentOperationalSessionInput {
  id: string;
  workflowThreadId: string;
  projectId: string;
  userStoryId: string;
  runId?: string | null;
  codeChangeSetId?: string | null;
  agentName: AgentName;
  agentProfileId: AgentProfileId;
  status?: AgentOperationalSessionStatus;
  startedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AppendAgentOperationEventInput {
  id: string;
  sessionId: string;
  type: AgentOperationEventType;
  toolName?: AgentOperationEvent["toolName"];
  toolStatus?: AgentOperationEvent["toolStatus"];
  summary?: string | null;
  filePaths?: string[];
  commandIds?: string[];
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AgentOperationalSessionRepository {
  createSession(
    input: CreateAgentOperationalSessionInput
  ): Promise<AgentOperationalSession>;
  getSession(sessionId: string): Promise<AgentOperationalSession | null>;
  listSessionsByWorkflowThread(
    workflowThreadId: string
  ): Promise<AgentOperationalSession[]>;
  updateSessionStatus(input: {
    sessionId: string;
    status: AgentOperationalSessionStatus;
    finishedAt?: string | null;
    lastError?: string | null;
  }): Promise<AgentOperationalSession>;
  appendEvent(input: AppendAgentOperationEventInput): Promise<AgentOperationEvent>;
  listEvents(sessionId: string): Promise<AgentOperationEvent[]>;
  getProjection(sessionId: string): Promise<AgentOperationProjection | null>;
}

export interface StoryContextReader {
  getActiveStoryContext(
    folderId: string,
    storyId: string
  ): Promise<ActiveWorkspaceStoryContext>;
}

export interface ProjectConstructionRepository {
  saveProjectWorkspace(project: ProjectWorkspace): Promise<ProjectWorkspace>;
  getProjectWorkspace(projectWorkspaceId: string): Promise<ProjectWorkspace>;
  listProjectWorkspaces(): Promise<ProjectWorkspace[]>;
  saveConstructionRun(run: ProjectConstructionRun): Promise<ProjectConstructionRun>;
  updateConstructionRun(run: ProjectConstructionRun): Promise<ProjectConstructionRun>;
  getConstructionRun(runId: string): Promise<ProjectConstructionRun>;
  listConstructionRuns(projectWorkspaceId?: string): Promise<ProjectConstructionRun[]>;
  appendCommandRun(commandRun: ProjectCommandRun): Promise<ProjectCommandRun>;
  listCommandRuns(runId: string): Promise<ProjectCommandRun[]>;
  appendQualityGate(qualityGate: ProjectQualityGate): Promise<ProjectQualityGate>;
  listQualityGates(runId: string): Promise<ProjectQualityGate[]>;
}

export interface AgentSkillRepository {
  saveSkill(skill: AgentSkill): Promise<AgentSkill>;
  updateSkill(skill: AgentSkill): Promise<AgentSkill>;
  getSkill(skillId: string): Promise<AgentSkill>;
  findSkillBySlug(slug: string): Promise<AgentSkill | null>;
  listSkills(filter?: {
    status?: AgentSkillStatus | undefined;
    sourceType?: AgentSkillSourceType | undefined;
    search?: string | undefined;
    agentProfileId?: string | undefined;
  }): Promise<AgentSkill[]>;
  saveRevision(revision: AgentSkillRevision): Promise<AgentSkillRevision>;
  getRevision(revisionId: string): Promise<AgentSkillRevision>;
  listRevisions(skillId: string): Promise<AgentSkillRevision[]>;
  saveFile(file: AgentSkillFile): Promise<AgentSkillFile>;
  listFiles(revisionId: string): Promise<AgentSkillFile[]>;
  saveBinding(binding: AgentSkillBinding): Promise<AgentSkillBinding>;
  listBindings(skillId?: string): Promise<AgentSkillBinding[]>;
  replaceBindings(
    skillId: string,
    bindings: AgentSkillBinding[]
  ): Promise<AgentSkillBinding[]>;
  saveValidationReport(
    report: AgentSkillValidationReport
  ): Promise<AgentSkillValidationReport>;
  listValidationReports(revisionId: string): Promise<AgentSkillValidationReport[]>;
  appendUsageEvent(event: AgentSkillUsageEvent): Promise<AgentSkillUsageEvent>;
  listUsageEvents(filter?: {
    skillId?: string;
    workflowThreadId?: string;
  }): Promise<AgentSkillUsageEvent[]>;
}

export interface AgentMemoryRepository {
  appendItem(item: AgentMemoryItem): Promise<AgentMemoryItem>;
  listItems(filter?: {
    scope?: Partial<AgentMemoryScope>;
    kind?: AgentMemoryKind;
    agentProfileId?: string;
    includeStale?: boolean;
    limit?: number;
  }): Promise<AgentMemoryItem[]>;
  upsertSummary(summary: AgentMemorySummary): Promise<AgentMemorySummary>;
  listSummaries(filter?: {
    scope?: Partial<AgentMemoryScope>;
    agentProfileId?: string;
    limit?: number;
  }): Promise<AgentMemorySummary[]>;
  appendLink(link: AgentMemoryLink): Promise<AgentMemoryLink>;
  listLinks(memoryId: string): Promise<AgentMemoryLink[]>;
}
