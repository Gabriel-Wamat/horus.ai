import { randomUUID } from "node:crypto";
import type {
  AgentMemoryItem,
  AgentMemoryKind,
  AgentMemoryScope,
  AgentMemorySummary,
  ChatAgentContextBundle,
  ChatMessage,
  ProjectContextSnapshot,
} from "@u-build/shared";
import { collapseWhitespace } from "./AgenticTextParsing.js";
import { normalizeScope } from "./AgentMemoryService.js";

export interface ChatContextMemoryReader {
  retrieveForPrompt(input: {
    scope: Partial<AgentMemoryScope>;
    agentProfileId?: string | undefined;
    kinds?: AgentMemoryKind[] | undefined;
    summaryLimit?: number | undefined;
    itemLimit?: number | undefined;
  }): Promise<{
    summaries: AgentMemorySummary[];
    memories: AgentMemoryItem[];
  }>;
}

export interface ChatContextBudgetReport {
  readonly maxBytes: number;
  readonly usedBytes: number;
  readonly clippedBytes: number;
  readonly originalMessageCount: number;
  readonly selectedMessageCount: number;
  readonly summaryCount: number;
  readonly diagnostics: string[];
}

export interface ChatContextAssembly {
  readonly context: ChatAgentContextBundle;
  readonly report: ChatContextBudgetReport;
  readonly summaries: AgentMemorySummary[];
}

export interface ChatContextAssemblerOptions {
  readonly maxHistoryBytes?: number | undefined;
  readonly maxMessageBytes?: number | undefined;
  readonly maxRecentMessages?: number | undefined;
  readonly maxSummaryBytes?: number | undefined;
  readonly summaryLimit?: number | undefined;
  // Cap for the synthetic "project context" system message produced from a
  // ProjectContextSnapshot. Independent of maxHistoryBytes so the project
  // briefing never silently steals from chat-history budget.
  readonly maxProjectContextBytes?: number | undefined;
}

interface ResolvedChatContextAssemblerOptions {
  readonly maxHistoryBytes: number;
  readonly maxMessageBytes: number;
  readonly maxRecentMessages: number;
  readonly maxSummaryBytes: number;
  readonly summaryLimit: number;
  readonly maxProjectContextBytes: number;
}

const DEFAULT_OPTIONS: ResolvedChatContextAssemblerOptions = {
  maxHistoryBytes: 5_200,
  maxMessageBytes: 700,
  maxRecentMessages: 8,
  maxSummaryBytes: 1_800,
  summaryLimit: 2,
  maxProjectContextBytes: 2_400,
};

export class ChatContextAssembler {
  private readonly options: ResolvedChatContextAssemblerOptions;

  constructor(
    private readonly memoryReader?: ChatContextMemoryReader | undefined,
    options: ChatContextAssemblerOptions = {}
  ) {
    this.options = {
      maxHistoryBytes: options.maxHistoryBytes ?? DEFAULT_OPTIONS.maxHistoryBytes,
      maxMessageBytes: options.maxMessageBytes ?? DEFAULT_OPTIONS.maxMessageBytes,
      maxRecentMessages: options.maxRecentMessages ?? DEFAULT_OPTIONS.maxRecentMessages,
      maxSummaryBytes: options.maxSummaryBytes ?? DEFAULT_OPTIONS.maxSummaryBytes,
      summaryLimit: options.summaryLimit ?? DEFAULT_OPTIONS.summaryLimit,
      maxProjectContextBytes:
        options.maxProjectContextBytes ?? DEFAULT_OPTIONS.maxProjectContextBytes,
    };
  }

