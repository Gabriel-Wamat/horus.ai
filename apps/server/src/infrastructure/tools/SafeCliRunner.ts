import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  CliCommandPolicy,
  type CliCommandSpec,
  type NormalizedCliCommandSpec,
} from "./CliCommandPolicy.js";

export type CliExecutionStatus = "completed" | "failed" | "timed_out" | "rejected";

export interface CliExecutionResult {
  commandId: string;
  executable: string;
  args: string[];
  cwd: string;
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

export interface SafeCliRunnerOptions {
  policy?: CliCommandPolicy;
  outputTailLimit?: number;
  killGraceMs?: number;
}

const DEFAULT_OUTPUT_TAIL_LIMIT = 16_384;
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

  constructor(options: SafeCliRunnerOptions = {}) {
    this.policy = options.policy ?? new CliCommandPolicy();
    this.outputTailLimit = options.outputTailLimit ?? DEFAULT_OUTPUT_TAIL_LIMIT;
    this.killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  }

  async execute(spec: CliCommandSpec): Promise<CliExecutionResult> {
    const start = nowMs();
    const decision = await this.policy.evaluate(spec);
    if (!decision.allowed || !decision.normalized) {
      return this.rejectedResult(spec, decision.reason ?? "command rejected", nowMs() - start);
    }

    return this.spawnAndCollect(decision.normalized, start);
  }

  private async spawnAndCollect(
    spec: NormalizedCliCommandSpec,
    start: number
  ): Promise<CliExecutionResult> {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(spec.executable, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
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
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendTail(stdout, chunk, this.outputTailLimit);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendTail(stderr, chunk, this.outputTailLimit);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      if (child.pid) killProcessGroup(child.pid, "SIGTERM");
      void delay(this.killGraceMs).then(() => {
        if (!settled && child.pid) killProcessGroup(child.pid, "SIGKILL");
      });
    }, spec.timeoutMs);

    return new Promise<CliExecutionResult>((resolve) => {
      child.once("error", (err) => {
        clearTimeout(timeout);
        settled = true;
        resolve({
          commandId: spec.id,
          executable: spec.executable,
          args: spec.args,
          cwd: spec.cwd,
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
        settled = true;
        const status: CliExecutionStatus = timedOut
          ? "timed_out"
          : exitCode === 0
            ? "completed"
            : "failed";
        resolve({
          commandId: spec.id,
          executable: spec.executable,
          args: spec.args,
          cwd: spec.cwd,
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

  private rejectedResult(
    spec: CliCommandSpec,
    reason: string,
    durationMs: number
  ): CliExecutionResult {
    return {
      commandId: spec.id,
      executable: spec.executable,
      args: spec.args ?? [],
      cwd: spec.cwd,
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
    return `command failed with exit code ${exitCode ?? "null"}${signal ? ` and signal ${signal}` : ""}`;
  }
}
