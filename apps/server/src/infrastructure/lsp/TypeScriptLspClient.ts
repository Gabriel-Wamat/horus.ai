import { promises as fs } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";
import {
  LspDiagnosticSchema,
  LspDocumentSymbolSchema,
  SymbolLocationSchema,
  type AstRange,
  type AstSymbolKind,
  type LspDiagnostic,
  type LspDocumentSymbol,
  type RepositoryRetrievalCandidate,
  type SymbolLocation,
} from "@u-build/shared";
import type {
  LspClientPort,
  LspInitializeInput,
  LspLocationInput,
  LspPathInput,
  LspReferencesInput,
} from "../../application/ports/index.js";

interface IndexedDocument {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly content: string;
  readonly language: string;
  readonly version: string;
}

export class TypeScriptLspClient implements LspClientPort {
  private projectRootPath: string | null = null;
  private documents = new Map<string, IndexedDocument>();
  private languageService: ts.LanguageService | null = null;

  async initialize(input: LspInitializeInput): Promise<void> {
    throwIfAborted(input.signal);
    const root = await fs.realpath(input.projectRootPath);
    this.projectRootPath = root;
    this.documents = new Map(
      (input.candidates ?? [])
        .filter((candidate) => isTypeScriptLike(candidate))
        .map((candidate) => {
          const absolutePath = resolve(root, candidate.path);
          const document: IndexedDocument = {
            relativePath: candidate.path,
            absolutePath,
            content: candidate.content,
            language: candidate.language,
            version: "0",
          };
          return [absolutePath, document] as const;
        })
    );

    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => ({
        allowJs: true,
        checkJs: false,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      }),
      getCurrentDirectory: () => root,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      getScriptFileNames: () => [...this.documents.keys()],
      getScriptVersion: (fileName) =>
        this.documents.get(resolve(fileName))?.version ?? "0",
      getScriptSnapshot: (fileName) => {
        const absolute = resolve(fileName);
        const indexed = this.documents.get(absolute);
        if (indexed) return ts.ScriptSnapshot.fromString(indexed.content);
        const diskContent = ts.sys.readFile(absolute);
        return diskContent === undefined
          ? undefined
          : ts.ScriptSnapshot.fromString(diskContent);
      },
      fileExists: (fileName) =>
        this.documents.has(resolve(fileName)) || ts.sys.fileExists(fileName),
      readFile: (fileName) =>
        this.documents.get(resolve(fileName))?.content ?? ts.sys.readFile(fileName),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };
    if (ts.sys.realpath) {
      host.realpath = ts.sys.realpath;
    }

    this.languageService = ts.createLanguageService(
      host,
      ts.createDocumentRegistry()
    );
  }

  async documentSymbols(input: LspPathInput): Promise<LspDocumentSymbol[]> {
    throwIfAborted(input.signal);
    const { absolutePath, document } = this.resolveDocument(input.path);
    const tree = this.requireService().getNavigationTree(absolutePath);
    return flattenNavigationTree(tree, document).map((symbol) =>
      LspDocumentSymbolSchema.parse(symbol)
    );
  }

  async definition(input: LspLocationInput): Promise<SymbolLocation[]> {
    throwIfAborted(input.signal);
    const { absolutePath, document } = this.resolveDocument(input.location.path);
    const position = this.positionFromLocation(document, input.location);
    const definitions =
      this.requireService().getDefinitionAtPosition(absolutePath, position) ?? [];
    return definitions
      .map((definition) => this.locationFromFileSpan(definition.fileName, definition.textSpan))
      .filter((location): location is SymbolLocation => location !== null)
      .map((location) => SymbolLocationSchema.parse(location));
  }

  async references(input: LspReferencesInput): Promise<SymbolLocation[]> {
    throwIfAborted(input.signal);
    const { absolutePath, document } = this.resolveDocument(input.location.path);
    const position = this.positionFromLocation(document, input.location);
    const references =
      this.requireService().getReferencesAtPosition(absolutePath, position) ?? [];
    return references
      .filter((reference) => {
        const maybeDefinition = reference as ts.ReferenceEntry & {
          readonly isDefinition?: boolean;
        };
        return input.includeDeclaration || !maybeDefinition.isDefinition;
      })
      .map((reference) => this.locationFromFileSpan(reference.fileName, reference.textSpan))
      .filter((location): location is SymbolLocation => location !== null)
      .map((location) => SymbolLocationSchema.parse(location));
  }

  async diagnostics(input: LspPathInput): Promise<LspDiagnostic[]> {
    throwIfAborted(input.signal);
    const { absolutePath } = this.resolveDocument(input.path);
    const service = this.requireService();
    const diagnostics = [
      ...service.getSyntacticDiagnostics(absolutePath),
      ...service.getSemanticDiagnostics(absolutePath),
      ...service.getSuggestionDiagnostics(absolutePath),
    ];
    return diagnostics
      .map((diagnostic) => this.diagnosticFromTs(diagnostic))
      .filter((diagnostic): diagnostic is LspDiagnostic => diagnostic !== null)
      .map((diagnostic) => LspDiagnosticSchema.parse(diagnostic));
  }

  async shutdown(): Promise<void> {
    this.languageService?.dispose();
    this.languageService = null;
    this.projectRootPath = null;
    this.documents.clear();
  }

  private requireService(): ts.LanguageService {
    if (!this.languageService || !this.projectRootPath) {
      throw new Error("TypeScript LSP client is not initialized.");
    }
    return this.languageService;
  }

  private resolveDocument(path: string): {
    readonly absolutePath: string;
    readonly document: IndexedDocument;
  } {
    if (!this.projectRootPath) {
      throw new Error("TypeScript LSP client is not initialized.");
    }
    const absolutePath = resolve(this.projectRootPath, path);
    const document = this.documents.get(absolutePath);
    if (!document) {
      throw new Error(`Document is not indexed by TypeScript LSP client: ${path}`);
    }
    return { absolutePath, document };
  }

  private positionFromLocation(
    document: IndexedDocument,
    location: SymbolLocation
  ): number {
    return byteOffsetToStringOffset(
      document.content,
      location.range.startByte
    );
  }

  private locationFromFileSpan(
    fileName: string,
    textSpan: ts.TextSpan
  ): SymbolLocation | null {
    const absolute = resolve(fileName);
    const document = this.documents.get(absolute);
    if (!document || !this.projectRootPath) return null;
    if (!isInsideRoot(this.projectRootPath, absolute)) return null;
    return {
      path: document.relativePath,
      uri: pathToFileUri(absolute),
      range: rangeFromTextSpan(document.content, textSpan),
    };
  }

  private diagnosticFromTs(diagnostic: ts.Diagnostic): LspDiagnostic | null {
    if (!diagnostic.file || !this.projectRootPath) return null;
    const absolute = resolve(diagnostic.file.fileName);
    const document = this.documents.get(absolute);
    if (!document || !isInsideRoot(this.projectRootPath, absolute)) return null;
    const start = diagnostic.start ?? 0;
    const length = diagnostic.length ?? 0;
    return {
      path: document.relativePath,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      severity: diagnosticSeverity(diagnostic.category),
      source: "typescript",
      code: String(diagnostic.code),
      range: rangeFromTextSpan(document.content, { start, length }),
    };
  }
}

