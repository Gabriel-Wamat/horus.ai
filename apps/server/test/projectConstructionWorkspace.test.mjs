import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ProjectConfigService } from "../dist/infrastructure/project/ProjectConfigService.js";
import { ProjectExecutionService } from "../dist/infrastructure/project/ProjectExecutionService.js";
import { ProjectWorkspaceService } from "../dist/infrastructure/project/ProjectWorkspaceService.js";
import { StartProjectConstructionUseCase } from "../dist/application/usecases/StartProjectConstructionUseCase.js";

const workspaceFolderId = "55555555-5555-4555-8555-555555555555";

const constructionStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Criar app de consulta",
  description: "Como usuário, quero consultar dados no app gerado.",
  acceptanceCriteria: ["App renderiza a consulta"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-26T10:00:00.000Z",
};

const constructionSpec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: constructionStory.id,
  version: 1,
  summary: "Gerar app de consulta",
  technicalApproach: "Construir tela inicial com React e estado local.",
  components: [],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: constructionStory.acceptanceCriteria,
  generatedAt: "2026-05-26T10:01:00.000Z",
};

test("ProjectWorkspaceService creates a physical git-backed project with a Horus contract", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "horus-root-"));
  const service = new ProjectWorkspaceService({
    repositoryRoot: repoRoot,
    env: {
      HORUS_PROJECT_WORKSPACE_ROOT: "generated-projects",
      HORUS_PROJECT_BASE_REF: "main",
    },
  });

  const project = await service.createNewProject({
    name: "Investimentos RI",
    targetMode: "new_project",
    projectStack: "typescript-react",
  });

  assert.ok(project.rootPath.startsWith(join(repoRoot, "generated-projects")));
  assert.equal(project.targetMode, "new_project");
  assert.ok(project.configPath.endsWith(".horus-project.yaml"));

  const config = await new ProjectConfigService().load(project.rootPath);
  assert.equal(config.projectName, "Investimentos RI");
  assert.ok(config.writeRoots.includes("."));
  assert.ok(config.commandCatalog.some((command) => command.id === "run-root-dev"));
  assert.ok(config.roleProfiles.frontend_specialist.allowedCommandIds.includes("run-root-dev"));
  assert.ok(config.bootstrapCommandIds.includes("install-root-dependencies"));
  assert.equal(
    config.roleProfiles.curator.allowedCommandIds.includes("install-root-dependencies"),
    false
  );
  assert.equal(
    config.roleProfiles.curator.allowedCommandIds.includes("run-root-dev"),
    false
  );
  assert.ok(
    config.roleProfiles.curator.allowedCommandIds.includes("type-check-root-type-check")
  );

  const packageJson = JSON.parse(
    await readFile(join(project.rootPath, "package.json"), "utf8")
  );
  const indexHtml = await readFile(join(project.rootPath, "index.html"), "utf8");
  const app = await readFile(join(project.rootPath, "src", "App.tsx"), "utf8");
  const main = await readFile(join(project.rootPath, "src", "main.tsx"), "utf8");

  assert.equal(packageJson.scripts.dev, "vite");
  assert.equal(packageJson.scripts["type-check"], "tsc --noEmit");
  assert.ok(packageJson.dependencies.react);
  assert.match(indexHtml, /src\/main\.tsx/);
  assert.match(main, /createRoot/);
  assert.match(app, /WelcomeScreen/);
  assert.ok(config.commandCatalog.some((command) => command.id === "run-root-dev"));
  assert.ok(
    config.commandCatalog.some((command) => command.id === "type-check-root-type-check")
  );

  const manifest = JSON.parse(
    await readFile(join(project.rootPath, "horus.project.json"), "utf8")
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.projectId, project.id);
  assert.equal(manifest.projectName, "Investimentos RI");
  assert.equal(manifest.stack.frontend, "react");
  assert.equal(manifest.stack.language, "typescript");
  assert.ok(manifest.entrypoints.includes("src/App.tsx"));
  assert.ok(manifest.commandCatalog.some((command) => command.id === "run-root-dev"));
  assert.equal(manifest.security.rulesCannotGrantPermissions, true);
});

