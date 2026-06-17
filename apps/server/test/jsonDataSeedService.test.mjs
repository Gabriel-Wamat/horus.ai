import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { JsonDataSeedService } from "../dist/infrastructure/database/JsonDataSeedService.js";

const folderId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const specId = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";
const projectWorkspaceId = "55555555-5555-4555-8555-555555555555";
const constructionRunId = "66666666-6666-4666-8666-666666666666";
const commandRunId = "77777777-7777-4777-8777-777777777777";
const qualityGateId = "88888888-8888-4888-8888-888888888888";
const previewSessionId = "99999999-9999-4999-8999-999999999999";
const previewEventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draftId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("json data seed imports portable seed data idempotently through repositories", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-json-seed-"));
  const sourceDataDir = join(root, "source-data");
  const targetDataDir = join(root, "target-data");
  const repositoryRoot = join(root, "repo");
  await writeFixture(sourceDataDir);

  const repositories = createMemoryRepositories();
  const service = new JsonDataSeedService({
    sourceDataDir,
    targetDataDir,
    repositoryRoot,
  });

  assert.deepEqual(await service.inspect(), {
    folders: 1,
    userStories: 1,
    specs: 1,
    frontendProjects: 1,
    projectWorkspaces: 1,
    constructionRuns: 1,
    commandRuns: 1,
    qualityGates: 1,
    previewSessions: 1,
    previewEvents: 1,
    previewDrafts: 1,
    skippedPreviewEvents: 0,
    skippedPreviewDrafts: 0,
  });

  const first = await service.seed(repositories);
  const second = await service.seed(repositories);

  assert.equal(first.previewEvents, 1);
  assert.equal(first.previewDrafts, 1);
  assert.equal(second.previewEvents, 0);
  assert.equal(second.previewDrafts, 0);
  assert.equal(second.skippedPreviewEvents, 1);
  assert.equal(second.skippedPreviewDrafts, 1);

  assert.equal(repositories.workspaceStore.folders.get(folderId)?.slug, "seed");
  assert.equal(repositories.workspaceStore.stories.get(storyId)?.title, "Seed story");
  assert.equal(repositories.workspaceStore.specs.get(specId)?.summary, "Seed spec");
  assert.equal(
    repositories.frontendProjects.projects.get(projectId)?.rootPath,
    join(targetDataDir, "project-workspaces", "seed-project")
  );
  assert.equal(
    repositories.projectConstruction.projectWorkspaces.get(projectWorkspaceId)
      ?.rootPath,
    join(targetDataDir, "project-workspaces", "seed-project")
  );
  assert.equal(
    repositories.previewSessions.sessions.get(previewSessionId)?.status,
    "stopped"
  );
  assert.equal(
    repositories.previewSessions.sessions.get(previewSessionId)?.previewUrl,
    null
  );
  assert.equal(
    repositories.previewSessions.sessions.get(previewSessionId)?.processId,
    null
  );
  assert.equal(
    repositories.previewSessions.events.get(previewSessionId)?.[0]?.data.previewUrl,
    "[local-runtime-url]"
  );
  assert.equal(repositories.previewSessions.events.get(previewSessionId)?.length, 1);
  assert.equal(repositories.previewSessions.drafts.get(previewSessionId)?.length, 1);
});

