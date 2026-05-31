import { randomUUID } from "node:crypto";
import type {
  AgentMemoryItem,
  AgentMemoryKind,
  AgentMemoryScope,
  AgentMemorySourceRef,
  AgentMemorySummary,
  ChatMessage,
  WorkflowEvent,
} from "@u-build/shared";
import type { AgentMemoryRepository } from "../ports/RepositoryPorts.js";

export interface RetrieveAgentMemoryInput {
  scope: Partial<AgentMemoryScope>;
  agentProfileId?: string | undefined;
  kinds?: AgentMemoryKind[] | undefined;
  summaryLimit?: number | undefined;
  itemLimit?: number | undefined;
}

export class AgentMemoryService {
  constructor(private readonly repository: AgentMemoryRepository) {}

  async retrieveForPrompt(input: RetrieveAgentMemoryInput): Promise<{
    summaries: AgentMemorySummary[];
    memories: AgentMemoryItem[];
  }> {
    const summaries = await this.repository.listSummaries({
      scope: input.scope,
      limit: input.summaryLimit ?? 3,
      ...(input.agentProfileId ? { agentProfileId: input.agentProfileId } : {}),
    });
    const kinds = input.kinds ?? [
      "working",
      "preference",
      "rejected_decision",
      "semantic",
      "episodic",
    ];
    const perKindLimit = Math.max(
      1,
      Math.ceil((input.itemLimit ?? 12) / kinds.length)
    );
    const batches = await Promise.all(
      kinds.map((kind) =>
        this.repository.listItems({
          scope: input.scope,
          kind,
          includeStale: false,
          limit: perKindLimit,
          ...(input.agentProfileId ? { agentProfileId: input.agentProfileId } : {}),
        })
      )
    );
    const memories = dedupeById(batches.flat()).slice(0, input.itemLimit ?? 12);
    return { summaries, memories };
  }

  async recordMemory(input: {
    kind: AgentMemoryKind;
    scope: AgentMemoryScope;
    content: string;
    confidence?: number | undefined;
    sourceRefs: AgentMemorySourceRef[];
    tags?: string[] | undefined;
    staleAt?: string | null | undefined;
  }): Promise<AgentMemoryItem> {
    const now = new Date().toISOString();
    return this.repository.appendItem({
      id: randomUUID(),
      kind: input.kind,
      scope: input.scope,
      content: input.content,
      confidence: input.confidence ?? 1,
      sourceRefs: input.sourceRefs,
      tags: input.tags ?? [],
      staleAt: input.staleAt ?? null,
      supersededByMemoryId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async recordEphemeralTaskMemory(input: {
    codingTaskId: string;
    scope: Partial<AgentMemoryScope>;
    content: string;
    sourceRefs: AgentMemorySourceRef[];
    ttlMs: number;
    tags?: string[] | undefined;
  }): Promise<AgentMemoryItem> {
    const staleAt = new Date(Date.now() + input.ttlMs).toISOString();
    return this.recordMemory({
      kind: "working",
      scope: normalizeScope({
        ...input.scope,
        codingTaskId: input.codingTaskId,
      }),
      content: input.content,
      sourceRefs: input.sourceRefs,
      staleAt,
      tags: ["ephemeral", "coding_task", ...(input.tags ?? [])],
    });
  }

  async retrieveEphemeralTaskMemory(input: {
    codingTaskId: string;
    scope?: Partial<AgentMemoryScope> | undefined;
    limit?: number | undefined;
  }): Promise<AgentMemoryItem[]> {
    return this.repository.listItems({
      scope: {
        ...(input.scope ?? {}),
        codingTaskId: input.codingTaskId,
      },
      kind: "working",
      includeStale: false,
      limit: input.limit ?? 12,
    });
  }

  async upsertConversationSummary(input: {
    scope: AgentMemoryScope;
    messages: ChatMessage[];
    summary: string;
  }): Promise<AgentMemorySummary | null> {
    const sequenced = input.messages.filter((message) => message.sequence);
    const sourceRefs = sequenced.slice(-24).map((message) => ({
      type: "chat_message" as const,
      id: message.id,
      label: `chat:${String(message.sequence)}`,
    }));
    if (sourceRefs.length === 0) return null;
    const sequences = sequenced.map((message) => message.sequence as number);
    const now = new Date().toISOString();
    return this.repository.upsertSummary({
      id: randomUUID(),
      scope: input.scope,
      summary: input.summary,
      sourceRefs,
      sourceMessageSequenceMin: Math.min(...sequences),
      sourceMessageSequenceMax: Math.max(...sequences),
      createdAt: now,
      updatedAt: now,
    });
  }

  async recordWorkflowEvent(event: WorkflowEvent): Promise<AgentMemoryItem | null> {
    const scope = normalizeScope({
      workflowThreadId: event.threadId,
      userStoryId: "userStoryId" in event ? event.userStoryId ?? null : null,
      agentProfileId: "agentName" in event ? `${event.agentName}_agent` : null,
    });
    const content = workflowEventToMemoryContent(event);
    if (!content) return null;
    return this.recordMemory({
      kind: "episodic",
      scope,
      content,
      confidence: event.type === "error" ? 0.9 : 1,
      sourceRefs: [
        {
          type: "workflow_event",
          id: `${event.threadId}:${event.type}:${event.timestamp}`,
          label: event.type,
        },
      ],
      tags: ["workflow", event.type],
    });
  }
}

export function normalizeScope(scope: Partial<AgentMemoryScope>): AgentMemoryScope {
  return {
    workspaceFolderId: scope.workspaceFolderId ?? null,
    userStoryId: scope.userStoryId ?? null,
    projectId: scope.projectId ?? null,
    chatSessionId: scope.chatSessionId ?? null,
    workflowThreadId: scope.workflowThreadId ?? null,
    codingTaskId: scope.codingTaskId ?? null,
    agentProfileId: scope.agentProfileId ?? null,
  };
}

function workflowEventToMemoryContent(event: WorkflowEvent): string | null {
  switch (event.type) {
    case "node_completed":
      return `${event.agentName} terminou com status ${event.status}.`;
    case "patch_proposed":
      return `Patch proposto para ${event.filePaths.join(", ")}.`;
    case "patch_applied":
      return `Patch aplicado em ${event.filePaths.join(", ")}.`;
    case "validation_evidence":
      return `Evidencia runtime ${event.evidence.status}.`;
    case "retry_started":
      return `Retry ${event.retryCount} iniciado para ${event.fixTarget}: ${event.notes}`;
    case "awaiting_retry_approval":
      return `Loop pausado para aprovacao humana apos ${event.retryCount} retries: ${event.notes}`;
    case "recovery_decision":
      return `Recuperacao ${event.decision.recoveryAction} para ${event.gateType}: ${event.decision.operatorMessage}`;
    case "fallback_executed":
      return `Fallback ${event.action} ${event.status}: ${event.message}`;
    case "status_changed":
      return `Workflow mudou para ${event.status}.`;
    case "error":
      return `Workflow falhou: ${event.message}`;
    default:
      return null;
  }
}

function dedupeById(items: AgentMemoryItem[]): AgentMemoryItem[] {
  const seen = new Set<string>();
  const deduped: AgentMemoryItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
