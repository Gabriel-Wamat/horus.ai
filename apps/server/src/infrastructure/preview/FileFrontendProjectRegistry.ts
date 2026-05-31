import { promises as fs } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import {
  FrontendProjectSchema,
  type FrontendProject,
} from "@u-build/shared";
import {
  buildSeedFrontendProject,
  canonicalizeProjectRoot,
  FrontendProjectRootError,
} from "./SeedFrontendProject.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";

const PROJECTS_FILE = "projects.json";

export class FrontendProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Frontend project not found: ${projectId}`);
    this.name = "FrontendProjectNotFoundError";
  }
}

export { FrontendProjectRootError };

function isInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relation = relative(rootPath, candidatePath);
  return (
    relation === "" ||
    (!relation.startsWith("..") && !relation.includes(`..${sep}`))
  );
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return slug || "frontend-project";
}

export class FileFrontendProjectRegistry {
  constructor(
    private readonly baseDir = "./data/frontend-projects",
    private readonly repositoryRoot = resolve(
      fileURLToPath(new URL("../../../../../", import.meta.url))
    ),
    private readonly env: Record<string, string | undefined> = process.env
  ) {}

  private projectsPath(): string {
    return resolve(this.baseDir, PROJECTS_FILE);
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private async canonicalizeProjectRoot(rootPath: string): Promise<string> {
    return canonicalizeProjectRoot(this.repositoryRoot, rootPath);
  }

  private async seedProjects(): Promise<FrontendProject[]> {
    return [
      await buildSeedFrontendProject({
        repositoryRoot: this.repositoryRoot,
        env: this.env,
      }),
    ];
  }

  private async readProjects(): Promise<FrontendProject[]> {
    await this.ensureBaseDir();
    try {
      const parsed = await readJsonFile(
        this.projectsPath(),
        FrontendProjectSchema.array()
      );
      return Promise.all(parsed.map((project) => this.toRuntimeProject(project)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    const seeded = await this.seedProjects();
    await this.writeProjects(seeded);
    return seeded;
  }

  private async writeProjects(projects: FrontendProject[]): Promise<void> {
    await this.ensureBaseDir();
    const validated = FrontendProjectSchema.array().parse(
      await Promise.all(projects.map((project) => this.toPersistedProject(project)))
    );
    await writeJsonFileAtomic(this.projectsPath(), validated);
  }

  private async toRuntimeProject(project: FrontendProject): Promise<FrontendProject> {
    return FrontendProjectSchema.parse({
      ...project,
      rootPath: await this.canonicalizeProjectRoot(project.rootPath),
    });
  }

  private async toPersistedProject(project: FrontendProject): Promise<FrontendProject> {
    const repoRoot = await fs.realpath(this.repositoryRoot);
    const rootPath = resolve(project.rootPath);
    const persistedRootPath = isInsideRoot(repoRoot, rootPath)
      ? relative(repoRoot, rootPath).split(sep).join("/")
      : project.rootPath;
    return FrontendProjectSchema.parse({
      ...project,
      rootPath: persistedRootPath || ".",
    });
  }

  async listProjects(): Promise<FrontendProject[]> {
    return this.readProjects();
  }

  async getProject(projectId: string): Promise<FrontendProject> {
    const projects = await this.readProjects();
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      throw new FrontendProjectNotFoundError(projectId);
    }
    return project;
  }

  async registerProject(input: {
    name: string;
    rootPath: string;
    defaultRoute?: string;
    devCommand?: string | null;
    previewUrl?: string | null;
    previewCommandId?: string | null;
    commandCatalog?: FrontendProject["commandCatalog"];
    projectKind?: FrontendProject["projectKind"];
    lifecycleStatus?: FrontendProject["lifecycleStatus"];
    visibility?: FrontendProject["visibility"];
    healthStatus?: FrontendProject["healthStatus"];
    healthReasons?: FrontendProject["healthReasons"];
    canonicalProjectId?: string | null;
    projectWorkspaceId?: string | null;
    appFingerprint?: string | null;
    lastHealthCheckedAt?: string | null;
    archivedAt?: string | null;
    archivedReason?: string | null;
  }): Promise<FrontendProject> {
    const projects = await this.readProjects();
    const rootPath = await this.canonicalizeProjectRoot(input.rootPath);
    const slug = slugify(input.name);
    const existing =
      input.projectWorkspaceId === undefined || input.projectWorkspaceId === null
        ? projects.find((item) => item.slug === slug)
        : projects.find(
            (item) => item.projectWorkspaceId === input.projectWorkspaceId
          ) ?? projects.find((item) => item.slug === slug);
    const project = FrontendProjectSchema.parse({
      id: existing?.id ?? uuidv4(),
      name: input.name.trim(),
      slug,
      rootPath,
      defaultRoute: input.defaultRoute ?? "/",
      devCommand: input.devCommand ?? null,
      previewCommandId: input.previewCommandId ?? null,
      commandCatalog: input.commandCatalog ?? [],
      previewUrl: input.previewUrl ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      projectKind: input.projectKind ?? existing?.projectKind ?? "generated",
      lifecycleStatus:
        input.lifecycleStatus ?? existing?.lifecycleStatus ?? "published",
      visibility: input.visibility ?? existing?.visibility ?? "visible",
      healthStatus: input.healthStatus ?? existing?.healthStatus ?? "unknown",
      healthReasons: input.healthReasons ?? existing?.healthReasons ?? [],
      canonicalProjectId:
        input.canonicalProjectId ?? existing?.canonicalProjectId ?? null,
      projectWorkspaceId:
        input.projectWorkspaceId ?? existing?.projectWorkspaceId ?? null,
      appFingerprint: input.appFingerprint ?? existing?.appFingerprint ?? null,
      lastHealthCheckedAt:
        input.lastHealthCheckedAt ?? existing?.lastHealthCheckedAt ?? null,
      archivedAt: input.archivedAt ?? existing?.archivedAt ?? null,
      archivedReason: input.archivedReason ?? existing?.archivedReason ?? null,
    });

    await this.writeProjects([
      ...projects.filter((item) => item.id !== project.id),
      project,
    ]);
    return project;
  }
}