test("ProjectWorkspaceService rejects unsupported frontend stacks clearly", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "horus-root-"));
  const service = new ProjectWorkspaceService({
    repositoryRoot: repoRoot,
    env: {
      HORUS_PROJECT_WORKSPACE_ROOT: "generated-projects",
      HORUS_PROJECT_BASE_REF: "main",
    },
  });

  await assert.rejects(
    () =>
      service.createNewProject({
        name: "Angular Futuro",
        targetMode: "new_project",
        projectStack: "angular",
      }),
    /Unsupported frontend projectStack "angular"/
  );
});

test("ProjectExecutionService applies only write-root bounded operations and command ids", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "horus-root-"));
  const workspaceService = new ProjectWorkspaceService({
    repositoryRoot: repoRoot,
    env: { HORUS_PROJECT_WORKSPACE_ROOT: "generated-projects" },
  });
  const project = await workspaceService.createNewProject({
    name: "Bounded Writes",
    targetMode: "new_project",
  });
  const config = await new ProjectConfigService().load(project.rootPath);
  const execution = new ProjectExecutionService();

  await assert.rejects(
    () =>
      execution.executePlan({
        constructionRunId: "11111111-1111-4111-8111-111111111111",
        roleName: "frontend_specialist",
        projectRoot: project.rootPath,
        config,
        plan: {
          summary: "Unsafe write",
          fileOperations: [
            {
              operation: "write",
              path: "../outside.txt",
              reason: "Should fail",
              content: "no",
            },
          ],
          commandRequests: [],
          validationCommandIds: [],
          risks: [],
        },
      }),
    /escapes.*project/i
  );

  const result = await execution.executePlan({
    constructionRunId: "11111111-1111-4111-8111-111111111111",
    roleName: "frontend_specialist",
    projectRoot: project.rootPath,
    config,
    plan: {
      summary: "Safe write",
      fileOperations: [
        {
          operation: "write",
          path: "docs/user-stories/US-01/user-story.md",
          reason: "Persist story",
          content: "# US-01\n",
        },
      ],
      commandRequests: [],
      validationCommandIds: [],
      risks: [],
    },
  });

  assert.deepEqual(result.changedFiles, ["docs/user-stories/US-01/user-story.md"]);
  assert.equal(
    await readFile(join(project.rootPath, "docs/user-stories/US-01/user-story.md"), "utf8"),
    "# US-01\n"
  );
});

test("StartProjectConstructionUseCase delegates selected specs to project construction workflow", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-delegated-project-"));
  const now = "2026-05-26T10:00:00.000Z";
  const projectWorkspace = {
    id: "33333333-3333-4333-8333-333333333333",
    workspaceFolderId,
    name: "Projeto Delegado",
    slug: "projeto-delegado",
    targetMode: "new_project",
    rootPath: projectRoot,
    configPath: join(projectRoot, ".horus-project.yaml"),
    gitRepositoryPath: projectRoot,
    currentBranch: "main",
    baseRef: "main",
    projectStack: "typescript-react",
    createdAt: now,
    updatedAt: now,
  };
  const savedRuns = [];
  const executedPlans = [];
  let workflowInput;

  const projectConstruction = {
    listProjectWorkspaces: async () => [],
    getProjectWorkspace: async () => null,
    saveProjectWorkspace: async (project) => project,
    saveConstructionRun: async (run) => {
      savedRuns.push(run);
      return run;
    },
    updateConstructionRun: async (run) => {
      savedRuns.push(run);
      return run;
    },
  };
  const workspaceStore = {
    getActiveStoryContext: async () => ({
      story: constructionStory,
      spec: constructionSpec,
      artifactContext: {
        workspaceFolderId,
        userStoryRevisionId: "story-r1",
        specRevisionId: "spec-r1",
      },
    }),
  };
  const frontendProjects = {
    registerProject: async (input) => ({
      id: "44444444-4444-4444-8444-444444444444",
      slug: "projeto-delegado",
      createdAt: now,
      ...input,
    }),
  };
  const projectWorkspaceService = {
    createNewProject: async () => projectWorkspace,
    prepareWorkspace: async () => ({
      workspacePath: projectRoot,
      branchName: "main",
      created: false,
    }),
  };
  const projectConfigService = {
    load: async () => ({
      version: 1,
      projectName: "Projeto Delegado",
      projectStack: "typescript-react",
      baseRef: "main",
      writeRoots: ["."],
      commandCatalog: [
        {
          id: "noop",
          executable: process.execPath,
          args: ["-e", ""],
          cwd: ".",
          env: {},
        },
      ],
      roleProfiles: {
        backend_specialist: {
          allowedCommandIds: [],
          defaultValidationCommandIds: [],
        },
      },
      testRunnerIds: [],
      bootstrapCommandIds: [],
    }),
  };
  const projectExecutionService = {
    executePlan: async (plan) => {
      executedPlans.push(plan);
      return { changedFiles: [], commandRuns: [] };
    },
  };
  const workflowStarter = {
    start: async (input) => {
      workflowInput = input;
      return { threadId: "66666666-6666-4666-8666-666666666666" };
    },
  };

  const useCase = new StartProjectConstructionUseCase(
    projectConstruction,
    workspaceStore,
    frontendProjects,
    projectWorkspaceService,
    projectConfigService,
    projectExecutionService,
    {
      HORUS_GENERATED_PROJECT_PREVIEW_HOST: "127.0.0.1",
      HORUS_GENERATED_PROJECT_PREVIEW_PORT: "5184",
    },
    workflowStarter
  );

  const result = await useCase.execute({
    workspaceFolderId,
    projectName: "Projeto Delegado",
    userStoryIds: [constructionStory.id],
  });

  assert.equal(executedPlans.length, 1);
  assert.equal(workflowInput.workflowMode, "project_construction");
  assert.deepEqual(workflowInput.userStories, [constructionStory]);
  assert.deepEqual(workflowInput.initialSpecs, {
    [constructionStory.id]: constructionSpec,
  });
  assert.equal(
    workflowInput.workspaceArtifactContext[constructionStory.id].constructionRunId,
    result.constructionRun.id
  );
  assert.equal(workflowInput.frontendProjectRootPath, projectRoot);
  assert.equal(workflowInput.frontendProjectId, result.frontendProject.id);
  assert.equal(result.constructionRun.workflowRunId, "66666666-6666-4666-8666-666666666666");
  assert.equal(savedRuns.at(-1).workflowRunId, "66666666-6666-4666-8666-666666666666");
});

