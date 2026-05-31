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
  project_kind?: string;
  lifecycle_status?: string;
  visibility?: string;
  health_status?: string;
  health_reasons?: unknown;
  canonical_project_id?: string | null;
  project_workspace_id?: string | null;
  app_fingerprint?: string | null;
  last_health_checked_at?: Date | null;
  archived_at?: Date | null;
  archived_reason?: string | null;
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
    const rootPath = await canonicalizeProjectRoot(this.repositoryRoot, input.rootPath);
    const slug = slugify(input.name, "frontend-project");
    const existing =
      input.projectWorkspaceId === undefined || input.projectWorkspaceId === null
        ? await this.findBySlug(slug)
        : (await this.findByProjectWorkspaceId(input.projectWorkspaceId)) ??
          (await this.findBySlug(slug));
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

  private async findByProjectWorkspaceId(
    projectWorkspaceId: string
  ): Promise<FrontendProject | null> {
    const result = await this.pool.query<ProjectRow>(
      "SELECT * FROM frontend_projects WHERE project_workspace_id = $1 ORDER BY created_at LIMIT 1",
      [projectWorkspaceId]
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
        preview_command_id, command_catalog, preview_url, created_at,
        project_kind, lifecycle_status, visibility, health_status, health_reasons,
        canonical_project_id, project_workspace_id, app_fingerprint,
        last_health_checked_at, archived_at, archived_reason
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10,
        $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19, $20, $21
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        root_path = EXCLUDED.root_path,
        default_route = EXCLUDED.default_route,
        dev_command = EXCLUDED.dev_command,
        preview_command_id = EXCLUDED.preview_command_id,
        command_catalog = EXCLUDED.command_catalog,
        preview_url = EXCLUDED.preview_url,
        project_kind = EXCLUDED.project_kind,
        lifecycle_status = EXCLUDED.lifecycle_status,
        visibility = EXCLUDED.visibility,
        health_status = EXCLUDED.health_status,
        health_reasons = EXCLUDED.health_reasons,
        canonical_project_id = EXCLUDED.canonical_project_id,
        project_workspace_id = EXCLUDED.project_workspace_id,
        app_fingerprint = EXCLUDED.app_fingerprint,
        last_health_checked_at = EXCLUDED.last_health_checked_at,
        archived_at = EXCLUDED.archived_at,
        archived_reason = EXCLUDED.archived_reason
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
        project.projectKind,
        project.lifecycleStatus,
        project.visibility,
        project.healthStatus,
        json(project.healthReasons),
        project.canonicalProjectId,
        project.projectWorkspaceId,
        project.appFingerprint,
        project.lastHealthCheckedAt,
        project.archivedAt,
        project.archivedReason,
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
    projectKind: row.project_kind,
    lifecycleStatus: row.lifecycle_status,
    visibility: row.visibility,
    healthStatus: row.health_status,
    healthReasons: row.health_reasons,
    canonicalProjectId: row.canonical_project_id ?? null,
    projectWorkspaceId: row.project_workspace_id ?? null,
    appFingerprint: row.app_fingerprint ?? null,
    lastHealthCheckedAt: row.last_health_checked_at
      ? toIso(row.last_health_checked_at)
      : null,
    archivedAt: row.archived_at ? toIso(row.archived_at) : null,
    archivedReason: row.archived_reason ?? null,
  });
}