function flattenNavigationTree(
  item: ts.NavigationTree,
  document: IndexedDocument,
  containerName?: string
): LspDocumentSymbol[] {
  const spans = item.spans ?? [];
  const ownSymbols = spans.map((span) => ({
    name: item.text,
    kind: navigationKind(item.kind, item.text),
    location: {
      path: document.relativePath,
      uri: pathToFileUri(document.absolutePath),
      range: rangeFromTextSpan(document.content, span),
    },
    ...(containerName ? { containerName } : {}),
  }));
  const children = (item.childItems ?? []).flatMap((child) =>
    flattenNavigationTree(child, document, item.text)
  );
  return [...ownSymbols, ...children];
}

function navigationKind(kind: string, name: string): AstSymbolKind {
  if (kind === "class") return "class";
  if (kind === "method") return "method";
  if (kind === "interface") return "interface";
  if (kind === "type") return "type";
  if (kind === "function") return name.startsWith("use") ? "hook" : "function";
  if (kind === "const" || kind === "let" || kind === "var") {
    return /^[A-Z]/u.test(name) ? "component" : "variable";
  }
  return "unknown";
}

function rangeFromTextSpan(content: string, span: ts.TextSpan): AstRange {
  const start = clamp(span.start, 0, content.length);
  const end = clamp(span.start + span.length, start, content.length);
  return {
    startByte: stringOffsetToByteOffset(content, start),
    endByte: stringOffsetToByteOffset(content, end),
    startPosition: positionFromStringOffset(content, start),
    endPosition: positionFromStringOffset(content, end),
  };
}

function positionFromStringOffset(
  content: string,
  offset: number
): { row: number; column: number } {
  const prefix = content.slice(0, offset);
  const lines = prefix.split("\n");
  return {
    row: lines.length - 1,
    column: lines.at(-1)?.length ?? 0,
  };
}

function stringOffsetToByteOffset(content: string, offset: number): number {
  return Buffer.byteLength(content.slice(0, offset), "utf-8");
}

function byteOffsetToStringOffset(content: string, byteOffset: number): number {
  let bytes = 0;
  let offset = 0;
  for (const char of content) {
    const next = bytes + Buffer.byteLength(char, "utf-8");
    if (next > byteOffset) return offset;
    bytes = next;
    offset += char.length;
  }
  return content.length;
}

function diagnosticSeverity(
  category: ts.DiagnosticCategory
): LspDiagnostic["severity"] {
  if (category === ts.DiagnosticCategory.Error) return "error";
  if (category === ts.DiagnosticCategory.Warning) return "warning";
  if (category === ts.DiagnosticCategory.Suggestion) return "hint";
  return "info";
}

function isTypeScriptLike(candidate: RepositoryRetrievalCandidate): boolean {
  return candidate.language === "typescript" || candidate.language === "javascript";
}

function isInsideRoot(root: string, absolutePath: string): boolean {
  const rel = relative(root, absolutePath);
  return Boolean(rel) && !rel.startsWith("..") && !rel.split(sep).includes("..");
}

function pathToFileUri(path: string): string {
  return `file://${path.split(sep).join("/")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("TypeScript LSP operation cancelled.");
  error.name = "AbortError";
  throw error;
}
