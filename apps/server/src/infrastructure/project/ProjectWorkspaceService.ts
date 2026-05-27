import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import type {
  CreateProjectWorkspaceInput,
  ProjectWorkspace,
} from "@u-build/shared";
import { ProjectWorkspaceSchema } from "@u-build/shared";
import { GitCommandExecutor } from "./GitCommandExecutor.js";
import { ProjectConfigService } from "./ProjectConfigService.js";
import { ProjectDefaultContractBuilder } from "./ProjectDefaultContractBuilder.js";
import { ProjectManifestService } from "./ProjectManifestService.js";
import { resolveFrontendStackAdapter } from "./FrontendStackAdapters.js";
import { isInsideRoot } from "./ProjectPathSafety.js";
import { loadRuntimeConfig } from "../config/runtimeConfig.js";

export class ProjectWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectWorkspaceError";
  }
}

export interface ProjectWorkspaceServiceOptions {
  env?: Record<string, string | undefined>;
  repositoryRoot?: string;
  git?: GitCommandExecutor;
  configService?: ProjectConfigService;
  manifestService?: ProjectManifestService;
  defaultContractBuilder?: ProjectDefaultContractBuilder;
}

export interface PreparedProjectWorkspace {
  project: ProjectWorkspace;
  workspacePath: string;
  branchName: string | null;
  created: boolean;
}

function readEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: string
): string {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

const DEFAULT_REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../../../../../", import.meta.url))
);

function slugify(value: string, fallback = "project"): string {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .split(/[^a-z0-9]+/u)
    .filter(Boolean)
    .join("-")
    .slice(0, 64);
  return slug || fallback;
}

export class ProjectWorkspaceService {
  private readonly env: Record<string, string | undefined>;
  private readonly repositoryRoot: string;
  private readonly git: GitCommandExecutor;
  private readonly configService: ProjectConfigService;
  private readonly manifestService: ProjectManifestService;
  private readonly defaultContractBuilder: ProjectDefaultContractBuilder;
  private readonly defaultProjectWorkspaceRoot: string;
  private readonly defaultRunWorkspaceRoot: string;

  constructor(options: ProjectWorkspaceServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.repositoryRoot = resolve(options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT);
    const runtimeConfig = loadRuntimeConfig(this.env, {
      repositoryRoot: this.repositoryRoot,
    });
    this.defaultProjectWorkspaceRoot = runtimeConfig.paths.projectWorkspacesDir;
    this.defaultRunWorkspaceRoot = runtimeConfig.paths.projectRunWorktreesDir;
    this.git = options.git ?? new GitCommandExecutor();
    this.configService = options.configService ?? new ProjectConfigService();
    this.manifestService = options.manifestService ?? new ProjectManifestService();
    this.defaultContractBuilder =
      options.defaultContractBuilder ?? new ProjectDefaultContractBuilder();
  }

  resolveProjectWorkspaceRoot(): string {
    return resolve(
      this.repositoryRoot,
      readEnv(
        this.env,
        "HORUS_PROJECT_WORKSPACE_ROOT",
        this.defaultProjectWorkspaceRoot
      )
    );
  }

  async createNewProject(input: CreateProjectWorkspaceInput): Promise<ProjectWorkspace> {
    const now = new Date().toISOString();
    const slug = slugify(input.name);
    const rootPath = resolve(
      input.rootPath ??
        join(this.resolveProjectWorkspaceRoot(), `${slug}-${uuidv4().slice(0, 8)}`)
    );
    await this.ensureProjectOutputPath(rootPath);

    const baseRef = readEnv(this.env, "HORUS_PROJECT_BASE_REF", "main");
    const projectStack = input.projectStack ?? "typescript-react";
    await this.writeStackScaffold(rootPath, input.name, projectStack, slug);
    const config = await this.defaultContractBuilder.build({
      projectRoot: rootPath,
      projectName: input.name,
      projectStack,
      baseRef,
    });
    const configPath = await this.configService.write(rootPath, config);
    const projectId = uuidv4();
    await this.manifestService.ensure({
      projectRoot: rootPath,
      projectId,
      projectName: input.name,
      projectStack,
      config,
    });
    await this.initializeGit(rootPath, baseRef);

    return ProjectWorkspaceSchema.parse({
      id: projectId,
      workspaceFolderId: input.workspaceFolderId ?? null,
      name: input.name,
      slug,
      targetMode: "new_project",
      rootPath,
      configPath,
      gitRepositoryPath: rootPath,
      currentBranch: baseRef,
      baseRef,
      projectStack,
      createdAt: now,
      updatedAt: now,
    });
  }

  async createExistingProject(
    input: CreateProjectWorkspaceInput
  ): Promise<ProjectWorkspace> {
    const existingPath = input.existingRepoPath ?? input.rootPath;
    if (!existingPath) {
      throw new ProjectWorkspaceError("existing_project requires existingRepoPath.");
    }
    const rootPath = await fs.realpath(resolve(existingPath));
    await this.preflightExistingRepo(rootPath, { baseRef: "HEAD" });
    const config = await this.defaultContractBuilder.build({
      projectRoot: rootPath,
      projectName: input.name,
      projectStack: input.projectStack ?? "existing-project",
      baseRef: "HEAD",
    });
    const configPath = await this.configService.write(rootPath, config);
    const projectId = uuidv4();
    await this.manifestService.ensure({
      projectRoot: rootPath,
      projectId,
      projectName: input.name,
      projectStack: input.projectStack ?? "existing-project",
      config,
    });
    const now = new Date().toISOString();
    return ProjectWorkspaceSchema.parse({
      id: projectId,
      workspaceFolderId: input.workspaceFolderId ?? null,
      name: input.name,
      slug: slugify(input.name),
      targetMode: "existing_project",
      rootPath,
      configPath,
      gitRepositoryPath: rootPath,
      currentBranch: null,
      baseRef: "HEAD",
      projectStack: input.projectStack ?? "existing-project",
      createdAt: now,
      updatedAt: now,
    });
  }

