import { promises as fs } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import ts from "typescript";

export interface SourceSyntaxIssue {
  path: string;
  message: string;
  line?: number | undefined;
  column?: number | undefined;
}

const SOURCE_SYNTAX_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

export function findSourceSyntaxIssue(input: {
  path: string;
  content: string | null;
}): SourceSyntaxIssue | null {
  if (input.content === null) return null;
  if (!SOURCE_SYNTAX_EXTENSIONS.has(extname(input.path))) return null;

  const result = ts.transpileModule(input.content, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
    fileName: input.path,
    reportDiagnostics: true,
  });
  const diagnostic = (result.diagnostics ?? []).find(
    (item) => item.category === ts.DiagnosticCategory.Error
  );
  if (!diagnostic) return null;

  const position =
    diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;
  return {
    path: input.path,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    ...(position
      ? { line: position.line + 1, column: position.character + 1 }
      : {}),
  };
}

export async function findFirstProjectSourceSyntaxIssue(
  projectRootPath: string
): Promise<SourceSyntaxIssue | null> {
  const projectRoot = resolve(projectRootPath);
  return findFirstIssueInDirectory(projectRoot, projectRoot);
}

async function findFirstIssueInDirectory(
  projectRoot: string,
  directory: string
): Promise<SourceSyntaxIssue | null> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return null;
    throw err;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const issue = await findFirstIssueInDirectory(
        projectRoot,
        resolve(directory, entry.name)
      );
      if (issue) return issue;
      continue;
    }

    if (!entry.isFile()) continue;
    const absolutePath = resolve(directory, entry.name);
    const relativePath = normalizeRelativePath(relative(projectRoot, absolutePath));
    if (!SOURCE_SYNTAX_EXTENSIONS.has(extname(relativePath))) continue;
    const content = await fs.readFile(absolutePath, "utf8");
    const issue = findSourceSyntaxIssue({ path: relativePath, content });
    if (issue) return issue;
  }

  return null;
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
