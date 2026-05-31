import { randomUUID } from "node:crypto";
import {
  StructuralPatchIntentSchema,
  type AstAnalysisResult,
  type AstDocument,
  type AstSymbol,
  type ContextBudgetConfig,
  type RepositoryGraphNeighborhood,
  type RepositoryGraphSnapshot,
  type RepositoryRetrievalCandidate,
  type RepositoryRetrievalResult,
  type RepositoryScanSnapshot,
  type SemanticRetrievalResult,
  type SymbolIndexEntry,
  type SymbolIndexResult,
  type StructuralPatchIntent,
} from "@u-build/shared";
import type {
  AstAnalyzerPort,
  ChatCodingPlannerDiagnostic,
  ChatCodingPlannerInput,
  ChatCodingPlannerPort,
  ChatCodingPlannerResult,
  CodingContextBudgeterPort,
  GraphAwareRetrievalPort,
  RepositoryGraphBuilderPort,
  RepositoryScannerPort,
  SemanticRepositoryRetrievalPort,
  SymbolIndexPort,
  TextRetrievalPort,
} from "../ports/index.js";
import {
  extractRepositoryExplicitPaths,
  toRepositoryPath,
} from "./RepositoryAccessPolicy.js";
import {
  extractChatCodeBlocks,
  hasRenameRequest,
  inferOperationKind,
  inferSymbolFromContent,
  inferSymbolNameFromMessage,
  isLikelyCodeBlock,
} from "./ChatCodingRequestParser.js";
import { mergeSemanticRetrieval } from "./ChatCodingRetrievalMerge.js";

interface PlannerEvidence {
  readonly candidate: RepositoryRetrievalCandidate;
  readonly document: AstDocument;
  readonly symbol?: AstSymbol;
}

export class ChatCodingPlanner implements ChatCodingPlannerPort {
  constructor(
    private readonly scanner: RepositoryScannerPort,
    private readonly retriever: TextRetrievalPort,
    private readonly astAnalyzer: AstAnalyzerPort,
    private readonly idGenerator: () => string = randomUUID,
    private readonly symbolIndex?: SymbolIndexPort,
    private readonly graphBuilder?: RepositoryGraphBuilderPort,
    private readonly graphRetrieval?: GraphAwareRetrievalPort,
    private readonly semanticRetrieval?: SemanticRepositoryRetrievalPort,
    private readonly contextBudgeter?: CodingContextBudgeterPort,
    private readonly contextBudget?: ContextBudgetConfig
  ) {}

