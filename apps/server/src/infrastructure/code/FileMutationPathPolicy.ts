import { promises as fs } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isWritablePath } from "../project/ProjectPathSafety.js";
import { FileMutationPreflightError } from "./FileMutationPreflightErrors.js";

const FORBIDDEN_PATH_SEGMENTS = new Set([
  ".git",
  ".horus",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

const FORBIDDEN_ROOT_SEGMENTS = new Set([".horus", ".turbo", "data"]);

const PROTECTED_DELETE_PATHS = new Set([
  ".horus-project.yaml",
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "tsconfig.json",
  "tsconfig.base.json",
  "vite.config.ts",
  "vite.config.js",
  "src/main.ts",
  "src/main.tsx",
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".crt",
  ".cer",
  ".p12",
  ".pfx",
]);

const SENSITIVE_NAME_TOKENS = new Set([
  "secret",
  "credential",
  "credentials",
  "token",
]);

export function resolveMutationPath(projectRoot: string, targetPath: string): string {
  const trimmedTargetPath = targetPath.trim();
  if (!trimmedTargetPath) {
    throw new FileMutationPreflightError(
      "invalid_operation",
      targetPath,
      "File mutation target path is required."
    );
  }
  if (isAbsolute(trimmedTargetPath)) {
    throw new FileMutationPreflightError(
      "absolute_path",
      targetPath,
      `File mutation target path must be relative to the selected project: ${targetPath}`
    );
  }

  const resolvedTarget = resolve(projectRoot, trimmedTargetPath);
  const relativeTarget = relative(projectRoot, resolvedTarget);
  if (
    relativeTarget.length === 0 ||
    relativeTarget.startsWith("..") ||
    isAbsolute(relativeTarget)
  ) {
    throw new FileMutationPreflightError(
      "path_escape",
      targetPath,
      `File mutation target path escapes the selected project: ${targetPath}`
    );
  }

  assertAllowedRelativePath(relativeTarget, targetPath);
  return resolvedTarget;
}

export function assertAllowedWriteRoot(input: {
  projectRoot: string;
  targetPath: string;
  relativePath: string;
  allowedWriteRoots?: readonly string[] | undefined;
  originalPath: string;
}): void {
  if (!input.allowedWriteRoots || input.allowedWriteRoots.length === 0) return;
  if (isWritablePath(input.projectRoot, input.targetPath, input.allowedWriteRoots)) {
    return;
  }
  throw new FileMutationPreflightError(
    "path_forbidden",
    input.originalPath,
    `File mutation target path is outside writeRoots: ${input.relativePath}`
  );
}

export async function assertNoSymlinkPath(input: {
  projectRoot: string;
  targetPath: string;
  relativePath: string;
}): Promise<void> {
  const segments = input.relativePath.split("/").filter(Boolean);
  let currentPath = input.projectRoot;

  for (const segment of segments) {
    currentPath = resolve(currentPath, segment);
    let stat;
    try {
      stat = await fs.lstat(currentPath);
    } catch (err) {
      if (isNodeError(err) && err.code === "ENOENT") return;
      throw err;
    }

    if (stat.isSymbolicLink()) {
      throw new FileMutationPreflightError(
        "symlink_path",
        input.relativePath,
        `File mutation refuses to mutate symlink path: ${input.relativePath}`
      );
    }
  }
}

export function isProtectedDeletePath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  if (PROTECTED_DELETE_PATHS.has(normalized)) return true;
  if (isProtectedTsconfigPath(normalized)) return true;
  return normalized.startsWith("src/main.");
}

export function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function assertAllowedRelativePath(relativeTarget: string, originalPath: string): void {
  const normalized = normalizeRelativePath(relativeTarget);
  const segments = normalized.split("/").filter(Boolean);
  if (FORBIDDEN_ROOT_SEGMENTS.has(segments[0] ?? "")) {
    throw new FileMutationPreflightError(
      "path_forbidden",
      originalPath,
      `File mutation target path is not allowed: ${originalPath}`
    );
  }
  if (segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment))) {
    throw new FileMutationPreflightError(
      "path_forbidden",
      originalPath,
      `File mutation target path is not allowed: ${originalPath}`
    );
  }

  const fileName = segments.at(-1) ?? "";
  if (isSensitiveFileName(fileName)) {
    throw new FileMutationPreflightError(
      "path_forbidden",
      originalPath,
      `File mutation target path is sensitive and cannot be mutated: ${originalPath}`
    );
  }
}

function isProtectedTsconfigPath(path: string): boolean {
  if (!path.startsWith("tsconfig.")) return false;
  if (!path.endsWith(".json")) return false;
  const middle = path.slice("tsconfig.".length, path.length - ".json".length);
  return middle.length > 0;
}

function isSensitiveFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower === ".env" || lower.startsWith(".env.")) return true;
  if ([...SENSITIVE_EXTENSIONS].some((extension) => lower.endsWith(extension))) {
    return true;
  }

  const tokens = splitFileNameTokens(lower);
  if (tokens.some((token) => SENSITIVE_NAME_TOKENS.has(token))) return true;
  if (tokens.includes("privatekey")) return true;
  return tokens.some(
    (token, index) => token === "private" && tokens[index + 1] === "key"
  );
}

function splitFileNameTokens(fileName: string): string[] {
  const tokens: string[] = [];
  let token = "";
  const pushToken = () => {
    if (token) tokens.push(token);
    token = "";
  };

  for (const char of fileName) {
    if (char === "-" || char === "_" || char === ".") {
      pushToken();
      continue;
    }
    token += char;
  }
  pushToken();
  return tokens;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
