import {
  ProjectConstructionRunSchema,
  StartProjectConstructionInputSchema,
  type FrontendProject,
  type HorusProjectConfig,
  type LlmSettings,
  type LlmSettingsReference,
  type ProjectConstructionRun,
  type ProjectWorkspace,
  type PreviewCommand,
  type PreviewSession,
  type Spec,
  type UserStory,
  type WorkspaceArtifactContext,
} from "@u-build/shared";
import { v4 as uuidv4 } from "uuid";
import type {
  FrontendProjectRepository,
  ProjectConstructionRepository,
  WorkspaceRepository,
} from "../ports/RepositoryPorts.js";
import type {
  ProjectConfigReader,
  ProjectExecutionRunner,
  ProjectWorkspaceProvider,
} from "../ports/ProjectServicesPort.js";
import type { PreviewRuntimePort } from "../ports/PreviewRuntimePort.js";

export class ProjectConstructionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectConstructionValidationError";
  }
}

export interface StartProjectConstructionResult {
  projectWorkspace: ProjectWorkspace;
  constructionRun: ProjectConstructionRun;
  frontendProject: FrontendProject | null;
  previewSession: PreviewSession | null;
  reusedProjectWorkspace: boolean;
}

export interface ProjectConstructionWorkflowStarter {
  start(input: {
    workspaceFolderId: string;
    userStories: UserStory[];
    workspaceArtifactContext?: Record<string, WorkspaceArtifactContext>;
    initialSpecs?: Record<string, Spec>;
    workflowMode?: "project_construction";
    projectWorkspaceId?: string;
    frontendProjectId?: string;
    frontendProjectRootPath?: string;
    previewSessionId?: string;
    llmSettings?: LlmSettings;
  }): Promise<{ threadId: string }>;
}

export interface ProjectConstructionLlmSettingsResolver {
  resolveReference(
    reference?: LlmSettingsReference
  ): Promise<LlmSettings | undefined>;
}

function slug(value: string, fallback = "item"): string {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .split(/[^a-z0-9]+/u)
    .filter(Boolean)
    .join("-");
  return normalized || fallback;
}

function storyMarkdown(story: UserStory, spec: Spec): string {
  return [
    `# ${story.title}`,
    "",
    "## User Story",
    story.description,
    "",
    "## Acceptance Criteria",
    ...story.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    "## SPEC Summary",
    spec.summary,
    "",
    "## Technical Approach",
    spec.technicalApproach,
    "",
  ].join("\n");
}

function compareIsoDesc(left: string, right: string): number {
  return right.localeCompare(left);
}

function selectReusableProjectWorkspace(
  projects: ProjectWorkspace[],
  workspaceFolderId: string
): ProjectWorkspace | undefined {
  return projects
    .filter(
      (item) =>
        item.workspaceFolderId === workspaceFolderId &&
        item.targetMode === "new_project"
    )
    .sort(
      (left, right) =>
        compareIsoDesc(left.updatedAt, right.updatedAt) ||
        compareIsoDesc(left.createdAt, right.createdAt)
    )[0];
}

export class StartProjectConstructionUseCase {
  constructor(
    private readonly projectConstruction: ProjectConstructionRepository,
    private readonly workspaceStore: WorkspaceRepository,
    private readonly frontendProjects: FrontendProjectRepository,
    private readonly projectWorkspaceService: ProjectWorkspaceProvider,
    private readonly projectConfigService: ProjectConfigReader,
    private readonly projectExecutionService: ProjectExecutionRunner,
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly workflowStarter?: ProjectConstructionWorkflowStarter,
    private readonly llmSettingsResolver?: ProjectConstructionLlmSettingsResolver,
    private readonly previewRuntime?: Pick<
      PreviewRuntimePort,
      "createSession" | "startSession"
    >
  ) {}

