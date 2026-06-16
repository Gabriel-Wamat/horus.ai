import type {
  AgentProfileId,
  AgentOperationalFileReadEvidence,
  AgentToolCall,
  AgentToolName,
  AgentToolResult,
  ProjectFileVersion,
  ShellCommandResult,
  ShellCommandOutputEvent,
} from "@u-build/shared";
import {
  AgentToolCallSchema,
  AgentToolResultSchema,
  AgentToolNameSchema,
} from "@u-build/shared";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
  AgentToolAccessBlockedError,
  AgentToolRegistry,
  redact,
} from "./AgentToolRegistry.js";

export interface AgentToolRuntimeContext {
  agentProfileId: AgentProfileId;
  projectId?: string | undefined;
  runId?: string | undefined;
  previewSessionId?: string | undefined;
  projectRootOverride?: string | undefined;
  workflowThreadId?: string | undefined;
  userStoryId?: string | undefined;
  signal?: AbortSignal | undefined;
  maxToolCalls?: number | undefined;
  maxWriteFileBytes?: number | undefined;
  readEvidence?: readonly AgentOperationalFileReadEvidence[] | undefined;
  onShellOutput?:
    | ((event: {
        toolName: AgentToolName;
        output: ShellCommandOutputEvent;
      }) => void)
    | undefined;
  onShellCommandComplete?:
    | ((event: {
        toolName: AgentToolName;
        result: ShellCommandResult;
      }) => void)
    | undefined;
}

export interface AgentToolRuntimeExecuteInput<TInput = Record<string, unknown>> {
  toolName: AgentToolName;
  input?: TInput | undefined;
  reason?: string | undefined;
}

export type AgentToolRuntimeEvent = AgentToolCall | AgentToolResult;

interface ReadFileEvidence {
  readonly projectId: string;
  readonly path: string;
  readonly versionHash: string | null;
  readonly version?: ProjectFileVersion | undefined;
}

const DEFAULT_MAX_TOOL_CALLS = 12;
const DEFAULT_MAX_WRITE_FILE_BYTES = 512_000;

export class AgentToolRuntime {
  private toolCallCount = 0;
  private readonly events: AgentToolRuntimeEvent[] = [];
  private readonly readEvidence = new Map<string, ReadFileEvidence>();

  constructor(
    private readonly registry: AgentToolRegistry,
    private readonly context: AgentToolRuntimeContext
  ) {
    this.seedReadEvidence(context.readEvidence ?? []);
  }

  getEvents(): AgentToolRuntimeEvent[] {
    return [...this.events];
  }

  async execute<TOutput = unknown>(
    input: AgentToolRuntimeExecuteInput
  ): Promise<TOutput> {
    this.toolCallCount += 1;
    const maxToolCalls = this.context.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
    if (this.toolCallCount > maxToolCalls) {
      throw new AgentToolRuntimePolicyError(
        `Agent tool call limit exceeded: ${maxToolCalls}`
      );
    }

    const toolName = AgentToolNameSchema.parse(input.toolName);
    const mergedInput = this.mergeContext(input.input);
    const startedAt = new Date();
    const callId = randomUUID();
    this.events.push(
      AgentToolCallSchema.parse({
        id: callId,
        agentProfileId: this.context.agentProfileId,
        toolName,
        status: "started",
        mutatesState: this.registry.isMutatingTool(toolName),
        input: redact(mergedInput),
        reason: input.reason,
        startedAt: startedAt.toISOString(),
      })
    );

    try {
      const toolInput = this.finalizeToolInput(toolName, mergedInput, callId);
      const output = await this.registry.execute<TOutput>({
        agentProfileId: this.context.agentProfileId,
        toolName,
        input: toolInput,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(this.context.signal ? { signal: this.context.signal } : {}),
        ...(this.context.projectRootOverride
          ? { projectRootOverride: this.context.projectRootOverride }
          : {}),
        ...(this.context.onShellOutput
          ? {
              onShellOutput: (output) =>
                this.context.onShellOutput?.({ toolName, output }),
            }
          : {}),
        ...(this.context.onShellCommandComplete
          ? {
              onShellCommandComplete: (result) =>
                this.context.onShellCommandComplete?.({ toolName, result }),
            }
          : {}),
      });
      this.recordReadEvidence(toolName, toolInput, output);
      this.events.push(
        AgentToolResultSchema.parse({
          callId,
          agentProfileId: this.context.agentProfileId,
          toolName,
          status: "succeeded",
          mutatesState: this.registry.isMutatingTool(toolName),
          output: redact(output),
          errorMessage: null,
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: Math.max(0, Date.now() - startedAt.getTime()),
        })
      );
      return output;
    } catch (err) {
      const status = isBlockedToolRuntimeError(err) ? "blocked" : "failed";
      this.events.push(
        AgentToolResultSchema.parse({
          callId,
          agentProfileId: this.context.agentProfileId,
          toolName,
          status,
          mutatesState: this.registry.isMutatingTool(toolName),
          output: null,
          errorMessage: err instanceof Error ? err.message : String(err),
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: Math.max(0, Date.now() - startedAt.getTime()),
        })
      );
      throw err;
    }
  }

