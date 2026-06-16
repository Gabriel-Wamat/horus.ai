import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCuratorAgentNode } from "../dist/infrastructure/langgraph/nodes/curatorAgentNode.js";
import { compactAgentResultHistory } from "../dist/infrastructure/langgraph/state.js";
import { FileMemorySaver } from "../dist/infrastructure/langgraph/FileMemorySaver.js";
import { FileWorkflowEventLogRepository } from "../dist/infrastructure/repositories/FileWorkflowEventLogRepository.js";
import {
  FileMutationPreflightApplier,
  FileMutationPreflightError,
} from "../dist/infrastructure/code/FileMutationPreflightApplier.js";
import { ProjectWorkspaceService } from "../dist/infrastructure/project/ProjectWorkspaceService.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Preview controls",
  description: "Como usuário, quero operar o preview com segurança.",
  acceptanceCriteria: ["Escala após o limite de retries"],
  priority: "medium",
  labels: [],
  createdAt: "2026-06-08T10:00:00.000Z",
};

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: userStory.id,
  version: 1,
  summary: "Preview controls",
  technicalApproach: "Validar o controle de loop do curador.",
  components: [
    {
      name: "PreviewCanvas",
      type: "ui",
      description: "Exibe o preview visual.",
      dependencies: [],
    },
  ],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-06-08T10:01:00.000Z",
};

function agentResult(agentName, output) {
  return {
    status: "success",
    agentName,
    userStoryId: userStory.id,
    output,
    executionTimeMs: 1,
    completedAt: "2026-06-08T10:02:00.000Z",
  };
}

test("curator escalates on the third failed validation instead of routing a fourth front pass", async () => {
  const curator = createCuratorAgentNode({
    getRuntimeLlmSettings: () => undefined,
    validateOutput: async () => ({
      passed: false,
      score: 10,
      notes: "Ainda faltam requisitos obrigatórios.",
      missingItems: ["missing live preview controls"],
      fixTarget: "front",
    }),
  });

  const update = await curator({
    userStories: [userStory],
    currentUSIndex: 0,
    specs: { [userStory.id]: spec },
    workspaceArtifactContext: {},
    humanFeedback: {},
    agentResults: {
      [userStory.id]: [
        agentResult("front", { html: "<main>Preview</main>" }),
        agentResult("qa", { testCases: [{ name: "renders preview" }] }),
      ],
    },
    status: "running",
    threadId: "33333333-3333-4333-8333-333333333333",
    workflowMode: "project_construction",
    routingDecision: ["frontAgent"],
    curatorFeedback: {},
    retryCount: 2,
    pendingRetryApproval: null,
  });

  assert.equal(update.retryCount, 3);
  assert.equal(update.status, "awaiting_human");
  assert.equal(update.pendingRetryApproval?.retryCount, 3);
  assert.equal(update.pendingRetryApproval?.userStoryId, userStory.id);
  assert.equal(update.curatorFeedback?.[userStory.id]?.passed, false);
});

