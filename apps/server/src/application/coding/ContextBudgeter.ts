import {
  ContextBudgetItemSchema,
  PackedCodingContextSchema,
  type ContextBudgetItem,
  type ContextBudgetSourceType,
  type PackedCodingContext,
} from "@u-build/shared";
import type {
  CodingContextBudgeterPort,
  CodingContextBudgetInput,
} from "../ports/index.js";

const TOKEN_CHAR_RATIO = 4;

export class ContextBudgeter implements CodingContextBudgeterPort {
  constructor(private readonly now: () => Date = () => new Date()) {}

  pack(input: CodingContextBudgetInput): PackedCodingContext {
    throwIfAborted(input.signal);
    const maxTokens = input.budget.maxTokens;
    const usableTokens = Math.max(0, maxTokens - input.budget.reserveTokens);
    const maxItemTokens = input.budget.maxItemTokens;
    const items = buildItems(input)
      .filter((item) => item.content.trim().length > 0)
      .map((item) => ContextBudgetItemSchema.parse(item));
    const deduped = dedupeItems(items);
    const omittedDuplicates = duplicateOmissions(items, deduped);
    const sorted = [...deduped].sort(
      (left, right) =>
        right.priority - left.priority ||
        right.score - left.score ||
        left.id.localeCompare(right.id)
    );
    const packed = [];
    const omitted = [...omittedDuplicates];
    let usedTokens = 0;

    for (const item of sorted) {
      throwIfAborted(input.signal);
      const remaining = usableTokens - usedTokens;
      if (remaining <= 0) {
        omitted.push(omit(item, "budget_exhausted"));
        continue;
      }
      const itemLimit = Math.min(
        remaining,
        maxItemTokens ? Math.min(maxItemTokens, item.tokenEstimate) : item.tokenEstimate
      );
      if (item.tokenEstimate <= remaining && (!maxItemTokens || item.tokenEstimate <= maxItemTokens)) {
        packed.push({ ...item, truncated: false });
        usedTokens += item.tokenEstimate;
        continue;
      }
      if (itemLimit <= 0) {
        omitted.push(omit(item, "budget_exhausted"));
        continue;
      }
      const content = clipToTokenEstimate(item.content, itemLimit);
      const tokenEstimate = estimateTokens(content);
      if (!content.trim() || tokenEstimate <= 0) {
        omitted.push(omit(item, "empty_content"));
        continue;
      }
      packed.push({
        ...item,
        content,
        tokenEstimate,
        originalTokenEstimate: item.tokenEstimate,
        truncated: true,
      });
      usedTokens += tokenEstimate;
    }

    const sourceCounts = sourceCount(packed);
    return PackedCodingContextSchema.parse({
      budget: input.budget,
      usedTokens,
      remainingTokens: Math.max(0, maxTokens - usedTokens),
      items: packed,
      omittedItems: omitted,
      sourceCounts,
      diagnostics: [
        `context_budget:${usedTokens}/${maxTokens}`,
        `context_items:${packed.length}/${deduped.length}`,
        ...(omitted.length > 0 ? [`context_omitted:${omitted.length}`] : []),
      ],
      generatedAt: this.now().toISOString(),
    });
  }
}

function buildItems(input: CodingContextBudgetInput): ContextBudgetItem[] {
  return [
    requestItem(input.request),
    ...memoryItems(input),
    ...lexicalItems(input),
    ...semanticItems(input),
    ...symbolItems(input),
    ...graphItems(input),
  ];
}

function requestItem(request: string): ContextBudgetItem {
  return {
    id: "request:user",
    type: "user_request",
    label: "User request",
    content: request,
    tokenEstimate: estimateTokens(request),
    priority: 1_000,
    score: 100,
  };
}

function memoryItems(input: CodingContextBudgetInput): ContextBudgetItem[] {
  return (input.memories ?? []).map((memory) => ({
    id: `memory:${memory.id}`,
    type: "task_memory",
    label: `Task memory ${memory.id}`,
    content: memory.content,
    tokenEstimate: estimateTokens(memory.content),
    priority: memory.scope.codingTaskId ? 850 : 520,
    score: Math.round(memory.confidence * 100),
    sourceId: memory.id,
  }));
}

function lexicalItems(input: CodingContextBudgetInput): ContextBudgetItem[] {
  return (input.retrieval?.candidates ?? []).flatMap((candidate) => {
    const excerpts =
      candidate.excerpts.length > 0
        ? candidate.excerpts
        : [
            {
              filePath: candidate.path,
              startLine: candidate.startLine,
              endLine: candidate.endLine ?? candidate.startLine,
              content: candidate.content,
              reason: "candidate_content",
              score: candidate.score,
            },
          ];
    return excerpts.map((excerpt, index) => ({
      id: `lexical:${candidate.path}:${excerpt.startLine}:${excerpt.endLine}:${index}`,
      type: "lexical_candidate" as const,
      label: `${candidate.path}:${excerpt.startLine}-${excerpt.endLine}`,
      content: excerpt.content,
      tokenEstimate: estimateTokens(excerpt.content),
      priority: 760,
      score: Math.max(candidate.score, excerpt.score),
      path: candidate.path,
      sourceId: candidate.path,
    }));
  });
}

