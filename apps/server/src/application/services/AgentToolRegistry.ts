import type {
  AgentToolCall,
  AgentToolResult,
  AgentProfileId,
  AgentToolName,
  ShellCommandResult,
  ShellCommandOutputEvent,
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
  readonly signal?: AbortSignal;
  readonly projectRootOverride?: string | undefined;
  readonly onShellOutput?:
    | ((event: ShellCommandOutputEvent) => void)
    | undefined;
  readonly onShellCommandComplete?:
    | ((event: ShellCommandResult) => void)
    | undefined;
}

export interface AgentToolExecutionContext {
  readonly signal?: AbortSignal;
  readonly projectRootOverride?: string | undefined;
  readonly onShellOutput?:
    | ((event: ShellCommandOutputEvent) => void)
    | undefined;
  readonly onShellCommandComplete?:
    | ((event: ShellCommandResult) => void)
    | undefined;
}

type AgentToolHandler = (
  input: unknown,
  context: AgentToolExecutionContext
) => Promise<unknown>;

export interface AgentToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly toolName: AgentToolName;
  readonly mutatesState: boolean;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly handler: (
    input: TInput,
    context: AgentToolExecutionContext
  ) => Promise<TOutput>;
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
      const toolName = AgentToolNameSchema.parse(definitionOrName);
      this.profiles.assertToolRegistration(toolName, false);
      this.tools.set(definitionOrName, {
        toolName,
        mutatesState: false,
        inputSchema: passthroughSchema(),
        outputSchema: passthroughSchema(),
        handler: legacyHandler as AgentToolHandler,
      });
      return;
    }

    const toolName = AgentToolNameSchema.parse(definitionOrName.toolName);
    this.profiles.assertToolRegistration(toolName, definitionOrName.mutatesState);
    this.tools.set(toolName, {
      toolName,
      mutatesState: definitionOrName.mutatesState,
      inputSchema: definitionOrName.inputSchema as z.ZodType<unknown>,
      outputSchema: definitionOrName.outputSchema as z.ZodType<unknown>,
      handler: definitionOrName.handler as AgentToolHandler,
    });
  }

  listRegisteredTools(): AgentToolName[] {
    return [...this.tools.keys()].sort();
  }

  hasTool(toolName: AgentToolName): boolean {
    return this.tools.has(AgentToolNameSchema.parse(toolName));
  }

  canUseTool(agentProfileId: AgentProfileId, toolName: AgentToolName): boolean {
    return this.profiles.canUseTool(agentProfileId, toolName);
  }

  isMutatingTool(toolName: AgentToolName): boolean {
    const parsedToolName = AgentToolNameSchema.parse(toolName);
    return this.tools.get(parsedToolName)?.mutatesState ??
      this.profiles.isToolMutating(parsedToolName);
  }

  async execute<TOutput = unknown>(
    input: AgentToolExecutionInput
  ): Promise<TOutput> {
    const callId = randomUUID();
    const startedAt = new Date();
    const agentProfileId = AgentProfileIdSchema.parse(input.agentProfileId);
    const toolName = AgentToolNameSchema.parse(input.toolName);
    const tool = this.tools.get(toolName);
    const mutatesState = tool?.mutatesState ?? this.profiles.isToolMutating(toolName);

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

    assertToolNotAborted(input.signal, toolName);
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
      const output = tool.outputSchema.parse(
        await tool.handler(
          parsedInput,
          {
            ...(input.signal ? { signal: input.signal } : {}),
            ...(input.projectRootOverride
              ? { projectRootOverride: input.projectRootOverride }
              : {}),
            ...(input.onShellOutput
              ? { onShellOutput: input.onShellOutput }
              : {}),
            ...(input.onShellCommandComplete
              ? { onShellCommandComplete: input.onShellCommandComplete }
              : {}),
          }
        )
      );
      assertToolNotAborted(input.signal, toolName);
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

export class AgentToolAbortedError extends Error {
  constructor(toolName: AgentToolName) {
    super(`Tool ${toolName} aborted by agent runtime signal.`);
    this.name = "AgentToolAbortedError";
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

function assertToolNotAborted(
  signal: AbortSignal | undefined,
  toolName: AgentToolName
): void {
  if (signal?.aborted) {
    throw new AgentToolAbortedError(toolName);
  }
}

export const defaultAgentToolRegistry = new AgentToolRegistry();
