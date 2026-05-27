import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { FrontendProject, PreviewSession } from "@u-build/shared";
import type { NormalizedCliCommandSpec } from "../tools/CliCommandPolicy.js";
import {
  PreviewCommandResolutionError,
  resolvePreviewCommand,
} from "./PreviewCommandResolver.js";
import {
  BrowserPreviewStartError,
  type BrowserPreviewAdapter,
  type BrowserPreviewStartResult,
} from "./NoopBrowserPreviewAdapter.js";

interface ManagedPreviewProcess {
  child: ChildProcess;
  command: NormalizedCliCommandSpec;
  stdoutTail: string;
  stderrTail: string;
  exited: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  startedAt: number;
}

export interface ProcessBrowserPreviewAdapterOptions {
  startupTimeoutMs?: number;
  readinessPollMs?: number;
  outputTailLimit?: number;
  killGraceMs?: number;
  fetchTimeoutMs?: number;
  readinessStabilityMs?: number;
  allowedExecutables?: readonly string[];
  killProcessGroup?: boolean;
  readinessProbe?: (previewUrl: string) => Promise<boolean>;
}

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_READINESS_POLL_MS = 250;
const DEFAULT_OUTPUT_TAIL_LIMIT = 16_384;
const DEFAULT_KILL_GRACE_MS = 500;
const DEFAULT_FETCH_TIMEOUT_MS = 1_000;
const DEFAULT_READINESS_STABILITY_MS = 250;

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

function evidenceForProcess(processInfo: ManagedPreviewProcess): Record<string, unknown> {
  return {
    commandId: processInfo.command.id,
    executable: processInfo.command.executable,
    args: processInfo.command.args,
    cwd: processInfo.command.cwd,
    processId: processInfo.child.pid ?? null,
    stdoutTail: processInfo.stdoutTail,
    stderrTail: processInfo.stderrTail,
    exitCode: processInfo.exitCode,
    signal: processInfo.signal,
    durationMs: nowMs() - processInfo.startedAt,
  };
}

export class ProcessBrowserPreviewAdapter implements BrowserPreviewAdapter {
  private readonly processes = new Map<string, ManagedPreviewProcess>();
  private readonly startupTimeoutMs: number;
  private readonly readinessPollMs: number;
  private readonly outputTailLimit: number;
  private readonly killGraceMs: number;
  private readonly fetchTimeoutMs: number;
  private readonly readinessStabilityMs: number;
  private readonly allowedExecutables: readonly string[] | undefined;
  private readonly killProcessGroupEnabled: boolean;
  private readonly readinessProbe: ((previewUrl: string) => Promise<boolean>) | undefined;

  constructor(options: ProcessBrowserPreviewAdapterOptions = {}) {
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    this.readinessPollMs = options.readinessPollMs ?? DEFAULT_READINESS_POLL_MS;
    this.outputTailLimit = options.outputTailLimit ?? DEFAULT_OUTPUT_TAIL_LIMIT;
    this.killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    this.readinessStabilityMs =
      options.readinessStabilityMs ?? DEFAULT_READINESS_STABILITY_MS;
    this.allowedExecutables = options.allowedExecutables;
    this.killProcessGroupEnabled = options.killProcessGroup ?? true;
    this.readinessProbe = options.readinessProbe;
  }

  async start(
    project: FrontendProject,
    session: PreviewSession
  ): Promise<BrowserPreviewStartResult> {
    const previewUrl = session.previewUrl ?? project.previewUrl;
    if (!previewUrl) {
      throw new BrowserPreviewStartError("Frontend project has no preview URL", {
        projectId: project.id,
        reason: "missing_preview_url",
      });
    }

    const existing = this.processes.get(session.id);
    if (existing && !existing.exited) {
      await this.waitForReadiness(previewUrl, existing);
      return {
        previewUrl,
        processId: existing.child.pid ?? null,
        evidence: evidenceForProcess(existing),
      };
    }

    if (!this.readinessProbe && await this.isReachable(previewUrl)) {
      return {
        previewUrl,
        processId: null,
        evidence: {
          previewUrl,
          reason: "preview_already_reachable",
        },
      };
    }

    const command = await this.resolveCommand(project);
    const managed = this.spawnManagedProcess(session.id, command);
    try {
      await this.waitForReadiness(previewUrl, managed);
    } catch (err) {
      await this.stopManagedProcess(managed);
      this.processes.delete(session.id);
      if (err instanceof BrowserPreviewStartError) throw err;
      throw new BrowserPreviewStartError(
        err instanceof Error ? err.message : String(err),
        evidenceForProcess(managed)
      );
    }

    return {
      previewUrl,
      processId: managed.child.pid ?? null,
      evidence: evidenceForProcess(managed),
    };
  }

