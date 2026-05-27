import { v4 as uuidv4 } from "uuid";
import {
  CreatePreviewSessionInputSchema,
  CreateVisualInstructionDraftInputSchema,
  SetPreviewDeviceInputSchema,
  type CreatePreviewSessionInput,
  type CreateVisualInstructionDraftInput,
  type FrontendProject,
  type IPreviewEventStream,
  type PreviewDevice,
  type PreviewDeviceName,
  type PreviewEvent,
  type PreviewEventType,
  type PreviewSession,
  type PreviewStatus,
  type SetPreviewDeviceInput,
  type VisualInstructionDraft,
} from "@u-build/shared";
import {
  BrowserPreviewStartError,
  type BrowserPreviewAdapter,
} from "./NoopBrowserPreviewAdapter.js";
import { buildPreviewRuntimeEvidence } from "./PreviewRuntimeEvidence.js";
import type {
  FrontendProjectRepository,
  PreviewSessionRepository,
} from "../repositories/contracts.js";

export interface PreviewActionResult {
  session: PreviewSession;
  event: PreviewEvent;
}

export interface VisualInstructionDraftResult {
  draft: VisualInstructionDraft;
  event: PreviewEvent;
}

const DEVICE_PRESETS: Record<PreviewDeviceName, PreviewDevice> = {
  pc: { name: "pc", width: 1440, height: 900 },
  phone: { name: "phone", width: 390, height: 844 },
  tablet: { name: "tablet", width: 834, height: 1112 },
};

const STALE_PROCESS_STATUSES = new Set<PreviewStatus>([
  "starting",
  "running",
  "inspecting",
  "applying",
]);

function buildPreviewUrl(project: FrontendProject, route: string): string | null {
  if (!project.previewUrl) return null;
  const url = new URL(project.previewUrl);
  url.pathname = route;
  return url.toString().replace(/\/$/, route === "/" ? "/" : "");
}

export class PreviewRuntimeManager {
  constructor(
    private readonly registry: FrontendProjectRepository,
    private readonly store: PreviewSessionRepository,
    private readonly adapter: BrowserPreviewAdapter,
    private readonly eventStream: IPreviewEventStream
  ) {}

  async listProjects(): Promise<FrontendProject[]> {
    return this.registry.listProjects();
  }

  async getSession(sessionId: string): Promise<PreviewSession> {
    return this.store.getSession(sessionId);
  }

  async listTimeline(sessionId: string): Promise<PreviewEvent[]> {
    return this.store.listEvents(sessionId);
  }

  async recoverStaleRuntimeSessions(): Promise<PreviewSession[]> {
    const sessions = await this.store.listSessions();
    const recovered: PreviewSession[] = [];
    for (const session of sessions) {
      if (!STALE_PROCESS_STATUSES.has(session.status) && session.processId === null) {
        continue;
      }
      if (!STALE_PROCESS_STATUSES.has(session.status) && session.processId !== null) {
        const cleared = await this.store.saveSession({
          ...session,
          processId: null,
          updatedAt: new Date().toISOString(),
        });
        recovered.push(cleared);
        continue;
      }

      const updated = await this.store.saveSession({
        ...session,
        status: "stopped",
        processId: null,
        stoppedAt: session.stoppedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        errorMessage:
          "Preview session was stopped because the server restarted and no longer owns the previous process.",
      });
      await this.recordEvent(
        updated,
        "preview_recovered_after_restart",
        "Preview session recovered after server restart",
        {
          previousStatus: session.status,
          previousProcessId: session.processId,
          nextStatus: updated.status,
        }
      );
      recovered.push(updated);
    }
    return recovered;
  }

  async createSession(input: CreatePreviewSessionInput): Promise<PreviewActionResult> {
    const parsed = CreatePreviewSessionInputSchema.parse(input);
    const project = await this.registry.getProject(parsed.projectId);
    const route = parsed.route ?? project.defaultRoute;
    const now = new Date().toISOString();
    const session: PreviewSession = {
      id: uuidv4(),
      projectId: project.id,
      status: "waiting",
      route,
      device: DEVICE_PRESETS[parsed.device ?? "pc"],
      previewUrl: buildPreviewUrl(project, route),
      processId: null,
      startedAt: null,
      stoppedAt: null,
      updatedAt: now,
      errorMessage: null,
    };

    const saved = await this.store.saveSession(session);
    const event = await this.recordEvent(saved, "preview_created", "Preview session created", {
      route: saved.route,
      device: saved.device.name,
    });
    return { session: saved, event };
  }

