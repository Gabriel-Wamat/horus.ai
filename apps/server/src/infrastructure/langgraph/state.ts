import { Annotation } from "@langchain/langgraph";
import type {
  UserStory,
  Spec,
  AgentResult,
  HumanFeedback,
  WorkflowStatus,
  WorkflowMode,
  WorkspaceArtifactContext,
} from "@u-build/shared";

// Structured feedback from curator passed back to odin/front/qa on retry
export interface CuratorFeedback {
  passed: boolean;
  score: number;
  notes: string;
  missingItems: string[];
  fixTarget: "front" | "qa" | "both";
}

// Payload surfaced to the frontend when max retries are exceeded
export interface PendingRetryApproval {
  userStoryId: string;
  retryCount: number;
  score: number;
  notes: string;
  missingItems: string[];
}

export const UBuildStateAnnotation = Annotation.Root({
  userStories: Annotation<UserStory[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  currentUSIndex: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  specs: Annotation<Record<string, Spec>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  workspaceArtifactContext: Annotation<Record<string, WorkspaceArtifactContext>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  humanFeedback: Annotation<Record<string, HumanFeedback>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  agentResults: Annotation<Record<string, AgentResult[]>>({
    reducer: (prev, next) => {
      const merged = { ...prev };
      for (const [key, value] of Object.entries(next)) {
        merged[key] = [...(merged[key] ?? []), ...value];
      }
      return merged;
    },
    default: () => ({}),
  }),

  status: Annotation<WorkflowStatus>({
    reducer: (_, next) => next,
    default: () => "idle",
  }),

  threadId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  workspaceFolderId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  projectWorkspaceId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  frontendProjectId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  frontendProjectRootPath: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  previewSessionId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  workflowMode: Annotation<WorkflowMode>({
    reducer: (_, next) => next,
    default: () => "standard",
  }),

  sourceChatSessionId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  sourceChatMessageId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  executionBrief: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Routing decision set by odinAgent; drives fan-out to front/qa agents
  routingDecision: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Reflection pattern: curator feedback per userStory, overwritten on each attempt
  curatorFeedback: Annotation<Record<string, CuratorFeedback>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Self-correction counter; reset to 0 on success, incremented on failure
  retryCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // Set by curator when retryCount exceeds MAX_RETRIES; triggers HITL escalation
  pendingRetryApproval: Annotation<PendingRetryApproval | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Set by curator when it passes but score < SCORE_THRESHOLD; triggers human review
  pendingCuratorReview: Annotation<{
    userStoryId: string;
    score: number;
    notes: string;
  } | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type UBuildState = typeof UBuildStateAnnotation.State;
export type UBuildUpdate = typeof UBuildStateAnnotation.Update;
