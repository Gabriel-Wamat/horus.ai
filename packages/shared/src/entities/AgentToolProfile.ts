import { z } from "zod";

export const AgentNameSchema = z.enum([
  "spec",
  "odin",
  "front",
  "qa",
  "curator",
]);

export const AgentProfileIdSchema = z.enum([
  "chat_agent",
  "horus_chat_executor",
  "spec_agent",
  "odin_agent",
  "front_agent",
  "qa_agent",
  "curator_agent",
]);

export const AgentToolNameSchema = z.enum([
  "inspect_project",
  "read_file",
  "search_code",
  "list_files",
  "edit_file",
  "replace_file_range",
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

export const AgentToolCapabilitySchema = z.enum([
  "project_inspection",
  "project_read",
  "project_search",
  "project_mutation",
  "project_delete",
  "change_proposal",
  "change_application",
  "diff_read",
  "command_run",
  "validation_run",
  "validation_read",
  "preview_inspection",
  "story_read",
  "spec_read",
  "spec_write",
  "assignment_routing",
  "evidence_read",
  "verdict_emit",
  "external_publish",
  "unsafe_shell",
]);

export const AgentToolCapabilityDefinitionSchema = z.object({
  toolName: AgentToolNameSchema,
  capabilities: z.array(AgentToolCapabilitySchema).min(1),
  mutatesState: z.boolean(),
  requiresProjectContext: z.boolean().default(false),
  description: z.string().trim().min(1),
});

export const AgentRuntimeIsolationPolicySchema = z.object({
  timeoutMs: z.number().int().positive().default(120_000),
  maxAttempts: z.number().int().positive().default(1),
  retryBackoffMs: z.number().int().nonnegative().default(0),
  circuitBreaker: z
    .object({
      failureThreshold: z.number().int().positive().default(3),
      cooldownMs: z.number().int().positive().default(60_000),
    })
    .default({}),
});

export const AgentToolProfileSchema = z
  .object({
    id: AgentProfileIdSchema,
    agentName: AgentNameSchema.optional(),
    label: z.string().trim().min(1),
    purpose: z.string().trim().min(1),
    allowedTools: z.array(AgentToolNameSchema).default([]),
    forbiddenTools: z.array(AgentToolNameSchema).default([]),
    capabilityScopes: z.array(AgentToolCapabilitySchema).default([]),
    inputContract: z.string().trim().min(1),
    outputContract: z.string().trim().min(1),
    isolationPolicy: AgentRuntimeIsolationPolicySchema.default({}),
  })
  .superRefine((profile, ctx) => {
    const allowed = new Set(profile.allowedTools);
    const forbidden = new Set(profile.forbiddenTools);
    for (const toolName of allowed) {
      if (forbidden.has(toolName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["forbiddenTools"],
          message: `Tool ${toolName} cannot be both allowed and forbidden.`,
        });
      }
    }
  });

export const AgentProfileSchema = AgentToolProfileSchema;

export const AgentToolProfileSummarySchema = z.object({
  id: AgentProfileIdSchema,
  agentName: AgentNameSchema.optional(),
  label: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  capabilityScopes: z.array(AgentToolCapabilitySchema),
  allowedTools: z.array(AgentToolNameSchema),
  forbiddenTools: z.array(AgentToolNameSchema),
  readOnlyTools: z.array(AgentToolNameSchema),
  mutatingTools: z.array(AgentToolNameSchema),
  commandTools: z.array(AgentToolNameSchema),
});

export type AgentName = z.infer<typeof AgentNameSchema>;
export type AgentProfileId = z.infer<typeof AgentProfileIdSchema>;
export type AgentToolName = z.infer<typeof AgentToolNameSchema>;
export type AgentToolCapability = z.infer<typeof AgentToolCapabilitySchema>;
export type AgentToolCapabilityDefinition = z.infer<
  typeof AgentToolCapabilityDefinitionSchema
>;
export type AgentRuntimeIsolationPolicy = z.infer<
  typeof AgentRuntimeIsolationPolicySchema
>;
export type AgentToolProfile = z.infer<typeof AgentToolProfileSchema>;
export type AgentProfile = AgentToolProfile;
export type AgentToolProfileSummary = z.infer<
  typeof AgentToolProfileSummarySchema
>;
