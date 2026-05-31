import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveProjectToolRuntimeId,
  shellCommandResultToChatStreamEvent,
} from "../dist/infrastructure/agents/HorusChatToolAgent.js";
import {
  mergeToolStep,
} from "../dist/application/services/HorusChatAgentStreamEvents.js";
import {
  buildFullReadBlockMessage,
  buildValidationRepairContinuationPrompt,
  commandResultFailed,
  formatProjectInspectionEvidence,
  isCodeChangeIntent,
  parsePrimaryDiagnosticTarget,
  selectDiagnosticValidationCommands,
  shouldAutoRunDiagnostics,
} from "../dist/infrastructure/agents/HorusChatToolDiagnostics.js";

test("Horus chat tool runtime uses the linked project workspace id", () => {
  const project = {
    id: "11111111-1111-4111-8111-111111111111",
    projectWorkspaceId: "22222222-2222-4222-8222-222222222222",
  };

  assert.equal(
    resolveProjectToolRuntimeId(project),
    "22222222-2222-4222-8222-222222222222"
  );
});

test("Horus chat tool runtime does not treat preview ids as workspace ids", () => {
  const project = {
    id: "11111111-1111-4111-8111-111111111111",
    projectWorkspaceId: null,
  };

  assert.equal(resolveProjectToolRuntimeId(project), undefined);
});

test("Horus chat tool steps accumulate live command output without duplicating steps", () => {
  const steps = [
    {
      tool: "run_validation_command",
      title: "Rodando validação: build root",
      phase: "started",
      filePaths: [],
      commandIds: ["build-root-build"],
      fileOperations: [],
    },
  ];

  const withFirstChunk = mergeToolStep(steps, {
    tool: "run_validation_command",
    title: "Rodando validação: build root",
    phase: "started",
    detail: "exit 1: first line\n",
    filePaths: [],
    commandIds: ["build-root-build"],
    fileOperations: [],
  });
  const withSecondChunk = mergeToolStep(withFirstChunk, {
    tool: "run_validation_command",
    title: "Rodando validação: build root",
    phase: "started",
    detail: "second line",
    filePaths: [],
    commandIds: ["build-root-build"],
    fileOperations: [],
  });

  assert.equal(withSecondChunk.length, 1);
  assert.equal(withSecondChunk[0].detail, "exit 1: first line\nsecond line");
});

test("Horus chat tool agent turns background command completion into a console step", () => {
  const event = shellCommandResultToChatStreamEvent({
    toolName: "run_command",
    title: "Executando comando: dev",
    result: {
      commandId: "run-root-dev",
      taskId: "task-run-root-dev-1",
      kind: "run",
      command: "npm run dev",
      executable: "npm",
      args: ["run", "dev"],
      cwd: "/tmp/project",
      status: "completed",
      approvalRequired: false,
      risk: "low",
      policyReason: null,
      approved: false,
      approvedBy: null,
      approvalReason: null,
      exitCode: 0,
      signal: null,
      stdoutTail: "ready",
      stderrTail: "",
      durationMs: 45,
      timedOut: false,
      spawned: true,
      processId: 1234,
      stdoutPath: "/tmp/project/.horus/execution-tasks/stdout.log",
      stderrPath: "/tmp/project/.horus/execution-tasks/stderr.log",
      stdoutBytes: 5,
      stderrBytes: 0,
      lastOutputAt: "2026-05-30T00:00:00.000Z",
      interactivePromptDetected: false,
      interactivePromptText: null,
      errorMessage: null,
      background: true,
      startedAt: "2026-05-30T00:00:00.000Z",
      finishedAt: "2026-05-30T00:00:01.000Z",
    },
  });

  assert.deepEqual(event, {
    type: "tool_succeeded",
    tool: "run_command",
    title: "Executando comando: dev",
    detail: "Comando concluído.",
    commandIds: ["run-root-dev"],
    taskId: "task-run-root-dev-1",
    fileOperations: [],
  });
});


test("Horus chat tool agent treats code error analysis as a runtime diagnostic", () => {
  assert.equal(
    shouldAutoRunDiagnostics("analise os códigos e veja se tem erros"),
    true
  );
  assert.equal(
    shouldAutoRunDiagnostics("o código tá dando erro quando tento rodar"),
    true
  );
  assert.equal(
    shouldAutoRunDiagnostics("rode o projeto e veja o erro"),
    true
  );
  assert.equal(
    shouldAutoRunDiagnostics("resolva os erros de código"),
    true
  );
  assert.equal(
    shouldAutoRunDiagnostics("troque o texto do botão Home para Início"),
    false
  );
});

