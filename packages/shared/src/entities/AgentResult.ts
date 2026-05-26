import { z } from "zod";

export const AgentResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    agentName: z.string(),
    userStoryId: z.string().uuid(),
    output: z.record(z.string(), z.unknown()),
    executionTimeMs: z.number().int().nonnegative(),
    completedAt: z.string().datetime(),
  }),
  z.object({
    status: z.literal("error"),
    agentName: z.string(),
    userStoryId: z.string().uuid(),
    errorMessage: z.string(),
    errorCode: z.string().optional(),
    executionTimeMs: z.number().int().nonnegative(),
    completedAt: z.string().datetime(),
  }),
  z.object({
    status: z.literal("skipped"),
    agentName: z.string(),
    userStoryId: z.string().uuid(),
    reason: z.string(),
    completedAt: z.string().datetime(),
  }),
]);

export type AgentResult = z.infer<typeof AgentResultSchema>;
export type SuccessfulAgentResult = Extract<AgentResult, { status: "success" }>;

export const AgentNameSchema = z.enum([
  "spec",
  "odin",
  "front",
  "qa",
  "curator",
]);

export type AgentName = z.infer<typeof AgentNameSchema>;

export function getLatestSuccessfulAgentResult(
  results: readonly AgentResult[],
  agentName: AgentName
): SuccessfulAgentResult | undefined {
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const result = results[i];
    if (result?.status === "success" && result.agentName === agentName) {
      return result;
    }
  }

  return undefined;
}
