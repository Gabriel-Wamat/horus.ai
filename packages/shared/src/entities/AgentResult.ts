import { z } from "zod";
import {
  AgentProfileIdSchema,
  AgentToolNameSchema,
} from "./AgentToolProfile.js";
import type { AgentName } from "./AgentToolProfile.js";
export {
  AgentNameSchema,
  AgentProfileIdSchema,
  AgentToolNameSchema,
  AgentToolCapabilitySchema,
  AgentToolCapabilityDefinitionSchema,
  AgentRuntimeIsolationPolicySchema,
  AgentToolProfileSchema,
  AgentProfileSchema,
  AgentToolProfileSummarySchema,
  type AgentName,
  type AgentProfileId,
  type AgentToolName,
  type AgentToolCapability,
  type AgentToolCapabilityDefinition,
  type AgentRuntimeIsolationPolicy,
  type AgentToolProfile,
  type AgentProfile,
  type AgentToolProfileSummary,
} from "./AgentToolProfile.js";

const AgentResultArtifactContextSchema = z.object({
  workspaceFolderId: z.string().uuid().optional(),
  userStoryRevisionId: z.string().optional(),
  specRevisionId: z.string().optional(),
  chatSessionId: z.string().uuid().optional(),
  sourceMessageId: z.string().uuid().optional(),
});

export const AgentResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("success"),
      agentName: z.string(),
      userStoryId: z.string().uuid(),
      output: z.record(z.string(), z.unknown()),
      executionTimeMs: z.number().int().nonnegative(),
      completedAt: z.string().datetime(),
    })
    .merge(AgentResultArtifactContextSchema),
  z
    .object({
      status: z.literal("error"),
      agentName: z.string(),
      userStoryId: z.string().uuid(),
      errorMessage: z.string(),
      errorCode: z.string().optional(),
      executionTimeMs: z.number().int().nonnegative(),
      completedAt: z.string().datetime(),
    })
    .merge(AgentResultArtifactContextSchema),
  z
    .object({
      status: z.literal("skipped"),
      agentName: z.string(),
      userStoryId: z.string().uuid(),
      reason: z.string(),
      completedAt: z.string().datetime(),
    })
    .merge(AgentResultArtifactContextSchema),
]);

export type AgentResult = z.infer<typeof AgentResultSchema>;
export type SuccessfulAgentResult = Extract<AgentResult, { status: "success" }>;

export const AgentToolCallStatusSchema = z.enum([
  "started",
  "succeeded",
  "failed",
  "blocked",
]);

export const AgentToolCallSchema = z.object({
  id: z.string().uuid(),
  agentProfileId: AgentProfileIdSchema,
  toolName: AgentToolNameSchema,
  status: AgentToolCallStatusSchema,
  mutatesState: z.boolean(),
  input: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().min(1).optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
});

export const AgentToolResultSchema = z.object({
  callId: z.string().uuid(),
  agentProfileId: AgentProfileIdSchema,
  toolName: AgentToolNameSchema,
  status: z.enum(["succeeded", "failed", "blocked"]),
  mutatesState: z.boolean(),
  output: z.unknown().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
});

export type AgentToolCallStatus = z.infer<typeof AgentToolCallStatusSchema>;
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;
export type AgentToolResult = z.infer<typeof AgentToolResultSchema>;

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
