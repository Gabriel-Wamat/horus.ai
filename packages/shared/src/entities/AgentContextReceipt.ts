import { z } from "zod";
import {
  AgentNameSchema,
  AgentProfileIdSchema,
} from "./AgentToolProfile.js";
import { CodeContextRetrievalStatusSchema } from "./CodeContext.js";

export const AgentContextRetrievalChannelSchema = z.enum([
  "explicit_paths",
  "runtime_errors",
  "git_diff",
  "lexical_bm25",
  "ast_symbols",
  "graph_neighbors",
  "semantic_embeddings",
  "reranker",
  "budget_packer",
  "project_manifest",
  "terminal_output",
]);

export const AgentContextChannelSchema = z.enum([
  "persistent_instructions",
  "user_story_spec",
  "repo_structure",
  "ast_symbols",
  "relevant_files",
  "diff",
  "terminal",
  "runtime_errors",
  "tests",
  "history",
  "decisions",
]);

export const AgentContextSelectedFileSchema = z.object({
  path: z.string().trim().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  bytes: z.number().int().nonnegative().optional(),
  hash: z.string().trim().min(1).optional(),
  channels: z.array(AgentContextRetrievalChannelSchema).default([]),
});

export const AgentContextSelectionReasonSchema = z.object({
  path: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1),
  channel: AgentContextRetrievalChannelSchema,
  score: z.number().nonnegative().optional(),
});

export const AgentContextOmittedFileSchema = z.object({
  path: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  count: z.number().int().positive().optional(),
});

export const AgentContextBudgetReceiptSchema = z.object({
  maxFiles: z.number().int().positive(),
  maxBytesPerFile: z.number().int().positive(),
  maxTotalBytes: z.number().int().positive(),
  selectedFiles: z.number().int().nonnegative(),
  selectedBytes: z.number().int().nonnegative(),
  omittedFiles: z.number().int().nonnegative(),
});

export const AgentContextRuntimeHintReceiptSchema = z.object({
  kind: z.string().trim().min(1),
  source: z.string().trim().min(1),
  message: z.string().trim().min(1),
  path: z.string().trim().min(1).optional(),
  line: z.number().int().positive().optional(),
});

export const AgentContextDiffHintReceiptSchema = z.object({
  path: z.string().trim().min(1),
  changeType: z.string().trim().min(1).optional(),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
  summary: z.string().trim().min(1).optional(),
});

export const AgentContextReceiptSchema = z.object({
  id: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
  threadId: z.string().uuid(),
  userStoryId: z.string().uuid().optional(),
  taskId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  agentName: AgentNameSchema,
  agentProfileId: AgentProfileIdSchema,
  selectedFiles: z.array(AgentContextSelectedFileSchema).default([]),
  selectionReasons: z.array(AgentContextSelectionReasonSchema).default([]),
  omittedFiles: z.array(AgentContextOmittedFileSchema).default([]),
  budget: AgentContextBudgetReceiptSchema,
  contextChannels: z.array(AgentContextChannelSchema).default([]),
  retrievalStatus: CodeContextRetrievalStatusSchema.default("partial"),
  retrievalChannels: z.array(AgentContextRetrievalChannelSchema).default([]),
  hashes: z.record(z.string(), z.string()).default({}),
  runtimeHints: z.array(AgentContextRuntimeHintReceiptSchema).default([]),
  diffHints: z.array(AgentContextDiffHintReceiptSchema).default([]),
  confidence: z.number().min(0).max(1),
  generatedAt: z.string().datetime(),
});

export type AgentContextRetrievalChannel = z.infer<
  typeof AgentContextRetrievalChannelSchema
>;
export type AgentContextChannel = z.infer<typeof AgentContextChannelSchema>;
export type AgentContextSelectedFile = z.infer<
  typeof AgentContextSelectedFileSchema
>;
export type AgentContextSelectionReason = z.infer<
  typeof AgentContextSelectionReasonSchema
>;
export type AgentContextOmittedFile = z.infer<
  typeof AgentContextOmittedFileSchema
>;
export type AgentContextBudgetReceipt = z.infer<
  typeof AgentContextBudgetReceiptSchema
>;
export type AgentContextRuntimeHintReceipt = z.infer<
  typeof AgentContextRuntimeHintReceiptSchema
>;
export type AgentContextDiffHintReceipt = z.infer<
  typeof AgentContextDiffHintReceiptSchema
>;
export type AgentContextReceipt = z.infer<typeof AgentContextReceiptSchema>;
