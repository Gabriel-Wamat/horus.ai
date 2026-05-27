import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { basename, relative, resolve } from "node:path";
import type { Writable } from "node:stream";
import type { Archiver } from "archiver";
import { isInsideRoot } from "./ProjectPathSafety.js";
import {
  shouldIgnoreProjectPath,
  toPosixRelativePath,
} from "./ProjectFileTreeCollector.js";
import {
  ProjectFileBrowserError,
  type ProjectFileBrowserService,
} from "./ProjectFileBrowserService.js";

const DEFAULT_MAX_FILES = 10_000;
const DEFAULT_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const require = createRequire(import.meta.url);
const { ZipArchive } = require("archiver") as {
  ZipArchive: new (options?: unknown) => Archiver;
};

export interface ProjectArchiveServiceOptions {
  maxFiles?: number;
  maxTotalBytes?: number;
  logger?: Pick<Console, "info" | "warn">;
}

export interface ProjectArchiveEntry {
  absolutePath: string;
  archivePath: string;
  sizeBytes: number;
}

export interface ProjectArchiveManifest {
  projectId: string;
  runId: string | null;
  rootLabel: string;
  fileName: string;
  entries: ProjectArchiveEntry[];
  skippedCount: number;
  totalBytes: number;
}

export class ProjectArchiveService {
  private readonly maxFiles: number;
  private readonly maxTotalBytes: number;
  private readonly logger: Pick<Console, "info" | "warn">;

  constructor(
    private readonly fileBrowser: ProjectFileBrowserService,
    options: ProjectArchiveServiceOptions = {}
  ) {
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    this.logger = options.logger ?? console;
  }

  async createManifest(input: {
    projectId: string;
    runId?: string;
  }): Promise<ProjectArchiveManifest> {
    const startedAt = Date.now();
    const resolved = await this.fileBrowser.resolveArchiveRoot(input);
    const rootRealPath = await fs.realpath(resolved.rootPath);
    const topLevelFolder = sanitizeArchiveSegment(
      resolved.project.slug || resolved.project.name || resolved.rootLabel
    );
    const entries: ProjectArchiveEntry[] = [];
    let skippedCount = 0;
    let totalBytes = 0;

    this.logger.info("project_archive_requested", {
      project_id: input.projectId,
      run_id: resolved.run?.id ?? null,
      root_label: resolved.rootLabel,
    });

    const visit = async (directoryPath: string): Promise<void> => {
      const dirents = await fs.readdir(directoryPath, { withFileTypes: true });
      dirents.sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });

      for (const dirent of dirents) {
        const absolutePath = resolve(directoryPath, dirent.name);
        const relativePath = toPosixRelativePath(relative(rootRealPath, absolutePath));
        if (shouldIgnoreProjectPath(relativePath, dirent.name)) {
          skippedCount += 1;
          continue;
        }

        let stat;
        let realPath;
        try {
          stat = await fs.lstat(absolutePath);
          realPath = await fs.realpath(absolutePath);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            skippedCount += 1;
            continue;
          }
          throw err;
        }

        if (!isInsideRoot(rootRealPath, realPath) || stat.isSymbolicLink()) {
          skippedCount += 1;
          continue;
        }

        if (stat.isDirectory()) {
          await visit(absolutePath);
          continue;
        }

        if (!stat.isFile()) {
          skippedCount += 1;
          continue;
        }

        if (entries.length + 1 > this.maxFiles) {
          throw new ProjectFileBrowserError(
            "file_too_large",
            "Project has too many files to download safely.",
            413,
            { maxFiles: this.maxFiles }
          );
        }

        totalBytes += stat.size;
        if (totalBytes > this.maxTotalBytes) {
          throw new ProjectFileBrowserError(
            "file_too_large",
            "Project is too large to download safely.",
            413,
            { maxTotalBytes: this.maxTotalBytes }
          );
        }

        entries.push({
          absolutePath,
          archivePath: `${topLevelFolder}/${relativePath}`,
          sizeBytes: stat.size,
        });
      }
    };

    await visit(rootRealPath);
    const manifest = {
      projectId: resolved.project.id,
      runId: resolved.run?.id ?? null,
      rootLabel: resolved.rootLabel,
      fileName: buildArchiveFileName(topLevelFolder),
      entries,
      skippedCount,
      totalBytes,
    };

    this.logger.info("project_archive_manifest_created", {
      project_id: manifest.projectId,
      run_id: manifest.runId,
      file_count: manifest.entries.length,
      skipped_count: manifest.skippedCount,
      total_bytes: manifest.totalBytes,
      duration_ms: Date.now() - startedAt,
    });

    return manifest;
  }

  async streamZip(manifest: ProjectArchiveManifest, output: Writable): Promise<void> {
    const startedAt = Date.now();
    const archive = new ZipArchive({ zlib: { level: 9 } });

    await new Promise<void>((resolvePromise, reject) => {
      let settled = false;
      const resolveOnce = (): void => {
        if (settled) return;
        settled = true;
        resolvePromise();
      };
      archive.on("warning", reject);
      archive.on("error", reject);
      output.on("error", reject);
      output.on("finish", resolveOnce);
      output.on("close", resolveOnce);

      archive.pipe(output);
      for (const entry of manifest.entries) {
        archive.file(entry.absolutePath, { name: entry.archivePath });
      }
      archive.finalize().catch(reject);
    });

    this.logger.info("project_archive_completed", {
      project_id: manifest.projectId,
      run_id: manifest.runId,
      file_count: manifest.entries.length,
      skipped_count: manifest.skippedCount,
      total_bytes: manifest.totalBytes,
      duration_ms: Date.now() - startedAt,
    });
  }
}

function sanitizeArchiveSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return normalized || "horus-project";
}

function buildArchiveFileName(topLevelFolder: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\..+$/u, "Z");
  return `horus-project-${basename(topLevelFolder)}-${stamp}.zip`;
}
