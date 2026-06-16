import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  HorusProjectManifestSchema,
  type FrontendProject,
  type PreviewSession,
} from "@u-build/shared";
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
import {
  buildAllowlistedChildEnv,
  DEFAULT_INHERITED_CHILD_ENV_KEYS,
} from "../process/ChildProcessEnv.js";

interface ManagedPreviewProcess {
  child: ChildProcess;
  command: NormalizedCliCommandSpec;
  project: FrontendProject;
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
  inheritedEnvKeys?: readonly string[];
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
  private readonly inheritedEnvKeys: readonly string[];
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
    this.inheritedEnvKeys =
      options.inheritedEnvKeys ?? DEFAULT_INHERITED_CHILD_ENV_KEYS;
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
      await this.waitForReadiness(previewUrl, existing, project);
      return {
        previewUrl,
        processId: existing.child.pid ?? null,
        evidence: evidenceForProcess(existing),
      };
    }

    if (!this.readinessProbe) {
      await this.assertPreviewUrlIsNotWrongOwner(previewUrl, project);
      if (await this.isReadyForProject(previewUrl, project)) {
        return {
          previewUrl,
          processId: null,
          evidence: {
            previewUrl,
            reason: "preview_already_reachable",
          },
        };
      }
    }

    const command = await this.resolveCommand(project);
    const managed = this.spawnManagedProcess(session.id, command, project);
    try {
      await this.waitForReadiness(previewUrl, managed, project);
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
    await this.waitForReadiness(session.previewUrl, managed, managed.project);
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
    command: NormalizedCliCommandSpec,
    project: FrontendProject
  ): ManagedPreviewProcess {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: buildAllowlistedChildEnv(command.env, this.inheritedEnvKeys),
      detached: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const managed: ManagedPreviewProcess = {
      child,
      command,
      project,
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
    managed: ManagedPreviewProcess,
    project: FrontendProject
  ): Promise<void> {
    const deadline = nowMs() + this.startupTimeoutMs;
    while (nowMs() < deadline) {
      if (managed.exited) {
        throw new BrowserPreviewStartError("Preview process exited before readiness", {
          ...evidenceForProcess(managed),
          reason: "process_exited_before_ready",
        });
      }

      if (await this.isReadyForProject(previewUrl, project)) {
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
      if (!this.readinessProbe) {
        await this.assertPreviewUrlIsNotWrongOwner(previewUrl, project, {
          ignoreMissingRemoteManifest: true,
        });
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
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async isReadyForProject(
    previewUrl: string,
    project: FrontendProject
  ): Promise<boolean> {
    if (this.readinessProbe) {
      return this.readinessProbe(previewUrl);
    }

    const expectedProjectId = await this.readProjectManifestId(project.rootPath);
    if (!expectedProjectId) {
      return this.isReachable(previewUrl);
    }

    const remoteProjectId = await this.readRemoteProjectManifestId(previewUrl);
    return remoteProjectId === expectedProjectId;
  }

  private async assertPreviewUrlIsNotWrongOwner(
    previewUrl: string,
    project: FrontendProject,
    options: { ignoreMissingRemoteManifest?: boolean } = {}
  ): Promise<void> {
    const expectedProjectId = await this.readProjectManifestId(project.rootPath);
    if (!expectedProjectId) return;

    const remoteProjectId = await this.readRemoteProjectManifestId(previewUrl);
    if (remoteProjectId && remoteProjectId !== expectedProjectId) {
      throw new BrowserPreviewStartError(
        `Preview URL is serving project ${remoteProjectId}, not selected project ${expectedProjectId}`,
        {
          projectId: project.id,
          projectName: project.name,
          previewUrl,
          expectedProjectId,
          remoteProjectId,
          reason: "wrong_owner_port",
        }
      );
    }

    if (!remoteProjectId && !options.ignoreMissingRemoteManifest && await this.isReachable(previewUrl)) {
      throw new BrowserPreviewStartError(
        "Preview URL is reachable but does not expose the selected project manifest",
        {
          projectId: project.id,
          projectName: project.name,
          previewUrl,
          expectedProjectId,
          reason: "wrong_owner_port",
        }
      );
    }
  }

  private async readProjectManifestId(rootPath: string): Promise<string | null> {
    try {
      const raw = await fs.readFile(join(rootPath, "horus.project.json"), "utf-8");
      return parseProjectManifestId(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  private async readRemoteProjectManifestId(previewUrl: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const manifestUrl = new URL("/horus.project.json", previewUrl);
      manifestUrl.searchParams.set("_horusPreviewCheck", String(Date.now()));
      const response = await fetch(manifestUrl, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      return parseProjectManifestId(await response.json());
    } catch {
      return null;
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

function parseProjectManifestId(payload: unknown): string | null {
  const parsed = HorusProjectManifestSchema.safeParse(payload);
  return parsed.success ? parsed.data.projectId : null;
}
