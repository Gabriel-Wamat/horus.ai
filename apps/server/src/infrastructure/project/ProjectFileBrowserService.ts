import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import type {
  ProjectFileBrowserErrorCode,
  ProjectFileBrowserProject,
  ProjectFileContentResponse,
  ProjectFileVersion,
  SaveProjectFileResponse,
  ProjectFileTreeResponse,
  ProjectConstructionRun,
  ProjectWorkspace,
  HorusProjectManifest,
} from "@u-build/shared";
import type { ProjectConstructionRepository } from "../repositories/contracts.js";
import {
  ProjectConstructionRunNotFoundError,
  ProjectWorkspaceNotFoundError,
} from "../repositories/FileProjectConstructionRepository.js";
import {
  inferProjectFileLanguage,
  isSensitiveProjectPath,
  ProjectFileTreeCollector,
  toPosixRelativePath,
} from "./ProjectFileTreeCollector.js";
import { isGitMetadataPath, isInsideRoot, resolveInsideRoot } from "./ProjectPathSafety.js";
import { GitCommandExecutor } from "./GitCommandExecutor.js";
import { ProjectConfigService } from "./ProjectConfigService.js";
import { ProjectManifestService } from "./ProjectManifestService.js";

const DEFAULT_MAX_BYTES = 512_000;
const BINARY_SAMPLE_BYTES = 8_000;
const DEFAULT_MAX_WRITE_BYTES = 512_000;

export class ProjectFileBrowserError extends Error {
  constructor(
    public readonly code: ProjectFileBrowserErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ProjectFileBrowserError";
  }
}

export interface ProjectFileBrowserServiceOptions {
  collector?: ProjectFileTreeCollector;
  git?: GitCommandExecutor;
  configService?: ProjectConfigService;
  manifestService?: ProjectManifestService;
  logger?: Pick<Console, "info" | "warn">;
}

export class ProjectFileBrowserService {
  private readonly collector: ProjectFileTreeCollector;
  private readonly git: GitCommandExecutor;
  private readonly configService: ProjectConfigService;
  private readonly manifestService: ProjectManifestService;
  private readonly logger: Pick<Console, "info" | "warn">;

  constructor(
    private readonly projectConstruction: ProjectConstructionRepository,
    options: ProjectFileBrowserServiceOptions = {}
  ) {
    this.collector = options.collector ?? new ProjectFileTreeCollector();
    this.git = options.git ?? new GitCommandExecutor();
    this.configService = options.configService ?? new ProjectConfigService();
    this.manifestService = options.manifestService ?? new ProjectManifestService();
    this.logger = options.logger ?? console;
  }

  async listProjects(): Promise<ProjectFileBrowserProject[]> {
    const [projects, runs] = await Promise.all([
      this.projectConstruction.listProjectWorkspaces(),
      this.projectConstruction.listConstructionRuns(),
    ]);
    return projects
      .map((project) => {
        const latestRun = runs.find((run) => run.projectWorkspaceId === project.id);
        return {
          id: project.id,
          name: project.name,
          rootLabel: basename(project.rootPath),
          latestRunId: latestRun?.id ?? null,
          status: latestRun?.status ?? null,
          updatedAt: latestRun?.finishedAt ?? latestRun?.startedAt ?? project.updatedAt,
        };
      })
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  }

