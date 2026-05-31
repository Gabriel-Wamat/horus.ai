import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type {
  CodeChangeOperation,
  CodeChangeOperationPrecondition,
  CodeChangeSet,
  ProjectFileVersion,
  StructuralPatchDiffStats,
} from "@u-build/shared";
import {
  CodeChangeSetSchema,
} from "@u-build/shared";
import { DiffBuilder, combineDiffStats } from "../../application/coding/DiffBuilder.js";
import {
  assertAllowedWriteRoot,
  assertNoSymlinkPath,
  isProtectedDeletePath,
  normalizeRelativePath,
  resolveMutationPath,
} from "./FileMutationPathPolicy.js";
import {
  FileMutationPreflightError,
  type FileMutationFailureReason,
} from "./FileMutationPreflightErrors.js";

export {
  FileMutationPreflightError,
  type FileMutationFailureReason,
} from "./FileMutationPreflightErrors.js";

export interface FileMutationOperation {
  targetPath: string;
  changeType: "create" | "update" | "delete";
  afterContent: string | null;
  beforeContent?: string | null | undefined;
  diff?: string | undefined;
  preconditions?: readonly CodeChangeOperationPrecondition[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  baseVersion?: ProjectFileVersion | undefined;
  expectedContentHash?: string | undefined;
  expectedMtimeMs?: number | undefined;
  expectedSizeBytes?: number | undefined;
  allowOverwrite?: boolean | undefined;
  reason?: string | undefined;
}

export interface FileMutationPlannedOperation {
  targetPath: string;
  relativePath: string;
  beforeContent: string | null;
  beforeVersion: ProjectFileVersion | null;
  afterContent: string | null;
  afterVersion: ProjectFileVersion | null;
  changeType: "create" | "update" | "delete";
  operation: CodeChangeOperation;
  expectedDiff: string;
  expectedDiffStats: StructuralPatchDiffStats;
}

export interface FileMutationPlan {
  projectRoot: string;
  operations: FileMutationPlannedOperation[];
  finalDiff: string;
  finalDiffStats: StructuralPatchDiffStats;
  changeSet?: CodeChangeSet | undefined;
}

export interface FileMutationAppliedOperation extends FileMutationPlannedOperation {
  actualDiff: string;
  actualDiffStats: StructuralPatchDiffStats;
}

export interface FileMutationApplyResult {
  projectRoot: string;
  appliedOperations: FileMutationAppliedOperation[];
  finalDiff: string;
  actualDiff: string;
  finalDiffStats: StructuralPatchDiffStats;
  actualDiffStats: StructuralPatchDiffStats;
}

const DEFAULT_MAX_FILE_BYTES = 2_000_000;
const DEFAULT_MAX_WRITE_BYTES = 512_000;
const BINARY_SAMPLE_BYTES = 8_000;

export class FileMutationPreflightApplier {
  private readonly diffBuilder = new DiffBuilder();

  async planCodeChangeSet(input: {
    changeSet: CodeChangeSet;
    projectRootPath: string;
    allowDelete?: boolean;
    allowedWriteRoots?: readonly string[];
  }): Promise<FileMutationPlan & { changeSet: CodeChangeSet }> {
    const operations = input.changeSet.operations.map(
      (operation): FileMutationOperation => ({
        targetPath: operation.targetPath,
        changeType: operation.changeType,
        beforeContent: operation.beforeContent,
        afterContent: operation.afterContent,
        diff: operation.diff,
        preconditions: operation.preconditions,
        allowOverwrite:
          operation.changeType === "create" && operation.beforeContent === null
            ? true
            : undefined,
      })
    );
    const plan = await this.plan({
      projectRootPath: input.projectRootPath,
      operations,
      ...(input.allowDelete !== undefined ? { allowDelete: input.allowDelete } : {}),
      ...(input.allowedWriteRoots !== undefined
        ? { allowedWriteRoots: input.allowedWriteRoots }
        : {}),
    });
    return {
      ...plan,
      changeSet: CodeChangeSetSchema.parse({
        ...input.changeSet,
        operations: plan.operations.map((planned) => planned.operation),
      }),
    };
  }

