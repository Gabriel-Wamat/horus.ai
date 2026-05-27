import {
  ProjectCommandRunSchema,
  ProjectConstructionRunSchema,
  ProjectQualityGateSchema,
  ProjectWorkspaceSchema,
  type ProjectCommandRun,
  type ProjectConstructionRun,
  type ProjectQualityGate,
  type ProjectWorkspace,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import {
  ProjectConstructionRunNotFoundError,
  ProjectWorkspaceNotFoundError,
} from "./FileProjectConstructionRepository.js";
import type { ProjectConstructionRepository } from "./contracts.js";
import { json, toIso } from "./postgresUtils.js";

type ProjectWorkspaceRow = {
  id: string;
  workspace_folder_id: string | null;
  name: string;
  slug: string;
  target_mode: ProjectWorkspace["targetMode"];
  root_path: string;
  config_path: string;
  git_repository_path: string | null;
  current_branch: string | null;
  base_ref: string | null;
  project_stack: string | null;
  created_at: Date;
  updated_at: Date;
};

type ProjectConstructionRunRow = {
  id: string;
  project_workspace_id: string;
  workflow_run_id: string | null;
  status: ProjectConstructionRun["status"];
  workspace_path: string;
  branch_name: string | null;
  base_ref: string | null;
  selected_user_story_ids: unknown;
  selected_spec_ids: unknown;
  started_at: Date | null;
  finished_at: Date | null;
  error: string | null;
};

type ProjectCommandRunRow = {
  id: string;
  assignment_id: string | null;
  construction_run_id: string;
  command_id: string;
  command: string;
  cwd: string;
  exit_code: number | null;
  stdout_tail: string;
  stderr_tail: string;
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number;
  sandbox_profile: string | null;
};

type ProjectQualityGateRow = {
  id: string;
  construction_run_id: string;
  assignment_id: string | null;
  status: ProjectQualityGate["status"];
  checks: unknown;
  failed_checks: unknown;
  diff_stats: unknown;
  commit_sha: string | null;
  created_at: Date;
};

export class PostgresProjectConstructionRepository
  implements ProjectConstructionRepository
{
  constructor(private readonly pool: PgPool) {}

  async saveProjectWorkspace(project: ProjectWorkspace): Promise<ProjectWorkspace> {
    const validated = ProjectWorkspaceSchema.parse(project);
    await this.pool.query(
      `
      INSERT INTO project_workspaces (
        id, workspace_folder_id, name, slug, target_mode, root_path, config_path,
        git_repository_path, current_branch, base_ref, project_stack, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO UPDATE SET
        workspace_folder_id = EXCLUDED.workspace_folder_id,
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        target_mode = EXCLUDED.target_mode,
        root_path = EXCLUDED.root_path,
        config_path = EXCLUDED.config_path,
        git_repository_path = EXCLUDED.git_repository_path,
        current_branch = EXCLUDED.current_branch,
        base_ref = EXCLUDED.base_ref,
        project_stack = EXCLUDED.project_stack,
        updated_at = EXCLUDED.updated_at
      `,
      [
        validated.id,
        validated.workspaceFolderId,
        validated.name,
        validated.slug,
        validated.targetMode,
        validated.rootPath,
        validated.configPath,
        validated.gitRepositoryPath,
        validated.currentBranch,
        validated.baseRef,
        validated.projectStack,
        validated.createdAt,
        validated.updatedAt,
      ]
    );
    return validated;
  }

  async getProjectWorkspace(projectWorkspaceId: string): Promise<ProjectWorkspace> {
    const result = await this.pool.query<ProjectWorkspaceRow>(
      "SELECT * FROM project_workspaces WHERE id = $1",
      [projectWorkspaceId]
    );
    const row = result.rows[0];
    if (!row) throw new ProjectWorkspaceNotFoundError(projectWorkspaceId);
    return projectFromRow(row);
  }

  async listProjectWorkspaces(): Promise<ProjectWorkspace[]> {
    const result = await this.pool.query<ProjectWorkspaceRow>(
      "SELECT * FROM project_workspaces ORDER BY created_at DESC"
    );
    return result.rows.map(projectFromRow);
  }

  async saveConstructionRun(
    run: ProjectConstructionRun
  ): Promise<ProjectConstructionRun> {
    return this.updateConstructionRun(run);
  }

  async updateConstructionRun(
    run: ProjectConstructionRun
  ): Promise<ProjectConstructionRun> {
    const validated = ProjectConstructionRunSchema.parse(run);
    await this.pool.query(
      `
      INSERT INTO project_construction_runs (
        id, project_workspace_id, workflow_run_id, status, workspace_path,
        branch_name, base_ref, selected_user_story_ids, selected_spec_ids,
        started_at, finished_at, error
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        workspace_path = EXCLUDED.workspace_path,
        branch_name = EXCLUDED.branch_name,
        base_ref = EXCLUDED.base_ref,
        selected_user_story_ids = EXCLUDED.selected_user_story_ids,
        selected_spec_ids = EXCLUDED.selected_spec_ids,
        started_at = EXCLUDED.started_at,
        finished_at = EXCLUDED.finished_at,
        error = EXCLUDED.error
      `,
      [
        validated.id,
        validated.projectWorkspaceId,
        validated.workflowRunId,
        validated.status,
        validated.workspacePath,
        validated.branchName,
        validated.baseRef,
        json(validated.selectedUserStoryIds),
        json(validated.selectedSpecIds),
        validated.startedAt,
        validated.finishedAt,
        validated.error,
      ]
    );
    return validated;
  }

  async getConstructionRun(runId: string): Promise<ProjectConstructionRun> {
    const result = await this.pool.query<ProjectConstructionRunRow>(
      "SELECT * FROM project_construction_runs WHERE id = $1",
      [runId]
    );
    const row = result.rows[0];
    if (!row) throw new ProjectConstructionRunNotFoundError(runId);
    return runFromRow(row);
  }

  async listConstructionRuns(
    projectWorkspaceId?: string
  ): Promise<ProjectConstructionRun[]> {
    const result =
      projectWorkspaceId === undefined
        ? await this.pool.query<ProjectConstructionRunRow>(
            "SELECT * FROM project_construction_runs ORDER BY started_at DESC NULLS LAST"
          )
        : await this.pool.query<ProjectConstructionRunRow>(
            "SELECT * FROM project_construction_runs WHERE project_workspace_id = $1 ORDER BY started_at DESC NULLS LAST",
            [projectWorkspaceId]
          );
    return result.rows.map(runFromRow);
  }

  async appendCommandRun(commandRun: ProjectCommandRun): Promise<ProjectCommandRun> {
    const run = ProjectCommandRunSchema.parse(commandRun);
    await this.pool.query(
      `
      INSERT INTO project_command_runs (
        id, assignment_id, construction_run_id, command_id, command, cwd, exit_code,
        stdout_tail, stderr_tail, started_at, finished_at, duration_ms, sandbox_profile
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `,
      [
        run.id,
        run.assignmentId,
        run.constructionRunId,
        run.commandId,
        run.command,
        run.cwd,
        run.exitCode,
        run.stdoutTail,
        run.stderrTail,
        run.startedAt,
        run.finishedAt,
        run.durationMs,
        run.sandboxProfile,
      ]
    );
    return run;
  }

  async listCommandRuns(runId: string): Promise<ProjectCommandRun[]> {
    const result = await this.pool.query<ProjectCommandRunRow>(
      "SELECT * FROM project_command_runs WHERE construction_run_id = $1 ORDER BY started_at",
      [runId]
    );
    return result.rows.map(commandRunFromRow);
  }

  async appendQualityGate(
    qualityGate: ProjectQualityGate
  ): Promise<ProjectQualityGate> {
    const gate = ProjectQualityGateSchema.parse(qualityGate);
    await this.pool.query(
      `
      INSERT INTO project_quality_gates (
        id, construction_run_id, assignment_id, status, checks, failed_checks,
        diff_stats, commit_sha, created_at
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9)
      `,
      [
        gate.id,
        gate.constructionRunId,
        gate.assignmentId,
        gate.status,
        json(gate.checks),
        json(gate.failedChecks),
        json(gate.diffStats),
        gate.commitSha,
        gate.createdAt,
      ]
    );
    return gate;
  }

  async listQualityGates(runId: string): Promise<ProjectQualityGate[]> {
    const result = await this.pool.query<ProjectQualityGateRow>(
      "SELECT * FROM project_quality_gates WHERE construction_run_id = $1 ORDER BY created_at",
      [runId]
    );
    return result.rows.map(qualityGateFromRow);
  }
}

function projectFromRow(row: ProjectWorkspaceRow): ProjectWorkspace {
  return ProjectWorkspaceSchema.parse({
    id: row.id,
    workspaceFolderId: row.workspace_folder_id,
    name: row.name,
    slug: row.slug,
    targetMode: row.target_mode,
    rootPath: row.root_path,
    configPath: row.config_path,
    gitRepositoryPath: row.git_repository_path,
    currentBranch: row.current_branch,
    baseRef: row.base_ref,
    projectStack: row.project_stack,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function runFromRow(row: ProjectConstructionRunRow): ProjectConstructionRun {
  return ProjectConstructionRunSchema.parse({
    id: row.id,
    projectWorkspaceId: row.project_workspace_id,
    workflowRunId: row.workflow_run_id,
    status: row.status,
    workspacePath: row.workspace_path,
    branchName: row.branch_name,
    baseRef: row.base_ref,
    selectedUserStoryIds: row.selected_user_story_ids,
    selectedSpecIds: row.selected_spec_ids,
    startedAt: row.started_at ? toIso(row.started_at) : null,
    finishedAt: row.finished_at ? toIso(row.finished_at) : null,
    error: row.error,
  });
}

function commandRunFromRow(row: ProjectCommandRunRow): ProjectCommandRun {
  return ProjectCommandRunSchema.parse({
    id: row.id,
    assignmentId: row.assignment_id,
    constructionRunId: row.construction_run_id,
    commandId: row.command_id,
    command: row.command,
    cwd: row.cwd,
    exitCode: row.exit_code,
    stdoutTail: row.stdout_tail,
    stderrTail: row.stderr_tail,
    startedAt: toIso(row.started_at),
    finishedAt: row.finished_at ? toIso(row.finished_at) : null,
    durationMs: row.duration_ms,
    sandboxProfile: row.sandbox_profile,
  });
}

function qualityGateFromRow(row: ProjectQualityGateRow): ProjectQualityGate {
  return ProjectQualityGateSchema.parse({
    id: row.id,
    constructionRunId: row.construction_run_id,
    assignmentId: row.assignment_id,
    status: row.status,
    checks: row.checks,
    failedChecks: row.failed_checks,
    diffStats: row.diff_stats,
    commitSha: row.commit_sha,
    createdAt: toIso(row.created_at),
  });
}
