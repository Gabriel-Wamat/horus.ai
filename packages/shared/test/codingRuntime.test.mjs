import assert from "node:assert/strict";
import test from "node:test";
import {
  CodingRuntimeEventSchema,
  CodingRuntimeSnapshotSchema,
  CodingTaskSchema,
  CreateCodingTaskRequestSchema,
  isTerminalCodingRuntimeState,
} from "../dist/entities/CodingRuntime.js";

const taskId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const now = "2026-05-28T18:30:00.000Z";

test("CreateCodingTaskRequestSchema trims input and applies runtime defaults", () => {
  const parsed = CreateCodingTaskRequestSchema.parse({
    prompt: "  ajuste o botão principal  ",
    projectId,
  });

  assert.equal(parsed.prompt, "ajuste o botão principal");
  assert.deepEqual(parsed.selectedPaths, []);
  assert.equal(parsed.autoRun, false);
  assert.deepEqual(parsed.metadata, {});
});

test("CodingTaskSchema accepts deterministic accepted task records", () => {
  const parsed = CodingTaskSchema.parse({
    id: taskId,
    prompt: "Ajuste a UI.",
    projectId,
    selectedPaths: ["src/App.tsx"],
    surface: "frontend",
    routeReason: "Detected frontend evidence in selected paths.",
    state: "accepted",
    artifacts: [],
    metadata: { source: "test" },
    version: 0,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(parsed.state, "accepted");
  assert.equal(parsed.startedAt, null);
  assert.equal(parsed.completedAt, null);
  assert.equal(parsed.cancelledAt, null);
});

test("CodingRuntimeSnapshotSchema accepts ordered replayable task events", () => {
  const task = CodingTaskSchema.parse({
    id: taskId,
    prompt: "Ajuste a UI.",
    projectId,
    selectedPaths: [],
    surface: "frontend",
    routeReason: "Detected frontend evidence in prompt.",
    state: "completed",
    artifacts: [],
    error: null,
    metadata: {},
    version: 2,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: now,
    cancelledAt: null,
  });
  const event = CodingRuntimeEventSchema.parse({
    id: eventId,
    taskId,
    sequence: 1,
    type: "task_completed",
    fromState: "applying_patch",
    toState: "completed",
    message: "Coding task completed.",
    artifactRefs: [],
    error: null,
    createdAt: now,
  });

  const snapshot = CodingRuntimeSnapshotSchema.parse({
    task,
    events: [event],
    latestSequence: 1,
  });

  assert.equal(snapshot.latestSequence, 1);
  assert.equal(isTerminalCodingRuntimeState(snapshot.task.state), true);
  assert.equal(isTerminalCodingRuntimeState("retrieving"), false);
});
