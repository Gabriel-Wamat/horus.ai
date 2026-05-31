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
    workspaceArtifactContext: {
      [userStory.id]: {
        workspaceFolderId: "55555555-5555-4555-8555-555555555555",
        constructionRunId: "77777777-7777-4777-8777-777777777777",
      },
    },
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
  let preflightInput;
  const emittedEvents = [];
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
    preflightCodeChangeSet: async (input) => {
      preflightInput = input;
      input.onCommandOutput?.({
        commandId: "test-root-test",
        taskId: "task-curator-preflight",
        traceId: input.trace.traceId,
        spanId: input.trace.spanId,
        toolCallId: input.trace.toolCallId,
        runId: input.trace.runId,
        projectId: input.trace.projectId,
        agentId: input.trace.agentId,
        filePath: input.trace.filePath,
        diffId: input.trace.diffId,
        stream: "stderr",
        chunk: "TS1005",
        sequence: 0,
        timestamp: "2026-05-27T00:02:59.000Z",
      });
      return {
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
          id: "88888888-8888-4888-8888-888888888888",
          workflowThreadId: codeChangeSet.workflowThreadId,
          constructionRunId: "77777777-7777-4777-8777-777777777777",
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
      };
    },
    emitWorkflowEvent: (event) => {
      emittedEvents.push(event);
    },
  });

  const update = await node(baseState());

  assert.equal(validateOutputCalled, false);
  assert.equal(preflightInput.constructionRunId, "77777777-7777-4777-8777-777777777777");
  assert.equal(preflightInput.trace.traceId, codeChangeSet.workflowThreadId);
  assert.equal(preflightInput.trace.spanId, `curator-preflight-${codeChangeSet.id}`);
  assert.equal(preflightInput.trace.toolCallId, `curator-preflight-${codeChangeSet.id}`);
  assert.equal(preflightInput.trace.runId, "77777777-7777-4777-8777-777777777777");
  assert.equal(preflightInput.trace.projectId, "66666666-6666-4666-8666-666666666666");
  assert.equal(preflightInput.trace.agentId, "curator_agent");
  assert.equal(preflightInput.trace.filePath, "src/App.tsx");
  assert.equal(preflightInput.trace.diffId, codeChangeSet.id);
  assert.equal(emittedEvents.length, 1);
  assert.equal(emittedEvents[0].type, "command_output");
  assert.equal(emittedEvents[0].agentName, "curator");
  assert.equal(emittedEvents[0].agentProfileId, "curator_agent");
  assert.equal(emittedEvents[0].toolName, "run_validation_command");
  assert.equal(emittedEvents[0].taskId, "task-curator-preflight");
  assert.equal(emittedEvents[0].traceId, codeChangeSet.workflowThreadId);
  assert.equal(emittedEvents[0].filePath, "src/App.tsx");
  assert.equal(emittedEvents[0].diffId, codeChangeSet.id);
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

