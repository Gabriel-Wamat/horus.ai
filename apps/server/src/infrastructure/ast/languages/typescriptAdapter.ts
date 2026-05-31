import { createHash } from "node:crypto";
import { extname } from "node:path";
import { createRequire } from "node:module";
import Parser from "tree-sitter";
import {
  AstDocumentSchema,
  type AstDiagnostic,
  type AstDocument,
  type AstRange,
  type AstSymbol,
  type AstSymbolKind,
  type RepositoryRetrievalCandidate,
} from "@u-build/shared";
import type { TreeSitterLanguageAdapter } from "./TreeSitterLanguageAdapter.js";

const require = createRequire(import.meta.url);
const typeScriptGrammar = require("tree-sitter-typescript") as {
  typescript: unknown;
  tsx: unknown;
};

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SUPPORTED_LANGUAGES = new Set(["typescript", "javascript"]);
const MAX_SYMBOLS_PER_DOCUMENT = 500;
const MAX_DIAGNOSTICS_PER_DOCUMENT = 50;

type SyntaxNode = Parser.SyntaxNode;

export class TypeScriptTreeSitterAdapter implements TreeSitterLanguageAdapter {
  readonly id = "tree-sitter-typescript";

  supports(candidate: RepositoryRetrievalCandidate): boolean {
    return (
      SUPPORTED_LANGUAGES.has(candidate.language) ||
      SUPPORTED_EXTENSIONS.has(extname(candidate.path).toLowerCase())
    );
  }

  parse(
    candidate: RepositoryRetrievalCandidate,
    signal?: AbortSignal
  ): AstDocument {
    throwIfAborted(signal);
    const parser = new Parser();
    parser.setLanguage(this.resolveGrammar(candidate.path));
    const tree = parser.parse(candidate.content);
    const root = tree.rootNode;
    const diagnostics = root.hasError
      ? collectSyntaxDiagnostics(candidate.path, root)
      : [];
    const symbols = root.hasError
      ? []
      : extractSymbols({
          path: candidate.path,
          language: candidate.language,
          root,
        });
    return AstDocumentSchema.parse({
      path: candidate.path,
      language: candidate.language,
      contentHash: hashContent(candidate.content),
      bytes: Buffer.byteLength(candidate.content, "utf-8"),
      lineCount: Math.max(1, candidate.content.split("\n").length),
      parseStatus: root.hasError ? "parse_error" : "parsed",
      rootType: root.type,
      symbols,
      diagnostics,
    });
  }

  private resolveGrammar(path: string): unknown {
    const extension = extname(path).toLowerCase();
    if (extension === ".tsx") return typeScriptGrammar.tsx;
    if (extension === ".jsx") return typeScriptGrammar.tsx;
    return typeScriptGrammar.typescript;
  }
}

function extractSymbols(input: {
  readonly path: string;
  readonly language: string;
  readonly root: SyntaxNode;
}): AstSymbol[] {
  const symbols: AstSymbol[] = [];

  const visit = (node: SyntaxNode, parentId?: string): void => {
    if (symbols.length >= MAX_SYMBOLS_PER_DOCUMENT) return;
    const created = symbolFromNode(input.path, input.language, node, parentId);
    const nextParentId = created?.id ?? parentId;
    if (created) symbols.push(created);
    for (const child of node.namedChildren) {
      visit(child, nextParentId);
      if (symbols.length >= MAX_SYMBOLS_PER_DOCUMENT) return;
    }
  };

  visit(input.root);
  return symbols;
}

function symbolFromNode(
  path: string,
  language: string,
  node: SyntaxNode,
  parentId?: string
): AstSymbol | null {
  switch (node.type) {
    case "import_statement":
      return importSymbol(path, language, node, parentId);
    case "export_statement":
      return exportSymbol(path, language, node, parentId);
    case "function_declaration":
    case "generator_function_declaration":
      return namedDeclarationSymbol(path, language, node, "function", parentId);
    case "class_declaration":
      return namedDeclarationSymbol(path, language, node, "class", parentId);
    case "method_definition":
    case "method_signature":
      return namedDeclarationSymbol(path, language, node, "method", parentId);
    case "interface_declaration":
      return namedDeclarationSymbol(path, language, node, "interface", parentId);
    case "type_alias_declaration":
      return namedDeclarationSymbol(path, language, node, "type", parentId);
    case "variable_declarator":
      return variableSymbol(path, language, node, parentId);
    default:
      return null;
  }
}

function namedDeclarationSymbol(
  path: string,
  language: string,
  node: SyntaxNode,
  defaultKind: AstSymbolKind,
  parentId?: string
): AstSymbol | null {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;
  const name = nameNode.text.trim();
  if (!name) return null;
  const kind = refineCallableKind(name, defaultKind);
  return buildSymbol({
    path,
    language,
    node,
    name,
    kind,
    nameNode,
    ...(parentId ? { parentId } : {}),
  });
}

function variableSymbol(
  path: string,
  language: string,
  node: SyntaxNode,
  parentId?: string
): AstSymbol | null {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;
  const name = nameNode.text.trim();
  if (!name) return null;
  const valueNode = node.childForFieldName("value");
  const kind = refineCallableKind(
    name,
    valueNode && isCallableValue(valueNode) ? "function" : "variable"
  );
  return buildSymbol({
    path,
    language,
    node,
    name,
    kind,
    nameNode,
    ...(parentId ? { parentId } : {}),
    ...(valueNode?.type ? { detail: valueNode.type } : {}),
  });
}

