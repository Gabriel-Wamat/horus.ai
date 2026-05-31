import { basename, dirname, extname, sep } from "node:path";
import type {
  RepositoryRetrievalExcerpt,
  RepositoryRoutingHint,
} from "@u-build/shared";
import { CodingTaskRouter } from "./CodingTaskRouter.js";

export const DEFAULT_REPOSITORY_PRIORITY_FILES = [
  "horus.project.json",
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "src/main.tsx",
  "src/main.ts",
  "src/App.tsx",
  "src/App.ts",
  "src/styles/tokens.css",
  "src/styles/app.css",
  "src/index.css",
  "src/features/welcome/components/WelcomeScreen.tsx",
  "vite.config.ts",
  "tsconfig.json",
];

const IGNORED_DIR_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".playwright-cli",
  ".pnpm-store",
  ".vercel",
  ".vite",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
  "output",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "venv",
  ".venv",
]);

const SENSITIVE_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".npmrc",
  ".pypirc",
  ".netrc",
  "id_rsa",
  "id_dsa",
  "id_ed25519",
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".crt",
  ".cer",
]);

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  [".astro", "astro"],
  [".css", "css"],
  [".csv", "csv"],
  [".go", "go"],
  [".html", "html"],
  [".java", "java"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".json", "json"],
  [".md", "markdown"],
  [".mdx", "mdx"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".py", "python"],
  [".rs", "rust"],
  [".scss", "scss"],
  [".sh", "shell"],
  [".sql", "sql"],
  [".svg", "xml"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".txt", "plaintext"],
  [".vue", "vue"],
  [".xml", "xml"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
]);

const TEXT_EXTENSIONS = new Set(LANGUAGE_BY_EXTENSION.keys());

const EXPLICIT_PATH_PATTERN =
  /[A-Za-z0-9_./-]+\.(?:astro|css|csv|go|html|java|jsx?|json|mdx?|mjs|cjs|py|rs|scss|sh|sql|svg|tsx?|txt|vue|xml|ya?ml)/g;

export function toRepositoryPath(value: string): string {
  return value
    .split(sep)
    .join("/")
    .replaceAll("\\", "/")
    .replace(/^['"`]+|['"`.,;:]+$/g, "")
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "");
}

export function inferRepositoryLanguage(path: string): string {
  return LANGUAGE_BY_EXTENSION.get(extname(path).toLowerCase()) ?? "plaintext";
}

export function isSensitiveRepositoryPath(relativePath: string): boolean {
  const normalized = toRepositoryPath(relativePath);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  const fileName = parts.at(-1)?.toLowerCase() ?? "";
  if (SENSITIVE_FILE_NAMES.has(fileName)) return true;
  if (/^\.env[.-]/u.test(fileName)) return true;
  if (SENSITIVE_EXTENSIONS.has(extname(fileName))) return true;
  return false;
}

export function isIgnoredRepositoryPath(relativePath: string): boolean {
  const normalized = toRepositoryPath(relativePath);
  const parts = normalized.split("/").filter(Boolean);
  return parts.some((part) => IGNORED_DIR_NAMES.has(part));
}

export function shouldIgnoreRepositoryPath(
  relativePath: string,
  name = basename(relativePath)
): boolean {
  if (isIgnoredRepositoryPath(relativePath)) return true;
  if (isSensitiveRepositoryPath(relativePath)) return true;
  if (name === ".DS_Store") return true;
  if (name.startsWith(".") && name !== ".gitignore" && name !== ".env.example") {
    return true;
  }
  if (basename(dirname(relativePath)) === ".git") return true;
  return false;
}

export function isTextRepositoryFile(path: string): boolean {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

export function isProbablyBinaryBuffer(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  return sample.includes(0);
}

export function extractRepositorySearchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3)
    .filter(dedupe);
}

export function extractRepositoryExplicitPaths(query: string): string[] {
  return [...query.matchAll(EXPLICIT_PATH_PATTERN)]
    .map((match) => toRepositoryPath(match[0]))
    .filter(Boolean)
    .filter(dedupe);
}

export function scoreRepositoryPath(path: string, terms: readonly string[]): number {
  const normalized = path.toLowerCase();
  const hints = extractPathHints(path);
  return terms.reduce(
    (score, term) =>
      score +
      (normalized.includes(term) ? 4 : 0) +
      (hints.includes(term) ? 8 : 0),
    0
  );
}

export function scoreRepositoryContent(
  content: string,
  terms: readonly string[]
): number {
  const normalized = content.toLowerCase();
  return terms.reduce((score, term) => {
    const exact = normalized.includes(term) ? 8 : 0;
    const symbol = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(content)
      ? 12
      : 0;
    return score + exact + symbol;
  }, 0);
}

export function buildRepositoryExcerpt(
  filePath: string,
  content: string,
  terms: readonly string[],
  options: { radius?: number; minStrongScore?: number } = {}
): RepositoryRetrievalExcerpt | null {
  const lines = content.split("\n");
  if (lines.length === 0) return null;
  const radius = options.radius ?? 6;
  const minStrongScore = options.minStrongScore ?? 20;
  const normalizedTerms =
    terms.length > 0 ? terms : [filePath.split("/").pop() ?? filePath];
  let bestLine = -1;
  let bestScore = 0;

  lines.forEach((line, index) => {
    const normalized = line.toLowerCase();
    const lineScore = normalizedTerms.reduce(
      (score, term) => score + (normalized.includes(term.toLowerCase()) ? 10 : 0),
      0
    );
    if (lineScore > bestScore) {
      bestScore = lineScore;
      bestLine = index;
    }
  });

  if (bestLine < 0) {
    if (terms.length > 0) return null;
    bestLine = 0;
    bestScore = 1;
  }

  const start = Math.max(0, bestLine - radius);
  const end = Math.min(lines.length - 1, bestLine + radius);
  return {
    filePath,
    startLine: start + 1,
    endLine: end + 1,
    content: lines.slice(start, end + 1).join("\n"),
    reason:
      bestScore >= minStrongScore
        ? "Correspondência forte com a pergunta."
        : "Correspondência parcial com a pergunta.",
    score: bestScore,
  };
}

export async function mapWithRepositoryConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (item === undefined) continue;
        results[index] = await mapper(item);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export function detectRepositoryRoutingHints(input: {
  readonly query: string;
  readonly paths: readonly string[];
  readonly projectRootPath?: string;
}): RepositoryRoutingHint[] {
  const router = new CodingTaskRouter();
  const route = router.route({
    prompt: input.query,
    selectedPaths: input.paths,
    ...(input.projectRootPath ? { projectRootPath: input.projectRootPath } : {}),
  });
  const score =
    route.surface === "unknown"
      ? 0
      : route.surface === "full_stack"
        ? 100
        : 75;
  return [
    {
      surface: route.surface,
      reason: route.reason,
      score,
    },
  ];
}

function extractPathHints(path: string): string[] {
  return path
    .replace(/\.[^.]+$/, "")
    .split(/[\\/._-]+|(?=[A-Z])/)
    .map((term) =>
      term
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    )
    .filter((term) => term.length >= 3)
    .filter(dedupe);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function dedupe<T>(value: T, index: number, values: readonly T[]): boolean {
  return values.indexOf(value) === index;
}