  async execute(rawInput: unknown): Promise<StartProjectConstructionResult> {
    const input = StartProjectConstructionInputSchema.parse(rawInput);
    const contexts = await Promise.all(
      input.userStoryIds.map((storyId) =>
        this.workspaceStore.getActiveStoryContext(input.workspaceFolderId, storyId)
      )
    );
    const missingSpec = contexts.find((context) => !context.spec);
    if (missingSpec) {
      throw new ProjectConstructionValidationError(
        `User story "${missingSpec.story.title}" has no generated spec.`
      );
    }

    const requestedProjectName = input.projectName ?? "horus-generated-project";
    const existingProject =
      input.projectWorkspaceId === undefined
        ? selectReusableProjectWorkspace(
            await this.projectConstruction.listProjectWorkspaces(),
            input.workspaceFolderId
          )
        : undefined;
    const reusedProjectWorkspace = Boolean(existingProject);
    let project =
      input.projectWorkspaceId !== undefined
        ? await this.projectConstruction.getProjectWorkspace(input.projectWorkspaceId)
        : existingProject ??
          (await this.projectWorkspaceService.createNewProject({
            workspaceFolderId: input.workspaceFolderId,
            name: requestedProjectName,
            targetMode: "new_project",
            projectStack: input.projectStack ?? "typescript-react",
          }));
    project = await this.projectConstruction.saveProjectWorkspace(project);

    const runId = uuidv4();
    const prepared = await this.projectWorkspaceService.prepareWorkspace({
      runId,
      project,
    });
    const run = ProjectConstructionRunSchema.parse({
      id: runId,
      projectWorkspaceId: project.id,
      workflowRunId: null,
      status: "running",
      workspacePath: prepared.workspacePath,
      branchName: prepared.branchName,
      baseRef: project.baseRef,
      selectedUserStoryIds: input.userStoryIds,
      selectedSpecIds: contexts.map((context) => context.spec?.id).filter(Boolean),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    });
    await this.projectConstruction.saveConstructionRun(run);

    try {
      const config = await this.projectConfigService.load(prepared.workspacePath);
      const docsOperations = contexts.flatMap((context, index) => {
        const spec = context.spec;
        if (!spec) return [];
        const prefix = `docs/user-stories/${String(index + 1).padStart(2, "0")}-${slug(context.story.title)}`;
        return [
          {
            operation: "write" as const,
            path: `${prefix}/user-story.md`,
            reason: "Persist selected user story inside generated project workspace.",
            content: storyMarkdown(context.story, spec),
          },
          {
            operation: "write" as const,
            path: `${prefix}/spec.json`,
            reason: "Persist selected SDD spec inside generated project workspace.",
            content: `${JSON.stringify(spec, null, 2)}\n`,
          },
        ];
      });
      await this.projectExecutionService.executePlan({
        constructionRunId: run.id,
        roleName: "backend_specialist",
        projectRoot: prepared.workspacePath,
        config,
        plan: {
          summary: "Persist selected user stories and specs into project workspace.",
          fileOperations: [
            {
              operation: "write",
              path: "README.md",
              reason: "Describe generated project context.",
              content: this.buildProjectReadme(project, contexts),
            },
            ...docsOperations,
          ],
          commandRequests: [],
          validationCommandIds: [],
          risks: [],
        },
      });

      if (!this.workflowStarter) {
        throw new ProjectConstructionValidationError(
          "Project construction workflow starter is not configured."
        );
      }

      const frontendProject = await this.registerPreviewProject(
        project,
        prepared.workspacePath,
        config
      );
      const previewSession = await this.createAndStartPreviewSession(frontendProject);
      const initialSpecs: Record<string, Spec> = {};
      for (const context of contexts) {
        if (context.spec) initialSpecs[context.story.id] = context.spec;
      }
      const llmSettings = await this.llmSettingsResolver?.resolveReference(
        input.llmSettingsRef
      );

      const workflowArtifactContext = Object.fromEntries(
        contexts.map((context) => [
          context.story.id,
          {
            ...context.artifactContext,
            constructionRunId: run.id,
          },
        ])
      );

      const workflow = await this.workflowStarter.start({
        workspaceFolderId: input.workspaceFolderId,
        userStories: contexts.map((context) => context.story),
        workspaceArtifactContext: workflowArtifactContext,
        initialSpecs,
        workflowMode: "project_construction",
        projectWorkspaceId: project.id,
        ...(frontendProject ? { frontendProjectId: frontendProject.id } : {}),
        frontendProjectRootPath: prepared.workspacePath,
        ...(previewSession ? { previewSessionId: previewSession.id } : {}),
        ...(llmSettings ? { llmSettings } : {}),
      });

      const started = ProjectConstructionRunSchema.parse({
        ...run,
        workflowRunId: workflow.threadId,
        status: "running",
      });
      await this.projectConstruction.updateConstructionRun(started);
      return {
        projectWorkspace: project,
        constructionRun: started,
        frontendProject,
        previewSession,
        reusedProjectWorkspace,
      };
    } catch (err) {
      const failed = ProjectConstructionRunSchema.parse({
        ...run,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
      await this.projectConstruction.updateConstructionRun(failed);
      throw err;
    }
  }

  private buildProjectReadme(
    project: ProjectWorkspace,
    contexts: Array<{ story: UserStory; spec?: Spec }>
  ): string {
    return [
      `# ${project.name}`,
      "",
      "Projeto construído em workspace isolado pelo Horus.",
      "",
      "## User stories selecionadas",
      ...contexts.map((context) => `- ${context.story.title}`),
      "",
      "## Estrutura",
      "",
      "- `src/index.html`: scaffold visual inicial.",
      "- `docs/user-stories`: user stories e specs versionadas dentro do projeto.",
      "- `.horus-project.yaml`: contrato de comandos, write roots e perfis dos agentes.",
      "",
    ].join("\n");
  }

  private async registerPreviewProject(
    project: ProjectWorkspace,
    rootPath: string,
    config: HorusProjectConfig
  ): Promise<FrontendProject | null> {
    if (!this.frontendProjects.registerProject) return null;
    const port = resolveGeneratedPreviewPort(this.env, project.id);
    const bindHost =
      this.env["HORUS_GENERATED_PROJECT_PREVIEW_BIND_HOST"]?.trim() ||
      this.env["HORUS_GENERATED_PROJECT_PREVIEW_HOST"]?.trim() ||
      "127.0.0.1";
    const publicHost =
      this.env["HORUS_GENERATED_PROJECT_PREVIEW_PUBLIC_HOST"]?.trim() ||
      (bindHost === "0.0.0.0" ? "localhost" : bindHost);
    const previewCommand = buildPreviewCommand(config, bindHost, port);
    const commandCatalog = [
      ...config.commandCatalog,
      ...(previewCommand ? [previewCommand] : []),
    ];
    return this.frontendProjects.registerProject({
      name: project.name,
      rootPath,
      defaultRoute: "/",
      devCommand: previewCommand
        ? [previewCommand.executable, ...previewCommand.args].join(" ")
        : null,
      previewCommandId: previewCommand?.id ?? null,
      commandCatalog,
      previewUrl: `http://${publicHost}:${port}`,
      projectKind: "generated",
      lifecycleStatus: "published",
      visibility: "visible",
      healthStatus: "unknown",
      healthReasons: [],
      projectWorkspaceId: project.id,
      canonicalProjectId: null,
      appFingerprint: null,
      lastHealthCheckedAt: null,
      archivedAt: null,
      archivedReason: null,
    });
  }

  private async createAndStartPreviewSession(
    frontendProject: FrontendProject | null
  ): Promise<PreviewSession | null> {
    if (!frontendProject || !this.previewRuntime) return null;

    const created = await this.previewRuntime.createSession({
      projectId: frontendProject.id,
      route: frontendProject.defaultRoute,
      device: "pc",
    });

    try {
      const started = await this.previewRuntime.startSession(created.session.id);
      return started.session;
    } catch (err) {
      console.warn(
        `Preview session ${created.session.id} was created but could not be started.`,
        err
      );
      return created.session;
    }
  }
}

function resolveGeneratedPreviewPort(
  env: Record<string, string | undefined>,
  projectId: string
): string {
  const configured = env["HORUS_GENERATED_PROJECT_PREVIEW_PORT"]?.trim();
  if (configured) return configured;

  const basePort = Number.parseInt(
    env["HORUS_GENERATED_PROJECT_PREVIEW_BASE_PORT"]?.trim() || "5184",
    10
  );
  const safeBasePort = Number.isFinite(basePort) && basePort > 0 ? basePort : 5184;
  const hash = Array.from(projectId).reduce(
    (acc, char) => (acc * 31 + char.charCodeAt(0)) % 1000,
    0
  );
  return String(safeBasePort + hash);
}

function buildPreviewCommand(
  config: HorusProjectConfig,
  host: string,
  port: string
): PreviewCommand | null {
  const devCommand =
    config.commandCatalog.find((command) => command.id === "run-root-dev") ??
    config.commandCatalog.find((command) => command.id.endsWith("-dev"));
  if (!devCommand) return null;

  return {
    id: "preview-dev",
    label: "Start preview dev server",
    executable: "node",
    args: ["--input-type=commonjs", "-e", buildPreviewBootstrapScript()],
    cwd: devCommand.cwd,
    env: {
      ...devCommand.env,
      HORUS_PREVIEW_PACKAGE_MANAGER: devCommand.executable,
      HORUS_PREVIEW_RUN_ARGS_JSON: JSON.stringify(devCommand.args),
      HORUS_PREVIEW_HOST: host,
      HORUS_PREVIEW_PORT: port,
    },
    timeoutMs: devCommand.timeoutMs ?? 120_000,
  };
}

function buildPreviewBootstrapScript(): string {
  return [
    "const { existsSync } = require('node:fs');",
    "const { spawn, spawnSync } = require('node:child_process');",
    "const packageManager = process.env.HORUS_PREVIEW_PACKAGE_MANAGER || 'npm';",
    "const runArgs = JSON.parse(process.env.HORUS_PREVIEW_RUN_ARGS_JSON || '[]');",
    "const host = process.env.HORUS_PREVIEW_HOST || '127.0.0.1';",
    "const port = process.env.HORUS_PREVIEW_PORT || '5173';",
    "if (!existsSync('node_modules')) {",
    "  const install = spawnSync(packageManager, ['install'], { stdio: 'inherit', shell: false });",
    "  if (install.error) { console.error(install.error.message); process.exit(1); }",
    "  if (install.status !== 0) process.exit(install.status || 1);",
    "}",
    "const child = spawn(packageManager, [...runArgs, '--', '--host', host, '--port', port], { stdio: 'inherit', shell: false });",
    "child.on('error', (err) => { console.error(err.message); process.exit(1); });",
    "child.on('exit', (code) => process.exit(code === null ? 1 : code));",
    "process.on('SIGTERM', () => child.kill('SIGTERM'));",
    "process.on('SIGINT', () => child.kill('SIGINT'));",
  ].join("\n");
}
