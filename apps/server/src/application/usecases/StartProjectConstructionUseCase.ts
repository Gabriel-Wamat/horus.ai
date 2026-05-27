import {
  ProjectConstructionRunSchema,
  StartProjectConstructionInputSchema,
  type FrontendProject,
  type HorusProjectConfig,
  type ProjectConstructionRun,
  type ProjectWorkspace,
  type PreviewCommand,
  type Spec,
  type UserStory,
  type WorkspaceArtifactContext,
} from "@u-build/shared";
import { v4 as uuidv4 } from "uuid";
import type {
  FrontendProjectRepository,
  ProjectConstructionRepository,
  WorkspaceRepository,
} from "../../infrastructure/repositories/contracts.js";
import { ProjectConfigService } from "../../infrastructure/project/ProjectConfigService.js";
import { ProjectExecutionService } from "../../infrastructure/project/ProjectExecutionService.js";
import { ProjectWorkspaceService } from "../../infrastructure/project/ProjectWorkspaceService.js";

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
  reusedProjectWorkspace: boolean;
}

export interface ProjectConstructionWorkflowStarter {
  start(input: {
    workspaceFolderId: string;
    userStories: UserStory[];
    workspaceArtifactContext?: Record<string, WorkspaceArtifactContext>;
    initialSpecs?: Record<string, Spec>;
    workflowMode?: "project_construction";
    frontendProjectId?: string;
    frontendProjectRootPath?: string;
  }): Promise<{ threadId: string }>;
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

export class StartProjectConstructionUseCase {
  constructor(
    private readonly projectConstruction: ProjectConstructionRepository,
    private readonly workspaceStore: WorkspaceRepository,
    private readonly frontendProjects: FrontendProjectRepository,
    private readonly projectWorkspaceService = new ProjectWorkspaceService(),
    private readonly projectConfigService = new ProjectConfigService(),
    private readonly projectExecutionService = new ProjectExecutionService(),
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly workflowStarter?: ProjectConstructionWorkflowStarter
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
        ? (await this.projectConstruction.listProjectWorkspaces()).find(
            (item) =>
              item.workspaceFolderId === input.workspaceFolderId &&
              item.name === requestedProjectName &&
              item.targetMode === "new_project"
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
      const initialSpecs: Record<string, Spec> = {};
      for (const context of contexts) {
        if (context.spec) initialSpecs[context.story.id] = context.spec;
      }

      const workflow = await this.workflowStarter.start({
        workspaceFolderId: input.workspaceFolderId,
        userStories: contexts.map((context) => context.story),
        workspaceArtifactContext: Object.fromEntries(
          contexts.map((context) => [context.story.id, context.artifactContext])
        ),
        initialSpecs,
        workflowMode: "project_construction",
        ...(frontendProject ? { frontendProjectId: frontendProject.id } : {}),
        frontendProjectRootPath: prepared.workspacePath,
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
    const port = this.env["HORUS_GENERATED_PROJECT_PREVIEW_PORT"]?.trim() || "5184";
    const host =
      this.env["HORUS_GENERATED_PROJECT_PREVIEW_HOST"]?.trim() || "127.0.0.1";
    const previewCommand = buildPreviewCommand(config, host, port);
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
      previewUrl: `http://${host}:${port}`,
    });
  }
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
    executable: devCommand.executable,
    args: [...devCommand.args, "--", "--host", host, "--port", port],
    cwd: devCommand.cwd,
    env: devCommand.env,
    timeoutMs: devCommand.timeoutMs ?? 120_000,
  };
}
