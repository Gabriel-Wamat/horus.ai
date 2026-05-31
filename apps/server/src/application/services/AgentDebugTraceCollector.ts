import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import type {
  AgentDebugTraceEntry,
  AgentDebugTraceOutcome,
  AgentName,
  AgentProfileId,
  ProjectContextSnapshot,
} from "@u-build/shared";
import { AgentDebugTraceEntrySchema } from "@u-build/shared";

// In-memory ring buffer of agent debug traces keyed by a composite key
// (projectId|threadId|userStoryId|agentName) so the UI can pull the decision
// trail for one (story, agent) pair without cross-contamination.
//
// Workflow nodes call record() once per turn. The HTTP layer reads via list()
// or listAll() — both filtered + paginated. The collector is intentionally
// in-memory: persistent storage is a future concern; this is the read model.

const DEFAULT_CAPACITY_PER_KEY = 64;

export interface RecordAgentDebugTraceInput {
  readonly projectId?: string | null | undefined;
  readonly workflowThreadId?: string | null | undefined;
  readonly userStoryId?: string | null | undefined;
  readonly agentName?: AgentName | null | undefined;
  readonly agentProfileId?: AgentProfileId | null | undefined;
  readonly turn: number;
  readonly snapshot?: ProjectContextSnapshot | undefined;
  readonly hypothesis?: string | undefined;
  readonly action: string;
  readonly outcome: AgentDebugTraceOutcome;
  readonly durationMs?: number | undefined;
  readonly notes?: readonly string[] | undefined;
  readonly filesRead?: readonly string[] | undefined;
  readonly filesWritten?: readonly string[] | undefined;
  readonly now?: (() => Date) | undefined;
}

export interface ListAgentDebugTraceInput {
  readonly projectId?: string | null | undefined;
  readonly workflowThreadId?: string | null | undefined;
  readonly userStoryId?: string | null | undefined;
  readonly agentName?: AgentName | null | undefined;
  readonly limit?: number | undefined;
}

export class AgentDebugTraceCollector {
  private readonly capacityPerKey: number;
  private readonly buffers = new Map<string, AgentDebugTraceEntry[]>();

  constructor(options: { capacityPerKey?: number | undefined } = {}) {
    this.capacityPerKey = clampPositive(
      options.capacityPerKey ?? DEFAULT_CAPACITY_PER_KEY,
      1,
      1024
    );
  }

  record(input: RecordAgentDebugTraceInput): AgentDebugTraceEntry {
    const now = input.now ?? (() => new Date());
    const snapshot = input.snapshot;
    const entry = AgentDebugTraceEntrySchema.parse({
      id: randomUUID(),
      projectId: input.projectId ?? null,
      workflowThreadId: input.workflowThreadId ?? null,
      userStoryId: input.userStoryId ?? null,
      agentName: input.agentName ?? null,
      agentProfileId: input.agentProfileId ?? null,
      turn: input.turn,
      contextSnapshotHash: snapshot ? hashSnapshot(snapshot) : null,
      contextSummary: snapshot
        ? {
            stack: snapshot.inspection.framework.name,
            runtimeHintCount: snapshot.runtimeHints.length,
            editableRootCount: snapshot.editRestrictions.editableRoots.length,
            protectedPathCount: snapshot.editRestrictions.protectedPaths.length,
            requiredValidationKinds: snapshot.validationStrategy.requirements
              .filter((req) => req.level === "required")
              .map((req) => req.kind),
          }
        : {},
      hypothesis: input.hypothesis ?? null,
      action: input.action,
      outcome: input.outcome,
      durationMs: input.durationMs ?? 0,
      notes: [...(input.notes ?? [])],
      filesRead: [...(input.filesRead ?? [])],
      filesWritten: [...(input.filesWritten ?? [])],
      createdAt: now().toISOString(),
    });
    const key = bufferKey(input);
    const buffer = this.buffers.get(key) ?? [];
    buffer.push(entry);
    while (buffer.length > this.capacityPerKey) buffer.shift();
    this.buffers.set(key, buffer);
    return entry;
  }

  list(filter: ListAgentDebugTraceInput): AgentDebugTraceEntry[] {
    const limit = clampPositive(filter.limit ?? this.capacityPerKey, 1, 1024);
    const entries: AgentDebugTraceEntry[] = [];
    for (const [key, buffer] of this.buffers) {
      if (!matchesKey(key, filter)) continue;
      entries.push(...buffer);
    }
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return entries.slice(0, limit);
  }

  clear(filter: ListAgentDebugTraceInput): void {
    for (const key of [...this.buffers.keys()]) {
      if (matchesKey(key, filter)) this.buffers.delete(key);
    }
  }
}

function bufferKey(input: {
  projectId?: string | null | undefined;
  workflowThreadId?: string | null | undefined;
  userStoryId?: string | null | undefined;
  agentName?: AgentName | null | undefined;
}): string {
  return [
    input.projectId ?? "",
    input.workflowThreadId ?? "",
    input.userStoryId ?? "",
    input.agentName ?? "",
  ].join("|");
}

function matchesKey(key: string, filter: ListAgentDebugTraceInput): boolean {
  const [projectId, threadId, userStoryId, agentName] = key.split("|");
  if (filter.projectId && filter.projectId !== projectId) return false;
  if (filter.workflowThreadId && filter.workflowThreadId !== threadId) return false;
  if (filter.userStoryId && filter.userStoryId !== userStoryId) return false;
  if (filter.agentName && filter.agentName !== agentName) return false;
  return true;
}

function hashSnapshot(snapshot: ProjectContextSnapshot): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        root: snapshot.projectRootPath,
        stack: snapshot.inspection.framework.name,
        fileCount: snapshot.codeContext.files.length,
        generatedAt: snapshot.generatedAt,
      })
    )
    .digest("hex")
    .slice(0, 16);
}

function clampPositive(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export const defaultAgentDebugTraceCollector = new AgentDebugTraceCollector();