  async startSession(sessionId: string): Promise<PreviewActionResult> {
    const session = await this.store.getSession(sessionId);
    const project = await this.registry.getProject(session.projectId);
    const now = new Date().toISOString();
    const starting = await this.store.saveSession({
      ...session,
      status: "starting",
      updatedAt: now,
      errorMessage: null,
    });
    let started;
    try {
      started = await this.adapter.start(project, starting);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview session failed to start";
      const evidence = err instanceof BrowserPreviewStartError ? err.evidence : {};
      const runtimeEvidence = buildPreviewRuntimeEvidence(evidence);
      const failed = await this.store.saveSession({
        ...starting,
        status: "error",
        processId: null,
        stoppedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        errorMessage: message,
      });
      const event = await this.recordEvent(
        failed,
        "preview_error",
        "Preview session failed to start",
        { errorMessage: message, runtimeEvidence }
      );
      return { session: failed, event };
    }
    const updated = await this.store.saveSession({
      ...starting,
      status: "running",
      previewUrl: started.previewUrl ?? buildPreviewUrl(project, starting.route),
      processId: started.processId,
      startedAt: starting.startedAt ?? now,
      stoppedAt: null,
      updatedAt: new Date().toISOString(),
      errorMessage: null,
    });
    const runtimeEvidence = buildPreviewRuntimeEvidence({
      ...started.evidence,
      previewUrl: updated.previewUrl,
    });
    await this.recordEvent(
      updated,
      "preview_started",
      "Preview session started",
      { previewUrl: updated.previewUrl, processId: updated.processId, runtimeEvidence }
    );
    const event = await this.recordEvent(
      updated,
      "preview_ready",
      "Preview session ready",
      {
        previewUrl: updated.previewUrl,
        startupDurationMs: runtimeEvidence.durationMs,
        runtimeEvidence,
      }
    );
    return { session: updated, event };
  }

  async stopSession(sessionId: string): Promise<PreviewActionResult> {
    const session = await this.store.getSession(sessionId);
    await this.adapter.stop(session);
    const updated = await this.store.saveSession({
      ...session,
      status: "stopped",
      processId: null,
      stoppedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      errorMessage: null,
    });
    const event = await this.recordEvent(
      updated,
      "preview_stopped",
      "Preview session stopped"
    );
    this.eventStream.cleanup(sessionId);
    return { session: updated, event };
  }

  async reloadSession(sessionId: string): Promise<PreviewActionResult> {
    const session = await this.store.getSession(sessionId);
    await this.adapter.reload(session);
    const updated = await this.store.saveSession({
      ...session,
      status: session.status === "stopped" ? "stopped" : "running",
      updatedAt: new Date().toISOString(),
      errorMessage: null,
    });
    const event = await this.recordEvent(
      updated,
      "preview_reloaded",
      "Preview session reloaded",
      { route: updated.route }
    );
    return { session: updated, event };
  }

  async setDevice(
    sessionId: string,
    input: SetPreviewDeviceInput
  ): Promise<PreviewActionResult> {
    const parsed = SetPreviewDeviceInputSchema.parse(input);
    const session = await this.store.getSession(sessionId);
    const updated = await this.store.saveSession({
      ...session,
      device: DEVICE_PRESETS[parsed.device],
      updatedAt: new Date().toISOString(),
    });
    const event = await this.recordEvent(
      updated,
      "device_changed",
      "Preview device changed",
      { device: updated.device.name }
    );
    return { session: updated, event };
  }

  async createVisualInstructionDraft(
    input: CreateVisualInstructionDraftInput
  ): Promise<VisualInstructionDraftResult> {
    const parsed = CreateVisualInstructionDraftInputSchema.parse(input);
    const session = await this.store.getSession(parsed.sessionId);
    const draft: VisualInstructionDraft = {
      id: uuidv4(),
      sessionId: session.id,
      projectId: session.projectId,
      mode: parsed.mode,
      message: parsed.message,
      status: "drafted",
      createdAt: new Date().toISOString(),
    };
    const saved = await this.store.saveDraft(draft);
    const event = await this.recordEvent(
      session,
      "visual_instruction_drafted",
      "Visual instruction drafted",
      { draftId: saved.id, mode: saved.mode, message: saved.message }
    );
    return { draft: saved, event };
  }

  private async recordEvent(
    session: PreviewSession,
    type: PreviewEventType,
    message: string,
    data: Record<string, unknown> = {}
  ): Promise<PreviewEvent> {
    const event: PreviewEvent = {
      id: uuidv4(),
      type,
      sessionId: session.id,
      projectId: session.projectId,
      timestamp: new Date().toISOString(),
      status: session.status,
      message,
      data,
    };
    const saved = await this.store.appendEvent(event);
    this.eventStream.emit(saved);
    return saved;
  }
}
