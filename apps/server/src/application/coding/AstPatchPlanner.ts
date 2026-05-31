import { randomUUID } from "node:crypto";
import {
  AstAnalysisResultSchema,
  CodingRuntimeArtifactRefSchema,
  RepositoryRetrievalResultSchema,
  StructuralPatchIntentSchema,
  StructuralPatchPlanSchema,
  type AstDiagnostic,
  type StructuralPatchFileChange,
  type StructuralPatchIntent,
  type StructuralPatchOperation,
  type StructuralPatchPlan,
} from "@u-build/shared";
import type {
  CodingRuntimeStepContext,
  CodingRuntimeStepResult,
  PatchPlannerInput,
  PatchPlannerPort,
} from "../ports/index.js";
import { DiffBuilder, combineDiffStats } from "./DiffBuilder.js";
import {
  type FileDraft,
  adjustRange,
  applyTextEdit,
  buildImportText,
  byteRange,
  diagnostic,
  expandToWholeLine,
  findImportSymbol,
  findTargetSymbol,
  getDraft,
  hasDeleteOperation,
  insertionByteForPosition,
  normalizeInsertedContent,
  operationFromIntent,
  throwIfAborted,
} from "./StructuralPatchEditUtils.js";

export class AstPatchPlanner implements PatchPlannerPort {
  constructor(
    private readonly diffBuilder = new DiffBuilder(),
    private readonly now: () => Date = () => new Date(),
    private readonly idGenerator: () => string = randomUUID
  ) {}

  async plan(input: PatchPlannerInput): Promise<StructuralPatchPlan> {
    throwIfAborted(input.signal);
    const diagnostics: AstDiagnostic[] = [];
    const drafts = new Map<string, FileDraft>();
    const candidates = new Map(input.candidates.map((candidate) => [candidate.path, candidate]));
    const documents = new Map(input.ast.documents.map((document) => [document.path, document]));

    for (const intent of input.intents) {
      throwIfAborted(input.signal);
      const parsedIntent = StructuralPatchIntentSchema.parse(intent);
      const candidate = candidates.get(parsedIntent.targetPath);
      const document = documents.get(parsedIntent.targetPath);
      if (!candidate || !document) {
        diagnostics.push(
          diagnostic(parsedIntent.targetPath, "unsupported_edit_target", "Patch target was not present in retrieval and AST evidence.")
        );
        continue;
      }
      if (document.parseStatus !== "parsed") {
        diagnostics.push(
          diagnostic(parsedIntent.targetPath, "invalid_ast_document", "Patch target cannot be edited because AST parsing did not succeed.")
        );
        continue;
      }
      const draft = getDraft(drafts, candidate, document);
      const operation = this.applyIntent(draft, parsedIntent, diagnostics);
      if (operation) draft.operations.push(operation);
    }

    const fileChanges = [...drafts.values()]
      .filter((draft) => draft.content !== draft.candidate.content || hasDeleteOperation(draft))
      .map((draft) => this.fileChangeFromDraft(draft));
    const hasErrors = diagnostics.some((item) => item.severity === "error");
    const diffStats = combineDiffStats(fileChanges.map((change) => change.diffStats));
    const plan = StructuralPatchPlanSchema.parse({
      id: this.idGenerator(),
      ...(input.task?.id ? { taskId: input.task.id } : {}),
      status: hasErrors || fileChanges.length === 0 ? "blocked" : "planned",
      fileChanges,
      diagnostics,
      summary: {
        fileCount: fileChanges.length,
        operationCount: fileChanges.reduce(
          (total, change) => total + change.operations.length,
          0
        ),
        diagnosticCount: diagnostics.length,
        diffStats,
      },
      createdAt: this.now().toISOString(),
    });
    return plan;
  }

  async execute(context: CodingRuntimeStepContext): Promise<CodingRuntimeStepResult> {
    const astArtifact = context.artifacts
      .filter((artifact) => artifact.kind === "ast_analysis")
      .at(-1);
    const retrievalArtifact = context.artifacts
      .filter((artifact) => artifact.kind === "retrieval")
      .at(-1);
    if (!astArtifact?.payload || !retrievalArtifact?.payload) {
      throw new Error("Coding task cannot plan a patch without retrieval and AST artifacts.");
    }

    const ast = AstAnalysisResultSchema.parse(astArtifact.payload);
    const retrieval = RepositoryRetrievalResultSchema.parse(
      retrievalArtifact.payload
    );
    const rawIntents = Array.isArray(context.task.metadata["structuralPatchIntents"])
      ? context.task.metadata["structuralPatchIntents"]
      : [];
    const intents = rawIntents.map((intent) => StructuralPatchIntentSchema.parse(intent));
    const plan = await this.plan({
      task: context.task,
      ast,
      candidates: retrieval.candidates ?? [],
      intents,
      signal: context.signal,
    });

    return {
      message: `Patch planning finished with status ${plan.status}.`,
      artifact: CodingRuntimeArtifactRefSchema.parse({
        id: this.idGenerator(),
        kind: "patch_plan",
        label: "Structural patch plan",
        status: plan.status === "planned" ? "ready" : "failed",
        createdAt: this.now().toISOString(),
        summary: `${plan.summary.operationCount} operation(s), ${plan.summary.fileCount} file(s), ${plan.summary.diagnosticCount} diagnostic(s).`,
        payload: plan,
      }),
      metadata: {
        status: plan.status,
        fileCount: plan.summary.fileCount,
        operationCount: plan.summary.operationCount,
        diagnosticCount: plan.summary.diagnosticCount,
      },
    };
  }

