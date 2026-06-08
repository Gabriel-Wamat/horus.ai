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

const MAX_AGENT_RESULTS_PER_STORY = 12;

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
        merged[key] = compactAgentResultHistory([
          ...(merged[key] ?? []),
          ...value,
        ]);
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
});

export type UBuildState = typeof UBuildStateAnnotation.State;
export type UBuildUpdate = typeof UBuildStateAnnotation.Update;

export function compactAgentResultHistory(
  results: readonly AgentResult[]
): AgentResult[] {
  const tail = results.slice(-MAX_AGENT_RESULTS_PER_STORY);
  const latestFullIndexes = new Set<number>(
    ["front", "qa", "curator"]
      .map((agentName) => findLatestSuccessfulAgentIndex(tail, agentName))
      .filter((index) => index >= 0)
  );

  return tail.map((result, index) =>
    latestFullIndexes.has(index)
      ? dropVolatileResultFields(result)
      : compactHistoricalAgentResult(result)
  );
}

function findLatestSuccessfulAgentIndex(
  results: readonly AgentResult[],
  agentName: string
): number {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result?.status === "success" && result.agentName === agentName) {
      return index;
    }
  }
  return -1;
}

function dropVolatileResultFields(result: AgentResult): AgentResult {
  if (result.status !== "success") return result;
  const output = { ...result.output };
  delete output["toolEvents"];

  const toolLoop = output["toolLoop"];
  if (toolLoop && typeof toolLoop === "object" && !Array.isArray(toolLoop)) {
    const compactToolLoop = { ...(toolLoop as Record<string, unknown>) };
    delete compactToolLoop["operationalSession"];
    output["toolLoop"] = compactToolLoop;
  }

  return { ...result, output };
}

function compactHistoricalAgentResult(result: AgentResult): AgentResult {
  const cleaned = dropVolatileResultFields(result);
  if (cleaned.status !== "success") return cleaned;

  const output = { ...cleaned.output };
  if (cleaned.agentName === "front") {
    const html = output["html"];
    if (typeof html === "string") {
      output["htmlLength"] = html.length;
      delete output["html"];
    }

    if (output["codeChangeSet"]) {
      output["codeChangeSetSummary"] = summarizeCodeChangeSet(
        output["codeChangeSet"]
      );
      delete output["codeChangeSet"];
    }
  }

  return { ...cleaned, output };
}

function summarizeCodeChangeSet(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { available: false };
  }

  const record = value as Record<string, unknown>;
  const operations = Array.isArray(record["operations"])
    ? record["operations"]
    : [];
  return {
    available: true,
    id: record["id"] ?? null,
    artifactCandidateId: record["artifactCandidateId"] ?? null,
    operationCount: operations.length,
    targetPaths: operations
      .map((operation) =>
        operation && typeof operation === "object"
          ? (operation as Record<string, unknown>)["targetPath"]
          : null
      )
      .filter((targetPath): targetPath is string => typeof targetPath === "string"),
  };
}
