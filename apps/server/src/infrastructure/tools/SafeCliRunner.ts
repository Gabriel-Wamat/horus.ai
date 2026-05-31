import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  CliCommandPolicy,
  type CliCommandSpec,
  type NormalizedCliCommandSpec,
} from "./CliCommandPolicy.js";
import {
  buildAllowlistedChildEnv,
  DEFAULT_INHERITED_CHILD_ENV_KEYS,
} from "../process/ChildProcessEnv.js";

export type CliExecutionStatus =
  | "completed"
  | "failed"
  | "timed_out"
  | "aborted"
  | "rejected";

export interface CliExecutionResult {
  commandId: string;
  executable: string;
  args: string[];
  cwd: string;
  approvalRequired: boolean;
  risk: "low" | "medium" | "high";
  policyReason: string | null;
  approved: boolean;
  approvedBy: string | null;
  approvalReason: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  spawned: boolean;
  processId: number | null;
  status: CliExecutionStatus;
  errorMessage: string | null;
}

export interface CliOutputChunk {
  stream: "stdout" | "stderr";
  chunk: string;
}

export interface SafeCliRunnerOptions {
  policy?: CliCommandPolicy;
  outputTailLimit?: number;
  killGraceMs?: number;
  inheritedEnvKeys?: readonly string[];
}

const DEFAULT_OUTPUT_TAIL_LIMIT = 16_384;
const DEFAULT_OUTPUT_CHUNK_LIMIT = 4_096;
const DEFAULT_KILL_GRACE_MS = 500;
function appendTail(current: string, chunk: Buffer, limit: number): string {
  const next = current + chunk.toString("utf-8");
  return next.length <= limit ? next : next.slice(next.length - limit);
}

function nowMs(): number {
  return Date.now();
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process may already have exited.
    }
  }
}

export class SafeCliRunner {
  private readonly policy: CliCommandPolicy;
  private readonly outputTailLimit: number;
  private readonly killGraceMs: number;
  private readonly inheritedEnvKeys: readonly string[];

  constructor(options: SafeCliRunnerOptions = {}) {
    this.policy = options.policy ?? new CliCommandPolicy();
    this.outputTailLimit = options.outputTailLimit ?? DEFAULT_OUTPUT_TAIL_LIMIT;
    this.killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    this.inheritedEnvKeys = options.inheritedEnvKeys ?? DEFAULT_INHERITED_CHILD_ENV_KEYS;
  }

  async execute(spec: CliCommandSpec): Promise<CliExecutionResult> {
    return this.executeWithOptions(spec);
  }

  async executeWithOptions(
    spec: CliCommandSpec,
    options: {
      signal?: AbortSignal | undefined;
      onOutput?: ((event: CliOutputChunk) => void) | undefined;
    } = {}
  ): Promise<CliExecutionResult> {
    const start = nowMs();
    if (options.signal?.aborted) {
      return this.rejectedResult(spec, "command aborted before spawn", nowMs() - start);
    }
    const decision = await this.policy.evaluate(spec);
    if (!decision.allowed || !decision.normalized) {
      return this.rejectedResult(
        spec,
        decision.reason ?? "command rejected",
        nowMs() - start,
        {
          approvalRequired: decision.approvalRequired,
          risk: decision.risk,
        }
      );
    }

    return this.spawnAndCollect(
      decision.normalized,
      start,
      options.signal,
      options.onOutput
    );
  }