test("Horus chat tool agent recognizes imperative fixes as code changes", () => {
  assert.equal(
    isCodeChangeIntent({
      message: "resolva os erros de código",
      intentKind: "code_change",
    }),
    true
  );
  assert.equal(
    isCodeChangeIntent({
      message: "corrija o erro do App.tsx",
    }),
    true
  );
  assert.equal(
    isCodeChangeIntent({
      message: "explique o que aconteceu",
      intentKind: "answer_question",
    }),
    false
  );
});

test("Horus chat tool agent extracts the primary compiler line for focused repair", () => {
  const target = parsePrimaryDiagnosticTarget(
    [
      `## build-root-build - tool_ok
{"exitCode":1,"stderrTail":"\\nsrc/App.tsx(320,19): error TS1128: Declaration or statement expected.\\n/Users/wamat/Desktop/horus.ai/data/project-workspaces/demo/src/App.tsx:411:19"}`
    ],
    "/Users/wamat/Desktop/horus.ai/data/project-workspaces/demo"
  );

  assert.deepEqual(target, {
    path: "src/App.tsx",
    line: 320,
    column: 19,
    startLine: 296,
    endLine: 400,
  });
});

test("Horus chat tool diagnostics blocks full-file reads after targeted compiler errors", () => {
  const message = buildFullReadBlockMessage({
    input: {
      message: "resolva os erros de código",
      intentKind: "code_change",
      project: {
        rootPath: "/Users/wamat/Desktop/horus.ai/data/project-workspaces/demo",
      },
    },
    call: {
      name: "read_file",
      args: {
        path: "/Users/wamat/Desktop/horus.ai/data/project-workspaces/demo/src/App.tsx",
      },
    },
    diagnosticFailed: true,
    diagnosticTarget: {
      path: "src/App.tsx",
      line: 320,
      column: 19,
      startLine: 296,
      endLine: 400,
    },
    mutatingToolUsed: false,
  });

  assert.ok(message?.includes("read_file com startLine/endLine"));
  assert.ok(message?.includes("src/App.tsx:320"));
});

test("Horus chat tool agent prefers build commands for diagnostics", () => {
  const commands = selectDiagnosticValidationCommands({
    commandCatalog: [
      {
        id: "install-root-dependencies",
        label: "Install dependencies",
        executable: "npm",
        args: ["install"],
        cwd: ".",
        env: {},
        timeoutMs: 120000,
      },
      {
        id: "test-root-test",
        label: "test root",
        executable: "npm",
        args: ["test"],
        cwd: ".",
        env: {},
        timeoutMs: 60000,
      },
      {
        id: "build-root-build",
        label: "build root",
        executable: "npm",
        args: ["run", "build"],
        cwd: ".",
        env: {},
        timeoutMs: 60000,
      },
      {
        id: "run-root-dev",
        label: "dev root",
        executable: "npm",
        args: ["run", "dev"],
        cwd: ".",
        env: {},
        timeoutMs: 120000,
      },
    ],
  });

  assert.deepEqual(
    commands.map((command) => command.id),
    ["build-root-build"]
  );
});

test("Horus chat tool diagnostics treats rejected shell results as failed runtime evidence", () => {
  assert.equal(
    commandResultFailed(
      JSON.stringify({
        status: "rejected",
        exitCode: null,
        stderrTail: "",
        stdoutTail: "",
      })
    ),
    true
  );
  assert.equal(
    commandResultFailed(
      JSON.stringify({
        status: "completed",
        exitCode: 0,
        stderrTail: "",
        stdoutTail: "",
      })
    ),
    false
  );
});

test("Horus chat tool diagnostics formats project inspection as structural context", () => {
  const block = formatProjectInspectionEvidence(
    JSON.stringify({
      framework: { name: "react-vite", status: "detected", confidence: 0.95 },
      packageManager: { name: "pnpm", status: "detected" },
      scripts: [{ name: "build", command: "vite build", category: "build" }],
      roots: {
        sourceRoots: ["src"],
        testRoots: ["test"],
        publicRoots: ["public"],
        editableRoots: ["src"],
      },
      entrypoints: [{ path: "src/App.tsx", kind: "page" }],
      editableFiles: [{ path: "src/App.tsx", language: "tsx", sizeBytes: 128 }],
      protectedPaths: [{ path: ".env", reason: "secret file" }],
      warnings: [],
    }),
    true
  );

  assert.match(block, /framework: react-vite/);
  assert.match(block, /scripts:/);
  assert.match(block, /protected_paths:/);
  assert.match(block, /\.env: secret file/);
});

test("Horus chat tool diagnostics creates bounded repair continuation prompts", () => {
  const prompt = buildValidationRepairContinuationPrompt({
    target: {
      path: "src/App.tsx",
      line: 12,
      column: 4,
      startLine: 1,
      endLine: 40,
    },
    failedValidations: 2,
    maxRepairAttempts: 3,
  });

  assert.match(prompt, /src\/App\.tsx:12:4/);
  assert.match(prompt, /2\/3/);
  assert.match(prompt, /rode validação novamente|valide de novo/);
});
