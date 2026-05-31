import { z } from "zod";
import { ChatMessageSchema } from "./ChatMemory.js";
import {
  CodingRuntimeArtifactKindSchema,
  CodingRuntimeArtifactStatusSchema,
  CodingRuntimeStateSchema,
} from "./CodingRuntime.js";
import {
  CodingValidationCommandKindSchema,
  CodingValidationCommandStatusSchema,
  CodingValidationResultStatusSchema,
} from "./CodingValidation.js";
import { LlmSettingsReferenceSchema } from "./LlmSettings.js";
import { StructuralPatchDiffStatsSchema } from "./StructuralPatch.js";

export const HorusChatModeSchema = z.enum(["chat", "executor"]);

export const HorusChatIntentKindSchema = z.enum([
  "answer_question",
  "code_change",
  "run_project",
  "generate_spec",
  "clarify",
  "unsupported",
]);

export const HorusPreviewActionSchema = z.enum(["start", "stop", "reload"]);

export const HorusChatOutcomeActionSchema = z.enum([
  "answer",
  "code_change_started",
  "code_change_completed",
  "project_execution_started",
  "project_execution_stopped",
  "project_execution_reloaded",
  "spec_requested",
  "clarification_required",
  "error",
]);

export const HorusChatOutcomeStatusSchema = z.enum([
  "completed",
  "accepted",
  "running",
  "blocked",
  "failed",
]);

export const HorusChatRetrievalStatusSchema = z.enum([
  "matched",
  "partial",
  "no_match",
  "blocked",
]);

export const HorusChatEvidenceSourceSchema = z.object({
  type: z.enum(["code_file", "user_story", "spec", "chat_history", "preview"]),
  label: z.string().trim().min(1),
  path: z.string().trim().min(1).optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  excerpt: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const HorusChatCodingArtifactSummarySchema = z.object({
  kind: CodingRuntimeArtifactKindSchema,
  label: z.string().trim().min(1),
  status: CodingRuntimeArtifactStatusSchema,
  summary: z.string().trim().min(1).optional(),
});

export const HorusChatCodingValidationCommandSummarySchema = z.object({
  kind: CodingValidationCommandKindSchema,
  command: z.string().trim().min(1),
  status: CodingValidationCommandStatusSchema,
  exitCode: z.number().int().nullable(),
});

export const HorusChatCodingPlannerDiagnosticSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  severity: z.enum(["error", "warning", "info"]),
  path: z.string().trim().min(1).optional(),
});

export const HorusChatCodingEvidenceSchema = z.object({
  taskId: z.string().uuid(),
  state: CodingRuntimeStateSchema,
  changedFiles: z.array(z.string().trim().min(1)).default([]),
  diffStats: StructuralPatchDiffStatsSchema.optional(),
  artifactSummaries: z.array(HorusChatCodingArtifactSummarySchema).default([]),
  plannerDiagnostics: z.array(HorusChatCodingPlannerDiagnosticSchema).default([]),
  validation: z
    .object({
      status: CodingValidationResultStatusSchema,
      passed: z.boolean(),
      skippedReason: z.string().trim().min(1).nullable().default(null),
      commands: z.array(HorusChatCodingValidationCommandSummarySchema).default([]),
      issues: z.array(z.string().trim().min(1)).default([]),
    })
    .optional(),
  apply: z
    .object({
      status: z.string().trim().min(1),
      operationCount: z.number().int().nonnegative(),
    })
    .optional(),
});

export const HorusChatToolFileOperationSchema = z.object({
  path: z.string().trim().min(1),
  operationType: z.enum([
    "read",
    "create",
    "update",
    "delete",
    "apply",
    "validate",
    "diff",
    "unknown",
  ]),
  status: z.enum([
    "running",
    "read",
    "changed",
    "proposed",
    "applied",
    "validated",
    "blocked",
    "failed",
    "skipped",
    "unknown",
  ]),
  additions: z.number().int().nonnegative().nullable().default(null),
  deletions: z.number().int().nonnegative().nullable().default(null),
  replacementCount: z.number().int().nonnegative().nullable().default(null),
  diffPreview: z.string().default(""),
  errorMessage: z.string().trim().min(1).nullable().default(null),
});