async function writeFixture(sourceDataDir) {
  const workspaceStoryDir = join(sourceDataDir, "workspace", "seed", "seed-story");
  const specDir = join(workspaceStoryDir, "specs", specId);
  const previewDir = join(sourceDataDir, "preview-sessions", previewSessionId);
  await mkdir(specDir, { recursive: true });
  await mkdir(previewDir, { recursive: true });
  await mkdir(join(sourceDataDir, "frontend-projects"), { recursive: true });
  await mkdir(join(sourceDataDir, "project-construction"), { recursive: true });

  await writeJson(join(sourceDataDir, "workspace", "folders.json"), [
    {
      id: folderId,
      name: "Seed",
      slug: "seed",
      createdAt: "2026-06-17T00:00:00.000Z",
      storyCount: 1,
    },
  ]);
  await writeJson(join(workspaceStoryDir, "active.json"), {
    folderId,
    storyId,
    activeRevision: 1,
    updatedAt: "2026-06-17T00:00:00.000Z",
    story: {
      id: storyId,
      title: "Seed story",
      description: "A portable seed story.",
      acceptanceCriteria: ["Imports through repository ports"],
      priority: "medium",
      labels: [],
      createdAt: "2026-06-17T00:00:00.000Z",
    },
  });
  await writeJson(join(specDir, "active.json"), {
    folderId,
    storyId,
    specId,
    activeRevision: 1,
    updatedAt: "2026-06-17T00:00:00.000Z",
    spec: {
      id: specId,
      userStoryId: storyId,
      version: 1,
      summary: "Seed spec",
      technicalApproach: "Persist the seed through typed repositories.",
      components: [
        {
          name: "SeedImporter",
          type: "service",
          description: "Imports JSON seed data through repository ports.",
          dependencies: [],
        },
      ],
      apiEndpoints: [],
      dataModels: [],
      acceptanceCriteria: ["Seed is idempotent"],
      generatedAt: "2026-06-17T00:00:00.000Z",
    },
  });
  await writeJson(join(sourceDataDir, "frontend-projects", "projects.json"), [
    {
      id: projectId,
      name: "seed-project",
      slug: "seed-project",
      rootPath: "project-workspaces/seed-project",
      defaultRoute: "/",
      devCommand: "npm run dev",
      previewCommandId: "run-root-dev",
      commandCatalog: [
        {
          id: "run-root-dev",
          executable: "npm",
          args: ["run", "dev"],
          cwd: ".",
          env: {},
        },
      ],
      previewUrl: "http://localhost:5174",
      createdAt: "2026-06-17T00:00:00.000Z",
    },
  ]);
  await writeJson(
    join(sourceDataDir, "project-construction", "project-workspaces.json"),
    [
      {
        id: projectWorkspaceId,
        workspaceFolderId: folderId,
        name: "seed-project",
        slug: "seed-project",
        targetMode: "new_project",
        rootPath: "project-workspaces/seed-project",
        configPath: "project-workspaces/seed-project/.horus-project.yaml",
        gitRepositoryPath: "project-workspaces/seed-project",
        currentBranch: "main",
        baseRef: "main",
        projectStack: "typescript-react",
        createdAt: "2026-06-17T00:00:00.000Z",
        updatedAt: "2026-06-17T00:00:00.000Z",
      },
    ]
  );
  await writeJson(
    join(sourceDataDir, "project-construction", "project-construction-runs.json"),
    [
      {
        id: constructionRunId,
        projectWorkspaceId,
        workflowRunId: null,
        status: "passed",
        workspacePath: "project-workspaces/seed-project",
        branchName: "main",
        baseRef: "main",
        selectedUserStoryIds: [storyId],
        selectedSpecIds: [specId],
        startedAt: "2026-06-17T00:00:00.000Z",
        finishedAt: "2026-06-17T00:01:00.000Z",
        error: null,
      },
    ]
  );
  await writeJson(
    join(sourceDataDir, "project-construction", "project-command-runs.json"),
    [
      {
        id: commandRunId,
        assignmentId: null,
        constructionRunId,
        commandId: "build",
        taskId: null,
        command: "npm run build",
        cwd: "project-workspaces/seed-project",
        approvalRequired: false,
        risk: "low",
        policyReason: null,
        approved: false,
        approvedBy: null,
        approvalReason: null,
        exitCode: 0,
        stdoutTail: "",
        stderrTail: "",
        stdoutPath: null,
        stderrPath: null,
        stdoutBytes: 0,
        stderrBytes: 0,
        lastOutputAt: null,
        interactivePromptDetected: false,
        interactivePromptText: null,
        startedAt: "2026-06-17T00:00:00.000Z",
        finishedAt: "2026-06-17T00:01:00.000Z",
        durationMs: 60000,
        sandboxProfile: null,
      },
    ]
  );
  await writeJson(
    join(sourceDataDir, "project-construction", "project-quality-gates.json"),
    [
      {
        id: qualityGateId,
        constructionRunId,
        assignmentId: null,
        status: "passed",
        checks: [],
        failedChecks: [],
        diffStats: null,
        commitSha: null,
        createdAt: "2026-06-17T00:01:00.000Z",
      },
    ]
  );
  await writeJson(join(previewDir, "session.json"), {
    id: previewSessionId,
    projectId,
    status: "running",
    route: "/",
    device: { name: "pc", width: 1440, height: 900 },
    previewUrl: "http://127.0.0.1:5174",
    processId: 12345,
    startedAt: "2026-06-17T00:00:00.000Z",
    stoppedAt: null,
    updatedAt: "2026-06-17T00:00:00.000Z",
    errorMessage: null,
  });
  await writeJson(join(previewDir, "timeline.json"), [
    {
      id: previewEventId,
      type: "preview_ready",
      sessionId: previewSessionId,
      projectId,
      timestamp: "2026-06-17T00:00:00.000Z",
      status: "running",
      message: "Preview session ready",
      data: { previewUrl: "http://127.0.0.1:5174" },
    },
  ]);
  await writeJson(join(previewDir, "drafts.json"), [
    {
      id: draftId,
      sessionId: previewSessionId,
      projectId,
      mode: "visual_edits",
      message: "Change color.",
      status: "drafted",
      createdAt: "2026-06-17T00:00:00.000Z",
    },
  ]);
}

