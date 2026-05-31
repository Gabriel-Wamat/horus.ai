import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { AgentToolLoop } from "../dist/application/services/AgentToolLoop.js";
import { AgentToolRuntime } from "../dist/application/services/AgentToolRuntime.js";
import { AgentProfileRegistry } from "../dist/application/services/AgentProfileRegistry.js";
import { AgentToolRegistry } from "../dist/application/services/AgentToolRegistry.js";
import { ReadOnlyCodeContextService } from "../dist/application/services/ReadOnlyCodeContextService.js";
import { ProjectInspectionService } from "../dist/application/services/ProjectInspectionService.js";
import { RepositoryScanner } from "../dist/application/coding/RepositoryScanner.js";
import { registerProjectAgentTools } from "../dist/application/tools/registerProjectAgentTools.js";
import { FileMutationPreflightApplier } from "../dist/infrastructure/code/FileMutationPreflightApplier.js";
import { ProjectConfigService } from "../dist/infrastructure/project/ProjectConfigService.js";
import { ProjectDiffAnalyzer } from "../dist/infrastructure/project/ProjectDiffAnalyzer.js";
import { ProjectExecutionService } from "../dist/infrastructure/project/ProjectExecutionService.js";
import { ProjectFileBrowserService } from "../dist/infrastructure/project/ProjectFileBrowserService.js";
import { FileAgentOperationalSessionRepository } from "../dist/infrastructure/repositories/FileAgentOperationalSessionRepository.js";
import { projectAgentOperationalFileOperations } from "../../../packages/shared/dist/index.js";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const USER_STORY_ID = "22222222-2222-4222-8222-222222222222";

test("AgentToolLoop edits project files through governed tools and emits workflow events", async () => {
  const root = await setupRuntimeProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    workflowThreadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
  });
  const operationalSessions = new FileAgentOperationalSessionRepository(
    await mkdtemp(join(tmpdir(), "horus-agent-loop-sessions-"))
  );
  const workflowEvents = [];

  const result = await new AgentToolLoop().executeCodeChangeSet({
    runtime,
    agentName: "front",
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
    codeChangeSet: {
      id: "44444444-4444-4444-8444-444444444444",
      workflowThreadId: THREAD_ID,
      userStoryId: USER_STORY_ID,
      sourceAgent: "front",
      status: "proposed",
      operations: [
        {
          changeType: "update",
          targetPath: "src/App.tsx",
          beforeContent: "export const App = () => 'Horus App';\n",
          afterContent: "export const App = () => 'Loop edited';\n",
          diff: "Update src/App.tsx",
          preconditions: [
            {
              path: "src/App.tsx",
              kind: "content_hash",
              expected: "0123456789abcdef",
            },
          ],
          metadata: {
            patchStrategy: "structural_ast",
            structuralIntentKinds: ["replace"],
            structuralTargets: [
              {
                kind: "replace",
                targetSymbolName: "App",
                targetSymbolKind: "component",
              },
            ],
          },
        },
      ],
      validation: [],
      createdAt: "2026-05-28T00:00:00.000Z",
    },
    eventSink: {
      emit(event) {
        workflowEvents.push(event);
      },
    },
    operationalSessionRepository: operationalSessions,
  });

  assert.equal(result.status, "succeeded", result.summary);
  assert.match(result.operationalSessionId, /^[0-9a-f-]{36}$/);
  assert.equal(result.operationalSession.status, "completed");
  assert.deepEqual(result.changedFiles, ["src/App.tsx"]);
  assert.match(await readFile(join(root, "src", "App.tsx"), "utf8"), /Loop edited/);
  assert.equal(workflowEvents[0].type, "tool_call_started");
  assert.equal(workflowEvents[0].toolName, "inspect_project");
  assert.equal(workflowEvents[0].operationalSessionId, result.operationalSessionId);
  const editStarted = workflowEvents.find(
    (event) => event.type === "tool_call_started" && event.toolName === "replace_file_range"
  );
  assert.deepEqual(editStarted.filePaths, ["src/App.tsx"]);
  assert.equal(workflowEvents.some((event) => event.type === "tool_call_finished"), true);
  assert.equal(
    workflowEvents.some(
      (event) =>
        event.type === "tool_call_finished" &&
        event.toolName === "replace_file_range" &&
        event.filePaths.includes("src/App.tsx")
    ),
    true
  );
  const readFinished = workflowEvents.find(
    (event) => event.type === "tool_call_finished" && event.toolName === "read_file"
  );
  assert.equal(readFinished.summary, "read_file leu src/App.tsx.");
  const rangeCall = result.events.find(
    (event) => event.status === "started" && event.toolName === "replace_file_range"
  );
  assert.equal(rangeCall.input.startLine, 1);
  assert.equal(rangeCall.input.endLine, 1);
  assert.equal(result.events.some((event) => event.toolName === "replace_file_range"), true);
  assert.equal(result.events.some((event) => event.toolName === "inspect_project"), true);
  const projection = await operationalSessions.getProjection(result.operationalSessionId);
  assert.equal(projection.status, "completed");
  assert.deepEqual(result.operationalSession.filesRead, ["src/App.tsx"]);
  assert.deepEqual(result.operationalSession.filesChanged, ["src/App.tsx"]);
  assert.deepEqual(
    projection.filesRead.map((file) => file.path),
    ["src/App.tsx"]
  );
  assert.deepEqual(
    projection.filesChanged.map((file) => file.path),
    ["src/App.tsx"]
  );
  assert.equal(projection.toolsUsed.some((tool) => tool.toolName === "replace_file_range"), true);
  assert.equal(projection.toolsUsed.some((tool) => tool.toolName === "inspect_project"), true);
  assert.equal(projection.filesChanged[0].patchStrategy, "structural_ast");
  assert.deepEqual(projection.filesChanged[0].structuralIntentKinds, ["replace"]);
  assert.equal(projection.filesChanged[0].structuralSymbolName, "App");
  assert.equal(projection.filesChanged[0].structuralSymbolKind, "component");
  assert.equal(projection.filesChanged[0].preconditionCount, 1);
  assert.equal(projection.filesChanged[0].preconditionHash, "0123456789abcdef");
  const fileTelemetry = projectAgentOperationalFileOperations(
    await operationalSessions.getSession(result.operationalSessionId),
    await operationalSessions.listEvents(result.operationalSessionId)
  );
  const editTelemetry = fileTelemetry.find(
    (operation) => operation.path === "src/App.tsx" && operation.status === "changed"
  );
  assert.equal(editTelemetry.patchStrategy, "structural_ast");
  assert.deepEqual(editTelemetry.structuralIntentKinds, ["replace"]);
});