  private applyIntent(
    draft: FileDraft,
    intent: StructuralPatchIntent,
    diagnostics: AstDiagnostic[]
  ): StructuralPatchOperation | null {
    switch (intent.kind) {
      case "add_import":
        return this.addImport(draft, intent, diagnostics);
      case "remove_import":
        return this.removeImport(draft, intent, diagnostics);
      case "replace":
      case "update_export":
        return this.replaceSymbol(draft, intent, diagnostics);
      case "delete":
        return this.deleteSymbol(draft, intent, diagnostics);
      case "insert":
        return this.insertContent(draft, intent, diagnostics);
      case "rename_local":
        return this.renameLocal(draft, intent, diagnostics);
    }
  }

  private addImport(
    draft: FileDraft,
    intent: StructuralPatchIntent,
    diagnostics: AstDiagnostic[]
  ): StructuralPatchOperation | null {
    const importText = buildImportText(intent);
    if (!importText) {
      diagnostics.push(
        diagnostic(intent.targetPath, "invalid_import_intent", "add_import requires importSource plus default, namespace or named import.")
      );
      return null;
    }
    if (draft.content.includes(importText.trim())) {
      diagnostics.push(
        diagnostic(intent.targetPath, "duplicate_import", "Requested import already exists.")
      );
      return null;
    }
    const importSymbols = draft.document.symbols.filter(
      (symbol) => symbol.kind === "import"
    );
    const insertionByte =
      importSymbols.length > 0
        ? Math.max(...importSymbols.map((symbol) => symbol.range.endByte))
        : 0;
    const insertAt = adjustRange({ startByte: insertionByte, endByte: insertionByte }, draft.delta);
    const prefix = insertionByte > 0 ? "\n" : "";
    const suffix = insertionByte === 0 ? "\n" : "";
    const content = `${prefix}${importText}${suffix}`;
    applyTextEdit(draft, insertAt.startByte, insertAt.endByte, content);
    return operationFromIntent(intent, {
      range: byteRange(insertionByte, insertionByte, draft.document),
      afterSnippet: content,
    });
  }

  private removeImport(
    draft: FileDraft,
    intent: StructuralPatchIntent,
    diagnostics: AstDiagnostic[]
  ): StructuralPatchOperation | null {
    const symbol = findImportSymbol(draft.document, intent);
    if (!symbol) {
      diagnostics.push(
        diagnostic(intent.targetPath, "unsupported_edit_target", "remove_import could not locate the requested import.")
      );
      return null;
    }
    const range = expandToWholeLine(draft.candidate.content, symbol.range);
    const adjusted = adjustRange(range, draft.delta);
    const beforeSnippet = draft.content.slice(adjusted.startByte, adjusted.endByte);
    applyTextEdit(draft, adjusted.startByte, adjusted.endByte, "");
    return operationFromIntent(intent, {
      targetSymbol: symbol,
      range,
      beforeSnippet,
      afterSnippet: "",
    });
  }

  private replaceSymbol(
    draft: FileDraft,
    intent: StructuralPatchIntent,
    diagnostics: AstDiagnostic[]
  ): StructuralPatchOperation | null {
    if (intent.content === undefined) {
      diagnostics.push(
        diagnostic(intent.targetPath, "missing_replacement_content", `${intent.kind} requires replacement content.`)
      );
      return null;
    }
    const symbol = findTargetSymbol(draft.document, intent);
    if (!symbol) {
      diagnostics.push(
        diagnostic(intent.targetPath, "unsupported_edit_target", `${intent.kind} could not locate a unique target symbol.`)
      );
      return null;
    }
    const adjusted = adjustRange(symbol.range, draft.delta);
    const beforeSnippet = draft.content.slice(adjusted.startByte, adjusted.endByte);
    applyTextEdit(draft, adjusted.startByte, adjusted.endByte, intent.content);
    return operationFromIntent(intent, {
      targetSymbol: symbol,
      range: symbol.range,
      beforeSnippet,
      afterSnippet: intent.content,
    });
  }