  async plan(input: ChatCodingPlannerInput): Promise<ChatCodingPlannerResult> {
    throwIfAborted(input.signal);
    const diagnostics: ChatCodingPlannerDiagnostic[] = [];
    const requestedPaths = extractRepositoryExplicitPaths(input.message);
    const scan = await this.scanner.scan({
      projectId: input.project.id,
      projectRootPath: input.project.rootPath,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const lexicalRetrieval = await this.retriever.retrieve({
      scan,
      query: input.message,
      requestedPaths,
      budget: {
        maxFiles: 8,
        maxTotalBytes: 36_000,
        maxContentScanFiles: 80,
        maxExcerpts: 8,
      },
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const initialAst = await this.astAnalyzer.analyze({
      candidates: lexicalRetrieval.candidates,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const initialRepositoryGraph = await this.buildRepositoryGraph(
      scan,
      initialAst,
      undefined,
      input.signal,
      diagnostics,
      false
    );
    const semanticRetrieval = await this.buildSemanticRetrieval(
      input,
      scan,
      lexicalRetrieval,
      initialAst,
      initialRepositoryGraph,
      requestedPaths,
      diagnostics
    );
    const retrieval = semanticRetrieval
      ? mergeSemanticRetrieval(lexicalRetrieval, semanticRetrieval)
      : lexicalRetrieval;
    const ast =
      retrieval === lexicalRetrieval
        ? initialAst
        : await this.astAnalyzer.analyze({
            candidates: retrieval.candidates,
            ...(input.signal ? { signal: input.signal } : {}),
          });
    const symbolIndex = await this.buildSymbolIndex(input, retrieval.candidates, ast, diagnostics);
    const repositoryGraph = await this.buildRepositoryGraph(
      scan,
      ast,
      symbolIndex,
      input.signal,
      diagnostics
    );
    const graphContext = repositoryGraph
      ? await this.buildGraphContext(input, scan, retrieval, repositoryGraph, diagnostics)
      : undefined;
    const packedContext = this.buildPackedContext(
      input,
      retrieval,
      ast,
      symbolIndex,
      graphContext,
      semanticRetrieval,
      diagnostics
    );
    const explicitIntents = this.parseExplicitIntents(input.message, diagnostics);
    const intents =
      explicitIntents.length > 0
        ? this.validateExplicitIntents(
            explicitIntents,
            retrieval.candidates,
            ast,
            symbolIndex,
            repositoryGraph,
            diagnostics
          )
        : this.inferIntents(
            input.message,
            retrieval.candidates,
            ast,
            symbolIndex,
            diagnostics
          );
    const selectedPaths = intents
      .map((intent) => toRepositoryPath(intent.targetPath))
      .filter((path, index, all) => path && all.indexOf(path) === index);
    const expandedSelectedPaths = [
      ...selectedPaths,
      ...(graphContext?.paths ?? []),
    ].filter((path, index, all) => path && all.indexOf(path) === index);

    if (intents.length === 0 && !diagnostics.some((item) => item.severity === "error")) {
      diagnostics.push({
        code: "no_structural_intent",
        message:
          "O planner não encontrou uma alteração estrutural segura. Informe arquivo, símbolo e conteúdo da mudança.",
        severity: "error",
      });
    }

    return {
      intents,
      diagnostics,
      selectedPaths: expandedSelectedPaths,
      scan,
      retrieval,
      ast,
      ...(symbolIndex ? { symbolIndex } : {}),
      ...(repositoryGraph ? { repositoryGraph } : {}),
      ...(graphContext ? { graphContext } : {}),
      ...(semanticRetrieval ? { semanticRetrieval } : {}),
      ...(packedContext ? { packedContext } : {}),
    };
  }

  private async buildSymbolIndex(
    input: ChatCodingPlannerInput,
    candidates: readonly RepositoryRetrievalCandidate[],
    ast: AstAnalysisResult,
    diagnostics: ChatCodingPlannerDiagnostic[]
  ): Promise<SymbolIndexResult | undefined> {
    if (!this.symbolIndex) return undefined;
    try {
      return await this.symbolIndex.buildIndex({
        projectRootPath: input.project.rootPath,
        candidates,
        ast,
        ...(input.signal ? { signal: input.signal } : {}),
      });
    } catch (err) {
      diagnostics.push({
        code: "symbol_index_unavailable",
        message:
          err instanceof Error
            ? err.message
            : "Symbol index unavailable for this chat planning turn.",
        severity: "warning",
      });
      return undefined;
    }
  }

  private async buildRepositoryGraph(
    scan: RepositoryScanSnapshot,
    ast: AstAnalysisResult,
    symbolIndex: SymbolIndexResult | undefined,
    signal: AbortSignal | undefined,
    diagnostics: ChatCodingPlannerDiagnostic[],
    reportDiagnostics = true
  ): Promise<RepositoryGraphSnapshot | undefined> {
    if (!this.graphBuilder) return undefined;
    try {
      const graph = await this.graphBuilder.build({
        scan,
        ast,
        ...(symbolIndex ? { symbolIndex } : {}),
        ...(signal ? { signal } : {}),
      });
      if (reportDiagnostics && graph.status !== "complete") {
        diagnostics.push({
          code: "repository_graph_partial",
          message: `Repository graph disponível com status ${graph.status}; o planner manterá fallback lexical/símbolos.`,
          severity: "warning",
        });
      }
      return graph;
    } catch (err) {
      if (reportDiagnostics) {
        diagnostics.push({
          code: "repository_graph_unavailable",
          message:
            err instanceof Error
              ? err.message
              : "Repository graph unavailable for this chat planning turn.",
          severity: "warning",
        });
      }
      return undefined;
    }
  }

  private async buildGraphContext(
    input: ChatCodingPlannerInput,
    scan: RepositoryScanSnapshot,
    retrieval: RepositoryRetrievalResult,
    graph: RepositoryGraphSnapshot,
    diagnostics: ChatCodingPlannerDiagnostic[]
  ): Promise<RepositoryGraphNeighborhood | undefined> {
    if (!this.graphRetrieval) return undefined;
    try {
      const result = await this.graphRetrieval.buildContext({
        graph,
        scan,
        retrieval,
        query: input.message,
        requestedPaths: extractRepositoryExplicitPaths(input.message),
        maxDepth: 2,
        nodeBudget: 40,
        maxRelatedFiles: 6,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      for (const note of result.notes) {
        diagnostics.push({
          code: "repository_graph_context",
          message: note,
          severity: "info",
        });
      }
      return result.neighborhood;
    } catch (err) {
      diagnostics.push({
        code: "repository_graph_context_unavailable",
        message:
          err instanceof Error
            ? err.message
            : "Graph-aware retrieval unavailable for this planning turn.",
        severity: "warning",
      });
      return undefined;
    }
  }

  private async buildSemanticRetrieval(
    input: ChatCodingPlannerInput,
    scan: RepositoryScanSnapshot,
    lexicalRetrieval: RepositoryRetrievalResult,
    ast: AstAnalysisResult,
    graph: RepositoryGraphSnapshot | undefined,
    requestedPaths: readonly string[],
    diagnostics: ChatCodingPlannerDiagnostic[]
  ): Promise<SemanticRetrievalResult | undefined> {
    if (!this.semanticRetrieval) return undefined;
    try {
      const result = await this.semanticRetrieval.retrieve({
        query: input.message,
        scan,
        lexicalRetrieval,
        ast,
        requestedPaths,
        ...(graph ? { graph } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      });
      for (const note of result.notes) {
        diagnostics.push({
          code: "semantic_retrieval",
          message: note,
          severity: result.status === "unavailable" ? "warning" : "info",
        });
      }
      return result;
    } catch (err) {
      diagnostics.push({
        code: "semantic_retrieval_unavailable",
        message:
          err instanceof Error
            ? err.message
            : "Semantic retrieval unavailable for this planning turn.",
        severity: "warning",
      });
      return undefined;
    }
  }

  private buildPackedContext(
    input: ChatCodingPlannerInput,
    retrieval: RepositoryRetrievalResult,
    ast: AstAnalysisResult,
    symbolIndex: SymbolIndexResult | undefined,
    graphContext: RepositoryGraphNeighborhood | undefined,
    semanticRetrieval: SemanticRetrievalResult | undefined,
    diagnostics: ChatCodingPlannerDiagnostic[]
  ) {
    if (!this.contextBudgeter || !this.contextBudget) return undefined;
    try {
      const packed = this.contextBudgeter.pack({
        request: input.message,
        budget: this.contextBudget,
        retrieval,
        ast,
        ...(symbolIndex ? { symbolIndex } : {}),
        ...(graphContext ? { graphContext } : {}),
        ...(semanticRetrieval ? { semanticRetrieval } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      });
      for (const diagnostic of packed.diagnostics) {
        diagnostics.push({
          code: "context_budget",
          message: diagnostic,
          severity: "info",
        });
      }
      return packed;
    } catch (err) {
      diagnostics.push({
        code: "context_budget_unavailable",
        message:
          err instanceof Error
            ? err.message
            : "Context budget unavailable for this planning turn.",
        severity: "warning",
      });
      return undefined;
    }
  }

  private parseExplicitIntents(
    message: string,
    diagnostics: ChatCodingPlannerDiagnostic[]
  ): StructuralPatchIntent[] {
    const parsed: StructuralPatchIntent[] = [];
    for (const block of extractChatCodeBlocks(message)) {
      if (block.language && !["json", "jsonc"].includes(block.language.toLowerCase())) {
        continue;
      }
      const raw = safeJsonParse(block.code);
      if (!raw) continue;
      const maybeIntents = Array.isArray(raw)
        ? raw
        : isRecord(raw)
          ? raw["structuralPatchIntents"] ?? raw["intents"]
          : undefined;
      if (!Array.isArray(maybeIntents)) continue;
      for (const item of maybeIntents) {
        const result = StructuralPatchIntentSchema.safeParse(item);
        if (result.success) {
          parsed.push(result.data);
          continue;
        }
        diagnostics.push({
          code: "invalid_structural_intent",
          message: result.error.issues[0]?.message ?? "Intent estrutural inválida.",
          severity: "error",
        });
      }
    }
    return parsed;
  }

  private validateExplicitIntents(
    intents: readonly StructuralPatchIntent[],
    candidates: readonly RepositoryRetrievalCandidate[],
    ast: AstAnalysisResult,
    symbolIndex: SymbolIndexResult | undefined,
    repositoryGraph: RepositoryGraphSnapshot | undefined,
    diagnostics: ChatCodingPlannerDiagnostic[]
  ): StructuralPatchIntent[] {
    const byPath = evidenceByPath(candidates, ast);
    const accepted: StructuralPatchIntent[] = [];
    for (const intent of intents) {
      const targetPath = toRepositoryPath(intent.targetPath);
      const evidence = byPath.get(targetPath);
      if (!evidence) {
        const graphDiagnostic = graphConnectivityDiagnostic(
          intent,
          repositoryGraph,
          this.graphRetrieval
        );
        diagnostics.push({
          code: graphDiagnostic?.code ?? "target_not_retrieved",
          message:
            graphDiagnostic?.message ??
            `O arquivo ${targetPath} não foi recuperado pelo contexto do repositório.`,
          severity: "error",
          path: targetPath,
        });
        continue;
      }
      const symbolDiagnostic = validateSymbolIntent(intent, evidence.document);
      if (symbolDiagnostic) {
        diagnostics.push(symbolDiagnostic);
        continue;
      }
      const renameDiagnostic = validateRenameIntent(intent, symbolIndex);
      if (renameDiagnostic) {
        diagnostics.push(renameDiagnostic);
        continue;
      }
      accepted.push(
        StructuralPatchIntentSchema.parse({
          ...intent,
          targetPath,
        })
      );
    }
    return accepted;
  }

  private inferIntents(
    message: string,
    candidates: readonly RepositoryRetrievalCandidate[],
    ast: AstAnalysisResult,
    symbolIndex: SymbolIndexResult | undefined,
    diagnostics: ChatCodingPlannerDiagnostic[]
  ): StructuralPatchIntent[] {
    if (hasRenameRequest(message)) {
      diagnostics.push({
        code: "global_rename_requires_explicit_review",
        message:
          "Renomeações exigem resolução completa de referências e confirmação explícita; o planner não aplica rename global automaticamente.",
        severity: "error",
      });
      if (symbolIndex?.status) {
        diagnostics.push({
          code: "symbol_index_status",
          message: `Symbol index disponível com status ${symbolIndex.status} e ${symbolIndex.summary.indexedSymbolCount} símbolo(s) indexado(s).`,
          severity: "info",
        });
      }
      return [];
    }

    const codeBlock = extractChatCodeBlocks(message).find((block) =>
      isLikelyCodeBlock(block.language, block.code)
    );
    if (!codeBlock) {
      diagnostics.push({
        code: "missing_code_block",
        message:
          "Para evitar edição inventada, informe o novo trecho em um bloco de código ou envie StructuralPatchIntent explícito.",
        severity: "error",
      });
      return [];
    }

    const evidence = this.resolveTargetEvidence(message, candidates, ast);
    if (!evidence) {
      diagnostics.push({
        code: "target_not_resolved",
        message:
          "Não foi possível resolver um arquivo AST único para a alteração. Cite o caminho exato do arquivo.",
        severity: "error",
      });
      return [];
    }

    const explicitSymbolName = inferSymbolNameFromMessage(message);
    const replacementSymbol = inferSymbolFromContent(codeBlock.code);
    const symbolName = explicitSymbolName ?? replacementSymbol?.name;
    const intentKind = inferOperationKind(message, Boolean(symbolName));

    if (intentKind === "delete") {
      const targetSymbol = this.resolveTargetSymbol(evidence.document, symbolName);
      if (!targetSymbol) {
        diagnostics.push({
          code: "target_symbol_not_resolved",
          message:
            "A remoção estrutural precisa de um símbolo único. Cite a função, classe, componente ou export.",
          severity: "error",
          path: evidence.candidate.path,
        });
        return [];
      }
      return [
        StructuralPatchIntentSchema.parse({
          id: this.idGenerator(),
          kind: "delete",
          targetPath: evidence.candidate.path,
          targetSymbolName: targetSymbol.name,
          targetSymbolKind: targetSymbol.kind,
          rationale: "Pedido de chat convertido para remoção estrutural.",
        }),
      ];
    }

    if (intentKind === "insert") {
      return [
        StructuralPatchIntentSchema.parse({
          id: this.idGenerator(),
          kind: "insert",
          targetPath: evidence.candidate.path,
          position: "file_end",
          content: ensureTrailingNewline(codeBlock.code.trim()),
          rationale: "Pedido de chat convertido para inserção estrutural.",
        }),
      ];
    }

    const targetSymbol = this.resolveTargetSymbol(evidence.document, symbolName);
    if (!targetSymbol) {
      diagnostics.push({
        code: "target_symbol_not_resolved",
        message:
          "A substituição estrutural precisa de um símbolo único. Cite o nome do componente, função, classe, tipo ou interface.",
        severity: "error",
        path: evidence.candidate.path,
      });
      return [];
    }

    return [
      StructuralPatchIntentSchema.parse({
        id: this.idGenerator(),
        kind: "replace",
        targetPath: evidence.candidate.path,
        targetSymbolId: targetSymbol.id,
        targetSymbolName: targetSymbol.name,
        targetSymbolKind: targetSymbol.kind,
        content: ensureTrailingNewline(codeBlock.code.trim()),
        rationale: "Pedido de chat convertido para substituição estrutural.",
      }),
    ];
  }

  private resolveTargetEvidence(
    message: string,
    candidates: readonly RepositoryRetrievalCandidate[],
    ast: AstAnalysisResult
  ): PlannerEvidence | null {
    const byPath = evidenceByPath(candidates, ast);
    const explicitPaths = extractRepositoryExplicitPaths(message)
      .map(toRepositoryPath)
      .filter(Boolean);
    for (const path of explicitPaths) {
      const evidence = byPath.get(path);
      if (evidence?.document.parseStatus === "parsed") return evidence;
    }

    const parsed = [...byPath.values()]
      .filter((item) => item.document.parseStatus === "parsed")
      .sort((left, right) => right.candidate.score - left.candidate.score);
    return parsed[0] ?? null;
  }

  private resolveTargetSymbol(
    document: AstDocument,
    preferredName: string | undefined
  ): AstSymbol | null {
    const editable = document.symbols.filter(isEditableSymbol);
    if (preferredName) {
      const exact = editable.filter(
        (symbol) => symbol.name.toLowerCase() === preferredName.toLowerCase()
      );
      if (exact.length === 1) return exact[0] ?? null;
    }
    if (editable.length === 1) return editable[0] ?? null;
    const components = editable.filter((symbol) => symbol.kind === "component");
    if (components.length === 1) return components[0] ?? null;
    return null;
  }
}

function evidenceByPath(
  candidates: readonly RepositoryRetrievalCandidate[],
  ast: AstAnalysisResult
): Map<string, PlannerEvidence> {
  const documents = new Map(ast.documents.map((document) => [document.path, document]));
  const entries = candidates
    .map((candidate) => {
      const document = documents.get(candidate.path);
      return document ? [candidate.path, { candidate, document }] : null;
    })
    .filter((entry): entry is [string, PlannerEvidence] => entry !== null);
  return new Map(entries);
}

function validateSymbolIntent(
  intent: StructuralPatchIntent,
  document: AstDocument
): ChatCodingPlannerDiagnostic | null {
  if (!["replace", "delete", "rename_local", "update_export"].includes(intent.kind)) {
    return null;
  }
  const matched = document.symbols.filter((symbol) => {
    if (intent.targetSymbolId) return symbol.id === intent.targetSymbolId;
    if (intent.targetSymbolName) {
      return symbol.name.toLowerCase() === intent.targetSymbolName.toLowerCase();
    }
    return false;
  });
  if (matched.length === 1) return null;
  return {
    code: "target_symbol_not_resolved",
    message: `O símbolo alvo em ${intent.targetPath} não foi encontrado de forma única.`,
    severity: "error",
    path: intent.targetPath,
  };
}

function validateRenameIntent(
  intent: StructuralPatchIntent,
  symbolIndex: SymbolIndexResult | undefined
): ChatCodingPlannerDiagnostic | null {
  if (intent.kind !== "rename_local") return null;
  if (!symbolIndex || symbolIndex.status === "unavailable" || symbolIndex.status === "failed") {
    return {
      code: "rename_requires_symbol_index",
      message:
        "rename_local foi bloqueado porque o índice LSP/símbolos não está disponível para medir impacto.",
      severity: "error",
      path: intent.targetPath,
    };
  }
  const entry = findSymbolIndexEntry(symbolIndex, intent);
  if (!entry || entry.referenceResolution !== "complete") {
    return {
      code: "rename_references_unresolved",
      message:
        "rename_local foi bloqueado porque as referências do símbolo não foram resolvidas completamente.",
      severity: "error",
      path: intent.targetPath,
    };
  }
  if (entry.referenceCount > 1) {
    return {
      code: "rename_has_external_references",
      message:
        "rename_local alteraria apenas a declaração, mas o índice encontrou referências adicionais. Use uma spec dedicada de rename global.",
      severity: "error",
      path: intent.targetPath,
    };
  }
  return null;
}

function graphConnectivityDiagnostic(
  intent: StructuralPatchIntent,
  repositoryGraph: RepositoryGraphSnapshot | undefined,
  graphRetrieval: GraphAwareRetrievalPort | undefined
): { code: string; message: string } | null {
  if (!repositoryGraph || !graphRetrieval) return null;
  const [connectivity] = graphRetrieval.assessIntentConnectivity({
    graph: repositoryGraph,
    intents: [intent],
  });
  if (!connectivity) return null;
  if (connectivity.status === "connected") {
    return {
      code: "target_not_retrieved_but_graph_connected",
      message:
        `O alvo ${connectivity.targetPath} existe no grafo, mas não entrou no contexto editável. ` +
        `Caminhos relacionados: ${connectivity.relatedPaths.join(", ") || "nenhum"}.`,
    };
  }
  return {
    code:
      connectivity.status === "disconnected"
        ? "disconnected_new_file_edit"
        : "target_not_retrieved",
    message: connectivity.reason,
  };
}

function findSymbolIndexEntry(
  symbolIndex: SymbolIndexResult,
  intent: StructuralPatchIntent
): SymbolIndexEntry | undefined {
  return symbolIndex.entries.find((entry) => {
    if (entry.symbol.path !== intent.targetPath) return false;
    if (intent.targetSymbolId) return entry.symbol.id === intent.targetSymbolId;
    if (intent.targetSymbolName) {
      return entry.symbol.name.toLowerCase() === intent.targetSymbolName.toLowerCase();
    }
    return false;
  });
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEditableSymbol(symbol: AstSymbol): boolean {
  return [
    "component",
    "function",
    "class",
    "method",
    "variable",
    "type",
    "interface",
  ].includes(symbol.kind);
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Chat coding planning cancelled.");
  error.name = "AbortError";
  throw error;
}