  async stop(session: PreviewSession): Promise<void> {
    const managed = this.processes.get(session.id);
    if (!managed) return;
    await this.stopManagedProcess(managed);
    this.processes.delete(session.id);
  }

  async reload(session: PreviewSession): Promise<void> {
    const managed = this.processes.get(session.id);
    if (!managed || managed.exited || !session.previewUrl) return;
    await this.waitForReadiness(session.previewUrl, managed);
  }

  private async resolveCommand(project: FrontendProject): Promise<NormalizedCliCommandSpec> {
    try {
      return await resolvePreviewCommand(project, {
        ...(this.allowedExecutables ? { allowedExecutables: this.allowedExecutables } : {}),
      timeoutMs: this.startupTimeoutMs,
      });
    } catch (err) {
      if (err instanceof PreviewCommandResolutionError) {
        throw new BrowserPreviewStartError(err.message, err.evidence);
      }
      throw err;
    }
  }

  private spawnManagedProcess(
    sessionId: string,
    command: NormalizedCliCommandSpec
  ): ManagedPreviewProcess {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: { ...process.env, ...command.env },
      detached: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const managed: ManagedPreviewProcess = {
      child,
      command,
      stdoutTail: "",
      stderrTail: "",
      exited: false,
      exitCode: null,
      signal: null,
      startedAt: nowMs(),
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      managed.stdoutTail = appendTail(managed.stdoutTail, chunk, this.outputTailLimit);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      managed.stderrTail = appendTail(managed.stderrTail, chunk, this.outputTailLimit);
    });
    child.once("close", (exitCode, signal) => {
      managed.exited = true;
      managed.exitCode = exitCode;
      managed.signal = signal;
      this.processes.delete(sessionId);
    });
    child.once("error", (err) => {
      managed.exited = true;
      managed.stderrTail = appendTail(managed.stderrTail, Buffer.from(err.message), this.outputTailLimit);
      this.processes.delete(sessionId);
    });

    this.processes.set(sessionId, managed);
    return managed;
  }

  private async waitForReadiness(
    previewUrl: string,
    managed: ManagedPreviewProcess
  ): Promise<void> {
    const deadline = nowMs() + this.startupTimeoutMs;
    while (nowMs() < deadline) {
      if (managed.exited) {
        throw new BrowserPreviewStartError("Preview process exited before readiness", {
          ...evidenceForProcess(managed),
          reason: "process_exited_before_ready",
        });
      }

      if (await this.isReachable(previewUrl)) {
        await delay(this.readinessStabilityMs);
        if (managed.exited) {
          throw new BrowserPreviewStartError("Preview process exited after readiness", {
            ...evidenceForProcess(managed),
            previewUrl,
            reason: "process_exited_after_ready",
          });
        }
        return;
      }
      await delay(this.readinessPollMs);
    }

    throw new BrowserPreviewStartError("Preview URL did not become reachable before timeout", {
      ...evidenceForProcess(managed),
      previewUrl,
      reason: "readiness_timeout",
      timeoutMs: this.startupTimeoutMs,
    });
  }

  private async isReachable(previewUrl: string): Promise<boolean> {
    if (this.readinessProbe) {
      return this.readinessProbe(previewUrl);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const response = await fetch(previewUrl, {
        method: "GET",
        signal: controller.signal,
      });
      return response.status >= 200 && response.status < 500;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async stopManagedProcess(managed: ManagedPreviewProcess): Promise<void> {
    if (managed.exited) return;
    const pid = managed.child.pid;
    if (pid) this.sendSignal(pid, managed.child, "SIGTERM");

    const closed = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), this.killGraceMs);
      managed.child.once("close", () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });

    if (!closed && pid) {
      this.sendSignal(pid, managed.child, "SIGKILL");
      await new Promise<void>((resolve) => {
        managed.child.once("close", () => resolve());
        setTimeout(resolve, this.killGraceMs);
      });
    }
  }

  private sendSignal(
    pid: number,
    child: ChildProcess,
    signal: NodeJS.Signals
  ): void {
    if (this.killProcessGroupEnabled) {
      killProcessGroup(pid, signal);
      return;
    }
    child.kill(signal);
  }
}