  async getTree(input: {
    projectId: string;
    runId?: string;
    limit?: number;
    depth?: number;
  }): Promise<ProjectFileTreeResponse> {
    const resolved = await this.resolveReadableRoot(input);
    const startedAt = Date.now();
    const collectorOptions = {
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.depth !== undefined ? { maxDepth: input.depth } : {}),
    };
    const result = await this.collector.collect(resolved.rootPath, collectorOptions);
    this.logger.info("project_file_tree_requested", {
      project_id: input.projectId,
      run_id: resolved.run?.id ?? null,
      entry_count: result.entries.length,
      partial: result.partial,
      duration_ms: Date.now() - startedAt,
    });
    return {
      projectId: resolved.project.id,
      runId: resolved.run?.id ?? null,
      rootLabel: basename(resolved.rootPath),
      entries: result.entries,
      partial: result.partial,
      ignoredCount: result.ignoredCount,
      generatedAt: new Date().toISOString(),
    };
  }

  async getManifest(input: {
    projectId: string;
    runId?: string;
  }): Promise<HorusProjectManifest> {
    const resolved = await this.resolveReadableRoot(input);
    const config = await this.configService.load(resolved.rootPath);
    return this.manifestService.ensure({
      projectRoot: resolved.rootPath,
      projectId: resolved.project.id,
      projectName: resolved.project.name,
      projectStack: resolved.project.projectStack ?? config.projectStack,
      config,
    });
  }

  async getFileContent(input: {
    projectId: string;
    runId?: string;
    path: string;
    maxBytes?: number;
  }): Promise<ProjectFileContentResponse> {
    const resolved = await this.resolveReadableRoot(input);
    const startedAt = Date.now();
    const normalizedPath = normalizeRequestedPath(input.path);
    const maxBytes = Math.min(input.maxBytes ?? DEFAULT_MAX_BYTES, 2_000_000);

    if (isSensitiveProjectPath(normalizedPath)) {
      this.logDenied(input.projectId, resolved.run?.id ?? null, normalizedPath, "sensitive_path");
      throw new ProjectFileBrowserError(
        "forbidden_path",
        "This file cannot be displayed.",
        403
      );
    }

    let targetPath: string;
    try {
      targetPath = resolveInsideRoot(resolved.rootPath, normalizedPath);
    } catch {
      this.logDenied(input.projectId, resolved.run?.id ?? null, normalizedPath, "path_escape");
      throw new ProjectFileBrowserError(
        "forbidden_path",
        "This path is outside the selected project.",
        403
      );
    }

    if (isGitMetadataPath(resolved.rootPath, targetPath)) {
      this.logDenied(input.projectId, resolved.run?.id ?? null, normalizedPath, "git_metadata");
      throw new ProjectFileBrowserError(
        "forbidden_path",
        "This file cannot be displayed.",
        403
      );
    }

    let stat;
    let realTargetPath;
    try {
      stat = await fs.lstat(targetPath);
      realTargetPath = await fs.realpath(targetPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ProjectFileBrowserError("file_not_found", "File not found.", 404);
      }
      throw err;
    }

    if (!isInsideRoot(await fs.realpath(resolved.rootPath), realTargetPath)) {
      this.logDenied(input.projectId, resolved.run?.id ?? null, normalizedPath, "symlink_escape");
      throw new ProjectFileBrowserError(
        "forbidden_path",
        "This path is outside the selected project.",
        403
      );
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      this.logDenied(input.projectId, resolved.run?.id ?? null, normalizedPath, "not_regular_file");
      throw new ProjectFileBrowserError(
        "forbidden_path",
        "This path cannot be displayed.",
        403
      );
    }

    const sample = await readFilePrefix(targetPath, Math.min(BINARY_SAMPLE_BYTES, maxBytes));
    const binary = isProbablyBinary(sample);
    const truncated = stat.size > maxBytes;
    const content = binary
      ? null
      : (await readFilePrefix(targetPath, Math.min(stat.size, maxBytes))).toString("utf-8");
    const version =
      binary || truncated ? undefined : computeFileVersion(await fs.readFile(targetPath), stat);
    this.logger.info("project_file_read_completed", {
      project_id: input.projectId,
      path: normalizedPath,
      size_bytes: stat.size,
      truncated,
      binary,
      duration_ms: Date.now() - startedAt,
    });

    return {
      projectId: resolved.project.id,
      runId: resolved.run?.id ?? null,
      path: normalizedPath,
      content,
      encoding: "utf-8",
      language: inferProjectFileLanguage(normalizedPath),
      sizeBytes: stat.size,
      truncated,
      binary,
      ...(version ? { version } : {}),
      generatedAt: new Date().toISOString(),
    };
  }

  async saveFile(input: {
    projectId: string;
    runId?: string | null;
    path: string;
    content: string;
    baseVersion: ProjectFileVersion;
  }): Promise<SaveProjectFileResponse> {
    const resolved = await this.resolveReadableRoot({
      projectId: input.projectId,
      ...(input.runId ? { runId: input.runId } : {}),
    });
    const startedAt = Date.now();
    const normalizedPath = normalizeRequestedPath(input.path);

    const targetPath = await this.resolveWritableFilePath({
      projectId: input.projectId,
      runId: resolved.run?.id ?? null,
      rootPath: resolved.rootPath,
      normalizedPath,
    });

    const currentStat = await fs.stat(targetPath);
    if (currentStat.size > DEFAULT_MAX_BYTES) {
      this.logDenied(input.projectId, resolved.run?.id ?? null, normalizedPath, "file_too_large");
      throw new ProjectFileBrowserError(
        "file_too_large",
        "This file is too large to edit safely.",
        413
      );
    }

    const currentBytes = await fs.readFile(targetPath);
    if (isProbablyBinary(currentBytes.subarray(0, BINARY_SAMPLE_BYTES))) {
      this.logDenied(input.projectId, resolved.run?.id ?? null, normalizedPath, "binary_file");
      throw new ProjectFileBrowserError(
        "binary_file",
        "Binary files cannot be edited.",
        403
      );
    }

    const currentVersion = computeFileVersion(currentBytes, currentStat);
    if (currentVersion.hash !== input.baseVersion.hash) {
      this.logger.warn("project_file_save_rejected", {
        project_id: input.projectId,
        run_id: resolved.run?.id ?? null,
        normalized_path: normalizedPath,
        code: "version_conflict",
      });
      throw new ProjectFileBrowserError(
        "version_conflict",
        "This file changed on disk after it was opened.",
        409,
        { currentVersion }
      );
    }

    const nextBytes = Buffer.from(input.content, "utf-8");
    if (nextBytes.byteLength > DEFAULT_MAX_WRITE_BYTES) {
      throw new ProjectFileBrowserError(
        "content_too_large",
        "Edited content is too large to save safely.",
        413
      );
    }

    const tempPath = join(
      dirname(targetPath),
      `.${basename(targetPath)}.horus-save-${process.pid}-${randomUUID()}.tmp`
    );
    try {
      const handle = await fs.open(tempPath, "wx");
      try {
        await handle.writeFile(nextBytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(tempPath, targetPath);
      await fsyncDirectoryBestEffort(dirname(targetPath));
    } catch (err) {
      await fs.unlink(tempPath).catch(() => undefined);
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        throw new ProjectFileBrowserError(
          "permission_denied",
          "The server does not have permission to save this file.",
          403
        );
      }
      throw new ProjectFileBrowserError(
        "write_failed",
        err instanceof Error ? err.message : "Failed to save file.",
        500
      );
    }

    const savedStat = await fs.stat(targetPath);
    const savedBytes = await fs.readFile(targetPath);
    const savedVersion = computeFileVersion(savedBytes, savedStat);
    this.logger.info("project_file_save_succeeded", {
      project_id: input.projectId,
      run_id: resolved.run?.id ?? null,
      normalized_path: normalizedPath,
      byte_length: savedBytes.byteLength,
      old_hash_prefix: input.baseVersion.hash.slice(0, 12),
      new_hash_prefix: savedVersion.hash.slice(0, 12),
      duration_ms: Date.now() - startedAt,
    });

    return {
      projectId: resolved.project.id,
      runId: resolved.run?.id ?? null,
      path: normalizedPath,
      content: savedBytes.toString("utf-8"),
      encoding: "utf-8",
      language: inferProjectFileLanguage(normalizedPath),
      sizeBytes: savedStat.size,
      truncated: false,
      binary: false,
      version: savedVersion,
      savedAt: new Date().toISOString(),
    };
  }

  private async resolveWritableFilePath(input: {
    projectId: string;
    runId: string | null;
    rootPath: string;
    normalizedPath: string;
  }): Promise<string> {
    if (isSensitiveProjectPath(input.normalizedPath)) {
      this.logDenied(input.projectId, input.runId, input.normalizedPath, "sensitive_path");
      throw new ProjectFileBrowserError(
        "sensitive_path",
        "This file cannot be edited.",
        403
      );
    }

    let targetPath: string;
    try {
      targetPath = resolveInsideRoot(input.rootPath, input.normalizedPath);
    } catch {
      this.logDenied(input.projectId, input.runId, input.normalizedPath, "path_escape");
      throw new ProjectFileBrowserError(
        "forbidden_path",
        "This path is outside the selected project.",
        403
      );
    }

    if (isGitMetadataPath(input.rootPath, targetPath)) {
      this.logDenied(input.projectId, input.runId, input.normalizedPath, "git_metadata");
      throw new ProjectFileBrowserError(
        "forbidden_path",
        "Git metadata cannot be edited.",
        403
      );
    }

    let lstat;
    let realTargetPath;
    try {
      lstat = await fs.lstat(targetPath);
      realTargetPath = await fs.realpath(targetPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ProjectFileBrowserError("file_not_found", "File not found.", 404);
      }
      throw err;
    }

    if (!isInsideRoot(await fs.realpath(input.rootPath), realTargetPath)) {
      this.logDenied(input.projectId, input.runId, input.normalizedPath, "symlink_escape");
      throw new ProjectFileBrowserError(
        "forbidden_path",
        "This path is outside the selected project.",
        403
      );
    }
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      this.logDenied(input.projectId, input.runId, input.normalizedPath, "not_regular_file");
      throw new ProjectFileBrowserError(
        "not_regular_file",
        "Only regular files can be edited.",
        403
      );
    }
    return targetPath;
  }

  private async resolveReadableRoot(input: {
    projectId: string;
    runId?: string;
  }): Promise<{
    project: ProjectWorkspace;
    run: ProjectConstructionRun | null;
    rootPath: string;
  }> {
    let project: ProjectWorkspace;
    try {
      project = await this.projectConstruction.getProjectWorkspace(input.projectId);
    } catch (err) {
      if (err instanceof ProjectWorkspaceNotFoundError) {
        throw new ProjectFileBrowserError(
          "project_not_found",
          "Project not found.",
          404
        );
      }
      throw err;
    }

    if (!input.runId) {
      return {
        project,
        run: null,
        rootPath: await this.resolveProjectRoot(project),
      };
    }

    let run: ProjectConstructionRun;
    try {
      run = await this.projectConstruction.getConstructionRun(input.runId);
    } catch (err) {
      if (err instanceof ProjectConstructionRunNotFoundError) {
        throw new ProjectFileBrowserError("run_not_found", "Run not found.", 404);
      }
      throw err;
    }
    if (run.projectWorkspaceId !== project.id) {
      throw new ProjectFileBrowserError(
        "run_not_found",
        "Run not found for this project.",
        404
      );
    }

    const runRoot = await this.resolveRunRoot(project, run);
    return { project, run, rootPath: runRoot };
  }

  private async resolveProjectRoot(project: ProjectWorkspace): Promise<string> {
    try {
      return await fs.realpath(project.rootPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ProjectFileBrowserError(
          "project_not_found",
          "Project root not found.",
          404
        );
      }
      throw err;
    }
  }

  private async resolveRunRoot(
    project: ProjectWorkspace,
    run: ProjectConstructionRun
  ): Promise<string> {
    const projectRoot = await this.resolveProjectRoot(project);
    let runRoot: string;
    try {
      runRoot = await fs.realpath(resolve(run.workspacePath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ProjectFileBrowserError("run_not_found", "Run workspace not found.", 404);
      }
      throw err;
    }

    if (project.targetMode === "new_project") {
      if (runRoot !== projectRoot) {
        throw new ProjectFileBrowserError(
          "forbidden_path",
          "Run workspace is not registered for this project.",
          403
        );
      }
      return runRoot;
    }

    await this.assertGitWorktreeBelongsToProject(projectRoot, runRoot);
    return runRoot;
  }

  private async assertGitWorktreeBelongsToProject(
    projectRoot: string,
    runRoot: string
  ): Promise<void> {
    try {
      const topLevel = (
        await this.git.run(runRoot, ["rev-parse", "--show-toplevel"])
      ).stdout.trim();
      const commonDirRaw = (
        await this.git.run(runRoot, ["rev-parse", "--git-common-dir"])
      ).stdout.trim();
      const runTopLevel = await fs.realpath(topLevel);
      const commonDir = await fs.realpath(resolve(runRoot, commonDirRaw));
      const projectGitDir = await fs.realpath(resolve(projectRoot, ".git"));

      if (runTopLevel !== runRoot || commonDir !== projectGitDir) {
        throw new Error("Git worktree does not belong to selected project.");
      }
    } catch {
      throw new ProjectFileBrowserError(
        "forbidden_path",
        "Run workspace is not a registered git worktree for this project.",
        403
      );
    }
  }

  private logDenied(
    projectId: string,
    runId: string | null,
    normalizedPath: string,
    reason: string
  ): void {
    this.logger.warn("project_file_read_denied", {
      project_id: projectId,
      run_id: runId,
      normalized_path: normalizedPath,
      reason,
    });
  }
}

function normalizeRequestedPath(path: string): string {
  const normalized = toPosixRelativePath(path.trim())
    .replace(/^\/+/u, "")
    .split("/")
    .filter((part) => part.length > 0)
    .join("/");
  const parts = normalized.split("/");
  if (!normalized || parts.includes("..") || parts.includes(".")) {
    throw new ProjectFileBrowserError(
      "forbidden_path",
      "This path is outside the selected project.",
      403
    );
  }
  return normalized;
}

async function readFilePrefix(path: string, maxBytes: number): Promise<Buffer> {
  const handle = await fs.open(path, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const result = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
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

function computeFileVersion(bytes: Buffer, stat: { size: number; mtimeMs: number }): ProjectFileVersion {
  return {
    hash: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

async function fsyncDirectoryBestEffort(path: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(path, "r");
    await handle.sync();
  } catch {
    // Some platforms/filesystems do not support fsync on directories.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