  async applyCodeChangeSet(input: {
    changeSet: CodeChangeSet;
    projectRootPath: string;
    allowDelete?: boolean;
    allowedWriteRoots?: readonly string[];
  }): Promise<{ changeSet: CodeChangeSet; result: FileMutationApplyResult }> {
    const plan = await this.planCodeChangeSet(input);
    const result = await this.applyPlanWithRollback(plan);
    return {
      result,
      changeSet: CodeChangeSetSchema.parse({
        ...plan.changeSet,
        operations: result.appliedOperations.map((planned) => planned.operation),
        status: "applied",
        appliedAt: new Date().toISOString(),
      }),
    };
  }

  async plan(input: {
    projectRootPath: string;
    operations: readonly FileMutationOperation[];
    allowDelete?: boolean;
    allowedWriteRoots?: readonly string[];
  }): Promise<FileMutationPlan> {
    const projectRoot = resolve(input.projectRootPath);
    const operations: FileMutationPlannedOperation[] = [];

    for (const operation of input.operations) {
      const targetPath = resolveMutationPath(projectRoot, operation.targetPath);
      const relativePath = normalizeRelativePath(relative(projectRoot, targetPath));
      assertAllowedWriteRoot({
        projectRoot,
        targetPath,
        relativePath,
        allowedWriteRoots: input.allowedWriteRoots,
        originalPath: operation.targetPath,
      });
      await assertNoSymlinkPath({ projectRoot, targetPath, relativePath });

      const fileState = await readFileState(targetPath, relativePath);
      assertOperationLegality({
        operation,
        targetPath: relativePath,
        fileState,
        allowDelete: input.allowDelete ?? true,
      });
      assertOperationPreconditions({
        operation,
        targetPath: relativePath,
        fileState,
      });

      const planned = buildPlannedOperation({
        operation,
        targetPath,
        relativePath,
        fileState,
        diffBuilder: this.diffBuilder,
      });
      operations.push(planned);
    }

    return {
      projectRoot,
      operations,
      finalDiff: operations.map((operation) => operation.expectedDiff).join("\n"),
      finalDiffStats: combineDiffStats(
        operations.map((operation) => operation.expectedDiffStats)
      ),
    };
  }

  async apply(input: {
    projectRootPath: string;
    operations: readonly FileMutationOperation[];
    allowDelete?: boolean;
    allowedWriteRoots?: readonly string[];
  }): Promise<FileMutationApplyResult> {
    const plan = await this.plan(input);
    return this.applyPlanWithRollback(plan);
  }

  async applyPlan(
    plan: Pick<FileMutationPlan, "projectRoot" | "operations" | "finalDiff" | "finalDiffStats">
  ): Promise<FileMutationApplyResult> {
    const appliedOperations: FileMutationAppliedOperation[] = [];
    for (const planned of plan.operations) {
      await applyOne(planned);
      appliedOperations.push(await readActualAppliedOperation(planned, this.diffBuilder));
    }
    return buildApplyResult(plan, appliedOperations);
  }