  private async spawnAndCollect(
    spec: NormalizedCliCommandSpec,
    start: number,
    abortSignal?: AbortSignal,
    onOutput?: ((event: CliOutputChunk) => void) | undefined
  ): Promise<CliExecutionResult> {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(spec.executable, spec.args, {
        cwd: spec.cwd,
        env: this.buildChildEnv(spec.env),
        detached: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      return this.failedSpawnResult(spec, err, nowMs() - start);
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendTail(stdout, chunk, this.outputTailLimit);
      emitOutputChunk(onOutput, "stdout", chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendTail(stderr, chunk, this.outputTailLimit);
      emitOutputChunk(onOutput, "stderr", chunk);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      if (child.pid) killProcessGroup(child.pid, "SIGTERM");
      void delay(this.killGraceMs).then(() => {
        if (!settled && child.pid) killProcessGroup(child.pid, "SIGKILL");
      });
    }, spec.timeoutMs);

    const abort = () => {
      aborted = true;
      if (child.pid) killProcessGroup(child.pid, "SIGTERM");
      void delay(this.killGraceMs).then(() => {
        if (!settled && child.pid) killProcessGroup(child.pid, "SIGKILL");
      });
    };
    abortSignal?.addEventListener("abort", abort, { once: true });
    if (abortSignal?.aborted) abort();

    return new Promise<CliExecutionResult>((resolve) => {
      child.once("error", (err) => {
        clearTimeout(timeout);
        abortSignal?.removeEventListener("abort", abort);
        settled = true;
        resolve({
          commandId: spec.id,
          executable: spec.executable,
          args: spec.args,
          cwd: spec.cwd,
          approvalRequired: spec.approvalRequired,
          risk: spec.risk,
          policyReason: null,
          approved: spec.approved,
          approvedBy: spec.approvedBy,
          approvalReason: spec.approvalReason,
          stdout,
          stderr,
          exitCode: null,
          signal: null,
          durationMs: nowMs() - start,
          timedOut,
          spawned: Boolean(child.pid),
          processId: child.pid ?? null,
          status: "failed",
          errorMessage: err.message,
        });
      });

      child.once("close", (exitCode, signal) => {
        clearTimeout(timeout);
        abortSignal?.removeEventListener("abort", abort);
        settled = true;
        const status: CliExecutionStatus = timedOut
          ? "timed_out"
          : aborted
            ? "aborted"
            : exitCode === 0
              ? "completed"
              : "failed";
        resolve({
          commandId: spec.id,
          executable: spec.executable,
          args: spec.args,
          cwd: spec.cwd,
          approvalRequired: spec.approvalRequired,
          risk: spec.risk,
          policyReason: null,
          approved: spec.approved,
          approvedBy: spec.approvedBy,
          approvalReason: spec.approvalReason,
          stdout,
          stderr,
          exitCode,
          signal,
          durationMs: nowMs() - start,
          timedOut,
          spawned: true,
          processId: child.pid ?? null,
          status,
          errorMessage: status === "completed" ? null : this.buildFailureMessage(status, exitCode, signal),
        });
      });
    });
  }

  private buildChildEnv(explicitEnv: Record<string, string>): Record<string, string> {
    return buildAllowlistedChildEnv(explicitEnv, this.inheritedEnvKeys);
  }

  private rejectedResult(
    spec: CliCommandSpec,
    reason: string,
    durationMs: number,
    policy: {
      approvalRequired?: boolean;
      risk?: "low" | "medium" | "high";
    } = {}
  ): CliExecutionResult {
    return {
      commandId: spec.id,
      executable: spec.executable ?? "/bin/bash",
      args: [...(spec.args ?? [])],
      cwd: spec.cwd,
      approvalRequired: policy.approvalRequired ?? false,
      risk: policy.risk ?? "high",
      policyReason: reason,
      approved: spec.approved === true,
      approvedBy: spec.approvedBy ?? null,
      approvalReason: spec.approvalReason ?? null,
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      durationMs,
      timedOut: false,
      spawned: false,
      processId: null,
      status: "rejected",
      errorMessage: reason,
    };
  }

  private failedSpawnResult(
    spec: NormalizedCliCommandSpec,
    err: unknown,
    durationMs: number
  ): CliExecutionResult {
    return {
      commandId: spec.id,
      executable: spec.executable,
      args: spec.args,
      cwd: spec.cwd,
      approvalRequired: spec.approvalRequired,
      risk: spec.risk,
      policyReason: null,
      approved: spec.approved,
      approvedBy: spec.approvedBy,
      approvalReason: spec.approvalReason,
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      durationMs,
      timedOut: false,
      spawned: false,
      processId: null,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  private buildFailureMessage(
    status: CliExecutionStatus,
    exitCode: number | null,
    signal: NodeJS.Signals | null
  ): string {
    if (status === "timed_out") return "command timed out";
    if (status === "aborted") return "command aborted";
    return `command failed with exit code ${exitCode ?? "null"}${signal ? ` and signal ${signal}` : ""}`;
  }
}

function emitOutputChunk(
  onOutput: ((event: CliOutputChunk) => void) | undefined,
  stream: "stdout" | "stderr",
  chunk: Buffer
): void {
  if (!onOutput) return;
  const text = chunk.toString("utf-8");
  onOutput({
    stream,
    chunk:
      text.length <= DEFAULT_OUTPUT_CHUNK_LIMIT
        ? text
        : text.slice(text.length - DEFAULT_OUTPUT_CHUNK_LIMIT),
  });
}