  private deleteSymbol(
    draft: FileDraft,
    intent: StructuralPatchIntent,
    diagnostics: AstDiagnostic[]
  ): StructuralPatchOperation | null {
    const symbol = findTargetSymbol(draft.document, intent);
    if (!symbol) {
      diagnostics.push(
        diagnostic(intent.targetPath, "unsupported_edit_target", "delete could not locate a unique target symbol.")
      );
      return null;
    }
    const range = expandToWholeLine(draft.candidate.content, symbol.range);
    const adjusted = adjustRange(range, draft.delta);
    const beforeSnippet = draft.content.slice(adjusted.startByte, adjusted.endByte);
    applyTextEdit(draft, adjusted.startByte, adjusted.endByte, "");
    return operationFromIntent(intent, {
      targetSymbol: symbol,
      range,
      beforeSnippet,
      afterSnippet: "",
    });
  }

  private insertContent(
    draft: FileDraft,
    intent: StructuralPatchIntent,
    diagnostics: AstDiagnostic[]
  ): StructuralPatchOperation | null {
    if (intent.content === undefined) {
      diagnostics.push(
        diagnostic(intent.targetPath, "missing_insert_content", "insert requires content.")
      );
      return null;
    }
    const position = intent.position ?? "file_end";
    const target = findTargetSymbol(draft.document, intent);
    if (
      (position === "before_symbol" || position === "after_symbol") &&
      !target
    ) {
      diagnostics.push(
        diagnostic(intent.targetPath, "unsupported_edit_target", `${position} requires a target symbol.`)
      );
      return null;
    }
    const startByte = insertionByteForPosition(
      draft.document,
      position,
      target
    );
    const adjusted = adjustRange({ startByte, endByte: startByte }, draft.delta);
    const content = normalizeInsertedContent(draft.content, adjusted.startByte, intent.content);
    applyTextEdit(draft, adjusted.startByte, adjusted.endByte, content);
    return operationFromIntent(intent, {
      targetSymbol: target,
      range: byteRange(startByte, startByte, draft.document),
      afterSnippet: content,
    });
  }

  private renameLocal(
    draft: FileDraft,
    intent: StructuralPatchIntent,
    diagnostics: AstDiagnostic[]
  ): StructuralPatchOperation | null {
    if (!intent.newName) {
      diagnostics.push(
        diagnostic(intent.targetPath, "missing_new_name", "rename_local requires newName.")
      );
      return null;
    }
    const symbol = findTargetSymbol(draft.document, intent);
    if (!symbol?.nameRange) {
      diagnostics.push(
        diagnostic(intent.targetPath, "unsupported_edit_target", "rename_local requires a symbol name range.")
      );
      return null;
    }
    const adjusted = adjustRange(symbol.nameRange, draft.delta);
    const beforeSnippet = draft.content.slice(adjusted.startByte, adjusted.endByte);
    applyTextEdit(draft, adjusted.startByte, adjusted.endByte, intent.newName);
    return operationFromIntent(intent, {
      targetSymbol: symbol,
      range: symbol.nameRange,
      beforeSnippet,
      afterSnippet: intent.newName,
    });
  }

  private fileChangeFromDraft(draft: FileDraft): StructuralPatchFileChange {
    const diff = this.diffBuilder.build({
      targetPath: draft.path,
      beforeContent: draft.candidate.content,
      afterContent: draft.content,
    });
    return {
      targetPath: draft.path,
      changeType: "update",
      beforeContent: draft.candidate.content,
      afterContent: draft.content,
      diff: diff.diff,
      diffStats: diff.stats,
      preconditions: [
        {
          path: draft.path,
          kind: "content_hash",
          expected: draft.document.contentHash,
        },
      ],
      operations: draft.operations,
    };
  }
}

export function compileStructuralPatchPlanToCodeChangeOperations(
  plan: StructuralPatchPlan
) {
  return plan.fileChanges.map((change) => ({
    targetPath: change.targetPath,
    changeType: change.changeType,
    beforeContent: change.beforeContent,
    afterContent: change.afterContent,
    diff: change.diff,
    preconditions: change.preconditions,
    metadata: {
      patchStrategy: "structural_ast",
      structuralOperationCount: change.operations.length,
      structuralIntentKinds: [
        ...new Set(change.operations.map((operation) => operation.kind)),
      ],
      structuralTargets: change.operations.map((operation) => ({
        kind: operation.kind,
        targetSymbolName: operation.targetSymbolName ?? null,
        targetSymbolKind: operation.targetSymbolKind ?? null,
      })),
    },
  }));
}

export { contentHash } from "./StructuralPatchEditUtils.js";
