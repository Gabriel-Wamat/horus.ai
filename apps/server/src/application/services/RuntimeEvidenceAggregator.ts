import type { ProjectContextRuntimeHint } from "@u-build/shared";

// In-memory ring buffer of runtime hints keyed by projectId. Preview adapters,
// validation runners and curators record() hints here as they happen; the
// ProjectContextEngine drains them when building the next snapshot so the
// agent sees live evidence — Vite dev server errors, browser console errors,
// network failures — without each consumer having to plumb evidence through
// the call chain.
//
// Per-project capacity is bounded so a long-running session doesn't grow
// unbounded. drain() returns the most-recent hints first.

const DEFAULT_CAPACITY_PER_PROJECT = 64;

export interface RuntimeEvidenceAggregatorOptions {
  readonly capacityPerProject?: number | undefined;
  readonly now?: (() => Date) | undefined;
}

export class RuntimeEvidenceAggregator {
  private readonly capacityPerProject: number;
  private readonly now: () => Date;
  private readonly buffers = new Map<string, ProjectContextRuntimeHint[]>();

  constructor(options: RuntimeEvidenceAggregatorOptions = {}) {
    this.capacityPerProject = clampPositive(
      options.capacityPerProject ?? DEFAULT_CAPACITY_PER_PROJECT,
      1,
      1024
    );
    this.now = options.now ?? (() => new Date());
  }

  record(
    projectId: string,
    hint: {
      readonly kind: ProjectContextRuntimeHint["kind"];
      readonly source: string;
      readonly message: string;
      readonly path?: string | undefined;
      readonly line?: number | undefined;
      readonly observedAt?: string | undefined;
    }
  ): void {
    if (!projectId?.trim()) return;
    const buffer = this.buffers.get(projectId) ?? [];
    const normalized: ProjectContextRuntimeHint = {
      kind: hint.kind,
      source: hint.source,
      message: hint.message,
      ...(hint.path ? { path: hint.path } : {}),
      ...(hint.line ? { line: hint.line } : {}),
      observedAt: hint.observedAt ?? this.now().toISOString(),
    };
    buffer.push(normalized);
    while (buffer.length > this.capacityPerProject) buffer.shift();
    this.buffers.set(projectId, buffer);
  }

  recordMany(
    projectId: string,
    hints: readonly ProjectContextRuntimeHint[]
  ): void {
    for (const hint of hints) {
      this.record(projectId, hint);
    }
  }

  drain(projectId: string, limit = this.capacityPerProject): ProjectContextRuntimeHint[] {
    const buffer = this.buffers.get(projectId);
    if (!buffer || buffer.length === 0) return [];
    const out = [...buffer].reverse().slice(0, limit);
    return out;
  }

  // Same as drain() but also empties the buffer — used after consuming the
  // hints for a snapshot so the next turn only sees *new* runtime evidence.
  consume(projectId: string, limit = this.capacityPerProject): ProjectContextRuntimeHint[] {
    const hints = this.drain(projectId, limit);
    this.buffers.delete(projectId);
    return hints;
  }

  clear(projectId: string): void {
    this.buffers.delete(projectId);
  }

  has(projectId: string): boolean {
    const buffer = this.buffers.get(projectId);
    return Boolean(buffer && buffer.length > 0);
  }
}

function clampPositive(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export const defaultRuntimeEvidenceAggregator = new RuntimeEvidenceAggregator();
