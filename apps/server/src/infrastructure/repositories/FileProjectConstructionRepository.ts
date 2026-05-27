import { promises as fs } from "node:fs";
import { join } from "node:path";
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
import type { ProjectConstructionRepository } from "./contracts.js";

const PROJECTS_FILE = "project-workspaces.json";
const RUNS_FILE = "project-construction-runs.json";
const COMMANDS_FILE = "project-command-runs.json";
const QUALITY_GATES_FILE = "project-quality-gates.json";

export class ProjectWorkspaceNotFoundError extends Error {
  constructor(id: string) {
    super(`Project workspace not found: ${id}`);
    this.name = "ProjectWorkspaceNotFoundError";
  }
}

export class ProjectConstructionRunNotFoundError extends Error {
  constructor(id: string) {
    super(`Project construction run not found: ${id}`);
    this.name = "ProjectConstructionRunNotFoundError";
  }
}

export class FileProjectConstructionRepository
  implements ProjectConstructionRepository
{
  constructor(private readonly baseDir = "./data/project-construction") {}

  async saveProjectWorkspace(project: ProjectWorkspace): Promise<ProjectWorkspace> {
    const validated = ProjectWorkspaceSchema.parse(project);
    const projects = await this.readArray(PROJECTS_FILE, ProjectWorkspaceSchema);
    await this.writeArray(PROJECTS_FILE, [
      ...projects.filter((item) => item.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async getProjectWorkspace(projectWorkspaceId: string): Promise<ProjectWorkspace> {
    const projects = await this.listProjectWorkspaces();
    const project = projects.find((item) => item.id === projectWorkspaceId);
    if (!project) throw new ProjectWorkspaceNotFoundError(projectWorkspaceId);
    return project;
  }

  async listProjectWorkspaces(): Promise<ProjectWorkspace[]> {
    return this.readArray(PROJECTS_FILE, ProjectWorkspaceSchema);
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
    const runs = await this.readArray(RUNS_FILE, ProjectConstructionRunSchema);
    await this.writeArray(RUNS_FILE, [
      ...runs.filter((item) => item.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async getConstructionRun(runId: string): Promise<ProjectConstructionRun> {
    const runs = await this.readArray(RUNS_FILE, ProjectConstructionRunSchema);
    const run = runs.find((item) => item.id === runId);
    if (!run) throw new ProjectConstructionRunNotFoundError(runId);
    return run;
  }

  async listConstructionRuns(
    projectWorkspaceId?: string
  ): Promise<ProjectConstructionRun[]> {
    const runs = await this.readArray(RUNS_FILE, ProjectConstructionRunSchema);
    return runs
      .filter(
        (run) =>
          projectWorkspaceId === undefined ||
          run.projectWorkspaceId === projectWorkspaceId
      )
      .sort((left, right) =>
        (right.startedAt ?? "").localeCompare(left.startedAt ?? "")
      );
  }

  async appendCommandRun(commandRun: ProjectCommandRun): Promise<ProjectCommandRun> {
    const validated = ProjectCommandRunSchema.parse(commandRun);
    await this.writeArray(COMMANDS_FILE, [
      ...(await this.readArray(COMMANDS_FILE, ProjectCommandRunSchema)),
      validated,
    ]);
    return validated;
  }

  async listCommandRuns(runId: string): Promise<ProjectCommandRun[]> {
    return (await this.readArray(COMMANDS_FILE, ProjectCommandRunSchema)).filter(
      (run) => run.constructionRunId === runId
    );
  }

  async appendQualityGate(
    qualityGate: ProjectQualityGate
  ): Promise<ProjectQualityGate> {
    const validated = ProjectQualityGateSchema.parse(qualityGate);
    await this.writeArray(QUALITY_GATES_FILE, [
      ...(await this.readArray(QUALITY_GATES_FILE, ProjectQualityGateSchema)),
      validated,
    ]);
    return validated;
  }

  async listQualityGates(runId: string): Promise<ProjectQualityGate[]> {
    return (await this.readArray(QUALITY_GATES_FILE, ProjectQualityGateSchema)).filter(
      (gate) => gate.constructionRunId === runId
    );
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private async readArray<T>(
    filename: string,
    schema: { parse(value: unknown): T }
  ): Promise<T[]> {
    await this.ensureBaseDir();
    try {
      const parsed = JSON.parse(await fs.readFile(join(this.baseDir, filename), "utf-8"));
      return Array.isArray(parsed) ? parsed.map((item) => schema.parse(item)) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return [];
    }
  }

  private async writeArray(filename: string, value: unknown[]): Promise<void> {
    await this.ensureBaseDir();
    await fs.writeFile(join(this.baseDir, filename), `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  }
}
