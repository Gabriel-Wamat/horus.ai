import assert from "node:assert/strict";
import test from "node:test";
import { createFrontAgentNode } from "../dist/infrastructure/langgraph/nodes/frontAgentNode.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ajustar painel",
  description: "Como usuário, quero ver um painel ajustado.",
  acceptanceCriteria: ["Painel aparece"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-26T10:00:00.000Z",
};

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: userStory.id,
  version: 1,
  summary: "Ajustar painel principal",
  technicalApproach: "Editar componente React existente.",
  components: [],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-05-26T10:01:00.000Z",
};

const projectWorkspaceId = "77777777-7777-4777-8777-777777777777";

test("frontAgentNode delegates chat code-change file operations to governed tool loop by default", async () => {
  const previous = process.env.HORUS_ENABLE_TOOL_MODE;
  delete process.env.HORUS_ENABLE_TOOL_MODE;
  const calls = [];

  try {
    const node = createFrontAgentNode({
      loadAgentSkill: () => "",
      getRuntimeLlmSettings: () => undefined,
      generateSpec: async () => spec,
      decideRouting: () => [],
      buildFrontendCodeContext: async () => ({
        projectId: "33333333-3333-4333-8333-333333333333",
        query: "Ajustar painel",
        inspectedFiles: ["src/App.tsx"],
        files: [
          {
            path: "src/App.tsx",
            bytes: 31,
            content: "export function App(){return null}",
          },
        ],
        omittedFilesCount: 0,
        totalBytes: 31,
        limits: {
          maxFiles: 12,
          maxBytesPerFile: 8000,
          maxTotalBytes: 32000,
        },
      }),
      generateFrontend: async () => ({
        html: "preview",
        operations: [
          {
            operation: "write",
            targetPath: "src/App.tsx",
            afterContent: "export function App(){return <main>Runtime</main>}",
            rationale: "Atualiza componente.",
          },
        ],
      }),
      createAgentToolRuntime: (context) => ({
        async execute(input) {
          calls.push({ context, input });
          if (input.toolName === "read_file") {
            return {
              path: input.input.path,
              content: "export function App(){return null}",
              versionHash: "a".repeat(64),
              version: { hash: "a".repeat(64), sizeBytes: 35, mtimeMs: 1 },
              truncated: false,
              binary: false,
            };
          }
          return { changeSetId: input.input.id, status: "proposed" };
        },
        getEvents() {
          return [
            {
              callId: "99999999-9999-4999-8999-999999999999",
              agentProfileId: context.agentProfileId,
              toolName: "propose_code_change_set",
              status: "succeeded",
              mutatesState: false,
              output: { status: "proposed" },
              errorMessage: null,
              startedAt: "2026-05-27T00:00:00.000Z",
              finishedAt: "2026-05-27T00:00:00.001Z",
              durationMs: 1,
            },
          ];
        },
      }),
      agentToolLoop: {
        async executeCodeChangeSet(input) {
          await input.runtime.execute({
            toolName: "propose_code_change_set",
            input: input.codeChangeSet,
          });
          await input.runtime.execute({
            toolName: "read_file",
            input: {
              path: "src/App.tsx",
            },
          });
          await input.runtime.execute({
            toolName: "edit_file",
            input: {
              path: "src/App.tsx",
              oldString: "export function App(){return null}",
              newString: "export function App(){return <main>Runtime</main>}",
              expectedContentHash: "a".repeat(64),
            },
          });
          await input.runtime.execute({
            toolName: "get_git_diff",
            input: {},
          });
          return {
            status: "succeeded",
            changedFiles: ["src/App.tsx"],
            validationCommandIds: [],
            events: input.runtime.getEvents(),
            summary: "1 arquivo alterado.",
          };
        },
      },
      generateQaTests: async () => ({ testCases: [] }),
      validateOutput: async () => ({
        passed: true,
        score: 100,
        notes: "ok",
        missingItems: [],
        fixTarget: "front",
      }),
    });

    const update = await node({
      userStories: [userStory],
      currentUSIndex: 0,
      specs: { [userStory.id]: spec },
      workspaceArtifactContext: {},
      humanFeedback: {},
      agentResults: {},
      status: "running",
      threadId: "55555555-5555-4555-8555-555555555555",
      workspaceFolderId: "44444444-4444-4444-8444-444444444444",
      projectWorkspaceId,
      workflowMode: "chat_code_change",
      frontendProjectId: "33333333-3333-4333-8333-333333333333",
      frontendProjectRootPath: "/tmp/horus-web",
      sourceChatSessionId: undefined,
      sourceChatMessageId: undefined,
      executionBrief: "Ajuste o painel.",
      routingDecision: [],
      curatorFeedback: {},
      retryCount: 0,
      pendingRetryApproval: null,
    });

    assert.equal(calls.length, 4);
    assert.equal(calls[0].context.agentProfileId, "front_agent");
    assert.equal(calls[0].context.projectId, projectWorkspaceId);
    assert.equal(calls[0].input.toolName, "propose_code_change_set");
    assert.equal(calls[1].input.toolName, "read_file");
    assert.equal(calls[2].input.toolName, "edit_file");
    assert.equal(calls[3].input.toolName, "get_git_diff");
    assert.equal(
      update.agentResults[userStory.id][0].output.toolLoop.changedFiles[0],
      "src/App.tsx"
    );
  } finally {
    if (previous === undefined) delete process.env.HORUS_ENABLE_TOOL_MODE;
    else process.env.HORUS_ENABLE_TOOL_MODE = previous;
  }
});