function createMemoryRepositories() {
  const workspaceStore = {
    folders: new Map(),
    stories: new Map(),
    specs: new Map(),
    async listFolders() {
      return [...this.folders.values()];
    },
    async saveFolder(folder) {
      this.folders.set(folder.id, folder);
      return folder;
    },
    async createFolder() {
      throw new Error("not used");
    },
    async listUserStories() {
      return [...this.stories.values()];
    },
    async listUserStoryArtifacts() {
      return [];
    },
    async resolveUserStoriesForWorkflow() {
      throw new Error("not used");
    },
    async getActiveStoryContext() {
      throw new Error("not used");
    },
    async saveUserStories(_folderId, stories) {
      for (const story of stories) this.stories.set(story.id, story);
    },
    async updateUserStory(_folderId, _storyId, story) {
      this.stories.set(story.id, story);
      return story;
    },
    async saveSpec(_folderId, _storyId, spec) {
      this.specs.set(spec.id, spec);
      return spec;
    },
    async updateSpec(_folderId, _storyId, _specId, spec) {
      this.specs.set(spec.id, spec);
      return spec;
    },
    async deleteUserStory() {
      throw new Error("not used");
    },
  };
  const frontendProjects = {
    projects: new Map(),
    async listProjects() {
      return [...this.projects.values()];
    },
    async getProject(projectId) {
      return this.projects.get(projectId);
    },
    async saveProject(project) {
      this.projects.set(project.id, project);
      return project;
    },
  };
  const previewSessions = {
    sessions: new Map(),
    events: new Map(),
    drafts: new Map(),
    async saveSession(session) {
      this.sessions.set(session.id, session);
      return session;
    },
    async getSession(sessionId) {
      return this.sessions.get(sessionId);
    },
    async listSessions() {
      return [...this.sessions.values()];
    },
    async appendEvent(event) {
      this.events.set(event.sessionId, [
        ...(this.events.get(event.sessionId) ?? []),
        event,
      ]);
      return event;
    },
    async listEvents(sessionId) {
      return this.events.get(sessionId) ?? [];
    },
    async saveDraft(draft) {
      this.drafts.set(draft.sessionId, [
        ...(this.drafts.get(draft.sessionId) ?? []),
        draft,
      ]);
      return draft;
    },
    async listDrafts(sessionId) {
      return this.drafts.get(sessionId) ?? [];
    },
  };
  const projectConstruction = {
    projectWorkspaces: new Map(),
    constructionRuns: new Map(),
    commandRuns: new Map(),
    qualityGates: new Map(),
    async saveProjectWorkspace(project) {
      this.projectWorkspaces.set(project.id, project);
      return project;
    },
    async getProjectWorkspace(projectWorkspaceId) {
      return this.projectWorkspaces.get(projectWorkspaceId);
    },
    async listProjectWorkspaces() {
      return [...this.projectWorkspaces.values()];
    },
    async saveConstructionRun(run) {
      this.constructionRuns.set(run.id, run);
      return run;
    },
    async updateConstructionRun(run) {
      this.constructionRuns.set(run.id, run);
      return run;
    },
    async getConstructionRun(runId) {
      return this.constructionRuns.get(runId);
    },
    async listConstructionRuns() {
      return [...this.constructionRuns.values()];
    },
    async appendCommandRun(commandRun) {
      this.commandRuns.set(commandRun.constructionRunId, [
        ...(this.commandRuns.get(commandRun.constructionRunId) ?? []),
        commandRun,
      ]);
      return commandRun;
    },
    async listCommandRuns(runId) {
      return this.commandRuns.get(runId) ?? [];
    },
    async appendQualityGate(qualityGate) {
      this.qualityGates.set(qualityGate.constructionRunId, [
        ...(this.qualityGates.get(qualityGate.constructionRunId) ?? []),
        qualityGate,
      ]);
      return qualityGate;
    },
    async listQualityGates(runId) {
      return this.qualityGates.get(runId) ?? [];
    },
  };
  return {
    workspaceStore,
    frontendProjects,
    previewSessions,
    projectConstruction,
  };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
