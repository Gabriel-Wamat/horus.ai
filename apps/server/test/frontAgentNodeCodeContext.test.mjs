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

test("frontAgentNode passes selected project code context and emits real file CodeChangeSet", async () => {
  let contextInput;
  let receivedCodeContext;
  const codeContext = {
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
  };

  const node = createFrontAgentNode({
    loadAgentSkill: () => "",
    getRuntimeLlmSettings: () => undefined,
    generateSpec: async () => spec,
    decideRouting: () => [],
    buildFrontendCodeContext: async (input) => {
      contextInput = input;
      return codeContext;
    },
    generateFrontend: async (
      _userStory,
      _spec,
      _feedback,
      _llmSettings,
      _executionBrief,
      injectedCodeContext
    ) => {
      receivedCodeContext = injectedCodeContext;
      return {
        html: "preview",
        inspectedFiles: injectedCodeContext?.inspectedFiles,
        operations: [
          {
            targetPath: "src/App.tsx",
            afterContent: "export function App(){return <main>Horus</main>}",
            rationale: "Atualiza o componente existente.",
          },
        ],
      };
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
    workspaceArtifactContext: {
      [userStory.id]: {
        workspaceFolderId: "44444444-4444-4444-8444-444444444444",
      },
    },
    humanFeedback: {},
    agentResults: {},
    status: "running",
    threadId: "55555555-5555-4555-8555-555555555555",
    workspaceFolderId: "44444444-4444-4444-8444-444444444444",
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

  assert.equal(contextInput.projectId, "33333333-3333-4333-8333-333333333333");
  assert.equal(contextInput.projectRootPath, "/tmp/horus-web");
  assert.equal(receivedCodeContext, codeContext);

  const result = update.agentResults[userStory.id][0];
  assert.equal(result.output.codeChangeSet.operations[0].targetPath, "src/App.tsx");
  assert.equal(result.output.codeChangeSet.operations[0].changeType, "update");
  assert.deepEqual(result.output.inspectedFiles, ["src/App.tsx"]);
});