test("StartProjectConstructionUseCase reuses the workspace folder environment even when the requested project name changes", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-reused-project-"));
  const now = "2026-05-26T10:00:00.000Z";
  const later = "2026-05-26T11:00:00.000Z";
  const projectWorkspace = {
    id: "77777777-7777-4777-8777-777777777777",
    workspaceFolderId,
    name: "Ambiente Canonico",
    slug: "ambiente-canonico",
    targetMode: "new_project",
    rootPath: projectRoot,
    configPath: join(projectRoot, ".horus-project.yaml"),
    gitRepositoryPath: projectRoot,
    currentBranch: "main",
    baseRef: "main",
    projectStack: "typescript-react",
    createdAt: now,
    updatedAt: later,
  };
  let createNewProjectCalled = false;
  let preparedProject;
  let workflowInput;

  const projectConstruction = {
    listProjectWorkspaces: async () => [
      {
        ...projectWorkspace,
        id: "88888888-8888-4888-8888-888888888888",
        workspaceFolderId: "99999999-9999-4999-8999-999999999999",
        name: "Outro Ambiente",
        slug: "outro-ambiente",
      },
      projectWorkspace,
    ],
    getProjectWorkspace: async () => null,
    saveProjectWorkspace: async (project) => project,
    saveConstructionRun: async (run) => run,
    updateConstructionRun: async (run) => run,
  };
  const workspaceStore = {
    getActiveStoryContext: async () => ({
      story: constructionStory,
      spec: constructionSpec,
      artifactContext: {
        workspaceFolderId,
        userStoryRevisionId: "story-r1",
        specRevisionId: "spec-r1",
      },
    }),
  };
  const frontendProjects = {
    registerProject: async (input) => ({
      id: "44444444-4444-4444-8444-444444444444",
      slug: "ambiente-canonico",
      createdAt: now,
      ...input,
    }),
  };
  const projectWorkspaceService = {
    createNewProject: async () => {
      createNewProjectCalled = true;
      throw new Error("should reuse the existing project workspace");
    },
    prepareWorkspace: async ({ project }) => {
      preparedProject = project;
      return {
        workspacePath: projectRoot,
        branchName: "main",
        created: false,
      };
    },
  };
  const projectConfigService = {
    load: async () => ({
      version: 1,
      projectName: "Ambiente Canonico",
      projectStack: "typescript-react",
      baseRef: "main",
      writeRoots: ["."],
      commandCatalog: [],
      roleProfiles: {},
      testRunnerIds: [],
      bootstrapCommandIds: [],
    }),
  };
  const projectExecutionService = {
    executePlan: async () => ({ changedFiles: [], commandRuns: [] }),
  };
  const workflowStarter = {
    start: async (input) => {
      workflowInput = input;
      return { threadId: "66666666-6666-4666-8666-666666666666" };
    },
  };

  const useCase = new StartProjectConstructionUseCase(
    projectConstruction,
    workspaceStore,
    frontendProjects,
    projectWorkspaceService,
    projectConfigService,
    projectExecutionService,
    {},
    workflowStarter
  );

  const result = await useCase.execute({
    workspaceFolderId,
    projectName: "Nome Novo Da Mesma Pasta",
    userStoryIds: [constructionStory.id],
  });

  assert.equal(createNewProjectCalled, false);
  assert.equal(result.reusedProjectWorkspace, true);
  assert.equal(result.projectWorkspace.id, projectWorkspace.id);
  assert.equal(preparedProject.id, projectWorkspace.id);
  assert.equal(workflowInput.frontendProjectRootPath, projectRoot);
});

