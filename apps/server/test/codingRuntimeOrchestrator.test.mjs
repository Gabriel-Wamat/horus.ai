import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  CodingRuntimeOrchestrator,
} from "../dist/application/coding/CodingRuntimeOrchestrator.js";
import { FileCodingTaskRepository } from "../dist/infrastructure/repositories/FileCodingTaskRepository.js";

const projectId = "33333333-3333-4333-8333-333333333333";

test("CodingRuntimeOrchestrator creates idempotent routed tasks", async () => {
  const orchestrator = await createOrchestrator({
    ids: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ],
  });

  const first = await orchestrator.createTask({
    prompt: "Ajuste o componente React.",
    projectId,
    selectedPaths: ["src/App.tsx"],
    idempotencyKey: "coding:test:1",
  });
  const second = await orchestrator.createTask({
    prompt: "Outro prompt que deve ser ignorado por idempotência.",
    projectId,
    idempotencyKey: "coding:test:1",
  });

  assert.equal(first.task.id, second.task.id);
  assert.equal(first.task.surface, "frontend");
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].type, "task_accepted");
});

test("CodingRuntimeOrchestrator runs every step through ports and records replayable events", async () => {
  const calls = [];
  const orchestrator = await createOrchestrator({
    ids: buildUuidSequence(40),
    steps: buildPassingSteps(calls),
  });
  const created = await orchestrator.createTask({
    prompt: "Ajuste API e componente React.",
    projectId,
    selectedPaths: ["apps/server/src/routes.ts", "apps/web/src/App.tsx"],
  });

  const completed = await orchestrator.runTask(created.task.id);

  assert.equal(completed.task.state, "completed");
  assert.equal(completed.task.surface, "full_stack");
  assert.deepEqual(calls, [
    "scanner",
    "retriever",
    "astAnalyzer",
    "patchPlanner",
    "astValidator",
    "runtimeValidator",
    "patchApplier",
  ]);
  assert.deepEqual(
    completed.events.map((event) => event.type),
    [
      "task_accepted",
      "scan_requested",
      "scan_completed",
      "retrieval_requested",
      "retrieval_completed",
      "ast_analysis_requested",
      "ast_analysis_completed",
      "patch_planning_requested",
      "patch_planning_completed",
      "ast_validation_requested",
      "ast_validation_completed",
      "runtime_validation_requested",
      "runtime_validation_completed",
      "patch_apply_requested",
      "patch_apply_completed",
      "task_completed",
    ]
  );
  assert.equal(completed.task.artifacts.length, 7);
  assert.equal(completed.latestSequence, 16);

  const afterRetrieval = await orchestrator.listEvents(created.task.id, {
    afterSequence: 5,
  });
  assert.equal(afterRetrieval[0].sequence, 6);
});

test("CodingRuntimeOrchestrator fails visibly when a runtime capability is missing", async () => {
  const orchestrator = await createOrchestrator({
    ids: buildUuidSequence(8),
  });
  const created = await orchestrator.createTask({
    prompt: "Mude o backend.",
    projectId,
  });

  const failed = await orchestrator.runTask(created.task.id);

  assert.equal(failed.task.state, "failed");
  assert.equal(failed.task.error.code, "missing_capability");
  assert.equal(failed.task.error.details.capability, "scanner");
  assert.deepEqual(
    failed.events.map((event) => event.type),
    ["task_accepted", "scan_requested", "task_failed"]
  );
});

test("CodingRuntimeOrchestrator stops before patch apply when validation artifact fails", async () => {
  const calls = [];
  const steps = buildPassingSteps(calls);
  steps.runtimeValidator = {
    async execute() {
      calls.push("runtimeValidator");
      return {
        message: "runtime validation failed",
        artifact: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001",
          kind: "runtime_validation",
          label: "Runtime validation",
          status: "failed",
          createdAt: "2026-05-28T18:30:00.000Z",
          summary: "test failed",
          payload: { status: "failed" },
        },
      };
    },
  };
  steps.patchApplier = {
    async execute() {
      calls.push("patchApplier");
      throw new Error("patch applier must not run");
    },
  };
  const orchestrator = await createOrchestrator({
    ids: buildUuidSequence(40),
    steps,
  });
  const created = await orchestrator.createTask({
    prompt: "Ajuste o componente React.",
    projectId,
    selectedPaths: ["src/App.tsx"],
  });

  const failed = await orchestrator.runTask(created.task.id);

  assert.equal(failed.task.state, "failed");
  assert.equal(failed.task.error.code, "coding_step_failed");
  assert.equal(failed.task.error.details.capability, "runtimeValidator");
  assert.ok(
    failed.task.artifacts.some(
      (artifact) =>
        artifact.kind === "runtime_validation" && artifact.status === "failed"
    )
  );
  assert.deepEqual(calls, [
    "scanner",
    "retriever",
    "astAnalyzer",
    "patchPlanner",
    "astValidator",
    "runtimeValidator",
  ]);
  assert.ok(!failed.events.some((event) => event.type === "patch_apply_requested"));
});

test("CodingRuntimeOrchestrator cancels before starting if signal is already aborted", async () => {
  const orchestrator = await createOrchestrator({
    ids: buildUuidSequence(6),
    steps: buildPassingSteps([]),
  });
  const created = await orchestrator.createTask({
    prompt: "Ajuste CSS.",
    projectId,
  });
  const controller = new AbortController();
  controller.abort(new Error("coding_task_cancelled"));

  const cancelled = await orchestrator.runTask(created.task.id, {
    signal: controller.signal,
  });

  assert.equal(cancelled.task.state, "cancelled");
  assert.deepEqual(
    cancelled.events.map((event) => event.type),
    ["task_accepted", "task_cancelled"]
  );
});

async function createOrchestrator({ ids, steps = {} }) {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-coding-runtime-"));
  const idGenerator = makeIdGenerator(ids);
  return new CodingRuntimeOrchestrator({
    taskRepository: new FileCodingTaskRepository(baseDir),
    steps,
    idGenerator,
    now: () => new Date("2026-05-28T18:30:00.000Z"),
  });
}

function buildPassingSteps(calls) {
  const step = (name) => ({
    async execute(context) {
      calls.push(name);
      return {
        message: `${name} ok`,
        metadata: {
          taskId: context.task.id,
          artifact: name,
        },
      };
    },
  });
  return {
    scanner: step("scanner"),
    retriever: step("retriever"),
    astAnalyzer: step("astAnalyzer"),
    patchPlanner: step("patchPlanner"),
    astValidator: step("astValidator"),
    runtimeValidator: step("runtimeValidator"),
    patchApplier: step("patchApplier"),
  };
}

function makeIdGenerator(ids) {
  const queue = [...ids];
  return () => {
    const next = queue.shift();
    assert.ok(next, "test id queue exhausted");
    return next;
  };
}

function buildUuidSequence(count) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(12, "0");
    return `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`;
  });
}
