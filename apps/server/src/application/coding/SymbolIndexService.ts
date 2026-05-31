import {
  SymbolIndexResultSchema,
  type AstDocument,
  type AstSymbol,
  type LspDiagnostic,
  type SymbolIndexEntry,
  type SymbolIndexResult,
  type SymbolLocation,
} from "@u-build/shared";
import type {
  LspClientPort,
  SymbolIndexInput,
  SymbolIndexPort,
} from "../ports/index.js";

const DEFAULT_MAX_SYMBOLS = 200;
const DEFAULT_MAX_REFERENCES_PER_SYMBOL = 20;
const DEFAULT_OPERATION_TIMEOUT_MS = 3_000;

interface SymbolIndexServiceOptions {
  readonly maxSymbols?: number;
  readonly maxReferencesPerSymbol?: number;
  readonly operationTimeoutMs?: number;
  readonly now?: () => Date;
}

export class SymbolIndexService implements SymbolIndexPort {
  private readonly maxSymbols: number;
  private readonly maxReferencesPerSymbol: number;
  private readonly operationTimeoutMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly createClient: () => LspClientPort,
    options: SymbolIndexServiceOptions = {}
  ) {
    this.maxSymbols = options.maxSymbols ?? DEFAULT_MAX_SYMBOLS;
    this.maxReferencesPerSymbol =
      options.maxReferencesPerSymbol ?? DEFAULT_MAX_REFERENCES_PER_SYMBOL;
    this.operationTimeoutMs =
      options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
  }

  async buildIndex(input: SymbolIndexInput): Promise<SymbolIndexResult> {
    throwIfAborted(input.signal);
    const client = this.createClient();
    const notes: string[] = [];
    const diagnostics: LspDiagnostic[] = [];
    const entries: SymbolIndexEntry[] = [];

    try {
      await this.withTimeout(
        client.initialize({
          projectRootPath: input.projectRootPath,
          candidates: input.candidates,
          ...(input.signal ? { signal: input.signal } : {}),
        }),
        "lsp_initialize"
      );

      const documents = input.ast.documents.filter(
        (document) =>
          document.parseStatus === "parsed" && isTypeScriptLike(document.language)
      );
      for (const document of documents) {
        throwIfAborted(input.signal);
        diagnostics.push(
          ...(await this.withTimeout(
            client.diagnostics({
              path: document.path,
              ...(input.signal ? { signal: input.signal } : {}),
            }),
            `lsp_diagnostics:${document.path}`
          ))
        );
      }

      const symbols = documents
        .flatMap((document) =>
          document.symbols
            .filter(isIndexableSymbol)
            .map((symbol) => ({ document, symbol }))
        )
        .slice(0, this.maxSymbols);

      for (const { document, symbol } of symbols) {
        throwIfAborted(input.signal);
        const location = symbolLocation(symbol);
        const definitions = await this.safeLocations(
          () =>
            client.definition({
              location,
              ...(input.signal ? { signal: input.signal } : {}),
            }),
          `lsp_definition:${symbol.id}`,
          notes
        );
        const references = await this.safeLocations(
          () =>
            client.references({
              location,
              includeDeclaration: true,
              ...(input.signal ? { signal: input.signal } : {}),
            }),
          `lsp_references:${symbol.id}`,
          notes
        );
        entries.push({
          symbol,
          location,
          definitionLocations: definitions,
          referenceCount: references.length,
          referenceLocations: references.slice(0, this.maxReferencesPerSymbol),
          referenceResolution:
            references.length > this.maxReferencesPerSymbol
              ? "truncated"
              : references.length === 0
                ? "unavailable"
                : "complete",
        });

        if (document.diagnostics.length > 0) {
          notes.push(
            `${document.path} also has ${document.diagnostics.length} AST diagnostic(s).`
          );
        }
      }

      const unresolvedSymbolCount = entries.filter(
        (entry) => entry.referenceResolution === "unavailable"
      ).length;
      const status =
        entries.length === 0
          ? "unavailable"
          : unresolvedSymbolCount > 0 || diagnostics.some((item) => item.severity === "error")
            ? "partial"
            : "complete";

      return SymbolIndexResultSchema.parse({
        projectRootPath: input.projectRootPath,
        status,
        entries,
        diagnostics,
        summary: {
          documentCount: documents.length,
          indexedSymbolCount: entries.length,
          diagnosticCount: diagnostics.length,
          unresolvedSymbolCount,
        },
        notes,
        generatedAt: this.now().toISOString(),
      });
    } catch (err) {
      return SymbolIndexResultSchema.parse({
        projectRootPath: input.projectRootPath,
        status: isAbortError(err) ? "failed" : "unavailable",
        entries,
        diagnostics: [
          ...diagnostics,
          {
            path: ".",
            severity: "error",
            source: "lsp",
            code: isAbortError(err) ? "lsp_cancelled" : "lsp_unavailable",
            message: err instanceof Error ? err.message : "LSP unavailable.",
          },
        ],
        summary: {
          documentCount: input.ast.documents.length,
          indexedSymbolCount: entries.length,
          diagnosticCount: diagnostics.length + 1,
          unresolvedSymbolCount: entries.length,
        },
        notes,
        generatedAt: this.now().toISOString(),
      });
    } finally {
      await client.shutdown().catch(() => undefined);
    }
  }

  private async safeLocations(
    operation: () => Promise<SymbolLocation[]>,
    label: string,
    notes: string[]
  ): Promise<SymbolLocation[]> {
    try {
      return await this.withTimeout(operation(), label);
    } catch (err) {
      notes.push(
        `${label} failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  }

  private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            const error = new Error(`${label} timed out.`);
            error.name = "AbortError";
            reject(error);
          }, this.operationTimeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

function symbolLocation(symbol: AstSymbol): SymbolLocation {
  return {
    path: symbol.path,
    range: symbol.nameRange ?? symbol.range,
  };
}

function isTypeScriptLike(language: AstDocument["language"]): boolean {
  return language === "typescript" || language === "javascript";
}

function isIndexableSymbol(symbol: AstSymbol): boolean {
  return [
    "component",
    "function",
    "class",
    "method",
    "variable",
    "hook",
    "type",
    "interface",
  ].includes(symbol.kind);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Symbol index build cancelled.");
  error.name = "AbortError";
  throw error;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}
