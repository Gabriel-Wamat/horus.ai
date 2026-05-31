import type {
  ChatMessage,
  ChatMessageVisibility,
  HorusChatOutcome,
  HorusChatToolStep,
} from "@u-build/shared";
import { HorusChatMessageMetadataSchema } from "@u-build/shared";
import type { PreviewChatMessage } from "../../components/PreviewConversationPanel.js";

export function upsertChatMessage(
  current: PreviewChatMessage[],
  message: PreviewChatMessage
): PreviewChatMessage[] {
  const existingIndex = current.findIndex((item) => item.id === message.id);
  if (existingIndex === -1) return [...current, message];

  return current.map((item) => (item.id === message.id ? message : item));
}

export function replaceChatMessage(
  current: PreviewChatMessage[],
  previousId: string,
  message: PreviewChatMessage
): PreviewChatMessage[] {
  const next = [...current];
  const previousIndex = next.findIndex((item) => item.id === previousId);
  const duplicateIndex = next.findIndex((item) => item.id === message.id);

  if (previousIndex >= 0) {
    next[previousIndex] = message;
    if (duplicateIndex >= 0 && duplicateIndex !== previousIndex) {
      next.splice(duplicateIndex, 1);
    }
    return next;
  }

  if (duplicateIndex >= 0) {
    next[duplicateIndex] = message;
    return next;
  }

  return [...next, message];
}

export function appendAssistantDelta(
  current: PreviewChatMessage[],
  messageId: string,
  delta: string
): PreviewChatMessage[] {
  return current.map((message) =>
    message.id === messageId
      ? {
          ...message,
          body: `${message.isPending ? "" : message.body}${delta}`,
          turnStatus: "streaming",
          isPending: false,
          isStreaming: true,
        }
      : message
  );
}

export function appendToolStep(
  current: PreviewChatMessage[],
  messageId: string,
  step: HorusChatToolStep
): PreviewChatMessage[] {
  return current.map((message) =>
    message.id === messageId
      ? { ...message, toolSteps: mergeToolStep(message.toolSteps ?? [], step) }
      : message
  );
}

function mergeToolStep(
  steps: HorusChatToolStep[],
  step: HorusChatToolStep
): HorusChatToolStep[] {
  if (step.phase === "started") {
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const candidate = steps[index];
      if (
        candidate &&
        candidate.title === step.title &&
        candidate.tool === step.tool &&
        candidate.phase === "started"
      ) {
        const next = steps.slice();
        next[index] = {
          ...candidate,
          ...(step.detail
            ? {
                detail: appendToolStepDetail(candidate.detail, step.detail),
              }
            : {}),
          ...(step.sequence ? { sequence: step.sequence } : {}),
          filePaths: mergeUnique(candidate.filePaths, step.filePaths),
          commandIds: mergeUnique(candidate.commandIds, step.commandIds),
          fileOperations: mergeFileOperations(
            candidate.fileOperations,
            step.fileOperations
          ),
        };
        return next;
      }
    }
    return [...steps, step];
  }
  // Resolve the most recent pending step with the same title into its terminal phase.
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const candidate = steps[index];
    if (candidate && candidate.title === step.title && candidate.phase === "started") {
      const next = steps.slice();
      next[index] = {
        ...candidate,
        phase: step.phase,
        ...(step.detail ? { detail: step.detail } : {}),
        ...(step.sequence ? { sequence: step.sequence } : {}),
        filePaths: mergeUnique(candidate.filePaths, step.filePaths),
        commandIds: mergeUnique(candidate.commandIds, step.commandIds),
        fileOperations: mergeFileOperations(
          candidate.fileOperations,
          step.fileOperations
        ),
      };
      return next;
    }
  }
  return [...steps, step];
}

