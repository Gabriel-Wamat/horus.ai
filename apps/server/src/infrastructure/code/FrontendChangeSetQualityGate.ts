import { promises as fs } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import ts from "typescript";
import type { CodeChangeSet, CodeChangeOperation } from "@u-build/shared";

export interface FrontendChangeSetQualityGateInput {
  projectRootPath: string;
  changeSet: CodeChangeSet;
}

export interface FrontendChangeSetQualityGateResult {
  passed: boolean;
  issues: string[];
}

const SOURCE_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
]);

const ENTRY_CANDIDATES = [
  "src/main.tsx",
  "src/main.ts",
  "src/main.jsx",
  "src/main.js",
  "src/App.tsx",
  "src/App.ts",
  "src/App.jsx",
  "src/App.js",
];

const FORBIDDEN_RUNTIME_TOKENS = [
  "mock",
  "fake",
  "faker",
  "fixture",
  "math.random(",
];

export async function evaluateFrontendChangeSet(
  input: FrontendChangeSetQualityGateInput
): Promise<FrontendChangeSetQualityGateResult> {
  const projectRoot = resolve(input.projectRootPath);
  const files = await readProjectSourceFiles(projectRoot);
  const issues: string[] = [];

  for (const operation of input.changeSet.operations) {
    const targetPath = normalizeRelativePath(operation.targetPath);
    files.set(targetPath, operation.afterContent);
    issues.push(...evaluateOperationContent(operation, files));
  }

  const reachableFiles = buildReachableFileSet(files);
  for (const operation of input.changeSet.operations) {
    const targetPath = normalizeRelativePath(operation.targetPath);
    if (!mustBeReachable(targetPath)) continue;
    if (!reachableFiles.has(targetPath)) {
      issues.push(
        `[front] ${targetPath} is not reachable from the app entrypoint import graph. Import it from an existing reachable module or update the existing component instead.`
      );
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

function evaluateOperationContent(
  operation: CodeChangeOperation,
  files: Map<string, string>
): string[] {
  const targetPath = normalizeRelativePath(operation.targetPath);
  const issues: string[] = [];
  const reactProject = isReactViteProject(files);

  if (
    reactProject &&
    (targetPath.startsWith("generated/horus/") ||
      (targetPath.endsWith(".html") && targetPath !== "index.html"))
  ) {
    issues.push(
      `[front] ${targetPath} is a standalone HTML artifact, but this project is a React/TypeScript/Vite app. Implement the feature through reachable TSX/CSS source files instead.`
    );
  }

  if (!mustBeReachable(targetPath)) return issues;

  const normalized = operation.afterContent.toLowerCase();
  for (const token of FORBIDDEN_RUNTIME_TOKENS) {
    if (normalized.includes(token)) {
      issues.push(
        `[front] ${targetPath} contains runtime fixture token "${token}". FrontAgent must wire real project data/contracts instead of mock or fake behavior.`
      );
    }
  }
  issues.push(...evaluateSourceSyntax(targetPath, operation.afterContent));
  return issues;
}

async function readProjectSourceFiles(projectRoot: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  await readDirIntoMap(projectRoot, projectRoot, files);
  return files;
}

async function readDirIntoMap(
  projectRoot: string,
  currentDir: string,
  files: Map<string, string>
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return;
    throw err;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const absolutePath = resolve(currentDir, entry.name);
    if (entry.isDirectory()) {
      await readDirIntoMap(projectRoot, absolutePath, files);
      continue;
    }

    const relativePath = normalizeRelativePath(relative(projectRoot, absolutePath));
    if (relativePath === "index.html" || mustBeReachable(relativePath)) {
      files.set(relativePath, await fs.readFile(absolutePath, "utf8"));
    }
  }
}

function buildReachableFileSet(files: Map<string, string>): Set<string> {
  const reachable = new Set<string>();
  const queue = ENTRY_CANDIDATES.filter((entry) => files.has(entry));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reachable.has(current)) continue;
    const content = files.get(current);
    if (content === undefined) continue;
    reachable.add(current);

    for (const specifier of collectModuleSpecifiers(current, content)) {
      const resolved = resolveImportSpecifier(files, current, specifier);
      if (resolved && !reachable.has(resolved)) queue.push(resolved);
    }
  }

  return reachable;
}

function isReactViteProject(files: Map<string, string>): boolean {
  const packageJson = files.get("package.json");
  return (
    files.has("src/main.tsx") ||
    files.has("src/App.tsx") ||
    Boolean(packageJson?.includes("\"react\"") && packageJson.includes("\"vite\""))
  );
}

function evaluateSourceSyntax(targetPath: string, content: string): string[] {
  const extension = extname(targetPath);
  if (![".ts", ".tsx", ".js", ".jsx"].includes(extension)) return [];

  const result = ts.transpileModule(content, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
    fileName: targetPath,
    reportDiagnostics: true,
  });
  const diagnostics = result.diagnostics ?? [];
  return diagnostics
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
      return `[front] ${targetPath} has TypeScript syntax error: ${message}`;
    });
}

function collectModuleSpecifiers(filePath: string, content: string): string[] {
  if (extname(filePath) === ".css") return [];

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const specifiers: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        specifiers.push(argument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

function resolveImportSpecifier(
  files: Map<string, string>,
  importerPath: string,
  specifier: string
): string | null {
  if (!specifier.startsWith(".")) return null;

  const basePath = normalizeRelativePath(
    resolvePosix(dirname(importerPath), specifier)
  );
  const withoutRuntimeExtension =
    basePath.endsWith(".js") || basePath.endsWith(".jsx")
      ? basePath.slice(0, basePath.lastIndexOf("."))
      : basePath;

  const candidates = [
    basePath,
    withoutRuntimeExtension,
    `${withoutRuntimeExtension}.ts`,
    `${withoutRuntimeExtension}.tsx`,
    `${withoutRuntimeExtension}.js`,
    `${withoutRuntimeExtension}.jsx`,
    `${withoutRuntimeExtension}.css`,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.css`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
    `${basePath}/index.jsx`,
  ];

  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

function resolvePosix(base: string, specifier: string): string {
  const parts = `${base}/${specifier}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

function mustBeReachable(targetPath: string): boolean {
  if (!targetPath.startsWith("src/")) return false;
  if (targetPath.endsWith(".d.ts")) return false;
  return SOURCE_EXTENSIONS.has(extname(targetPath));
}

function normalizeRelativePath(path: string): string {
  if (isAbsolute(path)) return path;
  return path.split(sep).join("/");
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