test("project construction curator fails closed when professional evidence is incomplete", async () => {
  const codeChangeSet = {
    id: "77777777-7777-4777-8777-777777777777",
    workflowThreadId: "33333333-3333-4333-8333-333333333333",
    userStoryId: userStory.id,
    sourceAgent: "front",
    status: "proposed",
    operations: [
      {
        changeType: "update",
        targetPath: "src/App.tsx",
        beforeContent: "<main />",
        afterContent: "<main>Preview controls</main>",
        diff: "--- a/src/App.tsx\n+++ b/src/App.tsx",
        preconditions: [],
        metadata: {},
      },
    ],
    validation: [],
    createdAt: "2026-06-08T10:02:00.000Z",
  };
  const runtimeEvidence = {
    id: "88888888-8888-4888-8888-888888888888",
    workflowThreadId: "33333333-3333-4333-8333-333333333333",
    constructionRunId: null,
    userStoryId: userStory.id,
    projectId: "99999999-9999-4999-8999-999999999999",
    status: "passed",
    skippedReason: null,
    commands: [
      {
        commandId: "build-root",
        taskId: null,
        command: "pnpm build",
        cwd: ".",
        approvalRequired: false,
        risk: "low",
        policyReason: null,
        approved: false,
        approvedBy: null,
        approvalReason: null,
        exitCode: 0,
        stdoutTail: "built",
        stderrTail: "",
        stdoutPath: null,
        stderrPath: null,
        interactivePromptDetected: false,
        interactivePromptText: null,
        durationMs: 100,
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
    createdAt: "2026-06-08T10:03:00.000Z",
  };
  const curator = createCuratorAgentNode({
    getRuntimeLlmSettings: () => undefined,
    preflightCodeChangeSet: async () => ({
      passed: true,
      issues: [],
      validation: [
        {
          command: "pnpm build",
          cwd: ".",
          exitCode: 0,
          status: "passed",
          stdout: "built",
          stderr: "",
        },
      ],
      runtimeEvidence,
    }),
    validateVisualGate: async () => ({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "passed",
      score: 96,
      threshold: 86,
      summary: "Visual aprovado.",
      issues: [],
      screenshots: [
        {
          id: "browser-screenshot:desktop",
          viewport: "desktop",
          width: 1440,
          height: 960,
          captureKind: "browser_screenshot",
          artifactPath: "/tmp/desktop.png",
          artifactUrl: null,
          nonBlank: true,
          diagnostics: {},
        },
      ],
      previewUrl: "http://preview.fixture.example:5184",
      captureUnavailableReason: null,
      designSystemSourceFiles: [],
      startedAt: "2026-06-08T10:03:00.000Z",
      finishedAt: "2026-06-08T10:03:01.000Z",
      durationMs: 1000,
    }),
    validateOutput: async () => {
      throw new Error("LLM validator must not approve incomplete evidence.");
    },
  });

  const update = await curator({
    userStories: [userStory],
    currentUSIndex: 0,
    specs: { [userStory.id]: spec },
    workspaceArtifactContext: {},
    humanFeedback: {},
    agentResults: {
      [userStory.id]: [
        agentResult("front", {
          html: "<main>Preview controls</main>",
          codeChangeSet,
        }),
        agentResult("qa", { testCases: [{ name: "renders preview" }] }),
      ],
    },
    status: "running",
    threadId: "33333333-3333-4333-8333-333333333333",
    workspaceFolderId: "44444444-4444-4444-8444-444444444444",
    frontendProjectId: "99999999-9999-4999-8999-999999999999",
    frontendProjectRootPath: "/tmp/horus-project",
    previewSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workflowMode: "project_construction",
    routingDecision: ["frontAgent", "qaAgent"],
    curatorFeedback: {},
    retryCount: 0,
    pendingRetryApproval: null,
  });

  const feedback = update.curatorFeedback?.[userStory.id];
  assert.equal(update.status, "running");
  assert.equal(update.retryCount, 1);
  assert.equal(feedback?.passed, false);
  assert.equal(
    feedback?.missingItems.some((item) => item.includes("DesignBrief")),
    true
  );
  assert.equal(
    feedback?.missingItems.some((item) => item.includes("QA runtime")),
    true
  );
  assert.equal(
    update.agentResults?.[userStory.id]?.[0]?.output.professionalEvidenceGate
      .passed,
    false
  );
});

test("file workflow event log recovers a stale lock left by a crashed writer", async () => {
  const threadId = "44444444-4444-4444-8444-444444444444";
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workflow-events-"));
  const lockPath = join(baseDir, `${threadId}.lock`);
  const staleDate = new Date(Date.now() - 120_000);
  const repository = new FileWorkflowEventLogRepository(baseDir);

  try {
    await writeFile(lockPath, "stale lock");
    await utimes(lockPath, staleDate, staleDate);

    const event = await repository.append({
      type: "status_changed",
      threadId,
      status: "running",
      timestamp: "2026-06-08T10:03:00.000Z",
    });

    assert.equal(event.sequence, 1);
    assert.equal(event.type, "status_changed");
    assert.equal(event.eventType, "received");
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("agent result compaction drops bulky historical tool payloads but keeps latest curator inputs", () => {
  const results = Array.from({ length: 14 }, (_, index) =>
    agentResult("front", {
      html: `<main>${index}</main>`,
      codeChangeSet: {
        id: `change-${index}`,
        artifactCandidateId: `candidate-${index}`,
        operations: [
          {
            operation: "write",
            targetPath: "src/App.tsx",
            afterContent: "x".repeat(1000),
            rationale: "test",
          },
        ],
      },
      toolEvents: [{ detail: "large event" }],
      toolLoop: {
        status: "succeeded",
        changedFiles: ["src/App.tsx"],
        validationCommandIds: [],
        summary: "ok",
        operationalSession: { events: ["large session"] },
      },
    })
  );

  const compacted = compactAgentResultHistory([
    ...results,
    agentResult("qa", { testCases: [{ name: "renders" }] }),
    agentResult("curator", { passed: false, score: 10 }),
  ]);
  const historicalFront = compacted.find(
    (result) => result.status === "success" && result.agentName === "front"
  );
  const latestFront = [...compacted]
    .reverse()
    .find((result) => result.status === "success" && result.agentName === "front");

  assert.equal(compacted.length, 12);
  assert.equal(historicalFront?.status, "success");
  assert.equal(historicalFront?.output["html"], undefined);
  assert.equal(historicalFront?.output["codeChangeSet"], undefined);
  assert.equal(historicalFront?.output["toolEvents"], undefined);
  assert.deepEqual(
    (historicalFront?.output["codeChangeSetSummary"] ?? {})["targetPaths"],
    ["src/App.tsx"]
  );
  assert.equal(latestFront?.status, "success");
  assert.equal(typeof latestFront?.output["html"], "string");
  assert.equal(typeof latestFront?.output["codeChangeSet"], "object");
  assert.equal(latestFront?.output["toolEvents"], undefined);
  assert.equal(
    ((latestFront?.output["toolLoop"] ?? {})).operationalSession,
    undefined
  );
});

test("file memory saver removes orphaned atomic write temp files on startup", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-memory-saver-"));
  const checkpointPath = join(baseDir, "memory-saver.json");
  const tempPath = join(baseDir, ".memory-saver.json.123.tmp");

  try {
    await writeFile(
      checkpointPath,
      JSON.stringify({ storage: {}, writes: {} }),
      "utf-8"
    );
    await writeFile(tempPath, "orphaned temp file", "utf-8");

    await FileMemorySaver.create(checkpointPath);

    await assert.rejects(() => access(tempPath), { code: "ENOENT" });
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("file mutation preflight blocks invalid TSX before writing", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-file-mutation-"));
  const appPath = join(baseDir, "src", "App.tsx");
  const original = "export function App() {\n  return <main>Ok</main>;\n}\n";
  const applier = new FileMutationPreflightApplier();

  try {
    await mkdir(join(baseDir, "src"), { recursive: true });
    await writeFile(appPath, original, "utf-8");

    await assert.rejects(
      () =>
        applier.apply({
          projectRootPath: baseDir,
          operations: [
            {
              targetPath: "src/App.tsx",
              changeType: "update",
              beforeContent: original,
              afterContent: `${original}\nconst broken = <section>;\n`,
            },
          ],
        }),
      (err) =>
        err instanceof FileMutationPreflightError &&
        err.reason === "invalid_operation" &&
        err.targetPath === "src/App.tsx"
    );

    const after = await readFile(appPath, "utf-8");
    assert.equal(after, original);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("generated project workspace restore clears invalid dirty source before a new run", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-generated-project-"));
  const service = new ProjectWorkspaceService({
    repositoryRoot: baseDir,
    env: {
      ...process.env,
      HORUS_PROJECT_WORKSPACE_ROOT: baseDir,
    },
  });

  try {
    const project = await service.createNewProject({
      workspaceFolderId: "66666666-6666-4666-8666-666666666666",
      name: "Syntax Restore",
      targetMode: "new_project",
      projectStack: "typescript-react",
    });
    const appPath = join(project.rootPath, "src", "App.tsx");
    const original = await readFile(appPath, "utf-8");
    await writeFile(appPath, `${original}\nconst broken = <section>;\n`, "utf-8");

    await service.prepareWorkspace({
      runId: "77777777-7777-4777-8777-777777777777",
      project,
    });

    const after = await readFile(appPath, "utf-8");
    assert.equal(after, original);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