function appendToolStepDetail(
  current: string | undefined,
  chunk: string,
  maxLength = 2400
): string {
  const next = `${current ?? ""}${chunk}`;
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

function mergeUnique(
  left: readonly string[] = [],
  right: readonly string[] = []
): string[] {
  return [...new Set([...left, ...right])];
}

function mergeFileOperations(
  left: ReadonlyArray<HorusChatToolStep["fileOperations"][number]> = [],
  right: ReadonlyArray<HorusChatToolStep["fileOperations"][number]> = []
): HorusChatToolStep["fileOperations"] {
  const byPath = new Map<string, HorusChatToolStep["fileOperations"][number]>();
  for (const operation of left) byPath.set(operation.path, operation);
  for (const operation of right) byPath.set(operation.path, operation);
  return [...byPath.values()];
}

export function mapChatMessage(
  message: ChatMessage,
  outcome?: HorusChatOutcome
): PreviewChatMessage {
  const horusMetadata = HorusChatMessageMetadataSchema.safeParse(
    message.metadata["horusChat"]
  );
  const persistedMetadata = horusMetadata.success ? horusMetadata.data : undefined;
  const effectiveOutcome = outcome ?? persistedMetadata?.outcome;
  const shouldExposeEvidence = shouldExposeTechnicalEvidence(effectiveOutcome);
  const evidenceSources = shouldExposeEvidence
    ? effectiveOutcome?.evidenceSources ?? persistedMetadata?.evidenceSources
    : undefined;
  const groundingStatus = shouldExposeEvidence
    ? effectiveOutcome?.groundingStatus ?? persistedMetadata?.groundingStatus
    : undefined;
  const codingEvidence =
    effectiveOutcome?.codingEvidence ?? persistedMetadata?.codingEvidence;
  const toolSteps =
    effectiveOutcome?.toolSteps ?? persistedMetadata?.toolSteps;

  return {
    id: message.id,
    role: message.role,
    body: message.body,
    createdAt: message.createdAt,
    sequence: message.sequence,
    eventType: message.eventType,
    visibility: message.visibility,
    deliveryStatus: message.deliveryStatus,
    ...(persistedMetadata?.idempotencyKey
      ? { idempotencyKey: persistedMetadata.idempotencyKey }
      : {}),
    ...(persistedMetadata?.turnStatus
      ? { turnStatus: persistedMetadata.turnStatus }
      : {}),
    ...(persistedMetadata?.retryable !== undefined
      ? { retryable: persistedMetadata.retryable }
      : {}),
    ...(persistedMetadata?.errorCode
      ? { errorCode: persistedMetadata.errorCode }
      : {}),
    ...(effectiveOutcome?.action ? { action: effectiveOutcome.action } : {}),
    ...(shouldExposeEvidence && effectiveOutcome?.retrievalStatus
      ? { retrievalStatus: effectiveOutcome.retrievalStatus }
      : {}),
    ...(shouldExposeEvidence && effectiveOutcome?.retrievalNotes
      ? { retrievalNotes: effectiveOutcome.retrievalNotes }
      : {}),
    ...(message.role === "agent" && codingEvidence
      ? { codingEvidence }
      : {}),
    ...(message.role === "agent" && toolSteps?.length ? { toolSteps } : {}),
    ...(message.deliveryStatus === "streaming" ? { isStreaming: true } : {}),
    ...(message.role === "agent" && evidenceSources
      ? { evidenceSources }
      : {}),
    ...(message.role === "agent" && groundingStatus
      ? { groundingStatus }
      : {}),
    ...(message.contextSnapshot.projectId
      ? { projectId: message.contextSnapshot.projectId }
      : {}),
    ...(message.contextSnapshot.workflowThreadId
      ? { workflowThreadId: message.contextSnapshot.workflowThreadId }
      : {}),
    ...(message.contextSnapshot.previewSessionId
      ? { previewSessionId: message.contextSnapshot.previewSessionId }
      : {}),
  };
}

function shouldExposeTechnicalEvidence(
  outcome: HorusChatOutcome | undefined
): boolean {
  if (!outcome) return true;
  return !(
    outcome.action === "code_change_started" ||
    outcome.action === "code_change_completed"
  );
}

export function isLegacyWorkflowProgressMessage(message: ChatMessage): boolean {
  if (!message.contextSnapshot.workflowThreadId || message.role !== "agent") {
    return false;
  }
  return [
    "modo executor",
    "Thread ",
    "concluiu a etapa do modo executor",
    "Validação runtime:",
    "Validação passou:",
    "Validação encontrou problema:",
    "Preparei uma alteração concreta",
    "Apliquei o patch no projeto",
    "A revisão pediu ajuste.",
    "Corrida concluída.",
    "Comecei a corrida.",
    "preparou alterações no projeto",
    "aplicou alterações no projeto",
    "A execução dos agentes falhou:",
  ].some((snippet) => message.body.includes(snippet));
}

export function mergeChatMessages(
  current: PreviewChatMessage[],
  incoming: PreviewChatMessage[]
): PreviewChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => {
    if (a.sequence !== undefined && b.sequence !== undefined) {
      return a.sequence - b.sequence;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function isVisibleChatMessage(message: ChatMessage): boolean {
  return message.visibility === ("user" satisfies ChatMessageVisibility);
}

export function isMessageForSelectedProject(
  message: ChatMessage,
  projectId: string | null
): boolean {
  if (!projectId) return !message.contextSnapshot.projectId;
  return message.contextSnapshot.projectId === projectId;
}

export function mapVisibleProjectChatMessages(
  messages: ChatMessage[],
  projectId: string | null
): PreviewChatMessage[] {
  return messages
    .filter(isVisibleChatMessage)
    .filter((message) => isMessageForSelectedProject(message, projectId))
    .filter((message) => !isLegacyWorkflowProgressMessage(message))
    .map((message) => mapChatMessage(message));
}

export function createLocalChatMessage(input: {
  body: string;
  role: PreviewChatMessage["role"];
  createdAt?: string;
  isPending?: boolean;
  isStreaming?: boolean;
  turnStatus?: PreviewChatMessage["turnStatus"];
}): PreviewChatMessage {
  return {
    id: `local-${input.role}-${crypto.randomUUID()}`,
    role: input.role,
    body: input.body,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.turnStatus ? { turnStatus: input.turnStatus } : {}),
    ...(input.isPending ? { isPending: true } : {}),
    ...(input.isStreaming ? { isStreaming: true } : {}),
  };
}
