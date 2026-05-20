import { Annotation } from "@langchain/langgraph";
import type {
  UserStory,
  Spec,
  AgentResult,
  HumanFeedback,
  WorkflowStatus,
} from "@u-build/shared";

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
});

export type UBuildState = typeof UBuildStateAnnotation.State;
export type UBuildUpdate = typeof UBuildStateAnnotation.Update;
