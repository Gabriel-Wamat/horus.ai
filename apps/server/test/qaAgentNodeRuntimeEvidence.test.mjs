import assert from "node:assert/strict";
import test from "node:test";
import { createQaAgentNode } from "../dist/infrastructure/langgraph/nodes/qaAgentNode.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Validar execução",
  description: "Como operador, quero evidência completa do QA.",
  acceptanceCriteria: ["QA registra install e retry"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-30T00:00:00.000Z",
};

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: userStory.id,
  version: 1,
  summary: "QA deve expor trilha operacional completa.",
  technicalApproach: "Executar comandos governados.",
  components: [],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-05-30T00:01:00.000Z",
};

test("qaAgentNode preserves dependency repair and retry runs in runtime evidence", async () => {
  const emittedEvents = [];
  const node = createQaAgentNode({
    loadAgentSkill: () => "",
    getRuntimeLlmSettings: () => undefined,
    generateSpec: async () => spec,
    decideRouting: () => [],
    generateFrontend: async () => ({ html: "" }),
    buildFrontendCodeContext: async () => ({
      projectId: "33333333-3333-4333-8333-333333333333",
      query: "",
      inspectedFiles: [],
      files: [],
      omittedFilesCount: 0,
      totalBytes: 0,
      limits: { maxFiles: 0, maxBytesPerFile: 0, maxTotalBytes: 0 },
    }),
    generateQaTests: async () => ({ testCases: [] }),
    validateOutput: async () => ({
      passed: true,
      score: 100,
      notes: "ok",
      missingItems: [],
      fixTarget: "front",
    }),
    buildProjectContextSnapshot: async () => ({
      projectId: "33333333-3333-4333-8333-333333333333",
      projectRootPath: "/tmp/horus-qa-runtime",
      agentProfileId: "qa_agent",
      query: "Validar execução",
      inspection: {
        projectId: "33333333-3333-4333-8333-333333333333",
        projectRootPath: "/tmp/horus-qa-runtime",
        packageManager: { name: "pnpm", status: "detected", evidence: [] },
        framework: {
          name: "react-vite",
          status: "detected",
          confidence: 1,
          evidence: [],
        },
        scripts: [
          {
            name: "build",
            command: "vite build",
            category: "build",
          },
        ],
        roots: {
          sourceRoots: ["src"],
          testRoots: [],
          publicRoots: [],
          editableRoots: ["src"],
        },
        entrypoints: [],
        routes: [],
        editableFiles: [],
        protectedPaths: [],
        unsafePaths: [],
        warnings: [],
        stats: {
          filesScanned: 0,
          filesIncluded: 0,
          filesSkipped: 0,
          bytesIncluded: 0,
        },
        generatedAt: "2026-05-30T00:02:00.000Z",
      },
      codeContext: {
        projectId: "33333333-3333-4333-8333-333333333333",
        query: "Validar execução",
        inspectedFiles: [],
        files: [],
        omittedFilesCount: 0,
        totalBytes: 0,
        limits: { maxFiles: 0, maxBytesPerFile: 0, maxTotalBytes: 0 },
      },
      validationStrategy: {
        stack: "react-vite",
        requirements: [],
        notes: [],
      },
      editRestrictions: {
        protectedPaths: [],
        unsafePaths: [],
        editableRoots: ["src"],
        forbiddenWritePatterns: [],
      },
      runtimeHints: [],
      runHistory: [],
      notes: [],
      generatedAt: "2026-05-30T00:02:00.000Z",
    }),
    emitWorkflowEvent: (event) => {
      emittedEvents.push(event);
    },
    createAgentToolRuntime: (context) => ({
      async execute(input) {
        if (input.toolName === "inspect_preview") {
          assert.equal(
            input.input.previewSessionId,
            "77777777-7777-4777-8777-777777777777"
          );
          assert.equal(input.input.projectId, "33333333-3333-4333-8333-333333333333");
          assert.equal(input.input.traceId, "55555555-5555-4555-8555-555555555555");
          assert.equal(input.input.runId, "55555555-5555-4555-8555-555555555555");
          assert.equal(input.input.agentId, "qa_agent");
          assert.equal(input.input.spanId, input.input.toolCallId);
          return {
            status: "passed",
            reason: "preview_reachable",
            previewSessionId: input.input.previewSessionId,
            previewStatus: "running",
            previewUrl: "http://localhost:5173",
            statusCode: 200,
            contentType: "text/html",
            bodyBytes: 128,
            elapsedMs: 9,
            checkedAt: "2026-05-30T00:03:30.000Z",
          };
        }

        assert.equal(input.toolName, "run_validation_command");
        assert.equal(input.input.traceId, "55555555-5555-4555-8555-555555555555");
        assert.equal(input.input.runId, "55555555-5555-4555-8555-555555555555");
        assert.equal(input.input.agentId, "qa_agent");
        assert.equal(input.input.spanId, input.input.toolCallId);
        assert.equal(typeof context.onShellOutput, "function");
        context.onShellOutput({
          toolName: "run_validation_command",
          output: {
            commandId: "build-root-build",
            taskId: "task-build-1",
            stream: "stderr",
            chunk: "vite: command not found",
            sequence: 0,
            timestamp: "2026-05-30T00:03:00.000Z",
            traceId: "55555555-5555-4555-8555-555555555555",
            spanId: input.input.spanId,
            parentSpanId: null,
            toolCallId: input.input.toolCallId,
            runId: "55555555-5555-4555-8555-555555555555",
            projectId: "33333333-3333-4333-8333-333333333333",
            agentId: "qa_agent",
            filePath: null,
            diffId: null,
          },
        });
        return {
          commandId: "build-root-build",
          taskId: "task-build-2",
          exitCode: 0,
          stdoutTail: "build passed",
          stderrTail: "",
          stdoutPath: "/tmp/stdout-build-2.log",
          stderrPath: "/tmp/stderr-build-2.log",
          durationMs: 12,
          runs: [
            {
              commandId: "build-root-build",
              taskId: "task-build-1",
              exitCode: 1,
              stdoutTail: "",
              stderrTail: "vite: command not found",
              stdoutPath: "/tmp/stdout-build-1.log",
              stderrPath: "/tmp/stderr-build-1.log",
              durationMs: 5,
            },
            {
              commandId: "install-root-dependencies",
              taskId: "task-install",
              exitCode: 0,
              stdoutTail: "installed",
              stderrTail: "",
              stdoutPath: "/tmp/stdout-install.log",
              stderrPath: "/tmp/stderr-install.log",
              durationMs: 20,
            },
            {
              commandId: "build-root-build",
              taskId: "task-build-2",
              exitCode: 0,
              stdoutTail: "build passed",
              stderrTail: "",
              stdoutPath: "/tmp/stdout-build-2.log",
              stderrPath: "/tmp/stderr-build-2.log",
              durationMs: 12,
            },
          ],
        };
      },
      getEvents() {
        return [];
      },
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
    projectWorkspaceId: "33333333-3333-4333-8333-333333333333",
    workflowMode: "project",
    frontendProjectId: "33333333-3333-4333-8333-333333333333",
    frontendProjectRootPath: "/tmp/horus-qa-runtime",
    previewSessionId: "77777777-7777-4777-8777-777777777777",
    sourceChatSessionId: undefined,
    sourceChatMessageId: undefined,
    executionBrief: "Validar execução",
    routingDecision: [],
    curatorFeedback: {},
    retryCount: 0,
    pendingRetryApproval: null,
  });

  const qaOutput = update.agentResults[userStory.id][0].output;
  assert.deepEqual(
    qaOutput.runtimeValidation.commands.map((command) => command.commandId),
    ["build-root-build", "install-root-dependencies", "build-root-build"]
  );
  assert.equal(qaOutput.runtimeValidation.status, "passed");
  assert.equal(qaOutput.runtimeValidation.preview.status, "passed");
  assert.equal(qaOutput.runtimeValidation.skippedReason, null);
  assert.equal(emittedEvents.length, 5);

  const started = emittedEvents.find((event) => event.type === "tool_call_started");
  const output = emittedEvents.find((event) => event.type === "command_output");
  const finished = emittedEvents.find((event) => event.type === "tool_call_finished");
  const previewStarted = emittedEvents.find(
    (event) => event.type === "tool_call_started" && event.toolName === "inspect_preview"
  );
  const previewFinished = emittedEvents.find(
    (event) => event.type === "tool_call_finished" && event.toolName === "inspect_preview"
  );
  assert.equal(started.commandIds[0], "build-root-build");
  assert.equal(started.toolName, "run_validation_command");
  assert.equal(started.toolCallId, output.toolCallId);
  assert.equal(output.taskId, "task-build-1");
  assert.equal(output.chunk, "vite: command not found");
  assert.equal(finished.status, "succeeded");
  assert.deepEqual(finished.commandIds, [
    "build-root-build",
    "install-root-dependencies",
  ]);
  assert.equal(finished.toolCallId, output.toolCallId);
  assert.equal(previewStarted.toolName, "inspect_preview");
  assert.equal(previewFinished.status, "succeeded");
  assert.equal(previewFinished.toolCallId, previewStarted.toolCallId);
});

test("qaAgentNode records failed evidence when QA cannot discover validation commands", async () => {
  const emittedEvents = [];
  const node = createQaAgentNode({
    loadAgentSkill: () => "",
    getRuntimeLlmSettings: () => undefined,
    generateSpec: async () => spec,
    decideRouting: () => [],
    generateFrontend: async () => ({ html: "" }),
    buildFrontendCodeContext: async () => ({
      projectId: "33333333-3333-4333-8333-333333333333",
      query: "",
      inspectedFiles: [],
      files: [],
      omittedFilesCount: 0,
      totalBytes: 0,
      limits: { maxFiles: 0, maxBytesPerFile: 0, maxTotalBytes: 0 },
    }),
    generateQaTests: async () => ({ testCases: [] }),
    validateOutput: async () => ({
      passed: true,
      score: 100,
      notes: "ok",
      missingItems: [],
      fixTarget: "front",
    }),
    buildProjectContextSnapshot: async () => ({
      projectId: "33333333-3333-4333-8333-333333333333",
      projectRootPath: "/tmp/horus-qa-no-commands",
      agentProfileId: "qa_agent",
      query: "Validar execução",
      inspection: {
        projectId: "33333333-3333-4333-8333-333333333333",
        projectRootPath: "/tmp/horus-qa-no-commands",
        packageManager: { name: "pnpm", status: "detected", evidence: [] },
        framework: {
          name: "react-vite",
          status: "detected",
          confidence: 1,
          evidence: [],
        },
        scripts: [
          {
            name: "dev",
            command: "vite",
            category: "dev",
          },
        ],
        roots: {
          sourceRoots: ["src"],
          testRoots: [],
          publicRoots: [],
          editableRoots: ["src"],
        },
        entrypoints: [],
        routes: [],
        editableFiles: [],
        protectedPaths: [],
        unsafePaths: [],
        warnings: [],
        stats: {
          filesScanned: 0,
          filesIncluded: 0,
          filesSkipped: 0,
          bytesIncluded: 0,
        },
        generatedAt: "2026-05-30T00:02:00.000Z",
      },
      codeContext: {
        projectId: "33333333-3333-4333-8333-333333333333",
        query: "Validar execução",
        inspectedFiles: [],
        files: [],
        omittedFilesCount: 0,
        totalBytes: 0,
        limits: { maxFiles: 0, maxBytesPerFile: 0, maxTotalBytes: 0 },
      },
      validationStrategy: {
        stack: "react-vite",
        requirements: [
          {
            kind: "build",
            level: "required",
            reason: "Build should be executed for this project.",
            scriptHint: "build",
          },
        ],
        notes: [],
      },
      editRestrictions: {
        protectedPaths: [],
        unsafePaths: [],
        editableRoots: ["src"],
        forbiddenWritePatterns: [],
      },
      runtimeHints: [],
      runHistory: [],
      notes: [],
      generatedAt: "2026-05-30T00:02:00.000Z",
    }),
    emitWorkflowEvent: (event) => {
      emittedEvents.push(event);
    },
    createAgentToolRuntime: () => {
      throw new Error("QA runtime should not be created without validation commands.");
    },
  });

  const update = await node({
    userStories: [userStory],
    currentUSIndex: 0,
    specs: { [userStory.id]: spec },
    workspaceArtifactContext: {},
    humanFeedback: {},
    agentResults: {},
    status: "running",
    threadId: "66666666-6666-4666-8666-666666666666",
    workspaceFolderId: "44444444-4444-4444-8444-444444444444",
    projectWorkspaceId: "33333333-3333-4333-8333-333333333333",
    workflowMode: "project",
    frontendProjectId: "33333333-3333-4333-8333-333333333333",
    frontendProjectRootPath: "/tmp/horus-qa-no-commands",
    sourceChatSessionId: undefined,
    sourceChatMessageId: undefined,
    executionBrief: "Validar execução",
    routingDecision: [],
    curatorFeedback: {},
    retryCount: 0,
    pendingRetryApproval: null,
  });

  const qaOutput = update.agentResults[userStory.id][0].output;
  assert.equal(qaOutput.runtimeValidation.status, "failed");
  assert.equal(
    qaOutput.runtimeValidation.commands[0].commandId,
    "qa-validation-command-discovery"
  );
  assert.equal(
    qaOutput.runtimeValidation.skippedReason.includes(
      "QA validation commands unavailable"
    ),
    true
  );

  assert.equal(emittedEvents.length, 1);
  assert.equal(emittedEvents[0].type, "tool_call_blocked");
  assert.equal(emittedEvents[0].toolName, "run_validation_command");
  assert.deepEqual(emittedEvents[0].commandIds, [
    "qa-validation-command-discovery",
  ]);
});
