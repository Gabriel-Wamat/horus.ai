import { z } from "zod";

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

export const AgentNameSchema = z.enum([
  "spec",
  "odin",
  "front",
  "qa",
  "curator",
]);

export type AgentName = z.infer<typeof AgentNameSchema>;

export const AgentProfileIdSchema = z.enum([
  "chat_agent",
  "spec_agent",
  "odin_agent",
  "front_agent",
  "qa_agent",
  "curator_agent",
]);

export const AgentToolNameSchema = z.enum([
  "read_file",
  "search_code",
  "list_files",
  "save_file",
  "apply_code_change_set",
  "get_git_diff",
  "search_code_readonly",
  "read_file_readonly",
  "list_project_files",
  "get_user_story",
  "get_spec",
  "read_user_story",
  "read_project_manifest",
  "save_spec_revision",
  "read_spec",
  "read_agent_results",
  "create_assignment",
  "update_assignment",
  "propose_code_change_set",
  "run_static_analysis_readonly",
  "read_code_change_set",
  "run_validation_command",
  "inspect_preview",
  "read_validation_evidence",
  "emit_verdict",
  "write_file",
  "run_command",
  "git_push",
  "delete_file",
  "write_project_file",
  "run_shell",
  "direct_fs_write",
  "arbitrary_shell",
  "run_arbitrary_command",
]);

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

export const AgentProfileSchema = z.object({
  id: AgentProfileIdSchema,
  agentName: AgentNameSchema.optional(),
  label: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  allowedTools: z.array(AgentToolNameSchema).default([]),
  forbiddenTools: z.array(AgentToolNameSchema).default([]),
  inputContract: z.string().trim().min(1),
  outputContract: z.string().trim().min(1),
});

export type AgentProfileId = z.infer<typeof AgentProfileIdSchema>;
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;
export type AgentToolCallStatus = z.infer<typeof AgentToolCallStatusSchema>;
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;
export type AgentToolResult = z.infer<typeof AgentToolResultSchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

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