test("StartProjectConstructionUseCase assigns a project-scoped preview port by default", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-preview-port-project-"));
  const now = "2026-05-26T10:00:00.000Z";
  const projectWorkspace = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workspaceFolderId,
    name: "Port Scoped Project",
    slug: "port-scoped-project",
    targetMode: "new_project",
    rootPath: projectRoot,
    configPath: join(projectRoot, ".horus-project.yaml"),
    gitRepositoryPath: projectRoot,
    currentBranch: "main",
    baseRef: "main",
    projectStack: "typescript-react",
    createdAt: now,
    updatedAt: now,
  };
  let registeredProjectInput;

  const projectConstruction = {
    listProjectWorkspaces: async () => [],
    getProjectWorkspace: async () => null,
    saveProjectWorkspace: async (project) => project,
    saveConstructionRun: async (run) => run,
    updateConstructionRun: async (run) => run,
  };
  const workspaceStore = {
    getActiveStoryContext: async () => ({
      story: constructionStory,
      spec: constructionSpec,
      artifactContext: {
        workspaceFolderId,
        userStoryRevisionId: "story-r1",
        specRevisionId: "spec-r1",
      },
    }),
  };
  const frontendProjects = {
    registerProject: async (input) => {
      registeredProjectInput = input;
      return {
        id: "44444444-4444-4444-8444-444444444444",
        slug: "port-scoped-project",
        createdAt: now,
        ...input,
      };
    },
  };
  const projectWorkspaceService = {
    createNewProject: async () => projectWorkspace,
    prepareWorkspace: async () => ({
      workspacePath: projectRoot,
      branchName: "main",
      created: false,
    }),
  };
  const projectConfigService = {
    load: async () => ({
      version: 1,
      projectName: "Port Scoped Project",
      projectStack: "typescript-react",
      baseRef: "main",
      writeRoots: ["."],
      commandCatalog: [
        {
          id: "run-root-dev",
          executable: "npm",
          args: ["run", "dev"],
          cwd: ".",
          env: {},
        },
      ],
      roleProfiles: {},
      testRunnerIds: [],
      bootstrapCommandIds: [],
    }),
  };
  const projectExecutionService = {
    executePlan: async () => ({ changedFiles: [], commandRuns: [] }),
  };
  const workflowStarter = {
    start: async () => ({ threadId: "66666666-6666-4666-8666-666666666666" }),
  };

  const useCase = new StartProjectConstructionUseCase(
    projectConstruction,
    workspaceStore,
    frontendProjects,
    projectWorkspaceService,
    projectConfigService,
    projectExecutionService,
    {},
    workflowStarter
  );

  await useCase.execute({
    workspaceFolderId,
    projectName: "Port Scoped Project",
    userStoryIds: [constructionStory.id],
  });

  assert.ok(registeredProjectInput);
  const previewUrl = new URL(registeredProjectInput.previewUrl);
  const port = Number(previewUrl.port);
  assert.notEqual(port, 5184);
  assert.ok(port >= 5184 && port < 6184);
  const previewCommand = registeredProjectInput.commandCatalog.find(
    (command) => command.id === "preview-dev"
  );
  assert.ok(previewCommand);
  assert.ok(previewCommand.args.includes(String(port)));
});
