import { promises as fs } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import {
  FrontendProjectSchema,
  type FrontendProject,
} from "@u-build/shared";

const PROJECTS_FILE = "projects.json";
const WEB_PROJECT_ID = "11111111-1111-4111-8111-111111111116";

export class FrontendProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Frontend project not found: ${projectId}`);
    this.name = "FrontendProjectNotFoundError";
  }
}

export class FrontendProjectRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontendProjectRootError";
  }
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

function isInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relation = relative(rootPath, candidatePath);
  return relation === "" || (!relation.startsWith("..") && !relation.includes(`..${sep}`));
}

export class FileFrontendProjectRegistry {
  constructor(
    private readonly baseDir = "./data/frontend-projects",
    private readonly repositoryRoot = resolve(
      fileURLToPath(new URL("../../../../../", import.meta.url))
    )
  ) {}

  private projectsPath(): string {
    return resolve(this.baseDir, PROJECTS_FILE);
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private async canonicalizeProjectRoot(rootPath: string): Promise<string> {
    const repoRoot = await fs.realpath(this.repositoryRoot);
    const candidate = resolve(repoRoot, rootPath);
    const canonical = await fs.realpath(candidate);

    if (!isInsideRoot(repoRoot, canonical)) {
      throw new FrontendProjectRootError(
        `Frontend project root must stay inside repository root: ${rootPath}`
      );
    }

    return canonical;
  }

  private async seedProjects(): Promise<FrontendProject[]> {
    const rootPath = await this.canonicalizeProjectRoot("apps/web");
    return [
      FrontendProjectSchema.parse({
        id: WEB_PROJECT_ID,
        name: "user_stories",
        slug: "user-stories",
        rootPath,
        defaultRoute: "/",
        devCommand: "pnpm --filter @u-build/web dev -- --host 127.0.0.1 --port 5174",
        previewUrl: "http://localhost:5174",
        createdAt: "2026-05-26T00:00:00.000Z",
      }),
    ];
  }

  private async readProjects(): Promise<FrontendProject[]> {
    await this.ensureBaseDir();
    try {
      const raw = await fs.readFile(this.projectsPath(), "utf-8");
      return FrontendProjectSchema.array().parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    const seeded = await this.seedProjects();
    await this.writeProjects(seeded);
    return seeded;
  }

  private async writeProjects(projects: FrontendProject[]): Promise<void> {
    await this.ensureBaseDir();
    const validated = FrontendProjectSchema.array().parse(projects);
    await fs.writeFile(
      this.projectsPath(),
      JSON.stringify(validated, null, 2),
      "utf-8"
    );
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
  }): Promise<FrontendProject> {
    const projects = await this.readProjects();
    const project = FrontendProjectSchema.parse({
      id: uuidv4(),
      name: input.name.trim(),
      slug: slugify(input.name),
      rootPath: await this.canonicalizeProjectRoot(input.rootPath),
      defaultRoute: input.defaultRoute ?? "/",
      devCommand: input.devCommand ?? null,
      previewUrl: input.previewUrl ?? null,
      createdAt: new Date().toISOString(),
    });

    await this.writeProjects([...projects, project]);
    return project;
  }
}