function semanticItems(input: CodingContextBudgetInput): ContextBudgetItem[] {
  return (input.semanticRetrieval?.matches ?? []).map((match) => ({
    id: `semantic:${match.chunk.id}`,
    type: "semantic_chunk",
    label: `${match.chunk.path}:${match.chunk.startLine}-${match.chunk.endLine}`,
    content: match.chunk.content,
    tokenEstimate: match.chunk.tokenEstimate,
    priority: 720,
    score: match.scoreBreakdown.finalScore,
    path: match.chunk.path,
    sourceId: match.chunk.id,
  }));
}

function symbolItems(input: CodingContextBudgetInput): ContextBudgetItem[] {
  return (input.ast?.documents ?? []).flatMap((document) =>
    document.symbols.map((symbol) => {
      const content = [
        `${symbol.kind} ${symbol.name}`,
        `path: ${symbol.path}`,
        `lines: ${symbol.range.startPosition.row + 1}-${symbol.range.endPosition.row + 1}`,
      ].join("\n");
      return {
        id: `symbol:${symbol.id}`,
        type: "symbol" as const,
        label: `${symbol.path}:${symbol.name}`,
        content,
        tokenEstimate: estimateTokens(content),
        priority: 680,
        score: input.symbolIndex?.entries.some((entry) => entry.symbol.id === symbol.id)
          ? 80
          : 55,
        path: symbol.path,
        sourceId: symbol.id,
      };
    })
  );
}

function graphItems(input: CodingContextBudgetInput): ContextBudgetItem[] {
  const context = input.graphContext;
  if (!context) return [];
  return [
    ...context.paths.map((path, index) => {
      const content = `related_path: ${path}`;
      return {
        id: `graph:path:${path}`,
        type: "graph" as const,
        label: `Graph path ${path}`,
        content,
        tokenEstimate: estimateTokens(content),
        priority: 600,
        score: 70 - index,
        path,
        sourceId: path,
      };
    }),
    ...context.edges.map((edge) => {
      const content = [
        `edge: ${edge.kind}`,
        edge.sourcePath ? `source: ${edge.sourcePath}` : "",
        edge.targetPath ? `target: ${edge.targetPath}` : "",
        edge.reason ? `reason: ${edge.reason}` : "",
      ].filter(Boolean).join("\n");
      return {
        id: `graph:edge:${edge.id}`,
        type: "graph" as const,
        label: `Graph edge ${edge.kind}`,
        content,
        tokenEstimate: estimateTokens(content),
        priority: 560,
        score: Math.round(edge.confidence * 100),
        path: edge.sourcePath ?? edge.targetPath,
        sourceId: edge.id,
      };
    }),
  ];
}

function dedupeItems(items: readonly ContextBudgetItem[]): ContextBudgetItem[] {
  const seen = new Set<string>();
  const output: ContextBudgetItem[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.path ?? ""}:${hashableContent(item.content)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function duplicateOmissions(
  items: readonly ContextBudgetItem[],
  deduped: readonly ContextBudgetItem[]
) {
  const kept = new Set(deduped.map((item) => item.id));
  return items.filter((item) => !kept.has(item.id)).map((item) => omit(item, "duplicate"));
}

function omit(item: ContextBudgetItem, reason: "budget_exhausted" | "empty_content" | "duplicate") {
  return {
    id: item.id,
    type: item.type,
    label: item.label,
    tokenEstimate: item.tokenEstimate,
    priority: item.priority,
    score: item.score,
    ...(item.path ? { path: item.path } : {}),
    reason,
  };
}

function sourceCount(items: readonly { readonly type: ContextBudgetSourceType }[]) {
  const types: ContextBudgetSourceType[] = [
    "user_request",
    "task_memory",
    "chat_history",
    "lexical_candidate",
    "semantic_chunk",
    "symbol",
    "graph",
    "validation_error",
  ];
  const entries: Array<[ContextBudgetSourceType, number]> = types.map((type) => [
    type,
    items.filter((item) => item.type === type).length,
  ]);
  return Object.fromEntries(entries);
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / TOKEN_CHAR_RATIO);
}

function clipToTokenEstimate(content: string, maxTokens: number): string {
  const maxChars = Math.max(0, maxTokens * TOKEN_CHAR_RATIO);
  if (content.length <= maxChars) return content;
  const suffix = "\n[context truncated by budget]";
  return `${content.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`;
}

function hashableContent(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 400);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Context budgeting cancelled.");
  error.name = "AbortError";
  throw error;
}