function importSymbol(
  path: string,
  language: string,
  node: SyntaxNode,
  parentId?: string
): AstSymbol | null {
  const sourceNode = node.childForFieldName("source");
  const source = stripQuotes(sourceNode?.text ?? "");
  if (!source) return null;
  return buildSymbol({
    path,
    language,
    node,
    name: source,
    kind: "import",
    ...(parentId ? { parentId } : {}),
    importSource: source,
    detail: node.text.slice(0, 160),
  });
}

function exportSymbol(
  path: string,
  language: string,
  node: SyntaxNode,
  parentId?: string
): AstSymbol | null {
  const sourceNode = node.childForFieldName("source");
  const source = stripQuotes(sourceNode?.text ?? "");
  const declarationName = findFirstDeclarationName(node);
  const name = declarationName ?? source;
  if (!name) return null;
  return buildSymbol({
    path,
    language,
    node,
    name,
    kind: "export",
    ...(parentId ? { parentId } : {}),
    ...(source ? { importSource: source } : {}),
    exportKind: detectExportKind(node),
    detail: node.text.slice(0, 160),
  });
}

function buildSymbol(input: {
  readonly path: string;
  readonly language: string;
  readonly node: SyntaxNode;
  readonly name: string;
  readonly kind: AstSymbolKind;
  readonly nameNode?: SyntaxNode;
  readonly parentId?: string;
  readonly importSource?: string;
  readonly exportKind?: AstSymbol["exportKind"];
  readonly detail?: string;
}): AstSymbol {
  const id = symbolId(input.path, input.kind, input.name, input.node.startIndex);
  return {
    id,
    path: input.path,
    language: input.language,
    name: input.name,
    kind: input.kind,
    range: rangeFromNode(input.node),
    ...(input.nameNode ? { nameRange: rangeFromNode(input.nameNode) } : {}),
    ...(input.parentId ? { parentId: input.parentId } : {}),
    ...(input.importSource ? { importSource: input.importSource } : {}),
    ...(input.exportKind ? { exportKind: input.exportKind } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
  };
}

function collectSyntaxDiagnostics(
  path: string,
  root: SyntaxNode
): AstDiagnostic[] {
  const diagnostics: AstDiagnostic[] = [];
  const visit = (node: SyntaxNode): void => {
    if (diagnostics.length >= MAX_DIAGNOSTICS_PER_DOCUMENT) return;
    if (node.isError || node.isMissing) {
      diagnostics.push({
        path,
        code: node.isMissing ? "missing_node" : "parse_error",
        message: node.isMissing
          ? `Missing syntax node: ${node.type}.`
          : `Syntax error near node: ${node.type}.`,
        severity: "error",
        source: "tree-sitter",
        range: rangeFromNode(node),
      });
    }
    for (const child of node.namedChildren) {
      visit(child);
      if (diagnostics.length >= MAX_DIAGNOSTICS_PER_DOCUMENT) return;
    }
  };
  visit(root);
  if (diagnostics.length === 0) {
    diagnostics.push({
      path,
      code: "parse_error",
      message: "Tree-sitter reported a syntax error.",
      severity: "error",
      source: "tree-sitter",
      range: rangeFromNode(root),
    });
  }
  return diagnostics;
}

function findFirstDeclarationName(node: SyntaxNode): string | null {
  for (const child of node.namedChildren) {
    if (child.type === "variable_declaration" || child.type === "lexical_declaration") {
      const declarator = child.namedChildren.find(
        (candidate) => candidate.type === "variable_declarator"
      );
      const name = declarator?.childForFieldName("name")?.text.trim();
      if (name) return name;
    }
    const name = child.childForFieldName("name")?.text.trim();
    if (name) return name;
    const nested = findFirstDeclarationName(child);
    if (nested) return nested;
  }
  return null;
}

function detectExportKind(node: SyntaxNode): AstSymbol["exportKind"] {
  const text = node.text;
  if (/export\s+default/u.test(text)) return "default";
  if (/export\s+\*/u.test(text)) return "namespace";
  if (node.childForFieldName("source")) return "reexport";
  return "named";
}

function refineCallableKind(
  name: string,
  fallback: AstSymbolKind
): AstSymbolKind {
  if (/^use[A-Z0-9]/u.test(name)) return "hook";
  if (/^[A-Z]/u.test(name) && (fallback === "function" || fallback === "class")) {
    return "component";
  }
  return fallback;
}

function isCallableValue(node: SyntaxNode): boolean {
  return (
    node.type === "arrow_function" ||
    node.type === "function" ||
    node.type === "function_expression" ||
    node.type === "generator_function"
  );
}

function rangeFromNode(node: SyntaxNode): AstRange {
  return {
    startByte: node.startIndex,
    endByte: node.endIndex,
    startPosition: {
      row: node.startPosition.row,
      column: node.startPosition.column,
    },
    endPosition: {
      row: node.endPosition.row,
      column: node.endPosition.column,
    },
  };
}

function symbolId(
  path: string,
  kind: AstSymbolKind,
  name: string,
  startByte: number
): string {
  return createHash("sha256")
    .update(`${path}:${kind}:${name}:${startByte}`)
    .digest("hex")
    .slice(0, 24);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"`]/u, "").replace(/['"`]$/u, "");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Tree-sitter TypeScript parsing cancelled.");
  error.name = "AbortError";
  throw error;
}
