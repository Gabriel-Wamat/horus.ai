import { z } from "zod";
import { AgentContextRetrievalChannelSchema } from "./AgentContextReceipt.js";

export const ContextRetrievalEvaluationCaseSchema = z.object({
  id: z.string().trim().min(1),
  query: z.string().trim().min(1),
  expectedFiles: z.array(z.string().trim().min(1)).default([]),
  expectedEditFiles: z.array(z.string().trim().min(1)).default([]),
  expectedTestFiles: z.array(z.string().trim().min(1)).default([]),
  expectedSymbols: z.array(z.string().trim().min(1)).default([]),
  terminalErrorPath: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
});

export const ContextRetrievalEvaluationResultSchema = z.object({
  caseId: z.string().trim().min(1),
  query: z.string().trim().min(1),
  selectedFiles: z.array(z.string().trim().min(1)),
  selectedSymbols: z.array(z.string().trim().min(1)).default([]),
  retrievalChannels: z.array(AgentContextRetrievalChannelSchema).default([]),
  expectedFiles: z.array(z.string().trim().min(1)),
  expectedEditFiles: z.array(z.string().trim().min(1)),
  expectedTestFiles: z.array(z.string().trim().min(1)),
  expectedSymbols: z.array(z.string().trim().min(1)),
  recallAtK: z.number().min(0).max(1),
  precisionAtK: z.number().min(0).max(1),
  reciprocalRank: z.number().min(0).max(1),
  editFileHit: z.boolean(),
  testFileHit: z.boolean(),
  symbolHit: z.boolean(),
  terminalErrorFileHit: z.boolean().nullable(),
  missingFiles: z.array(z.string().trim().min(1)),
});

export const ContextRetrievalEvaluationReportSchema = z.object({
  generatedAt: z.string().datetime(),
  k: z.number().int().positive(),
  caseCount: z.number().int().nonnegative(),
  averageRecallAtK: z.number().min(0).max(1),
  averagePrecisionAtK: z.number().min(0).max(1),
  meanReciprocalRank: z.number().min(0).max(1),
  editFileHitRate: z.number().min(0).max(1),
  testFileHitRate: z.number().min(0).max(1),
  symbolHitRate: z.number().min(0).max(1),
  terminalErrorFileHitRate: z.number().min(0).max(1).nullable(),
  results: z.array(ContextRetrievalEvaluationResultSchema),
});

export type ContextRetrievalEvaluationCase = z.infer<
  typeof ContextRetrievalEvaluationCaseSchema
>;
export type ContextRetrievalEvaluationResult = z.infer<
  typeof ContextRetrievalEvaluationResultSchema
>;
export type ContextRetrievalEvaluationReport = z.infer<
  typeof ContextRetrievalEvaluationReportSchema
>;
