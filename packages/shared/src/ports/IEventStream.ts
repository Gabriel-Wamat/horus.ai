import { z } from "zod";
import type { AgentName } from "../entities/AgentResult.js";
import { AgentNameSchema } from "../entities/AgentResult.js";
import type { Spec } from "../entities/Spec.js";
import { SpecSchema } from "../entities/Spec.js";
import type { WorkflowStatus } from "../entities/WorkflowState.js";
import { WorkflowStatusSchema } from "../entities/WorkflowState.js";
import type { RuntimeValidationEvidence } from "../entities/ProjectConstruction.js";
import { RuntimeValidationEvidenceSchema } from "../entities/ProjectConstruction.js";

export const WorkflowEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("node_started"),
    threadId: z.string().uuid(),
    agentName: AgentNameSchema,
    userStoryId: z.string().uuid(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("node_completed"),
    threadId: z.string().uuid(),
    agentName: AgentNameSchema,
    userStoryId: z.string().uuid(),
    status: z.enum(["success", "error", "skipped"]),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("patch_proposed"),
    threadId: z.string().uuid(),
    userStoryId: z.string().uuid(),
    changeSetId: z.string().uuid(),
    filePaths: z.array(z.string().trim().min(1)),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("patch_applied"),
    threadId: z.string().uuid(),
    userStoryId: z.string().uuid(),
    changeSetId: z.string().uuid(),
    filePaths: z.array(z.string().trim().min(1)),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("validation_evidence"),
    threadId: z.string().uuid(),
    userStoryId: z.string().uuid().optional(),
    evidence: RuntimeValidationEvidenceSchema,
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("awaiting_approval"),
    threadId: z.string().uuid(),
    userStoryId: z.string().uuid(),
    spec: SpecSchema,
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("retry_started"),
    threadId: z.string().uuid(),
    userStoryId: z.string().uuid(),
    retryCount: z.number().int().nonnegative(),
    fixTarget: z.enum(["front", "qa", "both"]),
    score: z.number(),
    notes: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("awaiting_retry_approval"),
    threadId: z.string().uuid(),
    userStoryId: z.string().uuid(),
    retryCount: z.number().int().nonnegative(),
    score: z.number(),
    notes: z.string(),
    missingItems: z.array(z.string()),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("status_changed"),
    threadId: z.string().uuid(),
    status: WorkflowStatusSchema,
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("error"),
    threadId: z.string().uuid(),
    message: z.string(),
    timestamp: z.string().datetime(),
  }),
]);

export type WorkflowEvent =
  | {
      type: "node_started";
      threadId: string;
      agentName: AgentName;
      userStoryId: string;
      timestamp: string;
    }
  | {
      type: "node_completed";
      threadId: string;
      agentName: AgentName;
      userStoryId: string;
      status: "success" | "error" | "skipped";
      timestamp: string;
    }
  | {
      type: "patch_proposed";
      threadId: string;
      userStoryId: string;
      changeSetId: string;
      filePaths: string[];
      timestamp: string;
    }
  | {
      type: "patch_applied";
      threadId: string;
      userStoryId: string;
      changeSetId: string;
      filePaths: string[];
      timestamp: string;
    }
  | {
      type: "validation_evidence";
      threadId: string;
      userStoryId?: string;
      evidence: RuntimeValidationEvidence;
      timestamp: string;
    }
  | {
      type: "awaiting_approval";
      threadId: string;
      userStoryId: string;
      spec: Spec;
      timestamp: string;
    }
  | {
      // Curator failed and is asking for a retry within the loop
      type: "retry_started";
      threadId: string;
      userStoryId: string;
      retryCount: number;
      fixTarget: "front" | "qa" | "both";
      score: number;
      notes: string;
      timestamp: string;
    }
  | {
      // Max retries exceeded — waiting for user to decide (HITL escalation)
      type: "awaiting_retry_approval";
      threadId: string;
      userStoryId: string;
      retryCount: number;
      score: number;
      notes: string;
      missingItems: string[];
      timestamp: string;
    }
  | {
      type: "status_changed";
      threadId: string;
      status: WorkflowStatus;
      timestamp: string;
    }
  | {
      type: "error";
      threadId: string;
      message: string;
      timestamp: string;
    };

export interface IEventStream {
  subscribe(
    threadId: string,
    handler: (event: WorkflowEvent) => void
  ): () => void;

  emit(event: WorkflowEvent): void;

  cleanup(threadId: string): void;
}