  async prepareWorkspace(input: {
    runId: string;
    project: ProjectWorkspace;
  }): Promise<PreparedProjectWorkspace> {
    if (input.project.targetMode === "new_project") {
      return {
        project: input.project,
        workspacePath: input.project.rootPath,
        branchName: input.project.currentBranch,
        created: false,
      };
    }

    const workspaceRoot = this.resolveRunWorkspaceRoot(input.project.rootPath);
    await fs.mkdir(workspaceRoot, { recursive: true });
    const workspacePath = resolve(workspaceRoot, input.runId);
    const branchName = `horus-run-${Date.now()}-${input.runId.replaceAll("-", "").slice(0, 8)}`;
    await this.preflightExistingRepo(input.project.rootPath, {
      baseRef: input.project.baseRef ?? "HEAD",
    });
    await this.git.run(input.project.rootPath, [
      "worktree",
      "add",
      "-b",
      branchName,
      workspacePath,
      input.project.baseRef ?? "HEAD",
    ]);
    return { project: input.project, workspacePath, branchName, created: true };
  }

  async preflightExistingRepo(
    rootPath: string,
    options: { baseRef: string; allowDirtyOutsideWriteRoots?: boolean; writeRoots?: string[] }
  ): Promise<void> {
    await this.git.run(rootPath, ["rev-parse", "--is-inside-work-tree"]);
    await this.git.run(rootPath, ["rev-parse", "--verify", options.baseRef]);
    const status = await this.git.run(rootPath, ["status", "--porcelain"]);
    if (!status.stdout.trim()) return;
    if (!options.allowDirtyOutsideWriteRoots) {
      throw new ProjectWorkspaceError(`Target repository must be clean: ${rootPath}`);
    }
    const dirtyPaths = status.stdout
      .split(/\r?\n/u)
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const writeRoots = options.writeRoots ?? [];
    const conflicting = dirtyPaths.filter((path) =>
      writeRoots.some(
        (root) => root === "." || path === root || path.startsWith(`${root}/`)
      )
    );
    if (conflicting.length > 0) {
      throw new ProjectWorkspaceError(
        `Target repository has local changes inside writeRoots: ${conflicting.join(", ")}`
      );
    }
  }

  private async ensureProjectOutputPath(rootPath: string): Promise<void> {
    await fs.mkdir(dirname(rootPath), { recursive: true });
    try {
      const entries = await fs.readdir(rootPath);
      const blocking = entries.filter((entry) => entry !== ".DS_Store");
      if (blocking.length > 0) {
        throw new ProjectWorkspaceError(
          `Project output path already exists and is not empty: ${rootPath}`
        );
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      await fs.mkdir(rootPath, { recursive: true });
    }
  }

  private async writeStackScaffold(
    rootPath: string,
    projectName: string,
    projectStack: string,
    packageName: string
  ): Promise<void> {
    const adapter = resolveFrontendStackAdapter(projectStack);
    for (const file of adapter.buildScaffold({ projectName, packageName })) {
      await fs.mkdir(dirname(join(rootPath, file.path)), { recursive: true });
      await fs.writeFile(join(rootPath, file.path), file.content, "utf-8");
    }
    await fs.writeFile(
      join(rootPath, ".gitignore"),
      ["node_modules/", "dist/", "build/", ".turbo/", ".DS_Store", "coverage/"].join("\n") +
        "\n",
      "utf-8"
    );
    await fs.writeFile(
      join(rootPath, "project.horus.json"),
      `${JSON.stringify(
        {
          name: projectName,
          bootstrapMode: "generated_from_horus",
          frontendStack: adapter.id,
          frontendEntrypoints: adapter.entrypoints,
        },
        null,
        2
      )}\n`,
      "utf-8"
    );
  }

  private async initializeGit(rootPath: string, baseRef: string): Promise<void> {
    await this.git.run(rootPath, ["init", "-b", baseRef]);
    await this.git.ensureLocalCommitIdentity(rootPath, {
      name: readEnv(this.env, "HORUS_BOOTSTRAP_GIT_USER_NAME", "Horus Builder"),
      email: readEnv(
        this.env,
        "HORUS_BOOTSTRAP_GIT_USER_EMAIL",
        "horus-builder@example.com"
      ),
    });
    await this.git.run(rootPath, ["add", "."]);
    await this.git.run(rootPath, ["commit", "-m", "chore: bootstrap horus project"]);
  }

  private resolveRunWorkspaceRoot(targetRepoRoot: string): string {
    const configured = resolve(
      this.repositoryRoot,
      readEnv(
        this.env,
        "HORUS_PROJECT_RUN_WORKSPACE_ROOT",
        this.defaultRunWorkspaceRoot
      )
    );
    return isInsideRoot(targetRepoRoot, configured)
      ? resolve(dirname(targetRepoRoot), `.${targetRepoRoot.split(/[\\/]/u).pop()}-horus-worktrees`)
      : configured;
  }
}
