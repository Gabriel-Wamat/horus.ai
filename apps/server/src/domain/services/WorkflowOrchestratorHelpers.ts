import { Command } from "@langchain/langgraph";
import { z } from "zod";
import { RuntimeValidationEvidenceSchema } from "@u-build/shared";

export const WorkflowStartOutboxPayloadSchema = z.object({
  threadId: z.string().uuid(),
  runId: z.string().uuid(),
  attemptId: z.string().uuid(),
  turnId: z.string().uuid().nullable().optional(),
  input: z.record(z.string(), z.unknown()),
  config: z.record(z.string(), z.unknown()),
});

export function extractAgentResultStoryId(
  nodeUpdate: Record<string, unknown> | undefined
): string | undefined {
  if (!nodeUpdate) return undefined;
  const agentResults = nodeUpdate["agentResults"];
  if (!agentResults || typeof agentResults !== "object") return undefined;
  const [storyId] = Object.keys(agentResults as Record<string, unknown>);
  return storyId;
}

export function extractRuntimeValidationEvidence(
  nodeUpdate: Record<string, unknown> | undefined
) {
  if (!nodeUpdate) return undefined;
  const agentResults = nodeUpdate["agentResults"];
  if (!agentResults || typeof agentResults !== "object") return undefined;
  for (const results of Object.values(agentResults as Record<string, unknown>)) {
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      if (!result || typeof result !== "object") continue;
      const output = (result as { output?: unknown }).output;
      if (!output || typeof output !== "object") continue;
      const rawEvidence = (output as Record<string, unknown>)["runtimeValidation"];
      if (rawEvidence) return RuntimeValidationEvidenceSchema.parse(rawEvidence);
    }
  }
  return undefined;
}

export function extractInputUserStoryId(
  input: Record<string, unknown> | Command
): string | undefined {
  if (
    typeof input !== "object" ||
    input === null ||
    !("userStories" in input) ||
    !Array.isArray((input as Record<string, unknown>)["userStories"])
  ) {
    return undefined;
  }

  const [firstStory] = (input as { userStories: unknown[] }).userStories;
  if (
    typeof firstStory === "object" &&
    firstStory !== null &&
    typeof (firstStory as Record<string, unknown>)["id"] === "string"
  ) {
    return (firstStory as Record<string, string>)["id"];
  }

  return undefined;
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown workflow error";
  }
}
