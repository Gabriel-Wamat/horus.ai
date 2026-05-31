import assert from "node:assert/strict";
import test from "node:test";
import {
  ShellCommandOutputEventSchema,
  ShellCommandRequestSchema,
  ShellCommandResultSchema,
} from "../dist/entities/ShellCommand.js";

test("ShellCommandRequestSchema normalizes portable command defaults", () => {
  const parsed = ShellCommandRequestSchema.parse({
    commandId: "typecheck",
    executable: "pnpm",
    args: ["type-check"],
  });

  assert.equal(parsed.cwd, ".");
  assert.equal(parsed.kind, "unknown");
  assert.deepEqual(parsed.env, {});
  assert.equal(parsed.background, false);
});

test("ShellCommandRequestSchema accepts shell command text without executable", () => {
  const parsed = ShellCommandRequestSchema.parse({
    commandId: "shell-probe",
    command: "printf hello | wc -c",
  });

  assert.equal(parsed.command, "printf hello | wc -c");
  assert.equal(parsed.shell, "bash");
  assert.equal(parsed.executable, undefined);
  assert.deepEqual(parsed.args, []);
});

test("ShellCommandResultSchema preserves bounded command evidence", () => {
  const parsed = ShellCommandResultSchema.parse({
    commandId: "probe",
    command: "node -e probe",
    executable: "node",
    args: ["-e", "probe"],
    cwd: "/tmp/project",
    status: "completed",
    exitCode: 0,
    stdoutTail: "ok",
    stderrTail: "",
    durationMs: 1,
    startedAt: "2026-05-28T00:00:00.000Z",
    finishedAt: "2026-05-28T00:00:00.001Z",
  });

  assert.equal(parsed.spawned, false);
  assert.equal(parsed.signal, null);
  assert.equal(parsed.errorMessage, null);
  assert.equal(parsed.background, false);
});

test("ShellCommandResultSchema accepts live background task evidence", () => {
  const parsed = ShellCommandResultSchema.parse({
    commandId: "dev-server",
    taskId: "dev-server-task",
    command: "pnpm dev",
    executable: "pnpm",
    args: ["dev"],
    cwd: "/tmp/project",
    status: "running",
    exitCode: null,
    stdoutTail: "",
    stderrTail: "",
    durationMs: 4,
    spawned: true,
    processId: 12345,
    background: true,
    startedAt: "2026-05-28T00:00:00.000Z",
    finishedAt: null,
  });

  assert.equal(parsed.status, "running");
  assert.equal(parsed.background, true);
  assert.equal(parsed.finishedAt, null);
});

test("ShellCommandOutputEventSchema accepts ordered stdout chunks", () => {
  const parsed = ShellCommandOutputEventSchema.parse({
    commandId: "probe",
    stream: "stdout",
    chunk: "hello",
    sequence: 0,
    timestamp: "2026-05-28T00:00:00.000Z",
  });

  assert.equal(parsed.sequence, 0);
});