test("AgentToolLoop reports blocked status when an agent profile cannot write", async () => {
  const root = await setupRuntimeProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "qa_agent",
    projectId: PROJECT_ID,
    workflowThreadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
  });
  const workflowEvents = [];

  const result = await new AgentToolLoop().executeCodeChangeSet({
    runtime,
    agentName: "qa",
    agentProfileId: "qa_agent",
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
    codeChangeSet: {
      id: "55555555-5555-4555-8555-555555555555",
      workflowThreadId: THREAD_ID,
      userStoryId: USER_STORY_ID,
      sourceAgent: "front",
      status: "proposed",
      operations: [
        {
          changeType: "update",
          targetPath: "src/App.tsx",
          beforeContent: "export const App = () => 'Horus App';\n",
          afterContent: "export const App = () => 'QA edit';\n",
          diff: "Update src/App.tsx",
        },
      ],
      validation: [],
      createdAt: "2026-05-28T00:00:00.000Z",
    },
    eventSink: {
      emit(event) {
        workflowEvents.push(event);
      },
    },
  });

  assert.equal(result.status, "blocked");
  assert.equal(workflowEvents.some((event) => event.type === "tool_call_blocked"), true);
  const blocked = workflowEvents.find((event) => event.type === "tool_call_blocked");
  assert.deepEqual(blocked.filePaths, ["src/App.tsx"]);
  const fallback = workflowEvents.find((event) => event.type === "fallback_executed");
  assert.equal(fallback.action, "block_delivery");
  assert.equal(fallback.status, "succeeded");
  assert.doesNotMatch(await readFile(join(root, "src", "App.tsx"), "utf8"), /QA edit/);
});

