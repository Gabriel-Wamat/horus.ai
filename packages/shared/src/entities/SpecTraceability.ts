import { z } from "zod";
import { AgentNameSchema } from "./AgentResult.js";

export const SpecRequirementKindSchema = z.enum([
  "acceptance_criterion",
  "component",
  "api_endpoint",
  "data_model",
  "visual_contract",
  "technical_approach",
]);

export const SpecTraceabilityEvidenceTypeSchema = z.enum([
  "code_file",
  "component",
  "test_case",
  "diff",
  "runtime_validation",
  "curator_decision",
]);

export const SpecTraceabilityConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
]);

export const SpecRequirementRefSchema = z.object({
  id: z.string().trim().min(1),
  kind: SpecRequirementKindSchema,
  label: z.string().trim().min(1),
  text: z.string().trim().min(1),
  index: z.number().int().nonnegative(),
});

export const SpecTraceabilityEvidenceSchema = z.object({
  type: SpecTraceabilityEvidenceTypeSchema,
  label: z.string().trim().min(1),
  path: z.string().trim().min(1).nullable().default(null),
  agentName: AgentNameSchema.nullable().default(null),
  sourceId: z.string().trim().min(1).nullable().default(null),
  confidence: SpecTraceabilityConfidenceSchema,
  rationale: z.string().trim().min(1),
});

export const SpecTraceabilityRecordSchema = z.object({
  requirement: SpecRequirementRefSchema,
  status: z.enum(["covered", "partial", "uncovered"]),
  confidence: SpecTraceabilityConfidenceSchema,
  evidence: z.array(SpecTraceabilityEvidenceSchema).default([]),
  gaps: z.array(z.string().trim().min(1)).default([]),
});

export const SpecTraceabilitySummarySchema = z.object({
  totalRequirements: z.number().int().nonnegative(),
  covered: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  uncovered: z.number().int().nonnegative(),
});

export const SpecTraceabilityReportSchema = z.object({
  specId: z.string().uuid(),
  userStoryId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  records: z.array(SpecTraceabilityRecordSchema).default([]),
  uncoveredRequirements: z.array(SpecRequirementRefSchema).default([]),
  summary: SpecTraceabilitySummarySchema,
});

export type SpecRequirementKind = z.infer<typeof SpecRequirementKindSchema>;
export type SpecTraceabilityEvidenceType = z.infer<
  typeof SpecTraceabilityEvidenceTypeSchema
>;
export type SpecTraceabilityConfidence = z.infer<
  typeof SpecTraceabilityConfidenceSchema
>;
export type SpecRequirementRef = z.infer<typeof SpecRequirementRefSchema>;
export type SpecTraceabilityEvidence = z.infer<
  typeof SpecTraceabilityEvidenceSchema
>;
export type SpecTraceabilityRecord = z.infer<
  typeof SpecTraceabilityRecordSchema
>;
export type SpecTraceabilitySummary = z.infer<
  typeof SpecTraceabilitySummarySchema
>;
export type SpecTraceabilityReport = z.infer<
  typeof SpecTraceabilityReportSchema
>;
