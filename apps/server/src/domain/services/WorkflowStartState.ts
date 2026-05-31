import type {
  Spec,
  UserStory,
  WorkflowMode,
  WorkflowState,
  WorkspaceArtifactContext,
} from "@u-build/shared";
import type { PendingRetryApproval } from "../ports/WorkflowGraphStatePort.js";
import type { StartWorkflowOptions } from "./WorkflowOrchestratorPorts.js";

export interface WorkflowInitialGraphState extends Record<string, unknown> {
  userStories: UserStory[];
  workspaceFolderId: string;
  projectWorkspaceId?: string;
  frontendProjectId?: string;
  frontendProjectRootPath?: string;
  previewSessionId?: string;
  workflowMode: WorkflowMode;
  sourceChatSessionId?: string;
  sourceChatMessageId?: string;
  executionBrief?: string;
  workspaceArtifactContext: Record<string, WorkspaceArtifactContext>;
  currentUSIndex: number;
  specs: Record<string, Spec>;
  humanFeedback: Record<string, never>;
  agentResults: Record<string, never>;
  status: "running";
  threadId: string;
  routingDecision: string[];
  curatorFeedback: Record<string, never>;
  retryCount: number;
  pendingRetryApproval: PendingRetryApproval | null;
}

export function buildWorkflowInitialGraphState(input: {
  options: StartWorkflowOptions;
  threadId: string;
  workflowMode: WorkflowMode;
}): WorkflowInitialGraphState {
  return {
    ...buildWorkflowStartContext(input),
    status: "running",
    threadId: input.threadId,
    routingDecision: [],
    curatorFeedback: {},
    retryCount: 0,
    pendingRetryApproval: null,
  };
}

export function buildWorkflowInitialStorageState(input: {
  options: StartWorkflowOptions;
  threadId: string;
  workflowMode: WorkflowMode;
  startedAt: string;
}): WorkflowState {
  return {
    threadId: input.threadId,
    ...buildWorkflowStartContext(input),
    pendingCheckpoints: [],
    validationGates: [],
    status: "running",
    startedAt: input.startedAt,
  };
}

function buildWorkflowStartContext(input: {
  options: StartWorkflowOptions;
  workflowMode: WorkflowMode;
}): {
  userStories: UserStory[];
  workspaceFolderId: string;
  projectWorkspaceId?: string;
  frontendProjectId?: string;
  frontendProjectRootPath?: string;
  previewSessionId?: string;
  workflowMode: WorkflowMode;
  sourceChatSessionId?: string;
  sourceChatMessageId?: string;
  executionBrief?: string;
  workspaceArtifactContext: Record<string, WorkspaceArtifactContext>;
  currentUSIndex: number;
  specs: Record<string, Spec>;
  humanFeedback: Record<string, never>;
  agentResults: Record<string, never>;
} {
  const { options, workflowMode } = input;
  return {
    userStories: options.userStories,
    workspaceFolderId: options.workspaceFolderId,
    ...(options.projectWorkspaceId
      ? { projectWorkspaceId: options.projectWorkspaceId }
      : {}),
    ...(options.frontendProjectId
      ? { frontendProjectId: options.frontendProjectId }
      : {}),
    ...(options.frontendProjectRootPath
      ? { frontendProjectRootPath: options.frontendProjectRootPath }
      : {}),
    ...(options.previewSessionId
      ? { previewSessionId: options.previewSessionId }
      : {}),
    workflowMode,
    ...(options.sourceChatSessionId
      ? { sourceChatSessionId: options.sourceChatSessionId }
      : {}),
    ...(options.sourceChatMessageId
      ? { sourceChatMessageId: options.sourceChatMessageId }
      : {}),
    ...(options.executionBrief ? { executionBrief: options.executionBrief } : {}),
    workspaceArtifactContext: options.workspaceArtifactContext ?? {},
    currentUSIndex: 0,
    specs: options.initialSpecs ?? {},
    humanFeedback: {},
    agentResults: {},
  };
}
