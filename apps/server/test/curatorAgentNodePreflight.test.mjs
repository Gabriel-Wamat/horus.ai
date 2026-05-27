import assert from "node:assert/strict";
import test from "node:test";
import { createCuratorAgentNode } from "../dist/infrastructure/langgraph/nodes/curatorAgentNode.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Validar entrega",
  description: "Como usuário, quero uma entrega validada.",
  acceptanceCriteria: ["Entrega sem falha"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-27T00:00:00.000Z",
};

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: userStory.id,
  version: 1,
  summary: "Validar entrega",
  technicalApproach: "Aplicar patch somente depois de validação terminal.",
  components: [],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-05-27T00:01:00.000Z",
};

const codeChangeSet = {
  id: "33333333-3333-4333-8333-333333333333",
  workflowThreadId: "44444444-4444-4444-8444-444444444444",
  userStoryId: userStory.id,
  sourceAgent: "front",
  status: "proposed",
  operations: [
    {
      targetPath: "src/App.tsx",
      changeType: "update",
      beforeContent: "before",
      afterContent: "after",
      diff: "diff --git a/src/App.tsx b/src/App.tsx\n@@\n-before\n+after",
    },
  ],
  validation: [],
  createdAt: "2026-05-27T00:02:00.000Z",
};

function baseState() {
  return {
    userStories: [userStory],
    currentUSIndex: 0,
    specs: { [userStory.id]: spec },
    workspaceArtifactContext: {},
    humanFeedback: {},
    agentResults: {
      [userStory.id]: [
        {
          status: "success",
          agentName: "front",
          userStoryId: userStory.id,
          output: {
            html: "<main>after</main>",
            codeChangeSet,
          },
          executionTimeMs: 1,
          completedAt: "2026-05-27T00:02:00.000Z",
        },
        {
          status: "success",
          agentName: "qa",
          userStoryId: userStory.id,
          output: {
            testCases: [
              {
                name: "renders",
                type: "unit",
                description: "renders",
                assertions: ["renders after"],
              },
            ],
          },
          executionTimeMs: 1,
          completedAt: "2026-05-27T00:02:01.000Z",
        },
      ],
    },
    status: "running",
    threadId: codeChangeSet.workflowThreadId,
    workspaceFolderId: "55555555-5555-4555-8555-555555555555",
    frontendProjectId: "66666666-6666-4666-8666-666666666666",
    frontendProjectRootPath: "/tmp/project",
    previewSessionId: undefined,
    workflowMode: "chat_code_change",
    sourceChatSessionId: undefined,
    sourceChatMessageId: undefined,
    executionBrief: "corrija a tela",
    routingDecision: [],
    curatorFeedback: {},
    retryCount: 0,
    pendingRetryApproval: null,
  };
}

test("curatorAgentNode converts failed terminal preflight into retry feedback instead of approving delivery", async () => {
  let validateOutputCalled = false;
  const node = createCuratorAgentNode({
    loadAgentSkill: () => "",
    getRuntimeLlmSettings: () => undefined,
    generateSpec: async () => spec,
    decideRouting: () => ["frontAgent"],
    generateFrontend: async () => ({ html: "" }),
    buildFrontendCodeContext: async () => ({
      files: [],
      excerpts: [],
      inspectedFiles: [],
      maxFiles: 0,
      maxBytesPerFile: 0,
      maxTotalBytes: 0,
      groundingStatus: "no_sources",
    }),
    generateQaTests: async () => ({ testCases: [] }),
    validateOutput: async () => {
      validateOutputCalled = true;
      return {
        passed: true,
        score: 100,
        notes: "would have passed",
        missingItems: [],
        fixTarget: "front",
      };
    },
    preflightCodeChangeSet: async () => ({
      passed: false,
      issues: ["[terminal] test-root-test failed with exit 1: TS1005"],
      validation: [
        {
          command: "npm test",
          cwd: "/tmp/project",
          exitCode: 1,
          status: "failed",
          stderr: "TS1005",
        },
      ],
      runtimeEvidence: {
        id: "77777777-7777-4777-8777-777777777777",
        workflowThreadId: codeChangeSet.workflowThreadId,
        constructionRunId: null,
        userStoryId: userStory.id,
        projectId: "66666666-6666-4666-8666-666666666666",
        status: "failed",
        skippedReason: null,
        commands: [
          {
            commandId: "test-root-test",
            command: "npm test",
            cwd: "/tmp/project",
            exitCode: 1,
            stdoutTail: "",
            stderrTail: "TS1005",
            durationMs: 10,
          },
        ],
        preview: {
          status: "skipped",
          url: null,
          message: "Terminal preflight failed.",
          evidence: {
            title: null,
            bodySnippet: null,
            screenshotPath: null,
          },
        },
        createdAt: "2026-05-27T00:03:00.000Z",
      },
    }),
  });

  const update = await node(baseState());

  assert.equal(validateOutputCalled, false);
  assert.equal(update.status, "running");
  assert.equal(update.retryCount, 1);
  assert.equal(update.curatorFeedback?.[userStory.id]?.passed, false);
  assert.equal(update.curatorFeedback?.[userStory.id]?.fixTarget, "front");
  assert.match(
    update.curatorFeedback?.[userStory.id]?.missingItems.join("\n"),
    /test-root-test failed/
  );
  const output = update.agentResults?.[userStory.id]?.[0]?.output;
  assert.equal(output?.passed, false);
  assert.equal(output?.runtimeValidation?.status, "failed");
});