  async assemble(input: {
    context: ChatAgentContextBundle;
    query: string;
    projectId?: string | undefined;
    // Optional canonical project context. When present, ChatContextAssembler
    // prepends a synthetic system message describing stack, validation policy,
    // edit restrictions and recent runtime hints so the chat agent reasons
    // with the same project picture the workflow agents already see.
    projectContext?: ProjectContextSnapshot | undefined;
  }): Promise<ChatContextAssembly> {
    const summaries = await this.retrieveSummaries(input.context, input.projectId);
    const summaryMessage = this.buildSummaryMessage(input.context, summaries);
    const projectContextMessage = input.projectContext
      ? this.buildProjectContextMessage(input.context, input.projectContext)
      : null;
    const summaryBytes = summaryMessage
      ? byteLength(summaryMessage.compactBody ?? summaryMessage.body)
      : 0;
    const selectedMessages = this.selectRecentMessages(
      input.context.messages,
      Math.max(0, this.options.maxHistoryBytes - summaryBytes)
    );
    const messages = [
      ...(projectContextMessage ? [projectContextMessage] : []),
      ...(summaryMessage ? [summaryMessage] : []),
      ...selectedMessages,
    ];
    const usedBytes = messages.reduce(
      (total, message) => total + byteLength(message.compactBody ?? message.body),
      0
    );
    const originalBytes = input.context.messages.reduce(
      (total, message) => total + byteLength(message.compactBody ?? message.body),
      0
    );
    const clippedBytes = Math.max(0, originalBytes - usedBytes);
    const diagnostics = [
      `chat_context_messages:${messages.length}/${input.context.messages.length}`,
      `chat_context_budget:${usedBytes}/${this.options.maxHistoryBytes}`,
    ];
    if (summaries.length > 0) diagnostics.push(`chat_context_summaries:${summaries.length}`);
    if (projectContextMessage) {
      diagnostics.push(
        `chat_context_project:${byteLength(projectContextMessage.compactBody ?? projectContextMessage.body)}/${this.options.maxProjectContextBytes}`
      );
    }
    if (clippedBytes > 0) diagnostics.push(`chat_context_clipped:${clippedBytes}`);

    return {
      context: {
        ...input.context,
        messages,
      },
      summaries,
      report: {
        maxBytes: this.options.maxHistoryBytes,
        usedBytes,
        clippedBytes,
        originalMessageCount: input.context.messages.length,
        selectedMessageCount: messages.length,
        summaryCount: summaries.length,
        diagnostics,
      },
    };
  }

  private async retrieveSummaries(
    context: ChatAgentContextBundle,
    projectId: string | undefined
  ): Promise<AgentMemorySummary[]> {
    if (!this.memoryReader) return [];
    const scope = normalizeScope({
      workspaceFolderId: context.session.workspaceFolderId,
      userStoryId: context.session.userStoryId,
      projectId: projectId ?? null,
      chatSessionId: context.session.id,
      workflowThreadId: context.session.workflowThreadId ?? null,
      agentProfileId: "horus_chat",
    });
    const result = await this.memoryReader.retrieveForPrompt({
      scope,
      agentProfileId: "horus_chat",
      summaryLimit: this.options.summaryLimit,
      itemLimit: 1,
      kinds: ["episodic"],
    });
    return result.summaries.slice(0, this.options.summaryLimit);
  }

  private buildProjectContextMessage(
    context: ChatAgentContextBundle,
    snapshot: ProjectContextSnapshot
  ): ChatMessage | null {
    const sections: string[] = [];
    const stack = snapshot.inspection.framework.name;
    const packageManager = snapshot.inspection.packageManager.name;
    sections.push(
      `Projeto: ${snapshot.projectRootPath} | stack=${stack} | package_manager=${packageManager}`
    );

    const requiredSteps = snapshot.validationStrategy.requirements
      .filter((req) => req.level === "required")
      .map((req) => req.kind);
    const recommendedSteps = snapshot.validationStrategy.requirements
      .filter((req) => req.level === "recommended")
      .map((req) => req.kind);
    if (requiredSteps.length > 0 || recommendedSteps.length > 0) {
      sections.push(
        `Validação obrigatória: ${requiredSteps.join(", ") || "(nenhuma)"} | recomendada: ${recommendedSteps.join(", ") || "(nenhuma)"}`
      );
    }

    const editableRoots = snapshot.editRestrictions.editableRoots.slice(0, 4);
    const protectedSample = snapshot.editRestrictions.protectedPaths.slice(0, 4);
    if (editableRoots.length > 0 || protectedSample.length > 0) {
      sections.push(
        `Raízes editáveis: ${editableRoots.join(", ") || "(indeterminadas)"} | proibidas: ${protectedSample.join(", ") || "(nenhuma)"}`
      );
    }

    const entrypointSample = snapshot.inspection.entrypoints
      .slice(0, 4)
      .map((entry) => entry.path);
    if (entrypointSample.length > 0) {
      sections.push(`Entrypoints: ${entrypointSample.join(", ")}`);
    }

    const recentHints = snapshot.runtimeHints.slice(0, 6);
    if (recentHints.length > 0) {
      sections.push("Erros recentes observados em runtime:");
      for (const hint of recentHints) {
        sections.push(
          `- [${hint.kind}] (${hint.source}) ${collapseWhitespace(hint.message).slice(0, 220)}`
        );
      }
    }

    const codeFiles = snapshot.codeContext.files.slice(0, 4);
    if (codeFiles.length > 0) {
      sections.push(
        `Arquivos no contexto: ${codeFiles.map((file) => file.path).join(", ")}`
      );
    }

    const body = clipByBytes(
      [
        "Contexto canônico do projeto (Engine):",
        ...sections,
      ].join("\n"),
      this.options.maxProjectContextBytes
    );
    if (!body.trim()) return null;
    return {
      id: randomUUID(),
      sessionId: context.session.id,
      sequence: -1,
      role: "system",
      eventType: "message",
      visibility: "hidden",
      deliveryStatus: "persisted",
      body,
      compactBody: body,
      contextSnapshot: {
        workspaceFolderId: context.session.workspaceFolderId,
        userStoryId: context.session.userStoryId,
        ...(context.session.workflowThreadId
          ? { workflowThreadId: context.session.workflowThreadId }
          : {}),
      },
      metadata: {
        horusChatContext: {
          source: "project_context_snapshot",
          stack,
          requiredValidationKinds: requiredSteps,
          runtimeHintCount: snapshot.runtimeHints.length,
          generatedAt: snapshot.generatedAt,
        },
      },
      createdAt: snapshot.generatedAt,
    };
  }

