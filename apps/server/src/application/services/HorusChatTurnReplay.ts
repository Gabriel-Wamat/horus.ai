import type { HorusChatTurnInput, HorusChatTurnResponse } from "@u-build/shared";
import { HorusChatTurnResponseSchema } from "@u-build/shared";
import type { ChatMemoryRepository } from "../ports/RepositoryPorts.js";
import { readHorusChatMetadata } from "./HorusChatTurnMetadata.js";

export async function findPersistedHorusChatTurnResponse(
  chatMemoryStore: ChatMemoryRepository,
  input: HorusChatTurnInput
): Promise<HorusChatTurnResponse | null> {
  if (!input.idempotencyKey) return null;
  const messages = await chatMemoryStore.listMessages(input.chatSessionId);
  const matches = messages.filter(
    (message) => readHorusChatMetadata(message)?.idempotencyKey === input.idempotencyKey
  );
  const userMessage = matches.find((message) => message.role === "user");
  const assistantMessage = [...matches]
    .reverse()
    .find((message) => message.role === "agent");
  const metadata = assistantMessage
    ? readHorusChatMetadata(assistantMessage)
    : undefined;

  if (!userMessage || !assistantMessage || !metadata?.intent || !metadata.outcome) {
    return null;
  }

  return HorusChatTurnResponseSchema.parse({
    userMessage,
    assistantMessage,
    intent: metadata.intent,
    outcome: metadata.outcome,
  });
}
