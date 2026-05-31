import { z } from "zod";
import {
  AgentNameSchema,
  AgentProfileIdSchema,
} from "./AgentResult.js";
import { OperationalMemorySummarySchema } from "./OperationalMemory.js";
import { SpecTraceabilityReportSchema } from "./SpecTraceability.js";

export const AgentContextSectionKindSchema = z.enum([
  "spec_requirements",
  "code_context",
  "project_structure",
  "design_context",
  "runtime_errors",
  "diff_evidence",
  "test_targets",
  "operational_memory",
  "traceability",
  "status_decision",
  "curator_feedback",
]);

export const AgentContextSectionPrioritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);

export const AgentContextSectionSchema = z.object({
  kind: AgentContextSectionKindSchema,
  title: z.string().trim().min(1),
  priority: AgentContextSectionPrioritySchema,
  items: z.array(z.string().trim().min(1)).default([]),
  diagnostics: z.array(z.string().trim().min(1)).default([]),
});

export const AgentContextEnvelopeSchema = z.object({
  agentName: AgentNameSchema,
  agentProfileId: AgentProfileIdSchema,
  purpose: z.string().trim().min(1),
  includeSections: z.array(AgentContextSectionKindSchema).default([]),
  excludeSections: z.array(AgentContextSectionKindSchema).default([]),
  sections: z.array(AgentContextSectionSchema).default([]),
  operationalMemory: OperationalMemorySummarySchema.optional(),
  traceability: SpecTraceabilityReportSchema.optional(),
  generatedAt: z.string().datetime(),
});

export type AgentContextSectionKind = z.infer<
  typeof AgentContextSectionKindSchema
>;
export type AgentContextSectionPriority = z.infer<
  typeof AgentContextSectionPrioritySchema
>;
export type AgentContextSection = z.infer<typeof AgentContextSectionSchema>;
export type AgentContextEnvelope = z.infer<typeof AgentContextEnvelopeSchema>;
