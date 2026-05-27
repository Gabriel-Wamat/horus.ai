import type {
  AppendChatMessageInput,
  ChatAgentContextBundle,
  ChatMessage,
  ChatSession,
  CreateChatSessionInput,
  FrontendProject,
  PreviewEvent,
  PreviewSession,
  Spec,
  UserStory,
  VisualInstructionDraft,
  WorkspaceArtifactContext,
  WorkspaceFolder,
  CodeChangeSet,
  HorusRunEventSnapshot,
  ProjectCommandRun,
  ProjectConstructionRun,
  ProjectQualityGate,
  ProjectWorkspace,
  AgentSkill,
  AgentSkillBinding,
  AgentSkillFile,
  AgentSkillRevision,
  AgentSkillSourceType,
  AgentSkillStatus,
  AgentSkillUsageEvent,
  AgentSkillValidationReport,
} from "@u-build/shared";
import type { WorkflowEvent } from "@u-build/shared";
import type {
  ActiveWorkspaceStoryContext,
  ResolvedWorkspaceStories,
  WorkspaceUserStoryArtifactMetadata,
} from "../workspace/FileWorkspaceStore.js";

export interface WorkspaceRepository {
  listFolders(): Promise<WorkspaceFolder[]>;
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
  listMessages(sessionId: string): Promise<ChatMessage[]>;
  buildAgentContext(sessionId: string): Promise<ChatAgentContextBundle>;
  appendMessage(
    sessionId: string,
    input: {
      role: "agent";
      body: string;
      workflowThreadId?: string;
    }
  ): Promise<ChatMessage>;
}

export interface FrontendProjectRepository {
  listProjects(): Promise<FrontendProject[]>;
  getProject(projectId: string): Promise<FrontendProject>;
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

export interface WorkflowEventLogRepository {
  append(event: WorkflowEvent): Promise<HorusRunEventSnapshot>;
  list(threadId: string): Promise<HorusRunEventSnapshot[]>;
  listAfter(
    threadId: string,
    sequence: number
  ): Promise<HorusRunEventSnapshot[]>;
}

export interface StoryContextReader {
  getActiveStoryContext(
    folderId: string,
    storyId: string
  ): Promise<{
    story: UserStory;
    spec?: Spec;
    artifactContext: WorkspaceArtifactContext;
  }>;
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
