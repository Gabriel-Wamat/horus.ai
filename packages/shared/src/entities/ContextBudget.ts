import { z } from "zod";

export const ContextBudgetSourceTypeSchema = z.enum([
  "user_request",
  "task_memory",
  "chat_history",
  "lexical_candidate",
  "semantic_chunk",
  "symbol",
  "graph",
  "validation_error",
]);

export const ContextBudgetOmissionReasonSchema = z.enum([
  "budget_exhausted",
  "lower_priority",
  "empty_content",
  "duplicate",
]);

export const ContextBudgetConfigSchema = z.object({
  maxTokens: z.number().int().positive(),
  reserveTokens: z.number().int().nonnegative().default(0),
  maxItemTokens: z.number().int().positive().optional(),
});

export const ContextBudgetItemSchema = z.object({
  id: z.string().trim().min(1),
  type: ContextBudgetSourceTypeSchema,
  label: z.string().trim().min(1),
  content: z.string(),
  tokenEstimate: z.number().int().nonnegative(),
  priority: z.number().int().nonnegative(),
  score: z.number().nonnegative().default(0),
  path: z.string().trim().min(1).optional(),
  sourceId: z.string().trim().min(1).optional(),
});

export const PackedContextItemSchema = ContextBudgetItemSchema.extend({
  content: z.string().trim().min(1),
  originalTokenEstimate: z.number().int().nonnegative().optional(),
  truncated: z.boolean().default(false),
});

export const OmittedContextItemSchema = z.object({
  id: z.string().trim().min(1),
  type: ContextBudgetSourceTypeSchema,
  label: z.string().trim().min(1),
  tokenEstimate: z.number().int().nonnegative(),
  priority: z.number().int().nonnegative(),
  score: z.number().nonnegative().default(0),
  path: z.string().trim().min(1).optional(),
  reason: ContextBudgetOmissionReasonSchema,
});

export const PackedCodingContextSchema = z.object({
  budget: ContextBudgetConfigSchema,
  usedTokens: z.number().int().nonnegative(),
  remainingTokens: z.number().int().nonnegative(),
  items: z.array(PackedContextItemSchema).default([]),
  omittedItems: z.array(OmittedContextItemSchema).default([]),
  sourceCounts: z.record(ContextBudgetSourceTypeSchema, z.number().int().nonnegative()),
  diagnostics: z.array(z.string().trim().min(1)).default([]),
  generatedAt: z.string().datetime(),
});

export type ContextBudgetSourceType = z.infer<
  typeof ContextBudgetSourceTypeSchema
>;
export type ContextBudgetOmissionReason = z.infer<
  typeof ContextBudgetOmissionReasonSchema
>;
export type ContextBudgetConfig = z.infer<typeof ContextBudgetConfigSchema>;
export type ContextBudgetItem = z.infer<typeof ContextBudgetItemSchema>;
export type PackedContextItem = z.infer<typeof PackedContextItemSchema>;
export type OmittedContextItem = z.infer<typeof OmittedContextItemSchema>;
export type PackedCodingContext = z.infer<typeof PackedCodingContextSchema>;
