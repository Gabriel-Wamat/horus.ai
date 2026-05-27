import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { WorkflowOrchestrator } from "../dist/domain/services/WorkflowOrchestrator.js";
import { ProjectCodeChangeSetApplier } from "../dist/infrastructure/code/ProjectCodeChangeSetApplier.js";

const workspaceFolderId = "55555555-5555-4555-8555-555555555555";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Criar preview",
  description: "Como usuário, quero ver a alteração no preview.",
  acceptanceCriteria: ["Preview mostra a alteração"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-26T10:00:00.000Z",
};

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: userStory.id,
  version: 1,
  summary: "Criar artefato de preview",
  technicalApproach: "Gerar HTML inicial para inspeção visual.",
  components: [],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-05-26T10:01:00.000Z",
};

const project = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "web",
  slug: "web",
  rootPath: "",
  defaultRoute: "/",
  devCommand: "pnpm dev",
  previewCommandId: null,
  commandCatalog: [],
  previewUrl: null,
  createdAt: "2026-05-26T10:00:00.000Z",
};

function codeChangeSet(threadId) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    workflowThreadId: threadId,
    workspaceFolderId,
    userStoryId: userStory.id,
    sourceAgent: "front",
    status: "proposed",
    operations: [
      {
        targetPath: "generated/horus/story.html",
        changeType: "create",
        beforeContent: null,
        afterContent: "<main>Workflow applied</main>",
        diff: "--- /dev/null\n+++ generated/horus/story.html\n+<main>Workflow applied</main>",
      },
    ],
    validation: [],
    createdAt: "2026-05-26T10:02:00.000Z",
  };
}

function curatorResult(passed) {
  return {
    agentName: "curator",
    output: {
      passed,
      score: passed ? 92 : 31,
      notes: passed ? "Aprovado para aplicar." : "Contrato visual insuficiente.",
      missingItems: passed ? [] : ["Aplicacao nao deve tocar arquivos sem aprovacao."],
      fixTarget: passed ? "none" : "front",
    },
  };
}

function createHarness({ graphChunks, projectRoot }) {
  let initialInput;
  let savedState;
  const savedChangeSets = [];
  const emittedEvents = [];
  const waiters = [];

  const storage = {
    save: async (state) => {
      savedState = state;
    },
    load: async () => savedState ?? null,
    list: async () => [],
    delete: async () => {},
  };
  const events = {
    emit: (event) => {
      emittedEvents.push(event);
      for (const waiter of waiters.splice(0)) waiter();
    },
    subscribe: () => () => {},
  };
  const graph = {
    stream: async (input) => {
      initialInput = input;
      return (async function* () {
        for (const chunk of graphChunks(input)) {
          yield chunk;
        }
      })();
    },
    getState: async () => ({
      values: {
        ...initialInput,
        status: "completed",
        currentUSIndex: 0,
        humanFeedback: {},
        agentResults: {},
      },
      next: [],
    }),
  };
  const sink = {
    save: async (changeSet) => {
      const existingIndex = savedChangeSets.findIndex(
        (item) => item.id === changeSet.id && item.status === changeSet.status
      );
      if (existingIndex >= 0) {
        savedChangeSets[existingIndex] = changeSet;
      } else {
        savedChangeSets.push(changeSet);
      }
      for (const waiter of waiters.splice(0)) waiter();
    },
    listByWorkflow: async (threadId) =>
      savedChangeSets.filter((item) => item.workflowThreadId === threadId),
  };

  const orchestrator = new WorkflowOrchestrator(
    storage,
    events,
    graph,
    undefined,
    undefined,
    sink,
    new ProjectCodeChangeSetApplier()
  );

  return {
    orchestrator,
    savedChangeSets,
    selectedProject: { ...project, rootPath: projectRoot },
    waitForStatus: async (status) => {
      while (!savedChangeSets.some((item) => item.status === status)) {
        await new Promise((resolve) => waiters.push(resolve));
      }
      return savedChangeSets.find((item) => item.status === status);
    },
    getSavedState: () => savedState,
    getEmittedEvents: () => emittedEvents,
    waitForEvent: async (type) => {
      while (!emittedEvents.some((event) => event.type === type)) {
        await new Promise((resolve) => waiters.push(resolve));
      }
      return emittedEvents.find((event) => event.type === type);
    },
  };
}

