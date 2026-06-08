import assert from "node:assert/strict";
import test from "node:test";
import { StartProjectConstructionUseCase } from "../dist/application/usecases/StartProjectConstructionUseCase.js";

const now = "2026-06-08T12:00:00.000Z";
const workspaceFolderId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const specId = "spec-project-preview-session";
const projectWorkspaceId = "33333333-3333-4333-8333-333333333333";
const frontendProjectId = "44444444-4444-4444-8444-444444444444";
const previewSessionId = "55555555-5555-4555-8555-555555555555";
const workflowThreadId = "66666666-6666-4666-8666-666666666666";

const story = {
  id: storyId,
  title: "Criar tarefa pessoal",
  description: "Permitir criar uma tarefa pessoal no fluxo principal.",
  acceptanceCriteria: ["Tarefa criada aparece na lista"],
  priority: "high",
  labels: [],
  createdAt: now,
};

const spec = {
  id: specId,
  userStoryId: storyId,
  version: 1,
  summary: "Criar uma interface CRUD de tarefas pessoais.",
  technicalApproach: "Usar formulario e lista local.",
  components: [],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: story.acceptanceCriteria,
  generatedAt: now,
};

const projectWorkspace = {
  id: projectWorkspaceId,
  workspaceFolderId,
  name: "Tarefas Pessoais",
  slug: "tarefas-pessoais",
  targetMode: "new_project",
  rootPath: "/tmp/horus/generated/tarefas-pessoais",
  configPath: "/tmp/horus/generated/tarefas-pessoais/.horus-project.yaml",
  gitRepositoryPath: null,
  currentBranch: null,
  baseRef: "main",
  projectStack: "typescript-react",
  createdAt: now,
  updatedAt: now,
};

const frontendProject = {
  id: frontendProjectId,
  name: "Tarefas Pessoais",
  slug: "tarefas-pessoais",
  rootPath: projectWorkspace.rootPath,
  defaultRoute: "/",
  devCommand: "pnpm dev",
  previewCommandId: "preview-dev",
  commandCatalog: [],
  previewUrl: "http://127.0.0.1:5184",
  createdAt: now,
  projectKind: "generated",
  lifecycleStatus: "published",
  visibility: "visible",
  healthStatus: "unknown",
  healthReasons: [],
  canonicalProjectId: null,
  projectWorkspaceId,
  appFingerprint: null,
  lastHealthCheckedAt: null,
  archivedAt: null,
  archivedReason: null,
};

const createdPreviewSession = {
  id: previewSessionId,
  projectId: frontendProjectId,
  status: "waiting",
  route: "/",
  device: { name: "pc", width: 1440, height: 900 },
  previewUrl: frontendProject.previewUrl,
  processId: null,
  startedAt: null,
  stoppedAt: null,
  updatedAt: now,
  errorMessage: null,
};

const runningPreviewSession = {
  ...createdPreviewSession,
  status: "running",
  startedAt: now,
};

function previewEvent(type, status) {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    type,
    sessionId: previewSessionId,
    projectId: frontendProjectId,
    timestamp: now,
    status,
    message: type,
    data: {},
  };
}

test("project construction creates a live preview session before starting workflow", async () => {
  const savedRuns = [];
  const workflowStarts = [];
  const previewCreates = [];
  const previewStarts = [];

  const useCase = new StartProjectConstructionUseCase(
    {
      listProjectWorkspaces: async () => [],
      getProjectWorkspace: async () => projectWorkspace,
      saveProjectWorkspace: async (project) => project,
      saveConstructionRun: async (run) => {
        savedRuns.push(run);
        return run;
      },
      updateConstructionRun: async (run) => {
        savedRuns.push(run);
        return run;
      },
    },
    {
      getActiveStoryContext: async () => ({
        story,
        spec,
        artifactContext: {},
      }),
    },
    {
      registerProject: async (input) => ({
        ...frontendProject,
        rootPath: input.rootPath,
        previewCommandId: input.previewCommandId,
        commandCatalog: input.commandCatalog,
        previewUrl: input.previewUrl,
      }),
    },
    {
      createNewProject: async () => projectWorkspace,
      prepareWorkspace: async () => ({
        workspacePath: projectWorkspace.rootPath,
        branchName: "codex/project-preview",
      }),
    },
    {
      load: async () => ({
        version: 1,
        projectName: "Tarefas Pessoais",
        projectStack: "typescript-react",
        baseRef: "main",
        writeRoots: ["."],
        commandCatalog: [
          {
            id: "run-root-dev",
            executable: "pnpm",
            args: ["dev"],
            cwd: ".",
            env: {},
          },
        ],
        testRunnerIds: [],
        bootstrapCommandIds: [],
        roleProfiles: {},
      }),
    },
    {
      executePlan: async () => ({ appliedOperations: [] }),
    },
    {
      HORUS_GENERATED_PROJECT_PREVIEW_PORT: "5184",
      HORUS_GENERATED_PROJECT_PREVIEW_HOST: "127.0.0.1",
    },
    {
      start: async (input) => {
        workflowStarts.push(input);
        return { threadId: workflowThreadId };
      },
    },
    undefined,
    {
      createSession: async (input) => {
        previewCreates.push(input);
        return {
          session: createdPreviewSession,
          event: previewEvent("preview_created", "waiting"),
        };
      },
      startSession: async (sessionId) => {
        previewStarts.push(sessionId);
        return {
          session: runningPreviewSession,
          event: previewEvent("preview_started", "running"),
        };
      },
    }
  );

  const result = await useCase.execute({
    workspaceFolderId,
    projectName: "Tarefas Pessoais",
    userStoryIds: [storyId],
    specIds: [specId],
  });

  assert.equal(previewCreates.length, 1);
  assert.deepEqual(previewCreates[0], {
    projectId: frontendProjectId,
    route: "/",
    device: "pc",
  });
  assert.deepEqual(previewStarts, [previewSessionId]);
  assert.equal(workflowStarts.length, 1);
  assert.equal(workflowStarts[0].frontendProjectId, frontendProjectId);
  assert.equal(workflowStarts[0].projectWorkspaceId, projectWorkspaceId);
  assert.equal(workflowStarts[0].previewSessionId, previewSessionId);
  assert.equal(result.frontendProject.id, frontendProjectId);
  assert.equal(result.previewSession.id, previewSessionId);
  assert.equal(result.previewSession.status, "running");
  assert.equal(result.constructionRun.workflowRunId, workflowThreadId);
  assert.equal(savedRuns.at(-1).workflowRunId, workflowThreadId);
});
