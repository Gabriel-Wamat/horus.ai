import { createHash } from "node:crypto";
import type { AgentResult, Spec, WorkspaceArtifactContext } from "@u-build/shared";
import type { UBuildState } from "./state.js";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function createSpecRevisionId(spec: Spec): string {
  const hash = createHash("sha256")
    .update(stableStringify(spec))
    .digest("hex")
    .slice(0, 12);
  return `spec:${spec.id}:${hash}`;
}

export function getArtifactContext(
  state: UBuildState,
  userStoryId: string
): WorkspaceArtifactContext | undefined {
  return state.workspaceArtifactContext[userStoryId];
}

export function mergeSpecRevisionContext(
  state: UBuildState,
  userStoryId: string,
  spec: Spec
): WorkspaceArtifactContext | undefined {
  const current = getArtifactContext(state, userStoryId);
  if (!current) return undefined;
  return {
    ...current,
    specRevisionId: createSpecRevisionId(spec),
  };
}

export function agentArtifactFields(
  context: WorkspaceArtifactContext | undefined,
  state?: Pick<UBuildState, "sourceChatSessionId" | "sourceChatMessageId">
): Pick<
  AgentResult,
  | "workspaceFolderId"
  | "userStoryRevisionId"
  | "specRevisionId"
  | "chatSessionId"
  | "sourceMessageId"
> {
  return {
    ...(context?.workspaceFolderId
      ? { workspaceFolderId: context.workspaceFolderId }
      : {}),
    ...(context?.userStoryRevisionId
      ? { userStoryRevisionId: context.userStoryRevisionId }
      : {}),
    ...(context?.specRevisionId ? { specRevisionId: context.specRevisionId } : {}),
    ...(state?.sourceChatSessionId
      ? { chatSessionId: state.sourceChatSessionId }
      : {}),
    ...(state?.sourceChatMessageId
      ? { sourceMessageId: state.sourceChatMessageId }
      : {}),
  };
}
