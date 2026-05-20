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

export const AgentNameSchema = z.enum([
  "spec",
  "odin",
  "front",
  "qa",
  "curator",
]);

export type AgentName = z.infer<typeof AgentNameSchema>;
