import assert from "node:assert/strict";
import test from "node:test";
import { createCuratorAgentNode } from "../dist/infrastructure/langgraph/nodes/curatorAgentNode.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Validar visual",
  description: "Como usuário, quero uma entrega visual consistente.",
  acceptanceCriteria: ["Entrega não deve quebrar visualmente"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-27T00:00:00.000Z",
};

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: userStory.id,
  version: 1,
  summary: "Validar visual antes da entrega.",
  technicalApproach: "Bloquear entrega se o visual gate reprovar.",
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
      afterContent: "<main style='width:1200px'></main>",
      diff: "diff --git a/src/App.tsx b/src/App.tsx",
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
            html: "<main style='width:1200px'></main>",
            codeChangeSet,
          },
          executionTimeMs: 1,
          completedAt: "2026-05-27T00:02:00.000Z",
        },
        {
          status: "success",
          agentName: "qa",
          userStoryId: userStory.id,
          output: { testCases: [] },
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

test("curatorAgentNode blocks delivery when visual gate fails and routes feedback to Front", async () => {
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
      passed: true,
      issues: [],
      validation: [],
      runtimeEvidence: {
        id: "88888888-8888-4888-8888-888888888888",
        workflowThreadId: codeChangeSet.workflowThreadId,
        constructionRunId: null,
        userStoryId: userStory.id,
        projectId: "66666666-6666-4666-8666-666666666666",
        status: "passed",
        skippedReason: null,
        commands: [],
        preview: {
          status: "skipped",
          url: null,
          message: "Terminal preflight passed.",
          evidence: {
            title: null,
            bodySnippet: null,
            screenshotPath: null,
          },
        },
        createdAt: "2026-05-27T00:02:30.000Z",
      },
    }),
    validateVisualGate: async () => ({
      id: "77777777-7777-4777-8777-777777777777",
      status: "failed",
      score: 58,
      threshold: 86,
      summary: "Visual reprovado: largura fixa no mobile.",
      issues: [
        {
          id: "visual-overflow",
          severity: "high",
          category: "responsive_overflow",
          location: "mobile viewport",
          observed: "Há largura fixa com risco de overflow: width:1200px.",
          expected: "Usar constraints responsivas.",
          fixTarget: "front",
          evidenceIds: ["static-dom:abc:mobile"],
        },
      ],
      screenshots: [
        {
          id: "static-dom:abc:mobile",
          viewport: "mobile",
          width: 390,
          height: 844,
          captureKind: "static_dom",
          artifactPath: null,
          artifactUrl: null,
          nonBlank: true,
          diagnostics: { fixedWidthRisks: ["width:1200px"] },
        },
      ],
      previewUrl: null,
      captureUnavailableReason: null,
      designSystemSourceFiles: [],
      startedAt: "2026-05-27T00:03:00.000Z",
      finishedAt: "2026-05-27T00:03:01.000Z",
      durationMs: 1000,
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
    /\[front:visual].*width:1200px/
  );
  const output = update.agentResults?.[userStory.id]?.[0]?.output;
  assert.equal(output?.passed, false);
  assert.equal(output?.visualGate?.status, "failed");
  assert.equal(output?.runtimeValidation?.preview.evidence.title, "Visual gate");
});
