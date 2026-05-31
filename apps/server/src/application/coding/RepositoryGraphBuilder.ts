import { dirname, extname, join, normalize } from "node:path/posix";
import {
  RepositoryGraphSnapshotSchema,
  type AstAnalysisResult,
  type AstSymbol,
  type RepositoryFileEntry,
  type RepositoryGraphEdge,
  type RepositoryGraphExport,
  type RepositoryGraphImport,
  type RepositoryGraphNode,
  type RepositoryGraphPackageScope,
  type RepositoryGraphSnapshot,
  type RepositoryScanSnapshot,
  type SymbolIndexResult,
} from "@u-build/shared";
import type {
  RepositoryGraphBuildInput,
  RepositoryGraphBuilderPort,
} from "../ports/index.js";
import { dedupe, toRepositoryPath } from "./RepositoryAccessPolicy.js";

const RESOLVABLE_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
];

export class RepositoryGraphBuilder implements RepositoryGraphBuilderPort {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async build(input: RepositoryGraphBuildInput): Promise<RepositoryGraphSnapshot> {
    throwIfAborted(input.signal);
    const filesByPath = new Map(input.scan.files.map((file) => [file.path, file]));
    const nodes = new Map<string, RepositoryGraphNode>();
    const edges = new Map<string, RepositoryGraphEdge>();
    const imports: RepositoryGraphImport[] = [];
    const exports: RepositoryGraphExport[] = [];
    const packageScopes = buildPackageScopes(input.scan);
    const notes: string[] = [];

    for (const scope of packageScopes) {
      nodes.set(scope.id, {
        id: scope.id,
        kind: "package_scope",
        label: scope.name,
        packageName: scope.name,
        packageRoot: scope.rootPath,
      });
    }

    for (const file of input.scan.files) {
      throwIfAborted(input.signal);
      const packageScope = nearestPackageScope(file.path, packageScopes);
      nodes.set(fileNodeId(file.path), fileNode(file));
      if (packageScope) {
        addEdge(edges, {
          id: edgeId("in_package", fileNodeId(file.path), packageScope.id),
          kind: "in_package",
          sourceId: fileNodeId(file.path),
          targetId: packageScope.id,
          sourcePath: file.path,
          confidence: 1,
          reason: "Nearest package.json scope.",
        });
      }
    }

    const parsedDocuments = input.ast.documents.filter(
      (document) => document.parseStatus === "parsed"
    );
    const parsedPaths = new Set(parsedDocuments.map((document) => document.path));