  private buildSummaryMessage(
    context: ChatAgentContextBundle,
    summaries: AgentMemorySummary[]
  ): ChatMessage | null {
    if (summaries.length === 0) return null;
    const body = clipByBytes(
      [
        "Resumo compactado do histórico isolado do chat:",
        ...summaries.map((summary) => `- ${collapseWhitespace(summary.summary)}`),
      ].join("\n"),
      Math.min(this.options.maxSummaryBytes, this.options.maxHistoryBytes)
    );
    return {
      id: randomUUID(),
      sessionId: context.session.id,
      sequence: 0,
      role: "system",
      eventType: "message",
      visibility: "hidden",
      deliveryStatus: "persisted",
      body,
      compactBody: body,
      contextSnapshot: {
        workspaceFolderId: context.session.workspaceFolderId,
        userStoryId: context.session.userStoryId,
        ...(context.session.workflowThreadId
          ? { workflowThreadId: context.session.workflowThreadId }
          : {}),
      },
      metadata: {
        horusChatContext: {
          source: "conversation_summary",
          summaryIds: summaries.map((summary) => summary.id),
        },
      },
      createdAt: summaries[0]?.updatedAt ?? new Date().toISOString(),
    };
  }

  private selectRecentMessages(
    messages: ChatMessage[],
    maxBudgetBytes: number
  ): ChatMessage[] {
    if (maxBudgetBytes <= 0) return [];
    const visibleMessages = messages
      .filter((message) => message.visibility === "user")
      .filter((message) => message.eventType === "message" || message.eventType === "action_state")
      .sort((left, right) => {
        if (left.sequence !== right.sequence) return left.sequence - right.sequence;
        return left.createdAt.localeCompare(right.createdAt);
      })
      .slice(-this.options.maxRecentMessages);

    const selected: ChatMessage[] = [];
    let usedBytes = 0;

    for (const message of [...visibleMessages].reverse()) {
      const remainingBytes = maxBudgetBytes - usedBytes;
      if (remainingBytes < 64) break;
      const compactBody = clipByBytes(
        message.compactBody ?? message.body,
        Math.min(this.options.maxMessageBytes, remainingBytes)
      );
      const nextBytes = byteLength(compactBody);
      if (usedBytes + nextBytes > maxBudgetBytes) {
        continue;
      }
      selected.push({
        ...message,
        body: compactBody,
        compactBody,
      });
      usedBytes += nextBytes;
    }

    return selected.reverse();
  }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf-8");
}

function clipByBytes(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) return value;
  let clipped = value.slice(0, maxBytes);
  while (byteLength(clipped) > maxBytes - 20 && clipped.length > 0) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped.trimEnd()}... [conteúdo compactado]`;
}