  async applyPlanWithRollback(
    plan: Pick<FileMutationPlan, "projectRoot" | "operations" | "finalDiff" | "finalDiffStats">
  ): Promise<FileMutationApplyResult> {
    const appliedOperations: FileMutationPlannedOperation[] = [];
    let currentOperation: FileMutationPlannedOperation | null = null;
    try {
      const appliedResults: FileMutationAppliedOperation[] = [];
      for (const planned of plan.operations) {
        currentOperation = planned;
        await applyOne(planned);
        appliedOperations.push(planned);
        appliedResults.push(
          await readActualAppliedOperation(planned, this.diffBuilder)
        );
      }
      return buildApplyResult(plan, appliedResults);
    } catch (err) {
      await this.rollback(appliedOperations);
      if (err instanceof FileMutationPreflightError) throw err;
      throw new FileMutationPreflightError(
        "apply_failed",
        currentOperation?.relativePath ?? "<unknown>",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  async rollback(
    appliedOperations: readonly Pick<FileMutationPlannedOperation, "targetPath" | "beforeContent">[]
  ): Promise<void> {
    for (const planned of [...appliedOperations].reverse()) {
      if (planned.beforeContent === null) {
        await fs.rm(planned.targetPath, { force: true });
        continue;
      }
      await writeTextFileAtomic(planned.targetPath, planned.beforeContent);
    }
  }
}

function buildPlannedOperation(input: {
  operation: FileMutationOperation;
  targetPath: string;
  relativePath: string;
  fileState: FileState;
  diffBuilder: DiffBuilder;
}): FileMutationPlannedOperation {
  const beforeContent = input.fileState.content;
  const afterContent =
    input.operation.changeType === "delete" ? null : input.operation.afterContent;
  if (input.operation.changeType !== "delete" && afterContent === null) {
    throw new FileMutationPreflightError(
      "invalid_operation",
      input.relativePath,
      `File mutation requires afterContent for ${input.relativePath}.`
    );
  }
  const actualChangeType =
    input.operation.changeType === "delete"
      ? "delete"
      : beforeContent === null
        ? "create"
        : "update";
  const diff = input.diffBuilder.build({
    targetPath: input.relativePath,
    beforeContent,
    afterContent,
  });
  return {
    targetPath: input.targetPath,
    relativePath: input.relativePath,
    beforeContent,
    beforeVersion: input.fileState.version,
    afterContent,
    afterVersion:
      afterContent === null
        ? null
        : computeTextVersion(afterContent, input.fileState.mtimeMs),
    changeType: actualChangeType,
    operation: codeChangeOperationFor({
      inputOperation: input.operation,
      targetPath: input.relativePath,
      beforeContent,
      afterContent,
      actualChangeType,
      diff: diff.diff,
    }),
    expectedDiff: diff.diff,
    expectedDiffStats: diff.stats,
  };
}

function codeChangeOperationFor(input: {
  inputOperation: FileMutationOperation;
  targetPath: string;
  beforeContent: string | null;
  afterContent: string | null;
  actualChangeType: "create" | "update" | "delete";
  diff: string;
}): CodeChangeOperation {
  if (input.actualChangeType === "delete") {
    return {
      targetPath: input.targetPath,
      changeType: "delete",
      beforeContent: input.beforeContent,
      afterContent: null,
      diff: input.diff,
      preconditions: [...(input.inputOperation.preconditions ?? [])],
      metadata: input.inputOperation.metadata ?? {},
    };
  }
  return {
    targetPath: input.targetPath,
    changeType: input.actualChangeType,
    beforeContent: input.beforeContent,
    afterContent: input.afterContent ?? "",
    diff: input.diff,
    preconditions: [...(input.inputOperation.preconditions ?? [])],
    metadata: input.inputOperation.metadata ?? {},
  };
}

function assertOperationLegality(input: {
  operation: FileMutationOperation;
  targetPath: string;
  fileState: FileState;
  allowDelete: boolean;
}): void {
  const exists = input.fileState.content !== null;
  if (input.operation.changeType === "delete") {
    if (!input.allowDelete) {
      throw new FileMutationPreflightError(
        "delete_denied",
        input.targetPath,
        `Delete is not allowed for ${input.targetPath}.`
      );
    }
    if (isProtectedDeletePath(input.targetPath)) {
      throw new FileMutationPreflightError(
        "delete_denied",
        input.targetPath,
        `Protected project file cannot be deleted: ${input.targetPath}.`
      );
    }
    if (!exists) {
      throw new FileMutationPreflightError(
        "missing_file",
        input.targetPath,
        `Cannot delete missing file: ${input.targetPath}.`
      );
    }
    return;
  }

  if (input.operation.afterContent === null) {
    throw new FileMutationPreflightError(
      "invalid_operation",
      input.targetPath,
      `Write mutation requires afterContent for ${input.targetPath}.`
    );
  }
  if (Buffer.byteLength(input.operation.afterContent, "utf8") > DEFAULT_MAX_WRITE_BYTES) {
    throw new FileMutationPreflightError(
      "content_too_large",
      input.targetPath,
      `Content is too large to write safely: ${input.targetPath}.`
    );
  }
  if (
    input.operation.changeType === "create" &&
    exists &&
    input.operation.allowOverwrite !== true
  ) {
    throw new FileMutationPreflightError(
      "already_exists",
      input.targetPath,
      `Cannot create existing file: ${input.targetPath}.`
    );
  }
  if (
    input.operation.changeType === "update" &&
    !exists &&
    input.operation.allowOverwrite !== true
  ) {
    throw new FileMutationPreflightError(
      "missing_file",
      input.targetPath,
      `Cannot update missing file: ${input.targetPath}.`
    );
  }
}

function assertOperationPreconditions(input: {
  operation: FileMutationOperation;
  targetPath: string;
  fileState: FileState;
}): void {
  const actualContent = input.fileState.content;
  const actualHash = input.fileState.version?.hash ?? "<missing>";

  for (const precondition of input.operation.preconditions ?? []) {
    if (precondition.kind === "exists" && actualContent === null) {
      throw preconditionError(precondition, input.targetPath, "exists", "<missing>");
    }
    if (precondition.kind === "missing" && actualContent !== null) {
      throw preconditionError(precondition, input.targetPath, "missing", "<present>");
    }
    if (precondition.kind === "content_hash") {
      const actual = actualContent === null ? "<missing>" : contentSha256(actualContent);
      if (actual !== precondition.expected) {
        throw preconditionError(
          precondition,
          input.targetPath,
          precondition.expected ?? "<unspecified>",
          actual
        );
      }
    }
  }

  if (
    input.operation.beforeContent !== undefined &&
    input.operation.beforeContent !== null &&
    actualContent !== null &&
    actualContent !== input.operation.beforeContent
  ) {
    throw versionConflict({
      targetPath: input.targetPath,
      expected: contentSha256(input.operation.beforeContent),
      actual: actualHash,
    });
  }

  const expectedHash =
    input.operation.expectedContentHash ?? input.operation.baseVersion?.hash;
  if (expectedHash && expectedHash !== actualHash) {
    throw versionConflict({
      targetPath: input.targetPath,
      expected: expectedHash,
      actual: actualHash,
    });
  }

  const expectedSize =
    input.operation.expectedSizeBytes ?? input.operation.baseVersion?.sizeBytes;
  if (
    expectedSize !== undefined &&
    input.fileState.version &&
    expectedSize !== input.fileState.version.sizeBytes
  ) {
    throw versionConflict({
      targetPath: input.targetPath,
      expected: String(expectedSize),
      actual: String(input.fileState.version.sizeBytes),
    });
  }

  const expectedMtime =
    input.operation.expectedMtimeMs ?? input.operation.baseVersion?.mtimeMs;
  if (
    expectedMtime !== undefined &&
    input.fileState.version &&
    expectedMtime !== input.fileState.version.mtimeMs
  ) {
    throw versionConflict({
      targetPath: input.targetPath,
      expected: String(expectedMtime),
      actual: String(input.fileState.version.mtimeMs),
    });
  }
}

function preconditionError(
  precondition: CodeChangeOperationPrecondition,
  targetPath: string,
  expected: string,
  actual: string
): FileMutationPreflightError {
  return new FileMutationPreflightError(
    "version_conflict",
    precondition.path || targetPath,
    `File mutation version_conflict for ${precondition.path || targetPath}: expected ${expected}, actual ${actual}`,
    { precondition: { ...precondition, actual }, expected, actual }
  );
}

function versionConflict(input: {
  targetPath: string;
  expected: string;
  actual: string;
}): FileMutationPreflightError {
  return new FileMutationPreflightError(
    "version_conflict",
    input.targetPath,
    `File mutation version_conflict for ${input.targetPath}: expected ${input.expected}, actual ${input.actual}`,
    { expected: input.expected, actual: input.actual }
  );
}

async function applyOne(operation: FileMutationPlannedOperation): Promise<void> {
  if (operation.changeType === "delete") {
    await fs.unlink(operation.targetPath);
    return;
  }
  await writeTextFileAtomic(operation.targetPath, operation.afterContent ?? "");
}

async function readActualAppliedOperation(
  planned: FileMutationPlannedOperation,
  diffBuilder: DiffBuilder
): Promise<FileMutationAppliedOperation> {
  const actualState =
    planned.changeType === "delete"
      ? { content: null, version: null }
      : await readFileState(planned.targetPath, planned.relativePath);
  const actualDiff = diffBuilder.build({
    targetPath: planned.relativePath,
    beforeContent: planned.beforeContent,
    afterContent: actualState.content,
  });
  return {
    ...planned,
    afterContent: actualState.content,
    afterVersion: actualState.version,
    actualDiff: actualDiff.diff,
    actualDiffStats: actualDiff.stats,
  };
}

function buildApplyResult(
  plan: Pick<FileMutationPlan, "projectRoot" | "operations" | "finalDiff" | "finalDiffStats">,
  appliedOperations: FileMutationAppliedOperation[]
): FileMutationApplyResult {
  const actualDiff = appliedOperations.map((operation) => operation.actualDiff).join("\n");
  return {
    projectRoot: plan.projectRoot,
    appliedOperations,
    finalDiff: plan.finalDiff,
    actualDiff,
    finalDiffStats: plan.finalDiffStats,
    actualDiffStats: combineDiffStats(
      appliedOperations.map((operation) => operation.actualDiffStats)
    ),
  };
}

async function writeTextFileAtomic(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(dirname(targetPath), { recursive: true });
  const tempPath = join(
    dirname(targetPath),
    `.${basename(targetPath)}.horus-mutation-${process.pid}-${randomUUID()}.tmp`
  );
  try {
    const handle = await fs.open(tempPath, "wx");
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tempPath, targetPath);
    await fsyncDirectoryBestEffort(dirname(targetPath));
  } catch (err) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw err;
  }
}

async function fsyncDirectoryBestEffort(path: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(path, "r");
    await handle.sync();
  } catch {
    // Some filesystems do not allow directory fsync.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

interface FileState {
  content: string | null;
  version: ProjectFileVersion | null;
  mtimeMs: number | null;
}

async function readFileState(
  targetPath: string,
  relativePath: string
): Promise<FileState> {
  let stat;
  try {
    stat = await fs.lstat(targetPath);
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return { content: null, version: null, mtimeMs: null };
    }
    throw err;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new FileMutationPreflightError(
      "path_forbidden",
      relativePath,
      `File mutation target must be a regular file: ${relativePath}.`
    );
  }
  if (stat.size > DEFAULT_MAX_FILE_BYTES) {
    throw new FileMutationPreflightError(
      "content_too_large",
      relativePath,
      `File is too large to mutate safely: ${relativePath}.`
    );
  }
  const bytes = await fs.readFile(targetPath);
  if (isProbablyBinary(bytes.subarray(0, BINARY_SAMPLE_BYTES))) {
    throw new FileMutationPreflightError(
      "binary_file",
      relativePath,
      `Binary file cannot be mutated safely: ${relativePath}.`
    );
  }
  return {
    content: bytes.toString("utf8"),
    version: computeFileVersion(bytes, stat),
    mtimeMs: stat.mtimeMs,
  };
}

function computeTextVersion(content: string, mtimeMs: number | null): ProjectFileVersion {
  return {
    hash: contentSha256(content),
    sizeBytes: Buffer.byteLength(content, "utf8"),
    mtimeMs: mtimeMs ?? 0,
  };
}

function computeFileVersion(
  bytes: Buffer,
  stat: { size: number; mtimeMs: number }
): ProjectFileVersion {
  return {
    hash: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function contentSha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function isProbablyBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  if (buffer.includes(0)) return true;
  let suspicious = 0;
  for (const byte of buffer) {
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte >= 32 && byte <= 126) continue;
    if (byte >= 128) continue;
    suspicious += 1;
  }
  return suspicious / buffer.length > 0.08;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