    for (const document of parsedDocuments) {
      throwIfAborted(input.signal);
      if (!filesByPath.has(document.path)) {
        notes.push(`AST document ${document.path} was ignored because it is absent from scan.`);
        continue;
      }
      for (const symbol of document.symbols) {
        const symbolNode = graphSymbolNode(symbol);
        nodes.set(symbolNode.id, symbolNode);
        addEdge(edges, {
          id: edgeId("declares", fileNodeId(symbol.path), symbolNode.id),
          kind: "declares",
          sourceId: fileNodeId(symbol.path),
          targetId: symbolNode.id,
          sourcePath: symbol.path,
          targetPath: symbol.path,
          targetSymbolId: symbol.id,
          confidence: 1,
        });

        if (symbol.kind === "import" && symbol.importSource) {
          const resolved = resolveImportPath(symbol.path, symbol.importSource, filesByPath);
          const packageName = resolved
            ? undefined
            : packageNameFromImportSource(symbol.importSource);
          const graphImport: RepositoryGraphImport = {
            id: `import:${symbol.path}:${symbol.range.startByte}:${symbol.importSource}`,
            sourcePath: symbol.path,
            source: symbol.importSource,
            ...(resolved ? { resolvedTargetPath: resolved.path } : {}),
            ...(packageName ? { packageName } : {}),
            isTypeOnly: /^import\s+type\b/u.test(symbol.detail ?? ""),
            confidence: resolved ? resolved.confidence : packageName ? 0.65 : 0.35,
          };
          imports.push(graphImport);
          if (resolved) {
            addEdge(edges, {
              id: edgeId("imports", fileNodeId(symbol.path), fileNodeId(resolved.path), symbol.importSource),
              kind: "imports",
              sourceId: fileNodeId(symbol.path),
              targetId: fileNodeId(resolved.path),
              sourcePath: symbol.path,
              targetPath: resolved.path,
              sourceSymbolId: symbol.id,
              importSource: symbol.importSource,
              confidence: resolved.confidence,
              reason: "Resolved relative import.",
            });
          } else if (packageName) {
            const externalId = externalPackageNodeId(packageName);
            nodes.set(externalId, {
              id: externalId,
              kind: "external_package",
              label: packageName,
              packageName,
            });
            addEdge(edges, {
              id: edgeId("imports_external", fileNodeId(symbol.path), externalId, symbol.importSource),
              kind: "imports_external",
              sourceId: fileNodeId(symbol.path),
              targetId: externalId,
              sourcePath: symbol.path,
              importSource: symbol.importSource,
              confidence: 0.65,
              reason: "External package import.",
            });
          } else {
            notes.push(`Import not resolved: ${symbol.path} -> ${symbol.importSource}.`);
          }
        }

        if (symbol.kind === "export") {
          exports.push({
            id: `export:${symbol.path}:${symbol.range.startByte}:${symbol.name}`,
            sourcePath: symbol.path,
            symbolName: symbol.name,
            exportKind: symbol.exportKind ?? "named",
            ...(symbol.importSource ? { reexportSource: symbol.importSource } : {}),
            confidence: 0.85,
          });
          addEdge(edges, {
            id: edgeId("exports", fileNodeId(symbol.path), symbolNode.id),
            kind: "exports",
            sourceId: fileNodeId(symbol.path),
            targetId: symbolNode.id,
            sourcePath: symbol.path,
            targetPath: symbol.path,
            targetSymbolId: symbol.id,
            confidence: 0.85,
          });
        }
      }
    }

    addSymbolReferenceEdges(edges, nodes, input.symbolIndex);
    addRelatedTestEdges(edges, input.scan.files);

    const sortedNodes = sortNodes([...nodes.values()]);
    const sortedEdges = sortEdges([...edges.values()]);
    const sortedImports = imports.sort(compareImports);
    const sortedExports = exports.sort(compareExports);
    const disconnectedImportCount = sortedImports.filter(
      (item) => !item.resolvedTargetPath && !item.packageName
    ).length;

    const status =
      input.ast.status === "failed"
        ? "unavailable"
        : input.ast.status === "partial" ||
            disconnectedImportCount > 0 ||
            parsedPaths.size === 0
          ? "partial"
          : "complete";

    return RepositoryGraphSnapshotSchema.parse({
      projectRootPath: input.scan.projectRootPath,
      status,
      nodes: sortedNodes,
      edges: sortedEdges,
      imports: sortedImports,
      exports: sortedExports,
      packages: packageScopes,
      summary: {
        fileNodeCount: sortedNodes.filter((node) => node.kind === "file").length,
        symbolNodeCount: sortedNodes.filter((node) => node.kind === "symbol").length,
        packageScopeCount: packageScopes.length,
        importEdgeCount: sortedEdges.filter((edge) => edge.kind === "imports").length,
        externalImportEdgeCount: sortedEdges.filter(
          (edge) => edge.kind === "imports_external"
        ).length,
        relatedTestEdgeCount: sortedEdges.filter(
          (edge) => edge.kind === "related_test" || edge.kind === "tests"
        ).length,
        disconnectedImportCount,
      },
      notes: notes.filter(dedupe).sort((left, right) => left.localeCompare(right)),
      generatedAt: this.now().toISOString(),
    });
  }
}

