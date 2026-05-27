import { relative, resolve, sep } from "node:path";

export class ProjectPathSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectPathSafetyError";
  }
}

export function isInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relation = relative(rootPath, candidatePath);
  return relation === "" || (!relation.startsWith("..") && !relation.includes(`..${sep}`));
}

export function resolveInsideRoot(rootPath: string, relativePath: string): string {
  if (!relativePath.trim()) {
    throw new ProjectPathSafetyError("Relative path is required.");
  }
  const targetPath = resolve(rootPath, relativePath);
  if (!isInsideRoot(rootPath, targetPath)) {
    throw new ProjectPathSafetyError(`Path escapes project boundary: ${relativePath}`);
  }
  return targetPath;
}

export function assertRelativeWriteRoot(writeRoot: string): void {
  if (!writeRoot.trim()) {
    throw new ProjectPathSafetyError("writeRoot must not be empty.");
  }
  const normalized = writeRoot.trim();
  if (resolve(normalized) === normalized) {
    throw new ProjectPathSafetyError(`writeRoot must be relative: ${writeRoot}`);
  }
  if (normalized.split(/[\\/]+/u).includes("..")) {
    throw new ProjectPathSafetyError(`writeRoot must stay inside project: ${writeRoot}`);
  }
}

export function isGitMetadataPath(rootPath: string, candidatePath: string): boolean {
  const relation = relative(rootPath, candidatePath).split(sep).join("/");
  return relation === ".git" || relation.startsWith(".git/");
}

export function isWritablePath(
  rootPath: string,
  candidatePath: string,
  writeRoots: readonly string[]
): boolean {
  const relativePath = relative(rootPath, candidatePath);
  if (relativePath.startsWith("..") || relativePath.includes(`..${sep}`)) return false;
  const normalizedRelative = relativePath.split(sep).join("/");
  return writeRoots.some((rawRoot) => {
    const normalizedRoot = rawRoot.trim().replace(/^\/+|\/+$/gu, "");
    if (normalizedRoot === "" || normalizedRoot === ".") return true;
    return (
      normalizedRelative === normalizedRoot ||
      normalizedRelative.startsWith(`${normalizedRoot}/`)
    );
  });
}
