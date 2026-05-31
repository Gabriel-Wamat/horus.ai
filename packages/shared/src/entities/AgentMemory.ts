import { z } from "zod";
import { RuntimeAgentSkillSchema } from "./AgentSkill.js";
import { AgentContextEnvelopeSchema } from "./AgentContextProfile.js";

export const AgentMemoryKindSchema = z.enum([
  "working",
  "episodic",
  "semantic",
  "preference",
  "rejected_decision",
]);

export const AgentMemoryScopeSchema = z.object({
  workspaceFolderId: z.string().uuid().nullable().default(null),
  userStoryId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  chatSessionId: z.string().uuid().nullable().default(null),
  workflowThreadId: z.string().uuid().nullable().default(null),
  codingTaskId: z.string().uuid().nullable().default(null),
  agentProfileId: z.string().trim().min(1).max(120).nullable().default(null),
});

export const AgentMemorySourceTypeSchema = z.enum([
  "chat_message",
  "workflow_event",
  "spec",
  "file",
  "skill",
  "validation",
  "manual",
]);

export const AgentMemorySourceRefSchema = z.object({
  type: AgentMemorySourceTypeSchema,
  id: z.string().trim().min(1).max(240),
  label: z.string().trim().min(1).max(240).nullable().default(null),
});

export const AgentMemoryItemSchema = z.object({
  id: z.string().uuid(),
  kind: AgentMemoryKindSchema,
  scope: AgentMemoryScopeSchema,
  content: z.string().trim().min(1).max(4_000),
  confidence: z.number().min(0).max(1).default(1),
  sourceRefs: z.array(AgentMemorySourceRefSchema).min(1).max(12),
  tags: z.array(z.string().trim().min(1).max(80)).default([]),
  staleAt: z.string().datetime().nullable().default(null),
  supersededByMemoryId: z.string().uuid().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AgentMemorySummarySchema = z.object({
  id: z.string().uuid(),
  scope: AgentMemoryScopeSchema,
  summary: z.string().trim().min(1).max(8_000),
  sourceRefs: z.array(AgentMemorySourceRefSchema).min(1).max(24),
  sourceMessageSequenceMin: z.number().int().positive().nullable().default(null),
  sourceMessageSequenceMax: z.number().int().positive().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AgentMemoryLinkSchema = z.object({
  id: z.string().uuid(),
  fromMemoryId: z.string().uuid(),
  toMemoryId: z.string().uuid(),
  relation: z.enum(["supports", "supersedes", "contradicts", "related"]),
  createdAt: z.string().datetime(),
});

export const PromptBudgetSectionReportSchema = z.object({
  name: z.string().trim().min(1),
  usedBytes: z.number().int().nonnegative(),
  clippedBytes: z.number().int().nonnegative().default(0),
  itemCount: z.number().int().nonnegative().default(0),
});

export const PromptBudgetReportSchema = z.object({
  maxBytes: z.number().int().positive(),
  usedBytes: z.number().int().nonnegative(),
  clippedBytes: z.number().int().nonnegative().default(0),
  sections: z.array(PromptBudgetSectionReportSchema).default([]),
  diagnostics: z.array(z.string().trim().min(1)).default([]),
});

export const PromptContextBundleSchema = z.object({
  agentProfileId: z.string().trim().min(1).max(120),
  scope: AgentMemoryScopeSchema,
  summaries: z.array(AgentMemorySummarySchema).default([]),
  memories: z.array(AgentMemoryItemSchema).default([]),
  runtimeSkills: z.array(RuntimeAgentSkillSchema).default([]),
  contextProfile: AgentContextEnvelopeSchema.optional(),
  budget: PromptBudgetReportSchema,
});

export type AgentMemoryKind = z.infer<typeof AgentMemoryKindSchema>;
export type AgentMemoryScope = z.infer<typeof AgentMemoryScopeSchema>;
export type AgentMemorySourceType = z.infer<typeof AgentMemorySourceTypeSchema>;
export type AgentMemorySourceRef = z.infer<typeof AgentMemorySourceRefSchema>;
export type AgentMemoryItem = z.infer<typeof AgentMemoryItemSchema>;
export type AgentMemorySummary = z.infer<typeof AgentMemorySummarySchema>;
export type AgentMemoryLink = z.infer<typeof AgentMemoryLinkSchema>;
export type PromptBudgetSectionReport = z.infer<
  typeof PromptBudgetSectionReportSchema
>;
export type PromptBudgetReport = z.infer<typeof PromptBudgetReportSchema>;
export type PromptContextBundle = z.infer<typeof PromptContextBundleSchema>;