function fileNode(file: RepositoryFileEntry): RepositoryGraphNode {
  return {
    id: fileNodeId(file.path),
    kind: "file",
    label: file.path,
    path: file.path,
    language: file.language,
    safety: file.safety,
  };
}

function graphSymbolNode(symbol: AstSymbol): RepositoryGraphNode {
  return {
    id: symbolNodeId(symbol.id),
    kind: "symbol",
    label: symbol.name,
    path: symbol.path,
    symbolId: symbol.id,
    symbolName: symbol.name,
    symbolKind: symbol.kind,
  };
}

function buildPackageScopes(
  scan: RepositoryScanSnapshot
): RepositoryGraphPackageScope[] {
  return scan.files
    .filter((file) => file.path.endsWith("package.json"))
    .map((file) => {
      const rootPath = dirname(file.path);
      const normalizedRoot = rootPath === "." ? "." : toRepositoryPath(rootPath);
      const name = normalizedRoot === "." ? "root" : normalizedRoot;
      return {
        id: packageScopeNodeId(normalizedRoot),
        rootPath: normalizedRoot,
        name,
        packageJsonPath: file.path,
      };
    })
    .sort((left, right) => left.rootPath.localeCompare(right.rootPath));
}

function nearestPackageScope(
  path: string,
  scopes: readonly RepositoryGraphPackageScope[]
): RepositoryGraphPackageScope | undefined {
  return [...scopes]
    .filter((scope) => scope.rootPath === "." || path.startsWith(`${scope.rootPath}/`))
    .sort((left, right) => right.rootPath.length - left.rootPath.length)
    .at(0);
}

function resolveImportPath(
  sourcePath: string,
  importSource: string,
  filesByPath: ReadonlyMap<string, RepositoryFileEntry>
): { path: string; confidence: number } | null {
  if (!importSource.startsWith(".")) return null;
  const sourceDir = dirname(sourcePath);
  const base = toRepositoryPath(normalize(join(sourceDir, importSource)));
  if (base.startsWith("../") || base === "..") return null;
  const candidates = candidateImportPaths(base);
  for (const candidate of candidates) {
    if (filesByPath.has(candidate)) {
      return { path: candidate, confidence: candidate === base ? 1 : 0.95 };
    }
  }
  return null;
}

function candidateImportPaths(base: string): string[] {
  const extension = extname(base);
  if (extension) return [base];
  return [
    ...RESOLVABLE_EXTENSIONS.map((suffix) => `${base}${suffix}`),
    ...RESOLVABLE_EXTENSIONS.filter(Boolean).map((suffix) => `${base}/index${suffix}`),
  ].filter(dedupe);
}

function addSymbolReferenceEdges(
  edges: Map<string, RepositoryGraphEdge>,
  nodes: Map<string, RepositoryGraphNode>,
  symbolIndex: SymbolIndexResult | undefined
): void {
  if (!symbolIndex) return;
  for (const entry of symbolIndex.entries) {
    const sourceSymbolId = symbolNodeId(entry.symbol.id);
    if (!nodes.has(sourceSymbolId)) continue;
    for (const location of entry.referenceLocations) {
      const targetFileId = fileNodeId(location.path);
      if (!nodes.has(targetFileId)) continue;
      addEdge(edges, {
        id: edgeId("references", sourceSymbolId, targetFileId, `${location.path}:${location.range.startByte}`),
        kind: "references",
        sourceId: sourceSymbolId,
        targetId: targetFileId,
        sourcePath: entry.symbol.path,
        targetPath: location.path,
        sourceSymbolId: entry.symbol.id,
        confidence: entry.referenceResolution === "complete" ? 0.9 : 0.65,
        reason: "LSP reference location.",
      });
    }
  }
}

