import { createHash } from "node:crypto";
import type {
  AstDiagnostic,
  AstDocument,
  AstRange,
  AstSymbol,
  RepositoryRetrievalCandidate,
  StructuralPatchIntent,
  StructuralPatchOperation,
} from "@u-build/shared";

export interface FileDraft {
  readonly path: string;
  readonly document: AstDocument;
  readonly candidate: RepositoryRetrievalCandidate;
  readonly operations: StructuralPatchOperation[];
  content: string;
  delta: number;
}

export function getDraft(
  drafts: Map<string, FileDraft>,
  candidate: RepositoryRetrievalCandidate,
  document: AstDocument
): FileDraft {
  const existing = drafts.get(candidate.path);
  if (existing) return existing;
  const draft: FileDraft = {
    path: candidate.path,
    candidate,
    document,
    operations: [],
    content: candidate.content,
    delta: 0,
  };
  drafts.set(candidate.path, draft);
  return draft;
}

export function applyTextEdit(
  draft: FileDraft,
  startByte: number,
  endByte: number,
  replacement: string
): void {
  draft.content =
    draft.content.slice(0, startByte) + replacement + draft.content.slice(endByte);
  draft.delta += Buffer.byteLength(replacement, "utf-8") - (endByte - startByte);
}

export function findTargetSymbol(
  document: AstDocument,
  intent: StructuralPatchIntent
): AstSymbol | null {
  const candidates = document.symbols.filter((symbol) => {
    if (intent.targetSymbolId && symbol.id !== intent.targetSymbolId) return false;
    if (intent.targetSymbolName && symbol.name !== intent.targetSymbolName) return false;
    if (intent.targetSymbolKind && symbol.kind !== intent.targetSymbolKind) return false;
    return symbol.kind !== "import" || intent.kind === "remove_import";
  });
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

export function findImportSymbol(
  document: AstDocument,
  intent: StructuralPatchIntent
): AstSymbol | null {
  const candidates = document.symbols.filter((symbol) => {
    if (symbol.kind !== "import") return false;
    if (intent.importSource && symbol.importSource !== intent.importSource) return false;
    if (intent.targetSymbolName && symbol.name !== intent.targetSymbolName) return false;
    return true;
  });
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

export function buildImportText(intent: StructuralPatchIntent): string | null {
  if (!intent.importSource) return null;
  const parts: string[] = [];
  if (intent.defaultImport) parts.push(intent.defaultImport);
  if (intent.namespaceImport) parts.push(`* as ${intent.namespaceImport}`);
  if (intent.namedImports.length > 0) {
    parts.push(`{ ${intent.namedImports.join(", ")} }`);
  }
  if (parts.length === 0) return null;
  return `import ${parts.join(", ")} from "${intent.importSource}";`;
}

export function insertionByteForPosition(
  document: AstDocument,
  position: NonNullable<StructuralPatchIntent["position"]>,
  symbol: AstSymbol | null
): number {
  if (position === "file_start") return 0;
  if (position === "before_symbol" && symbol) return symbol.range.startByte;
  if (position === "after_symbol" && symbol) return symbol.range.endByte;
  if (position === "after_imports") {
    const imports = document.symbols.filter((item) => item.kind === "import");
    return imports.length > 0
      ? Math.max(...imports.map((item) => item.range.endByte))
      : 0;
  }
  const lastSymbolEnd = Math.max(
    0,
    ...document.symbols.map((item) => item.range.endByte)
  );
  return lastSymbolEnd;
}

export function normalizeInsertedContent(
  currentContent: string,
  startByte: number,
  content: string
): string {
  const before = currentContent[startByte - 1] ?? "";
  const after = currentContent[startByte] ?? "";
  const prefix = before && before !== "\n" ? "\n" : "";
  const suffix = after && after !== "\n" ? "\n" : "";
  return `${prefix}${content}${content.endsWith("\n") ? "" : "\n"}${suffix}`;
}

export function expandToWholeLine(content: string, range: AstRange): AstRange {
  let start = range.startByte;
  let end = range.endByte;
  while (start > 0 && content[start - 1] !== "\n") start -= 1;
  while (end < content.length && content[end] !== "\n") end += 1;
  if (end < content.length && content[end] === "\n") end += 1;
  return { ...range, startByte: start, endByte: end };
}

export function adjustRange(
  range: Pick<AstRange, "startByte" | "endByte">,
  delta: number
): Pick<AstRange, "startByte" | "endByte"> {
  return {
    startByte: Math.max(0, range.startByte + delta),
    endByte: Math.max(0, range.endByte + delta),
  };
}

export function byteRange(
  startByte: number,
  endByte: number,
  document: AstDocument
): AstRange {
  return {
    startByte,
    endByte,
    startPosition: { row: 0, column: startByte },
    endPosition: { row: document.lineCount - 1, column: endByte },
  };
}

export function operationFromIntent(
  intent: StructuralPatchIntent,
  data: {
    readonly targetSymbol?: AstSymbol | null;
    readonly range?: AstRange;
    readonly beforeSnippet?: string;
    readonly afterSnippet?: string;
  }
): StructuralPatchOperation {
  const symbol = data.targetSymbol ?? null;
  return {
    id: intent.id,
    kind: intent.kind,
    targetPath: intent.targetPath,
    ...(symbol?.id ? { targetSymbolId: symbol.id } : {}),
    ...(symbol?.name ? { targetSymbolName: symbol.name } : {}),
    ...(symbol?.kind ? { targetSymbolKind: symbol.kind } : {}),
    ...(data.range ? { range: data.range } : {}),
    ...(data.beforeSnippet !== undefined ? { beforeSnippet: data.beforeSnippet } : {}),
    ...(data.afterSnippet !== undefined ? { afterSnippet: data.afterSnippet } : {}),
    ...(intent.rationale ? { rationale: intent.rationale } : {}),
  };
}

export function hasDeleteOperation(draft: FileDraft): boolean {
  return draft.operations.some((operation) => operation.kind === "delete");
}

export function diagnostic(
  path: string,
  code: string,
  message: string
): AstDiagnostic {
  return {
    path,
    code,
    message,
    severity: "error",
    source: "patch-planner",
  };
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Patch planning cancelled.");
  error.name = "AbortError";
  throw error;
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