async function startCodeChange(orchestrator, selectedProject) {
  return orchestrator.startChatCodeChange({
    workspaceFolderId,
    userStory,
    spec,
    artifactContext: { workspaceFolderId },
    project: selectedProject,
    chatSessionId: "66666666-6666-4666-8666-666666666666",
    sourceMessageId: "77777777-7777-4777-8777-777777777777",
    executionBrief: "Ajuste a tela inicial.",
  });
}

test("WorkflowOrchestrator persists proposed FrontAgent CodeChangeSet before curator approval", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-workflow-project-"));
  const harness = createHarness({
    projectRoot,
    graphChunks: (input) => [
      {
        frontAgent: {
          agentResults: {
            [userStory.id]: [{ output: { codeChangeSet: codeChangeSet(input.threadId) } }],
          },
        },
      },
    ],
  });

  await startCodeChange(harness.orchestrator, harness.selectedProject);
  const proposed = await harness.waitForStatus("proposed");

  assert.equal(proposed.status, "proposed");
  await assert.rejects(
    () => readFile(join(projectRoot, "generated", "horus", "story.html"), "utf8"),
    { code: "ENOENT" }
  );
});

test("WorkflowOrchestrator applies latest proposed CodeChangeSet only after curator approval", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-workflow-project-"));
  const harness = createHarness({
    projectRoot,
    graphChunks: (input) => [
      {
        frontAgent: {
          agentResults: {
            [userStory.id]: [{ output: { codeChangeSet: codeChangeSet(input.threadId) } }],
          },
        },
      },
      {
        curatorAgent: {
          agentResults: {
            [userStory.id]: [curatorResult(true)],
          },
          status: "completed",
        },
      },
    ],
  });

  await startCodeChange(harness.orchestrator, harness.selectedProject);
  const applied = await harness.waitForStatus("applied");
  const patchApplied = await harness.waitForEvent("patch_applied");

  assert.deepEqual(
    harness.savedChangeSets.map((item) => item.status),
    ["proposed", "curator_approved", "applied"]
  );
  assert.equal(applied.status, "applied");
  assert.equal(
    await readFile(join(projectRoot, "generated", "horus", "story.html"), "utf8"),
    "<main>Workflow applied</main>"
  );
  assert.equal(harness.getSavedState().frontendProjectId, project.id);
  assert.equal(harness.getSavedState().frontendProjectRootPath, projectRoot);
  assert.equal(patchApplied.changeSetId, codeChangeSet("").id);
  assert.deepEqual(patchApplied.filePaths, ["generated/horus/story.html"]);
});

test("WorkflowOrchestrator rejects latest proposed CodeChangeSet when curator fails", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-workflow-project-"));
  const harness = createHarness({
    projectRoot,
    graphChunks: (input) => [
      {
        frontAgent: {
          agentResults: {
            [userStory.id]: [{ output: { codeChangeSet: codeChangeSet(input.threadId) } }],
          },
        },
      },
      {
        curatorAgent: {
          agentResults: {
            [userStory.id]: [curatorResult(false)],
          },
          status: "completed",
        },
      },
    ],
  });

  await startCodeChange(harness.orchestrator, harness.selectedProject);
  const rejected = await harness.waitForStatus("curator_rejected");

  assert.equal(rejected.status, "curator_rejected");
  assert.match(rejected.failedReason, /Contrato visual insuficiente/);
  assert.match(rejected.failedReason, /Aplicacao nao deve tocar arquivos/);
  await assert.rejects(
    () => readFile(join(projectRoot, "generated", "horus", "story.html"), "utf8"),
    { code: "ENOENT" }
  );
});