export const HorusChatToolStepSchema = z.object({
  sequence: z.number().int().positive().optional(),
  tool: z.string().trim().min(1),
  title: z.string().trim().min(1),
  phase: z.enum(["started", "succeeded", "failed"]),
  detail: z.string().trim().min(1).optional(),
  filePaths: z.array(z.string().trim().min(1)).default([]),
  commandIds: z.array(z.string().trim().min(1)).default([]),
  taskId: z.string().trim().min(1).nullable().default(null),
  fileOperations: z.array(HorusChatToolFileOperationSchema).default([]),
});

export const HorusChatSuggestedActionSchema = z.object({
  type: z.enum(["open_file", "start_preview"]),
  label: z.string().trim().min(1),
  filePath: z.string().trim().min(1).optional(),
});

export const HorusChatTurnInputSchema = z.object({
  chatSessionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  streamCursor: z.number().int().nonnegative().optional(),
  message: z.string().trim().min(1).max(8000),
  previewSessionId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  workspaceFolderId: z.string().uuid().optional(),
  userStoryId: z.string().uuid().optional(),
  workflowThreadId: z.string().uuid().optional(),
  llmSettingsRef: LlmSettingsReferenceSchema.optional(),
});

export const HorusChatIntentSchema = z.object({
  kind: HorusChatIntentKindSchema,
  mode: HorusChatModeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1),
  previewAction: HorusPreviewActionSchema.optional(),
});

export const HorusChatOutcomeSchema = z.object({
  action: HorusChatOutcomeActionSchema,
  status: HorusChatOutcomeStatusSchema,
  summary: z.string().trim().min(1),
  chatSessionId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  workflowThreadId: z.string().uuid().optional(),
  codingTaskId: z.string().uuid().optional(),
  previewSessionId: z.string().uuid().optional(),
  contextSources: z.array(z.string().trim().min(1)).optional(),
  evidenceSources: z.array(HorusChatEvidenceSourceSchema).optional(),
  groundingStatus: z.enum(["grounded", "partial", "ungrounded"]).optional(),
  retrievalStatus: HorusChatRetrievalStatusSchema.optional(),
  retrievalNotes: z.array(z.string().trim().min(1)).optional(),
  codingEvidence: HorusChatCodingEvidenceSchema.optional(),
  toolSteps: z.array(HorusChatToolStepSchema).optional(),
  suggestedActions: z.array(HorusChatSuggestedActionSchema).optional(),
});

export const HorusChatTurnResponseSchema = z.object({
  userMessage: ChatMessageSchema,
  assistantMessage: ChatMessageSchema.optional(),
  intent: HorusChatIntentSchema,
  outcome: HorusChatOutcomeSchema,
});

export const HorusChatTurnLifecycleStatusSchema = z.enum([
  "pending",
  "streaming",
  "completed",
  "accepted",
  "blocked",
  "failed",
  "cancelled",
]);

export const HorusChatMessageMetadataSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  turnStatus: HorusChatTurnLifecycleStatusSchema.optional(),
  intent: HorusChatIntentSchema.optional(),
  outcome: HorusChatOutcomeSchema.optional(),
  evidenceSources: z.array(HorusChatEvidenceSourceSchema).optional(),
  groundingStatus: z.enum(["grounded", "partial", "ungrounded"]).optional(),
  codingEvidence: HorusChatCodingEvidenceSchema.optional(),
  toolSteps: z.array(HorusChatToolStepSchema).optional(),
  suggestedActions: z.array(HorusChatSuggestedActionSchema).optional(),
  errorCode: z.string().trim().min(1).optional(),
  retryable: z.boolean().optional(),
  submittedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
});

export const HorusChatMessageMetadataEnvelopeSchema = z
  .object({
    horusChat: HorusChatMessageMetadataSchema.optional(),
  })
  .passthrough();

const HorusChatStreamBaseSchema = z.object({
  sequence: z.number().int().positive(),
});

