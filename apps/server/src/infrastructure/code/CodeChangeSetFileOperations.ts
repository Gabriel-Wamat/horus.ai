import type {
  CodeChangeOperationPrecondition,
  CodeChangeSet,
} from "@u-build/shared";
import { promises as fs } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  FileMutationPreflightApplier,
  FileMutationPreflightError,
  type FileMutationPlannedOperation,
} from "./FileMutationPreflightApplier.js";

export interface PlannedCodeChangeOperation extends FileMutationPlannedOperation {}

export class CodeChangeSetPreconditionError extends Error {
  constructor(
    readonly precondition: CodeChangeOperationPrecondition,
    readonly targetPath: string,
    message: string
  ) {
    super(message);
    this.name = "CodeChangeSetPreconditionError";
  }
}

const defaultMutationApplier = new FileMutationPreflightApplier();

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

const SENSITIVE_FILE_PATTERN =
  /(^\.env(?:\..*)?$|(?:^|[-_.])(secret|credential|credentials|token|private[-_]?key)(?:[-_.]|$)|\.(pem|key|crt|cer|p12|pfx)$)/iu;

export async function planCodeChangeSetOperations(input: {
  changeSet: CodeChangeSet;
  projectRootPath: string;
  allowDelete?: boolean;
  allowedWriteRoots?: readonly string[];
}): Promise<{
  projectRoot: string;
  changeSet: CodeChangeSet;
  operations: PlannedCodeChangeOperation[];
}> {
  try {
    const plan = await defaultMutationApplier.planCodeChangeSet(input);
    return {
      projectRoot: plan.projectRoot,
      changeSet: plan.changeSet ?? input.changeSet,
      operations: plan.operations,
    };
  } catch (err) {
    throw mapPreconditionError(err);
  }
}

export async function applyPlannedCodeChangeOperations(
  plannedOperations: PlannedCodeChangeOperation[]
): Promise<void> {
  await defaultMutationApplier.applyPlan({
    projectRoot: inferProjectRoot(plannedOperations),
    operations: plannedOperations,
    finalDiff: finalDiffFor(plannedOperations),
    finalDiffStats: finalDiffStatsFor(plannedOperations),
  });
}

export async function rollbackPlannedCodeChangeOperations(
  appliedOperations: PlannedCodeChangeOperation[]
): Promise<void> {
  await defaultMutationApplier.rollback(appliedOperations);
}

export async function applyPlannedCodeChangeOperationsWithRollback(
  plannedOperations: PlannedCodeChangeOperation[]
): Promise<void> {
  await defaultMutationApplier.applyPlanWithRollback({
    projectRoot: inferProjectRoot(plannedOperations),
    operations: plannedOperations,
    finalDiff: finalDiffFor(plannedOperations),
    finalDiffStats: finalDiffStatsFor(plannedOperations),
  });
}

export function resolveCodeChangeSetPath(
  projectRoot: string,
  targetPath: string
): string {
  const trimmedTargetPath = targetPath.trim();
  if (!trimmedTargetPath) {
    throw new Error("CodeChangeSet target path is required.");
  }
  if (isAbsolute(trimmedTargetPath)) {
    throw new Error(
      `CodeChangeSet target path must be relative to the selected project: ${targetPath}`
    );
  }

  const resolvedTarget = resolve(projectRoot, trimmedTargetPath);
  const relativeTarget = relative(projectRoot, resolvedTarget);
  if (
    relativeTarget.length === 0 ||
    relativeTarget.startsWith("..") ||
    isAbsolute(relativeTarget)
  ) {
    throw new Error(
      `CodeChangeSet target path escapes the selected project: ${targetPath}`
    );
  }

  assertAllowedRelativePath(relativeTarget, targetPath);
  return resolvedTarget;
}

export async function assertCodeChangeSetPathHasNoSymlink(input: {
  projectRoot: string;
  targetPath: string;
}): Promise<void> {
  const relativeTarget = normalizeRelativePath(
    relative(input.projectRoot, input.targetPath)
  );
  const segments = relativeTarget.split("/").filter(Boolean);
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
      throw new Error(
        `CodeChangeSet refuses to mutate symlink path: ${relativeTarget}`
      );
    }
  }
}

function mapPreconditionError(err: unknown): unknown {
  if (
    err instanceof FileMutationPreflightError &&
    err.reason === "version_conflict" &&
    isPreconditionRecord(err.details["precondition"])
  ) {
    const precondition = err.details["precondition"];
    return new CodeChangeSetPreconditionError(
      precondition,
      err.targetPath,
      err.message.replace("File mutation", "CodeChangeSet")
    );
  }
  return err;
}

function isPreconditionRecord(
  value: unknown
): value is CodeChangeOperationPrecondition {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { kind?: unknown }).kind === "string" &&
    typeof (value as { path?: unknown }).path === "string"
  );
}

function inferProjectRoot(plannedOperations: readonly PlannedCodeChangeOperation[]): string {
  const first = plannedOperations[0];
  if (!first) return process.cwd();
  const suffix = first.relativePath.split("/").join("/");
  const target = first.targetPath.split("\\").join("/");
  return target.endsWith(`/${suffix}`)
    ? first.targetPath.slice(0, first.targetPath.length - suffix.length - 1)
    : process.cwd();
}

function finalDiffFor(plannedOperations: readonly PlannedCodeChangeOperation[]): string {
  return plannedOperations.map((operation) => {
    const legacyOperation = operation as Partial<PlannedCodeChangeOperation> & {
      operation?: { diff?: string };
    };
    return legacyOperation.expectedDiff ?? legacyOperation.operation?.diff ?? "";
  }).join("\n");
}

function finalDiffStatsFor(
  plannedOperations: readonly PlannedCodeChangeOperation[]
): { addedLines: number; removedLines: number; changedFiles: number } {
  return {
    addedLines: plannedOperations.reduce((sum, operation) => {
      return sum + (operation.expectedDiffStats?.addedLines ?? 0);
    }, 0),
    removedLines: plannedOperations.reduce((sum, operation) => {
      return sum + (operation.expectedDiffStats?.removedLines ?? 0);
    }, 0),
    changedFiles: plannedOperations.length,
  };
}

function assertAllowedRelativePath(relativeTarget: string, originalPath: string): void {
  const normalized = normalizeRelativePath(relativeTarget);
  const segments = normalized.split("/").filter(Boolean);
  if (FORBIDDEN_ROOT_SEGMENTS.has(segments[0] ?? "")) {
    throw new Error(
      `CodeChangeSet target path is not allowed for managed project mutation: ${originalPath}`
    );
  }
  if (segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment))) {
    throw new Error(
      `CodeChangeSet target path is not allowed for managed project mutation: ${originalPath}`
    );
  }

  const basename = segments.at(-1) ?? "";
  if (SENSITIVE_FILE_PATTERN.test(basename)) {
    throw new Error(
      `CodeChangeSet target path is sensitive and cannot be mutated: ${originalPath}`
    );
  }
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