  private mergeContext(input: unknown): Record<string, unknown> {
    const payload =
      input && typeof input === "object"
        ? { ...(input as Record<string, unknown>) }
        : {};
    if (this.context.projectId && payload["projectId"] === undefined) {
      payload["projectId"] = this.context.projectId;
    }
    if (this.context.runId && payload["runId"] === undefined) {
      payload["runId"] = this.context.runId;
    }
    if (
      this.context.previewSessionId &&
      payload["previewSessionId"] === undefined
    ) {
      payload["previewSessionId"] = this.context.previewSessionId;
    }
    if (
      this.context.workflowThreadId &&
      payload["workflowThreadId"] === undefined
    ) {
      payload["workflowThreadId"] = this.context.workflowThreadId;
    }
    if (this.context.userStoryId && payload["userStoryId"] === undefined) {
      payload["userStoryId"] = this.context.userStoryId;
    }

    return payload;
  }

  private finalizeToolInput(
    toolName: AgentToolName,
    payload: Record<string, unknown>,
    callId: string
  ): Record<string, unknown> {
    if (!this.registry.canUseTool(this.context.agentProfileId, toolName)) {
      return payload;
    }

    if (this.registry.isMutatingTool(toolName) && !payload["projectId"]) {
      throw new AgentToolRuntimePolicyError(
        `Tool ${toolName} requires a selected project context.`
      );
    }

    if (
      (toolName === "save_file" || toolName === "write_file") &&
      typeof payload["content"] === "string"
    ) {
      this.assertWriteSize(toolName, payload["content"]);
    }
    if (toolName === "save_file") {
      this.assertReadEvidenceForMutation("save_file", payload);
    }
    if (toolName === "write_file" && payload["overwrite"] === true) {
      this.assertReadEvidenceForMutation("write_file", payload);
    }

    if (toolName === "edit_file") {
      this.assertIncrementalEditInput(payload);
    }
    if (toolName === "rewrite_file") {
      this.assertRewriteFileInput(payload);
    }
    if (toolName === "replace_file_range") {
      this.assertLineRangeEditInput(payload);
    }
    if (toolName === "delete_file") {
      this.assertReadEvidenceForMutation("delete_file", payload);
    }

    if (toolName === "run_command" || toolName === "run_validation_command") {
      return this.attachTraceContext(payload, callId);
    }

    return payload;
  }

  private attachTraceContext(
    payload: Record<string, unknown>,
    callId: string
  ): Record<string, unknown> {
    const traceId =
      typeof payload["traceId"] === "string"
        ? payload["traceId"]
        : this.context.workflowThreadId ??
          this.context.runId ??
          this.context.projectId ??
          callId;
    return {
      ...payload,
      traceId,
      spanId: typeof payload["spanId"] === "string" ? payload["spanId"] : callId,
      parentSpanId:
        typeof payload["parentSpanId"] === "string"
          ? payload["parentSpanId"]
          : null,
      toolCallId:
        typeof payload["toolCallId"] === "string" ? payload["toolCallId"] : callId,
      runId:
        typeof payload["runId"] === "string"
          ? payload["runId"]
          : this.context.runId ?? this.context.workflowThreadId ?? null,
      projectId:
        typeof payload["projectId"] === "string"
          ? payload["projectId"]
          : this.context.projectId ?? null,
      agentId: this.context.agentProfileId,
    };
  }

  private assertWriteSize(toolName: AgentToolName, content: string): void {
    const maxWriteFileBytes =
      this.context.maxWriteFileBytes ?? DEFAULT_MAX_WRITE_FILE_BYTES;
    if (Buffer.byteLength(content, "utf8") > maxWriteFileBytes) {
      throw new AgentToolRuntimePolicyError(
        `Tool ${toolName} content exceeds maxWriteFileBytes=${maxWriteFileBytes}.`
      );
    }
  }

  private assertIncrementalEditInput(payload: Record<string, unknown>): void {
    if (typeof payload["newString"] === "string") {
      this.assertWriteSize("edit_file", payload["newString"]);
    }

    const projectId =
      typeof payload["projectId"] === "string" ? payload["projectId"] : "";
    const path = typeof payload["path"] === "string" ? payload["path"] : "";
    const evidence = this.readEvidence.get(readEvidenceKey(projectId, path));
    if (!evidence) {
      throw new AgentToolRuntimePolicyError(
        `Tool edit_file requires read_file evidence for ${path || "<missing path>"}.`
      );
    }

    const expectedHash =
      typeof payload["expectedContentHash"] === "string"
        ? payload["expectedContentHash"]
        : getBaseVersion(payload)?.hash;
    if (
      expectedHash &&
      evidence.versionHash &&
      evidence.versionHash !== expectedHash
    ) {
      throw new AgentToolRuntimePolicyError(
        `Tool edit_file stale_file for ${path}: expected ${expectedHash}, read ${evidence.versionHash}.`
      );
    }

    if (payload["expectedContentHash"] === undefined && evidence.versionHash) {
      payload["expectedContentHash"] = evidence.versionHash;
    }
    if (payload["baseVersion"] === undefined && evidence.version) {
      payload["baseVersion"] = evidence.version;
    }
  }