test("AgentToolLoop overwrites existing files when a full write change set has no before snapshot", async () => {
  const root = await setupRuntimeProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    workflowThreadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
  });

  const result = await new AgentToolLoop().executeCodeChangeSet({
    runtime,
    agentName: "front",
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
    codeChangeSet: {
      id: "66666666-6666-4666-8666-666666666666",
      workflowThreadId: THREAD_ID,
      userStoryId: USER_STORY_ID,
      sourceAgent: "front",
      status: "proposed",
      operations: [
        {
          changeType: "create",
          targetPath: "src/App.tsx",
          beforeContent: null,
          afterContent: "export const App = () => 'Overwritten safely';\n",
          diff: "Full write src/App.tsx",
        },
      ],
      validation: [],
      createdAt: "2026-05-28T00:00:00.000Z",
    },
  });

  assert.equal(result.status, "succeeded", result.summary);
  assert.deepEqual(result.changedFiles, ["src/App.tsx"]);
  assert.match(await readFile(join(root, "src", "App.tsx"), "utf8"), /Overwritten safely/);
});

test("AgentToolLoop skips no-op update operations instead of failing edit_file", async () => {
  const root = await setupRuntimeProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    workflowThreadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
  });
  const operationalSessions = new FileAgentOperationalSessionRepository(
    await mkdtemp(join(tmpdir(), "horus-agent-loop-noop-sessions-"))
  );

  const result = await new AgentToolLoop().executeCodeChangeSet({
    runtime,
    agentName: "front",
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
    codeChangeSet: {
      id: "77777777-7777-4777-8777-777777777777",
      workflowThreadId: THREAD_ID,
      userStoryId: USER_STORY_ID,
      sourceAgent: "front",
      status: "proposed",
      operations: [
        {
          changeType: "update",
          targetPath: "src/App.tsx",
          beforeContent: "export const App = () => 'Horus App';\n",
          afterContent: "export const App = () => 'No-op safe edit';\n",
          diff: "Update src/App.tsx",
        },
        {
          changeType: "update",
          targetPath: "src/styles/app.css",
          beforeContent: "body { color: white; }\n",
          afterContent: "body { color: white; }\n",
          diff: "No-op src/styles/app.css",
        },
      ],
      validation: [],
      createdAt: "2026-05-28T00:00:00.000Z",
    },
    operationalSessionRepository: operationalSessions,
  });

  assert.equal(result.status, "succeeded", result.summary);
  assert.deepEqual(result.changedFiles, ["src/App.tsx"]);
  const session = await operationalSessions.getSession(result.operationalSessionId);
  const sessionEvents = await operationalSessions.listEvents(result.operationalSessionId);
  const timeline = projectAgentOperationalFileOperations(session, sessionEvents);
  const skipped = timeline.find(
    (operation) =>
      operation.path === "src/styles/app.css" && operation.status === "skipped"
  );
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.operationType, "update");
  assert.equal(skipped.summary, "Edição ignorada em src/styles/app.css: conteúdo proposto igual ao atual.");
});

test("AgentToolLoop reads before deleting project files", async () => {
  const root = await setupRuntimeProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    workflowThreadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
  });

  const result = await new AgentToolLoop().executeCodeChangeSet({
    runtime,
    agentName: "front",
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
    codeChangeSet: {
      id: "88888888-8888-4888-8888-888888888888",
      workflowThreadId: THREAD_ID,
      userStoryId: USER_STORY_ID,
      sourceAgent: "front",
      status: "proposed",
      operations: [
        {
          changeType: "delete",
          targetPath: "src/styles/app.css",
          beforeContent: "body { color: white; }\n",
          afterContent: null,
          diff: "Delete src/styles/app.css",
        },
      ],
      validation: [],
      createdAt: "2026-05-28T00:00:00.000Z",
    },
  });

  assert.equal(result.status, "succeeded", result.summary);
  assert.deepEqual(result.changedFiles, ["src/styles/app.css"]);
  await assert.rejects(readFile(join(root, "src", "styles", "app.css"), "utf8"), {
    code: "ENOENT",
  });
  const readIndex = result.events.findIndex(
    (event) => event.status === "started" && event.toolName === "read_file"
  );
  const deleteIndex = result.events.findIndex(
    (event) => event.status === "started" && event.toolName === "delete_file"
  );
  assert.equal(readIndex >= 0, true);
  assert.equal(deleteIndex > readIndex, true);
});