function addRelatedTestEdges(
  edges: Map<string, RepositoryGraphEdge>,
  files: readonly RepositoryFileEntry[]
): void {
  const readable = files.filter((file) => file.safety === "readable");
  const testsByStem = new Map<string, RepositoryFileEntry[]>();
  const sourcesByStem = new Map<string, RepositoryFileEntry[]>();
  for (const file of readable) {
    const stem = pathStem(file.path);
    if (!stem) continue;
    const target = isTestPath(file.path) ? testsByStem : sourcesByStem;
    target.set(stem, [...(target.get(stem) ?? []), file]);
  }

  for (const [stem, tests] of testsByStem) {
    const sources = sourcesByStem.get(stem) ?? [];
    for (const testFile of tests) {
      for (const sourceFile of sources) {
        addEdge(edges, {
          id: edgeId("related_test", fileNodeId(sourceFile.path), fileNodeId(testFile.path)),
          kind: "related_test",
          sourceId: fileNodeId(sourceFile.path),
          targetId: fileNodeId(testFile.path),
          sourcePath: sourceFile.path,
          targetPath: testFile.path,
          confidence: 0.75,
          reason: "Matched source/test filename convention.",
        });
        addEdge(edges, {
          id: edgeId("tests", fileNodeId(testFile.path), fileNodeId(sourceFile.path)),
          kind: "tests",
          sourceId: fileNodeId(testFile.path),
          targetId: fileNodeId(sourceFile.path),
          sourcePath: testFile.path,
          targetPath: sourceFile.path,
          confidence: 0.75,
          reason: "Matched test/source filename convention.",
        });
      }
    }
  }
}

function packageNameFromImportSource(source: string): string | undefined {
  if (source.startsWith(".")) return undefined;
  const parts = source.split("/").filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts[0]?.startsWith("@") && parts[1]) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

function pathStem(path: string): string {
  const basename = path.split("/").at(-1) ?? path;
  return basename
    .replace(/\.[^.]+$/u, "")
    .replace(/\.(test|spec)$/iu, "")
    .toLowerCase();
}

function isTestPath(path: string): boolean {
  return /(^|\/)__tests__(\/|$)|\.(test|spec)\.[^.]+$/iu.test(path);
}

function addEdge(
  edges: Map<string, RepositoryGraphEdge>,
  edge: RepositoryGraphEdge
): void {
  if (!edges.has(edge.id)) edges.set(edge.id, edge);
}

function sortNodes(nodes: RepositoryGraphNode[]): RepositoryGraphNode[] {
  return nodes.sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      (left.path ?? left.label).localeCompare(right.path ?? right.label) ||
      left.id.localeCompare(right.id)
  );
}

function sortEdges(edges: RepositoryGraphEdge[]): RepositoryGraphEdge[] {
  return edges.sort(
    (left, right) =>
      (left.sourcePath ?? left.sourceId).localeCompare(right.sourcePath ?? right.sourceId) ||
      left.kind.localeCompare(right.kind) ||
      (left.targetPath ?? left.targetId).localeCompare(right.targetPath ?? right.targetId) ||
      left.id.localeCompare(right.id)
  );
}

function compareImports(
  left: RepositoryGraphImport,
  right: RepositoryGraphImport
): number {
  return (
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.source.localeCompare(right.source)
  );
}

function compareExports(
  left: RepositoryGraphExport,
  right: RepositoryGraphExport
): number {
  return (
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.symbolName.localeCompare(right.symbolName)
  );
}

function fileNodeId(path: string): string {
  return `file:${path}`;
}

function symbolNodeId(symbolId: string): string {
  return `symbol:${symbolId}`;
}

function packageScopeNodeId(rootPath: string): string {
  return `scope:${rootPath}`;
}

function externalPackageNodeId(packageName: string): string {
  return `external:${packageName}`;
}

function edgeId(
  kind: RepositoryGraphEdge["kind"],
  sourceId: string,
  targetId: string,
  qualifier = ""
): string {
  return [kind, sourceId, targetId, qualifier]
    .filter(Boolean)
    .join(":");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Repository graph build cancelled.");
  error.name = "AbortError";
  throw error;
}
