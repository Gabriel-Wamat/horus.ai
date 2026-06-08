import { z } from "zod";
import type {
  AgentName,
  AgentProfileId,
  AgentToolName,
} from "../entities/AgentResult.js";
import {
  AgentNameSchema,
  AgentProfileIdSchema,
  AgentToolNameSchema,
} from "../entities/AgentResult.js";
import type { Spec } from "../entities/Spec.js";
import { SpecSchema } from "../entities/Spec.js";
import type { WorkflowStatus } from "../entities/WorkflowState.js";
import { WorkflowStatusSchema } from "../entities/WorkflowState.js";
import type { RuntimeValidationEvidence } from "../entities/ProjectConstruction.js";
import { RuntimeValidationEvidenceSchema } from "../entities/ProjectConstruction.js";
import type {
  HorusRecoveryAction,
  HorusRecoveryDecision,
} from "../entities/HorusError.js";
import { HorusRecoveryDecisionSchema, HorusRecoveryActionSchema } from "../entities/HorusError.js";
import type { AgentContextReceipt } from "../entities/AgentContextReceipt.js";
import { AgentContextReceiptSchema } from "../entities/AgentContextReceipt.js";

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
    type: z.literal("context_receipt"),
    threadId: z.string().uuid(),
    userStoryId: z.string().uuid().optional(),
    receipt: AgentContextReceiptSchema,
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("tool_call_started"),
    threadId: z.string().uuid(),
    agentName: AgentNameSchema,
    agentProfileId: AgentProfileIdSchema,
    toolName: AgentToolNameSchema,
    traceId: z.string().trim().min(1).optional(),
    spanId: z.string().trim().min(1).optional(),
    parentSpanId: z.string().trim().min(1).nullable().optional(),
    toolCallId: z.string().trim().min(1).nullable().optional(),
    runId: z.string().trim().min(1).nullable().optional(),
    projectId: z.string().trim().min(1).nullable().optional(),
    agentId: z.string().trim().min(1).nullable().optional(),
    filePath: z.string().trim().min(1).nullable().optional(),
    diffId: z.string().trim().min(1).nullable().optional(),
    userStoryId: z.string().uuid().optional(),
    operationalSessionId: z.string().uuid().optional(),
    summary: z.string().trim().min(1).optional(),
    filePaths: z.array(z.string().trim().min(1)).optional(),
    commandIds: z.array(z.string().trim().min(1)).optional(),
    taskId: z.string().trim().min(1).optional(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("tool_call_finished"),
    threadId: z.string().uuid(),
    agentName: AgentNameSchema,
    agentProfileId: AgentProfileIdSchema,
    toolName: AgentToolNameSchema,
    status: z.enum(["succeeded", "failed"]),
    traceId: z.string().trim().min(1).optional(),
    spanId: z.string().trim().min(1).optional(),
    parentSpanId: z.string().trim().min(1).nullable().optional(),
    toolCallId: z.string().trim().min(1).nullable().optional(),
    runId: z.string().trim().min(1).nullable().optional(),
    projectId: z.string().trim().min(1).nullable().optional(),
    agentId: z.string().trim().min(1).nullable().optional(),
    filePath: z.string().trim().min(1).nullable().optional(),
    diffId: z.string().trim().min(1).nullable().optional(),
    userStoryId: z.string().uuid().optional(),
    operationalSessionId: z.string().uuid().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    summary: z.string().trim().min(1).optional(),
    filePaths: z.array(z.string().trim().min(1)).optional(),
    commandIds: z.array(z.string().trim().min(1)).optional(),
    taskId: z.string().trim().min(1).optional(),
    errorMessage: z.string().trim().min(1).optional(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("tool_call_blocked"),
    threadId: z.string().uuid(),
    agentName: AgentNameSchema,
    agentProfileId: AgentProfileIdSchema,
    toolName: AgentToolNameSchema,
    traceId: z.string().trim().min(1).optional(),
    spanId: z.string().trim().min(1).optional(),
    parentSpanId: z.string().trim().min(1).nullable().optional(),
    toolCallId: z.string().trim().min(1).nullable().optional(),
    runId: z.string().trim().min(1).nullable().optional(),
    projectId: z.string().trim().min(1).nullable().optional(),
    agentId: z.string().trim().min(1).nullable().optional(),
    filePath: z.string().trim().min(1).nullable().optional(),
    diffId: z.string().trim().min(1).nullable().optional(),
    userStoryId: z.string().uuid().optional(),
    operationalSessionId: z.string().uuid().optional(),
    summary: z.string().trim().min(1).optional(),
    errorMessage: z.string().trim().min(1),
    filePaths: z.array(z.string().trim().min(1)).optional(),
    commandIds: z.array(z.string().trim().min(1)).optional(),
    taskId: z.string().trim().min(1).optional(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("command_output"),
    threadId: z.string().uuid(),
    agentName: AgentNameSchema,
    agentProfileId: AgentProfileIdSchema,
    toolName: AgentToolNameSchema,
    commandId: z.string().trim().min(1),
    taskId: z.string().trim().min(1).optional(),
    traceId: z.string().trim().min(1).optional(),
    spanId: z.string().trim().min(1).optional(),
    parentSpanId: z.string().trim().min(1).nullable().optional(),
    toolCallId: z.string().trim().min(1).nullable().optional(),
    runId: z.string().trim().min(1).nullable().optional(),
    projectId: z.string().trim().min(1).nullable().optional(),
    agentId: z.string().trim().min(1).nullable().optional(),
    filePath: z.string().trim().min(1).nullable().optional(),
    diffId: z.string().trim().min(1).nullable().optional(),
    stream: z.enum(["stdout", "stderr"]),
    chunk: z.string(),
    chunkSequence: z.number().int().nonnegative(),
    userStoryId: z.string().uuid().optional(),
    operationalSessionId: z.string().uuid().optional(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("command_approval_requested"),
    threadId: z.string().uuid(),
    agentName: AgentNameSchema,
    agentProfileId: AgentProfileIdSchema,
    toolName: AgentToolNameSchema,
    commandId: z.string().trim().min(1),
    taskId: z.string().trim().min(1),
    traceId: z.string().trim().min(1).optional(),
    spanId: z.string().trim().min(1).optional(),
    parentSpanId: z.string().trim().min(1).nullable().optional(),
    toolCallId: z.string().trim().min(1).nullable().optional(),
    runId: z.string().trim().min(1).nullable().optional(),
    projectId: z.string().trim().min(1).nullable().optional(),
    agentId: z.string().trim().min(1).nullable().optional(),
    filePath: z.string().trim().min(1).nullable().optional(),
    diffId: z.string().trim().min(1).nullable().optional(),
    approvalReason: z.string().trim().min(1).nullable().default(null),
    policyReason: z.string().trim().min(1).nullable().default(null),
    risk: z.enum(["low", "medium", "high"]).default("medium"),
    userStoryId: z.string().uuid().optional(),
    operationalSessionId: z.string().uuid().optional(),
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
    type: z.literal("recovery_decision"),
    threadId: z.string().uuid(),
    userStoryId: z.string().uuid(),
    candidateId: z.string().uuid().optional(),
    gateId: z.string().trim().min(1),
    gateType: z.string().trim().min(1),
    evidenceStatus: z.string().trim().min(1),
    decision: HorusRecoveryDecisionSchema,
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal("fallback_executed"),
    threadId: z.string().uuid(),
    userStoryId: z.string().uuid(),
    action: HorusRecoveryActionSchema,
    status: z.enum(["succeeded", "failed", "skipped"]),
    message: z.string().trim().min(1),
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
      type: "context_receipt";
      threadId: string;
      userStoryId?: string;
      receipt: AgentContextReceipt;
      timestamp: string;
    }
  | {
      type: "tool_call_started";
      threadId: string;
      agentName: AgentName;
      agentProfileId: AgentProfileId;
      toolName: AgentToolName;
      traceId?: string;
      spanId?: string;
      parentSpanId?: string | null;
      toolCallId?: string | null;
      runId?: string | null;
      projectId?: string | null;
      agentId?: string | null;
      filePath?: string | null;
      diffId?: string | null;
      userStoryId?: string;
      operationalSessionId?: string;
      summary?: string;
      filePaths?: string[];
      commandIds?: string[];
      taskId?: string;
      timestamp: string;
    }
  | {
      type: "tool_call_finished";
      threadId: string;
      agentName: AgentName;
      agentProfileId: AgentProfileId;
      toolName: AgentToolName;
      status: "succeeded" | "failed";
      traceId?: string;
      spanId?: string;
      parentSpanId?: string | null;
      toolCallId?: string | null;
      runId?: string | null;
      projectId?: string | null;
      agentId?: string | null;
      filePath?: string | null;
      diffId?: string | null;
      userStoryId?: string;
      operationalSessionId?: string;
      durationMs?: number;
      summary?: string;
      filePaths?: string[];
      commandIds?: string[];
      taskId?: string;
      errorMessage?: string;
      timestamp: string;
    }
  | {
      type: "tool_call_blocked";
      threadId: string;
      agentName: AgentName;
      agentProfileId: AgentProfileId;
      toolName: AgentToolName;
      traceId?: string;
      spanId?: string;
      parentSpanId?: string | null;
      toolCallId?: string | null;
      runId?: string | null;
      projectId?: string | null;
      agentId?: string | null;
      filePath?: string | null;
      diffId?: string | null;
      userStoryId?: string;
      operationalSessionId?: string;
      summary?: string;
      errorMessage: string;
      filePaths?: string[];
      commandIds?: string[];
      taskId?: string;
      timestamp: string;
    }
  | {
      type: "command_output";
      threadId: string;
      agentName: AgentName;
      agentProfileId: AgentProfileId;
      toolName: AgentToolName;
      commandId: string;
      taskId?: string;
      traceId?: string;
      spanId?: string;
      parentSpanId?: string | null;
      toolCallId?: string | null;
      runId?: string | null;
      projectId?: string | null;
      agentId?: string | null;
      filePath?: string | null;
      diffId?: string | null;
      stream: "stdout" | "stderr";
      chunk: string;
      chunkSequence: number;
      userStoryId?: string;
      operationalSessionId?: string;
      timestamp: string;
    }
  | {
      type: "command_approval_requested";
      threadId: string;
      agentName: AgentName;
      agentProfileId: AgentProfileId;
      toolName: AgentToolName;
      commandId: string;
      taskId: string;
      traceId?: string;
      spanId?: string;
      parentSpanId?: string | null;
      toolCallId?: string | null;
      runId?: string | null;
      projectId?: string | null;
      agentId?: string | null;
      filePath?: string | null;
      diffId?: string | null;
      approvalReason: string | null;
      policyReason: string | null;
      risk: "low" | "medium" | "high";
      userStoryId?: string;
      operationalSessionId?: string;
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
      type: "recovery_decision";
      threadId: string;
      userStoryId: string;
      candidateId?: string;
      gateId: string;
      gateType: string;
      evidenceStatus: string;
      decision: HorusRecoveryDecision;
      timestamp: string;
    }
  | {
      type: "fallback_executed";
      threadId: string;
      userStoryId: string;
      action: HorusRecoveryAction;
      status: "succeeded" | "failed" | "skipped";
      message: string;
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
