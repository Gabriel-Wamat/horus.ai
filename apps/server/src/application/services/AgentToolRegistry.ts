import type {
  AgentToolCall,
  AgentToolResult,
  AgentProfileId,
  AgentToolName,
} from "@u-build/shared";
import {
  AgentToolCallSchema,
  AgentToolResultSchema,
  AgentProfileIdSchema,
  AgentToolNameSchema,
} from "@u-build/shared";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AgentProfileRegistry,
  AgentToolAccessDeniedError,
  defaultAgentProfileRegistry,
} from "./AgentProfileRegistry.js";

export interface AgentToolExecutionInput<TInput = unknown> {
  readonly agentProfileId: AgentProfileId;
  readonly toolName: AgentToolName;
  readonly input: TInput;
  readonly reason?: string;
}

type AgentToolHandler = (input: unknown) => Promise<unknown>;

export interface AgentToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly toolName: AgentToolName;
  readonly mutatesState: boolean;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly handler: (input: TInput) => Promise<TOutput>;
}

export interface AgentToolAuditSink {
  record(event: AgentToolCall | AgentToolResult): Promise<void> | void;
}

interface RegisteredAgentTool {
  readonly toolName: AgentToolName;
  readonly mutatesState: boolean;
  readonly inputSchema: z.ZodType<unknown>;
  readonly outputSchema: z.ZodType<unknown>;
  readonly handler: AgentToolHandler;
}

const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|password|authorization|private[_-]?key)/iu;
const SECRET_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]+|ghp_[A-Za-z0-9_]+)/gu;

export class AgentToolRegistry {
  private readonly tools = new Map<AgentToolName, RegisteredAgentTool>();

  constructor(
    private readonly profiles: AgentProfileRegistry = defaultAgentProfileRegistry,
    private readonly auditSink?: AgentToolAuditSink
  ) {}

  register<TInput = unknown, TOutput = unknown>(
    definitionOrName: AgentToolDefinition<TInput, TOutput> | AgentToolName,
    legacyHandler?: (input: TInput) => Promise<TOutput>
  ): void {
    if (typeof definitionOrName === "string") {
      if (!legacyHandler) {
        throw new AgentToolRegistrationError(`Missing handler for ${definitionOrName}`);
      }
      this.tools.set(definitionOrName, {
        toolName: AgentToolNameSchema.parse(definitionOrName),
        mutatesState: false,
        inputSchema: passthroughSchema(),
        outputSchema: passthroughSchema(),
        handler: legacyHandler as AgentToolHandler,
      });
      return;
    }

    const toolName = AgentToolNameSchema.parse(definitionOrName.toolName);
    this.tools.set(toolName, {
      toolName,
      mutatesState: definitionOrName.mutatesState,
      inputSchema: definitionOrName.inputSchema as z.ZodType<unknown>,
      outputSchema: definitionOrName.outputSchema as z.ZodType<unknown>,
      handler: definitionOrName.handler as AgentToolHandler,
    });
  }

  async execute<TOutput = unknown>(
    input: AgentToolExecutionInput
  ): Promise<TOutput> {
    const callId = randomUUID();
    const startedAt = new Date();
    const agentProfileId = AgentProfileIdSchema.parse(input.agentProfileId);
    const toolName = AgentToolNameSchema.parse(input.toolName);
    const tool = this.tools.get(toolName);
    const mutatesState = tool?.mutatesState ?? false;

    if (!this.profiles.canUseTool(agentProfileId, toolName)) {
      const error = new AgentToolAccessBlockedError(
        `Tool ${toolName} is not allowed for profile ${agentProfileId}`
      );
      await this.recordToolResult({
        callId,
        agentProfileId,
        toolName,
        mutatesState,
        input: redact(input.input),
        startedAt,
        status: "blocked",
        output: null,
        errorMessage: error.message,
      });
      throw error;
    }

    if (!tool) {
      throw new AgentToolNotRegisteredError(`Tool ${toolName} is not registered`);
    }

    const parsedInput = tool.inputSchema.parse(input.input);
    await this.auditSink?.record(
      AgentToolCallSchema.parse({
        id: callId,
        agentProfileId,
        toolName,
        status: "started",
        mutatesState: tool.mutatesState,
        input: redact(parsedInput),
        reason: input.reason,
        startedAt: startedAt.toISOString(),
        finishedAt: null,
        durationMs: null,
        errorMessage: null,
      })
    );

    try {
      const output = tool.outputSchema.parse(await tool.handler(parsedInput));
      await this.recordToolResult({
        callId,
        agentProfileId,
        toolName,
        mutatesState: tool.mutatesState,
        input: redact(parsedInput),
        startedAt,
        status: "succeeded",
        output: redact(output),
        errorMessage: null,
      });
      return output as TOutput;
    } catch (err) {
      await this.recordToolResult({
        callId,
        agentProfileId,
        toolName,
        mutatesState: tool.mutatesState,
        input: redact(parsedInput),
        startedAt,
        status: "failed",
        output: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async recordToolResult(input: {
    callId: string;
    agentProfileId: AgentProfileId;
    toolName: AgentToolName;
    mutatesState: boolean;
    input: unknown;
    startedAt: Date;
    status: "succeeded" | "failed" | "blocked";
    output: unknown;
    errorMessage: string | null;
  }): Promise<void> {
    const finishedAt = new Date();
    await this.auditSink?.record(
      AgentToolResultSchema.parse({
        callId: input.callId,
        agentProfileId: input.agentProfileId,
        toolName: input.toolName,
        status: input.status,
        mutatesState: input.mutatesState,
        output: input.output,
        errorMessage: input.errorMessage,
        startedAt: input.startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, finishedAt.getTime() - input.startedAt.getTime()),
      })
    );
  }
}

export class AgentToolNotRegisteredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolNotRegisteredError";
  }
}

export class AgentToolRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolRegistrationError";
  }
}

export class AgentToolAccessBlockedError extends AgentToolAccessDeniedError {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolAccessBlockedError";
  }
}

function passthroughSchema(): z.ZodType<unknown> {
  return z.unknown();
}

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(SECRET_VALUE_PATTERN, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(item),
      ])
    );
  }
  return value;
}

export const defaultAgentToolRegistry = new AgentToolRegistry();
