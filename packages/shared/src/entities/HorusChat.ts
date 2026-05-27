import { z } from "zod";
import { ChatMessageSchema } from "./ChatMemory.js";
import { LlmSettingsReferenceSchema } from "./LlmSettings.js";

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

export const HorusChatEvidenceSourceSchema = z.object({
  type: z.enum(["code_file", "user_story", "spec", "chat_history", "preview"]),
  label: z.string().trim().min(1),
  path: z.string().trim().min(1).optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  excerpt: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const HorusChatTurnInputSchema = z.object({
  chatSessionId: z.string().uuid(),
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
  previewSessionId: z.string().uuid().optional(),
  contextSources: z.array(z.string().trim().min(1)).optional(),
  evidenceSources: z.array(HorusChatEvidenceSourceSchema).optional(),
  groundingStatus: z.enum(["grounded", "partial", "ungrounded"]).optional(),
});

export const HorusChatTurnResponseSchema = z.object({
  userMessage: ChatMessageSchema,
  assistantMessage: ChatMessageSchema.optional(),
  intent: HorusChatIntentSchema,
  outcome: HorusChatOutcomeSchema,
});

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
    type: z.literal("evidence_sources"),
    messageId: z.string().trim().min(1),
    evidenceSources: z.array(HorusChatEvidenceSourceSchema),
    groundingStatus: z.enum(["grounded", "partial", "ungrounded"]),
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
]);

export type HorusChatIntentKind = z.infer<typeof HorusChatIntentKindSchema>;
export type HorusChatMode = z.infer<typeof HorusChatModeSchema>;
export type HorusPreviewAction = z.infer<typeof HorusPreviewActionSchema>;
export type HorusChatOutcomeAction = z.infer<typeof HorusChatOutcomeActionSchema>;
export type HorusChatOutcomeStatus = z.infer<typeof HorusChatOutcomeStatusSchema>;
export type HorusChatEvidenceSource = z.infer<typeof HorusChatEvidenceSourceSchema>;
export type HorusChatTurnInput = z.infer<typeof HorusChatTurnInputSchema>;
export type HorusChatIntent = z.infer<typeof HorusChatIntentSchema>;
export type HorusChatOutcome = z.infer<typeof HorusChatOutcomeSchema>;
export type HorusChatTurnResponse = z.infer<typeof HorusChatTurnResponseSchema>;
export type HorusChatStreamEvent = z.infer<typeof HorusChatStreamEventSchema>;