test("AgentToolLoop emits task id for validation command tools", async () => {
  const root = await setupRuntimeProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    workflowThreadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
  });
  const workflowEvents = [];

  const result = await new AgentToolLoop().executeCodeChangeSet({
    runtime,
    agentName: "front",
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
    codeChangeSet: {
      id: "99999999-9999-4999-8999-999999999999",
      workflowThreadId: THREAD_ID,
      userStoryId: USER_STORY_ID,
      sourceAgent: "front",
      status: "proposed",
      operations: [
        {
          changeType: "update",
          targetPath: "src/App.tsx",
          beforeContent: "export const App = () => 'Horus App';\n",
          afterContent: "export const App = () => 'Validated loop';\n",
          diff: "Update src/App.tsx",
        },
      ],
      validation: [],
      createdAt: "2026-05-28T00:00:00.000Z",
    },
    validationCommandIds: ["validate-node"],
    eventSink: {
      emit(event) {
        workflowEvents.push(event);
      },
    },
  });

  assert.equal(result.status, "succeeded", result.summary);
  const validationFinished = workflowEvents.find(
    (event) =>
      event.type === "tool_call_finished" &&
      event.toolName === "run_validation_command"
  );
  assert.equal(validationFinished.status, "succeeded");
  assert.deepEqual(validationFinished.commandIds, ["validate-node"]);
  assert.equal(typeof validationFinished.taskId, "string");
  assert.ok(validationFinished.taskId.includes("validate-node"));
});

async function setupRuntimeProject() {
  const root = await mkdtemp(join(tmpdir(), "horus-agent-loop-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "src", "styles"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), "export const App = () => 'Horus App';\n");
  await writeFile(join(root, "src", "styles", "app.css"), "body { color: white; }\n");
  await writeFile(
    join(root, ".horus-project.yaml"),
    JSON.stringify({
      version: 1,
      projectName: "Loop Demo",
      projectStack: "typescript-react",
      baseRef: "main",
      writeRoots: ["src"],
      commandCatalog: [
        {
          id: "validate-node",
          executable: process.execPath,
          args: ["-e", "console.log('validated')"],
          cwd: ".",
          env: {},
        },
      ],
      testRunnerIds: ["validate-node"],
      bootstrapCommandIds: [],
      roleProfiles: {
        backend_specialist: {
          allowedCommandIds: ["validate-node"],
          defaultValidationCommandIds: ["validate-node"],
        },
        frontend_specialist: {
          allowedCommandIds: ["validate-node"],
          defaultValidationCommandIds: ["validate-node"],
        },
        qa_specialist: {
          allowedCommandIds: ["validate-node"],
          defaultValidationCommandIds: ["validate-node"],
        },
      },
    })
  );
  return root;
}

function buildTools(root) {
  const repo = repositoryFor(root);
  const fileBrowser = new ProjectFileBrowserService(repo, {
    logger: { info() {}, warn() {} },
  });
  const tools = new AgentToolRegistry(new AgentProfileRegistry());
  registerProjectAgentTools({
    registry: tools,
    fileBrowser,
    codeContext: new ReadOnlyCodeContextService(),
    projectConstruction: repo,
    configService: new ProjectConfigService(),
    executionService: new ProjectExecutionService(),
    diffAnalyzer: new ProjectDiffAnalyzer(),
    fileMutationApplier: new FileMutationPreflightApplier(),
    projectInspector: new ProjectInspectionService(new RepositoryScanner()),
  });
  return tools;
}

function repositoryFor(rootPath) {
  const now = new Date().toISOString();
  const project = {
    id: PROJECT_ID,
    workspaceFolderId: null,
    name: "Loop Demo",
    slug: "loop-demo",
    targetMode: "new_project",
    rootPath,
    configPath: join(rootPath, ".horus-project.yaml"),
    gitRepositoryPath: rootPath,
    currentBranch: "main",
    baseRef: "main",
    projectStack: "typescript-react",
    createdAt: now,
    updatedAt: now,
  };
  return {
    async getProjectWorkspace(id) {
      if (id !== PROJECT_ID) throw new Error(`Project workspace not found: ${id}`);
      return project;
    },
    async listProjectWorkspaces() {
      return [project];
    },
    async listConstructionRuns() {
      return [];
    },
    async getConstructionRun(id) {
      throw new Error(`Project construction run not found: ${id}`);
    },
  };
}
