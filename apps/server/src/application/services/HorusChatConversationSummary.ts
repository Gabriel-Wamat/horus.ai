import type {
  AgentMemoryScope,
  ChatMessage,
  ChatSession,
  HorusChatTurnInput,
} from "@u-build/shared";
import type { ChatMemoryRepository } from "../ports/RepositoryPorts.js";
import { collapseWhitespace } from "./AgenticTextParsing.js";
import type { ChatContextMemoryReader } from "./ChatContextAssembler.js";

export interface ConversationMemoryWriter {
  upsertConversationSummary(input: {
    scope: AgentMemoryScope;
    messages: ChatMessage[];
    summary: string;
  }): Promise<unknown>;
}

export type ConversationMemoryProvider = ConversationMemoryWriter &
  Partial<ChatContextMemoryReader>;

export async function persistHorusChatConversationSummary(input: {
  conversationMemory: ConversationMemoryProvider | undefined;
  chatMemoryStore: ChatMemoryRepository;
  session: ChatSession;
  turnInput: HorusChatTurnInput;
  workflowThreadId: string | undefined;
  projectId: string | undefined;
}): Promise<void> {
  if (!input.conversationMemory) return;
  try {
    const messages = await input.chatMemoryStore.listMessages(input.session.id);
    const recent = messages.slice(-12);
    if (recent.length < 2) return;
    const summary = recent
      .map((message) => {
        const body = collapseWhitespace(message.compactBody ?? message.body).slice(0, 280);
        return `${message.role}: ${body}`;
      })
      .join("\n");
    await input.conversationMemory.upsertConversationSummary({
      scope: {
        workspaceFolderId: input.session.workspaceFolderId,
        userStoryId: input.session.userStoryId,
        projectId: input.projectId ?? input.turnInput.projectId ?? null,
        chatSessionId: input.session.id,
        workflowThreadId:
          input.workflowThreadId ??
          input.turnInput.workflowThreadId ??
          input.session.workflowThreadId ??
          null,
        codingTaskId: null,
        agentProfileId: "horus_chat",
      },
      messages: recent,
      summary,
    });
  } catch (err) {
    console.warn(
      "[SubmitHorusChatTurnUseCase] Failed to persist conversation summary:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