test("curatorAgentNode blocks governed chat edits when deterministic preflight fails", async () => {
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
      throw new Error("LLM curator should not retry after a governed chat edit");
    },
    preflightCodeChangeSet: async () => ({
      passed: false,
      issues: ["type-check failed because dependencies are not installed"],
      validation: [
        {
          command: "npm run type-check",
          cwd: "/tmp/project",
          exitCode: 2,
          status: "failed",
          stdout: "",
          stderr: "Cannot find module 'react'",
        },
      ],
      runtimeEvidence: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workflowThreadId: codeChangeSet.workflowThreadId,
        constructionRunId: "77777777-7777-4777-8777-777777777777",
        userStoryId: userStory.id,
        projectId: "66666666-6666-4666-8666-666666666666",
        status: "failed",
        skippedReason: null,
        commands: [
          {
            commandId: "type-check-root-type-check",
            command: "npm run type-check",
            cwd: "/tmp/project",
            exitCode: 2,
            stdoutTail: "",
            stderrTail: "Cannot find module 'react'",
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

  const state = baseState();
  state.agentResults[userStory.id][0].output.toolLoop = {
    status: "succeeded",
    changedFiles: ["src/App.tsx"],
    validationCommandIds: [],
    summary: "1 arquivo alterado por tools governadas.",
  };

  const update = await node(state);

  assert.equal(validateOutputCalled, false);
  assert.equal(update.status, "blocked");
  assert.equal(update.currentUSIndex, undefined);
  assert.equal(update.retryCount, 0);
  const output = update.agentResults?.[userStory.id]?.[0]?.output;
  assert.equal(output?.passed, false);
  assert.equal(output?.preflightValidation?.passed, false);
  assert.match(output?.notes, /preflight terminal\/estática falhou/);
});

test("curatorAgentNode approves project construction when deterministic gates pass", async () => {
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
      throw new Error("LLM curator should not run after deterministic gates pass");
    },
    preflightCodeChangeSet: async () => ({
      passed: true,
      issues: [],
      validation: [
        {
          command: "npm run type-check",
          cwd: "/tmp/project",
          exitCode: 0,
          status: "passed",
          stdout: "ok",
          stderr: "",
        },
      ],
      runtimeEvidence: {
        id: "99999999-9999-4999-8999-999999999999",
        workflowThreadId: codeChangeSet.workflowThreadId,
        constructionRunId: "77777777-7777-4777-8777-777777777777",
        userStoryId: userStory.id,
        projectId: "66666666-6666-4666-8666-666666666666",
        status: "passed",
        skippedReason: null,
        commands: [
          {
            commandId: "type-check-root-type-check",
            command: "npm run type-check",
            cwd: "/tmp/project",
            exitCode: 0,
            stdoutTail: "ok",
            stderrTail: "",
            durationMs: 10,
          },
        ],
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
        createdAt: "2026-05-27T00:03:00.000Z",
      },
    }),
    validateVisualGate: async () => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "passed",
      score: 91,
      threshold: 86,
      summary: "Visual aprovado.",
      issues: [],
      screenshots: [],
      previewUrl: null,
      captureUnavailableReason: null,
      designSystemSourceFiles: [],
      startedAt: "2026-05-27T00:04:00.000Z",
      finishedAt: "2026-05-27T00:04:00.005Z",
      durationMs: 5,
    }),
  });

  const update = await node({
    ...baseState(),
    workflowMode: "project_construction",
  });

  assert.equal(validateOutputCalled, false);
  assert.equal(update.status, "completed");
  assert.equal(update.currentUSIndex, 1);
  const output = update.agentResults?.[userStory.id]?.[0]?.output;
  assert.equal(output?.passed, true);
  assert.equal(output?.terminalRuntimeValidation?.status, "passed");
  assert.equal(output?.runtimeValidation?.status, "passed");
});

test("curatorAgentNode approves chat code changes when deterministic gates pass", async () => {
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
      throw new Error("LLM curator should not re-score narrow chat code changes");
    },
    preflightCodeChangeSet: async () => ({
      passed: true,
      issues: [],
      validation: [
        {
          command: "npm run type-check",
          cwd: "/tmp/project",
          exitCode: 0,
          status: "passed",
          stdout: "ok",
          stderr: "",
        },
      ],
      runtimeEvidence: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workflowThreadId: codeChangeSet.workflowThreadId,
        constructionRunId: "77777777-7777-4777-8777-777777777777",
        userStoryId: userStory.id,
        projectId: "66666666-6666-4666-8666-666666666666",
        status: "passed",
        skippedReason: null,
        commands: [
          {
            commandId: "type-check-root-type-check",
            command: "npm run type-check",
            cwd: "/tmp/project",
            exitCode: 0,
            stdoutTail: "ok",
            stderrTail: "",
            durationMs: 10,
          },
        ],
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
        createdAt: "2026-05-27T00:03:00.000Z",
      },
    }),
    validateVisualGate: async () => ({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "passed",
      score: 90,
      threshold: 86,
      summary: "Visual aprovado.",
      issues: [],
      screenshots: [],
      previewUrl: null,
      captureUnavailableReason: null,
      designSystemSourceFiles: [],
      startedAt: "2026-05-27T00:04:00.000Z",
      finishedAt: "2026-05-27T00:04:00.005Z",
      durationMs: 5,
    }),
  });

  const update = await node(baseState());

  assert.equal(validateOutputCalled, false);
  assert.equal(update.status, "completed");
  assert.equal(update.currentUSIndex, 1);
  const output = update.agentResults?.[userStory.id]?.[0]?.output;
  assert.equal(output?.passed, true);
  assert.equal(output?.terminalRuntimeValidation?.status, "passed");
  assert.equal(output?.runtimeValidation?.status, "passed");
});

test("curatorAgentNode blocks governed chat edits without deterministic evidence", async () => {
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
      throw new Error("LLM curator should not retry a governed chat edit");
    },
  });

  const state = baseState();
  state.agentResults[userStory.id][0].output.toolLoop = {
    status: "succeeded",
    changedFiles: ["src/App.tsx"],
    validationCommandIds: [],
    summary: "1 arquivo alterado por tools governadas.",
  };

  const update = await node(state);

  assert.equal(validateOutputCalled, false);
  assert.equal(update.status, "blocked");
  assert.equal(update.currentUSIndex, undefined);
  const output = update.agentResults?.[userStory.id]?.[0]?.output;
  assert.equal(output?.passed, false);
  assert.match(output?.notes, /preflight determinística/);
  assert.match(output?.missingItems.join("\n"), /preflight was not executed/);
});
