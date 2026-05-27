import { promises as fs } from "node:fs";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import type { ProjectFileEntry } from "@u-build/shared";
import { isInsideRoot } from "./ProjectPathSafety.js";

const DEFAULT_LIMIT = 2_000;
const DEFAULT_DEPTH = 12;

const IGNORED_DIR_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".vercel",
  ".vite",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
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

export interface ProjectFileTreeCollectorOptions {
  limit?: number;
  maxDepth?: number;
}

export interface ProjectFileTreeCollectorResult {
  entries: ProjectFileEntry[];
  partial: boolean;
  ignoredCount: number;
}

export function toPosixRelativePath(path: string): string {
  return path.split(sep).join("/");
}

export function inferProjectFileLanguage(path: string): string {
  return LANGUAGE_BY_EXTENSION.get(extname(path).toLowerCase()) ?? "plaintext";
}

export function isSensitiveProjectPath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/u, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.some((part) => IGNORED_DIR_NAMES.has(part))) return true;
  const fileName = parts.at(-1)?.toLowerCase() ?? "";
  if (SENSITIVE_FILE_NAMES.has(fileName)) return true;
  if (/^\.env[.-]/u.test(fileName)) return true;
  if (SENSITIVE_EXTENSIONS.has(extname(fileName))) return true;
  return false;
}

export class ProjectFileTreeCollector {
  async collect(
    rootPath: string,
    options: ProjectFileTreeCollectorOptions = {}
  ): Promise<ProjectFileTreeCollectorResult> {
    const rootRealPath = await fs.realpath(rootPath);
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 10_000);
    const maxDepth = Math.min(Math.max(options.maxDepth ?? DEFAULT_DEPTH, 1), 24);
    const entries: ProjectFileEntry[] = [];
    let ignoredCount = 0;
    let partial = false;

    const visit = async (directoryPath: string, depth: number): Promise<void> => {
      if (partial) return;
      if (depth > maxDepth) {
        partial = true;
        return;
      }

      const dirents = await fs.readdir(directoryPath, { withFileTypes: true });
      dirents.sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });

      for (const dirent of dirents) {
        if (entries.length >= limit) {
          partial = true;
          return;
        }

        const candidatePath = resolve(directoryPath, dirent.name);
        const relativePath = toPosixRelativePath(relative(rootRealPath, candidatePath));
        if (shouldIgnorePath(relativePath, dirent.name)) {
          ignoredCount += 1;
          continue;
        }

        let stat;
        let realCandidatePath;
        try {
          stat = await fs.lstat(candidatePath);
          realCandidatePath = await fs.realpath(candidatePath);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            ignoredCount += 1;
            continue;
          }
          throw err;
        }

        if (!isInsideRoot(rootRealPath, realCandidatePath)) {
          ignoredCount += 1;
          continue;
        }
        if (stat.isSymbolicLink()) {
          ignoredCount += 1;
          continue;
        }
        if (stat.isDirectory()) {
          entries.push({
            path: relativePath,
            kind: "dir",
            modifiedAt: stat.mtime.toISOString(),
          });
          await visit(candidatePath, depth + 1);
          continue;
        }
        if (!stat.isFile()) {
          ignoredCount += 1;
          continue;
        }
        entries.push({
          path: relativePath,
          kind: "file",
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          language: inferProjectFileLanguage(relativePath),
        });
      }
    };

    await visit(rootRealPath, 1);

    return { entries, partial, ignoredCount };
  }
}

function shouldIgnorePath(relativePath: string, name: string): boolean {
  if (isSensitiveProjectPath(relativePath)) return true;
  if (name === ".DS_Store") return true;
  if (name.startsWith(".") && name !== ".gitignore") return true;
  if (basename(dirname(relativePath)) === ".git") return true;
  return false;
}