export const HorusChatStreamEventSchema = z.discriminatedUnion("type", [
  HorusChatStreamBaseSchema.extend({
    type: z.literal("turn_started"),
    chatSessionId: z.string().uuid(),
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("user_message_persisted"),
    message: ChatMessageSchema,
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("intent_classified"),
    intent: HorusChatIntentSchema,
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("assistant_message_started"),
    messageId: z.string().trim().min(1),
    createdAt: z.string().datetime(),
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("assistant_text_delta"),
    messageId: z.string().trim().min(1),
    delta: z.string(),
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("assistant_tool_step"),
    messageId: z.string().trim().min(1),
    tool: z.string().trim().min(1),
    phase: z.enum(["started", "succeeded", "failed"]),
    title: z.string().trim().min(1),
    detail: z.string().optional(),
    filePaths: z.array(z.string().trim().min(1)).default([]),
    commandIds: z.array(z.string().trim().min(1)).default([]),
    taskId: z.string().trim().min(1).nullable().default(null),
    fileOperations: z.array(HorusChatToolFileOperationSchema).default([]),
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("evidence_sources"),
    messageId: z.string().trim().min(1),
    evidenceSources: z.array(HorusChatEvidenceSourceSchema),
    groundingStatus: z.enum(["grounded", "partial", "ungrounded"]),
    retrievalStatus: HorusChatRetrievalStatusSchema.optional(),
    retrievalNotes: z.array(z.string().trim().min(1)).optional(),
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("action_started"),
    action: HorusChatOutcomeActionSchema,
    label: z.string().trim().min(1),
    workflowThreadId: z.string().uuid().optional(),
    previewSessionId: z.string().uuid().optional(),
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("action_updated"),
    action: HorusChatOutcomeActionSchema,
    status: HorusChatOutcomeStatusSchema,
    summary: z.string().trim().min(1).optional(),
    workflowThreadId: z.string().uuid().optional(),
    previewSessionId: z.string().uuid().optional(),
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("assistant_message_completed"),
    message: ChatMessageSchema,
    outcome: HorusChatOutcomeSchema,
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("turn_completed"),
    response: HorusChatTurnResponseSchema,
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("turn_failed"),
    errorCode: z.string().trim().min(1),
    message: z.string().trim().min(1),
    retryable: z.boolean(),
  }),
  HorusChatStreamBaseSchema.extend({
    type: z.literal("turn_cancelled"),
    message: z.string().trim().min(1),
    retryable: z.boolean(),
  }),
]);

export type HorusChatIntentKind = z.infer<typeof HorusChatIntentKindSchema>;
export type HorusChatMode = z.infer<typeof HorusChatModeSchema>;
export type HorusPreviewAction = z.infer<typeof HorusPreviewActionSchema>;
export type HorusChatOutcomeAction = z.infer<typeof HorusChatOutcomeActionSchema>;
export type HorusChatOutcomeStatus = z.infer<typeof HorusChatOutcomeStatusSchema>;
export type HorusChatRetrievalStatus = z.infer<
  typeof HorusChatRetrievalStatusSchema
>;
export type HorusChatEvidenceSource = z.infer<typeof HorusChatEvidenceSourceSchema>;
export type HorusChatCodingArtifactSummary = z.infer<
  typeof HorusChatCodingArtifactSummarySchema
>;
export type HorusChatCodingValidationCommandSummary = z.infer<
  typeof HorusChatCodingValidationCommandSummarySchema
>;
export type HorusChatCodingPlannerDiagnostic = z.infer<
  typeof HorusChatCodingPlannerDiagnosticSchema
>;
export type HorusChatCodingEvidence = z.infer<
  typeof HorusChatCodingEvidenceSchema
>;
export type HorusChatToolStep = z.infer<typeof HorusChatToolStepSchema>;
export type HorusChatToolFileOperation = z.infer<
  typeof HorusChatToolFileOperationSchema
>;
export type HorusChatSuggestedAction = z.infer<
  typeof HorusChatSuggestedActionSchema
>;
export type HorusChatTurnInput = z.infer<typeof HorusChatTurnInputSchema>;
export type HorusChatIntent = z.infer<typeof HorusChatIntentSchema>;
export type HorusChatOutcome = z.infer<typeof HorusChatOutcomeSchema>;
export type HorusChatTurnResponse = z.infer<typeof HorusChatTurnResponseSchema>;
export type HorusChatTurnLifecycleStatus = z.infer<
  typeof HorusChatTurnLifecycleStatusSchema
>;
export type HorusChatMessageMetadata = z.infer<
  typeof HorusChatMessageMetadataSchema
>;
export type HorusChatMessageMetadataEnvelope = z.infer<
  typeof HorusChatMessageMetadataEnvelopeSchema
>;
export type HorusChatStreamEvent = z.infer<typeof HorusChatStreamEventSchema>;