test("frontAgentNode passes isolated worktree root into the governed tool runtime", async () => {
  const previous = process.env.HORUS_ENABLE_TOOL_MODE;
  delete process.env.HORUS_ENABLE_TOOL_MODE;
  const runtimeContexts = [];
  const isolatedRoot = "/tmp/horus-isolated-front-worktree";

  try {
    const node = createFrontAgentNode({
      loadAgentSkill: () => "",
      getRuntimeLlmSettings: () => undefined,
      generateSpec: async () => spec,
      decideRouting: () => [],
      buildFrontendCodeContext: async () => ({
        projectId: "33333333-3333-4333-8333-333333333333",
        query: "Ajustar painel",
        inspectedFiles: ["src/App.tsx"],
        files: [
          {
            path: "src/App.tsx",
            bytes: 31,
            content: "export function App(){return null}",
          },
        ],
        omittedFilesCount: 0,
        totalBytes: 31,
        limits: {
          maxFiles: 12,
          maxBytesPerFile: 8000,
          maxTotalBytes: 32000,
        },
      }),
      generateFrontend: async () => ({
        html: "preview",
        operations: [
          {
            operation: "write",
            targetPath: "src/App.tsx",
            afterContent: "export function App(){return <main>Runtime</main>}",
            rationale: "Atualiza componente.",
          },
        ],
      }),
      workflowRunIsolation: {
        isEnabled: () => true,
        async runIsolated(input) {
          const value = await input.execute({
            rootPath: isolatedRoot,
            isolated: true,
          });
          return { value, isolated: true, notes: [] };
        },
      },
      createAgentToolRuntime: (context) => {
        runtimeContexts.push(context);
        return {
          async execute() {
            return { changeSetId: "99999999-9999-4999-8999-999999999999", status: "ok" };
          },
          getEvents() {
            return [];
          },
        };
      },
      agentToolLoop: {
        async executeCodeChangeSet() {
          return {
            status: "succeeded",
            changedFiles: ["src/App.tsx"],
            validationCommandIds: [],
            events: [],
            summary: "1 arquivo alterado.",
          };
        },
      },
      generateQaTests: async () => ({ testCases: [] }),
      validateOutput: async () => ({
        passed: true,
        score: 100,
        notes: "ok",
        missingItems: [],
        fixTarget: "front",
      }),
    });

    await node({
      userStories: [userStory],
      currentUSIndex: 0,
      specs: { [userStory.id]: spec },
      workspaceArtifactContext: {},
      humanFeedback: {},
      agentResults: {},
      status: "running",
      threadId: "55555555-5555-4555-8555-555555555555",
      workspaceFolderId: "44444444-4444-4444-8444-444444444444",
      projectWorkspaceId,
      workflowMode: "chat_code_change",
      frontendProjectId: "33333333-3333-4333-8333-333333333333",
      frontendProjectRootPath: "/tmp/horus-web",
      sourceChatSessionId: undefined,
      sourceChatMessageId: undefined,
      executionBrief: "Ajuste o painel.",
      routingDecision: [],
      curatorFeedback: {},
      retryCount: 0,
      pendingRetryApproval: null,
    });

    assert.equal(runtimeContexts.length, 1);
    assert.equal(runtimeContexts[0].projectId, projectWorkspaceId);
    assert.equal(runtimeContexts[0].projectRootOverride, isolatedRoot);
  } finally {
    if (previous === undefined) delete process.env.HORUS_ENABLE_TOOL_MODE;
    else process.env.HORUS_ENABLE_TOOL_MODE = previous;
  }
});
