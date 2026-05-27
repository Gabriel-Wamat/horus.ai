import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import {
  FrontendProjectSchema,
  type FrontendProject,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import { FrontendProjectNotFoundError } from "../preview/FileFrontendProjectRegistry.js";
import {
  buildSeedFrontendProject,
  canonicalizeProjectRoot,
} from "../preview/SeedFrontendProject.js";
import type { FrontendProjectRepository } from "./contracts.js";
import { json, slugify, toIso } from "./postgresUtils.js";

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  root_path: string;
  default_route: string;
  dev_command: string | null;
  preview_command_id: string | null;
  command_catalog: unknown;
  preview_url: string | null;
  created_at: Date;
}

export class PostgresFrontendProjectRepository
  implements FrontendProjectRepository
{
  constructor(
    private readonly pool: PgPool,
    private readonly repositoryRoot = resolve(
      fileURLToPath(new URL("../../../../../", import.meta.url))
    ),
    private readonly env: Record<string, string | undefined> = process.env
  ) {}

  async listProjects(): Promise<FrontendProject[]> {
    await this.ensureSeedProject();
    const result = await this.pool.query<ProjectRow>(
      "SELECT * FROM frontend_projects ORDER BY created_at, name"
    );
    return result.rows.map(projectFromRow);
  }

  async getProject(projectId: string): Promise<FrontendProject> {
    await this.ensureSeedProject();
    const result = await this.pool.query<ProjectRow>(
      "SELECT * FROM frontend_projects WHERE id = $1",
      [projectId]
    );
    const row = result.rows[0];
    if (!row) throw new FrontendProjectNotFoundError(projectId);
    return projectFromRow(row);
  }

  async registerProject(input: {
    name: string;
    rootPath: string;
    defaultRoute?: string;
    devCommand?: string | null;
    previewUrl?: string | null;
    previewCommandId?: string | null;
    commandCatalog?: FrontendProject["commandCatalog"];
  }): Promise<FrontendProject> {
    const rootPath = await canonicalizeProjectRoot(this.repositoryRoot, input.rootPath);
    const slug = slugify(input.name, "frontend-project");
    const existing = await this.findBySlug(slug);
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
    });
    await this.upsertProject(project);
    return project;
  }

  private async findBySlug(slug: string): Promise<FrontendProject | null> {
    const result = await this.pool.query<ProjectRow>(
      "SELECT * FROM frontend_projects WHERE slug = $1 ORDER BY created_at LIMIT 1",
      [slug]
    );
    const row = result.rows[0];
    return row ? projectFromRow(row) : null;
  }

  private async ensureSeedProject(): Promise<void> {
    const project = await buildSeedFrontendProject({
      repositoryRoot: this.repositoryRoot,
      env: this.env,
    });
    await this.upsertProject(project);
  }

  private async upsertProject(project: FrontendProject): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO frontend_projects (
        id, name, slug, root_path, default_route, dev_command,
        preview_command_id, command_catalog, preview_url, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        root_path = EXCLUDED.root_path,
        default_route = EXCLUDED.default_route,
        dev_command = EXCLUDED.dev_command,
        preview_command_id = EXCLUDED.preview_command_id,
        command_catalog = EXCLUDED.command_catalog,
        preview_url = EXCLUDED.preview_url
      `,
      [
        project.id,
        project.name,
        project.slug,
        project.rootPath,
        project.defaultRoute,
        project.devCommand,
        project.previewCommandId,
        json(project.commandCatalog),
        project.previewUrl,
        project.createdAt,
      ]
    );
  }

}

function projectFromRow(row: ProjectRow): FrontendProject {
  return FrontendProjectSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    rootPath: row.root_path,
    defaultRoute: row.default_route,
    devCommand: row.dev_command,
    previewCommandId: row.preview_command_id,
    commandCatalog: row.command_catalog,
    previewUrl: row.preview_url,
    createdAt: toIso(row.created_at),
  });
}