  private assertLineRangeEditInput(payload: Record<string, unknown>): void {
    if (typeof payload["replacement"] === "string") {
      this.assertWriteSize("replace_file_range", payload["replacement"]);
    }
    this.assertReadEvidenceForMutation("replace_file_range", payload);
  }

  private assertRewriteFileInput(payload: Record<string, unknown>): void {
    if (typeof payload["content"] === "string") {
      this.assertWriteSize("rewrite_file", payload["content"]);
    }
    this.assertReadEvidenceForMutation("rewrite_file", payload);
  }

  private assertReadEvidenceForMutation(
    toolName: AgentToolName,
    payload: Record<string, unknown>
  ): void {
    const projectId =
      typeof payload["projectId"] === "string" ? payload["projectId"] : "";
    const path = typeof payload["path"] === "string" ? payload["path"] : "";
    const evidence = this.readEvidence.get(readEvidenceKey(projectId, path));
    if (!evidence) {
      throw new AgentToolRuntimePolicyError(
        `Tool ${toolName} requires read_file evidence for ${path || "<missing path>"}.`
      );
    }

    const expectedHash =
      typeof payload["expectedContentHash"] === "string"
        ? payload["expectedContentHash"]
        : getBaseVersion(payload)?.hash;
    if (
      expectedHash &&
      evidence.versionHash &&
      evidence.versionHash !== expectedHash
    ) {
      throw new AgentToolRuntimePolicyError(
        `Tool ${toolName} stale_file for ${path}: expected ${expectedHash}, read ${evidence.versionHash}.`
      );
    }

    if (payload["expectedContentHash"] === undefined && evidence.versionHash) {
      payload["expectedContentHash"] = evidence.versionHash;
    }
    if (payload["baseVersion"] === undefined && evidence.version) {
      payload["baseVersion"] = evidence.version;
    }
  }

  private recordReadEvidence(
    toolName: AgentToolName,
    input: Record<string, unknown>,
    output: unknown
  ): void {
    if (toolName !== "read_file") return;
    if (!output || typeof output !== "object") return;
    const record = output as Record<string, unknown>;
    const projectId =
      typeof input["projectId"] === "string" ? input["projectId"] : "";
    const path =
      typeof record["path"] === "string"
        ? record["path"]
        : typeof input["path"] === "string"
          ? input["path"]
          : "";
    if (!projectId || !path) return;
    const version = getProjectFileVersion(record["version"]);
    const versionHash =
      typeof record["versionHash"] === "string"
        ? record["versionHash"]
        : version?.hash ?? null;
    this.readEvidence.set(readEvidenceKey(projectId, path), {
      projectId,
      path: normalizeToolPath(path),
      versionHash,
      ...(version ? { version } : {}),
    });
  }

  private seedReadEvidence(
    readEvidence: readonly AgentOperationalFileReadEvidence[]
  ): void {
    const projectId = this.context.projectId;
    if (!projectId) return;
    for (const evidence of readEvidence) {
      this.readEvidence.set(readEvidenceKey(projectId, evidence.path), {
        projectId,
        path: normalizeToolPath(evidence.path),
        versionHash: evidence.versionHash,
        ...(evidence.baseVersion ? { version: evidence.baseVersion } : {}),
      });
    }
  }
}

export class AgentToolRuntimePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolRuntimePolicyError";
  }
}

function isBlockedToolRuntimeError(err: unknown): boolean {
  return (
    err instanceof AgentToolRuntimePolicyError ||
    err instanceof AgentToolAccessBlockedError
  );
}

function readEvidenceKey(projectId: string, path: string): string {
  return `${projectId}:${normalizeToolPath(path)}`;
}

function normalizeToolPath(path: string): string {
  return path.trim().split("\\").join("/");
}

function getProjectFileVersion(value: unknown): ProjectFileVersion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record["hash"] !== "string" ||
    typeof record["sizeBytes"] !== "number" ||
    typeof record["mtimeMs"] !== "number"
  ) {
    return undefined;
  }
  return {
    hash: record["hash"],
    sizeBytes: record["sizeBytes"],
    mtimeMs: record["mtimeMs"],
  };
}

function getBaseVersion(
  payload: Record<string, unknown>
): ProjectFileVersion | undefined {
  return getProjectFileVersion(payload["baseVersion"]);
}
