import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ExecutionTaskRuntime } from "../dist/infrastructure/tools/ExecutionTaskRuntime.js";

test("ExecutionTaskRuntime rejects invalid persisted task metadata instead of casting it", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-execution-task-contract-"));
  try {
    const taskId = "invalid-task";
    const taskDir = join(baseDir, taskId);
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      join(taskDir, "task.json"),
      JSON.stringify({
        taskId,
        status: "completed",
        startedAt: new Date().toISOString(),
      }),
      "utf-8"
    );

    const runtime = new ExecutionTaskRuntime({ outputBaseDir: baseDir });
    await assert.rejects(
      () => runtime.getTask(taskId),
      /Invalid execution task metadata .*commandId/
    );
    await assert.rejects(
      () => runtime.listTasks(),
      /Invalid execution task metadata .*commandId/
    );
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("ExecutionTaskRuntime applies schema defaults for compatible persisted task metadata", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-execution-task-contract-"));
  try {
    const taskId = "legacy-task";
    const taskDir = join(baseDir, taskId);
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      join(taskDir, "task.json"),
      JSON.stringify({
        taskId,
        commandId: "build",
        executable: "node",
        cwd: baseDir,
        status: "completed",
        stdoutPath: join(taskDir, "stdout.log"),
        stderrPath: join(taskDir, "stderr.log"),
        exitCode: 0,
        startedAt: new Date().toISOString(),
      }),
      "utf-8"
    );

    const runtime = new ExecutionTaskRuntime({ outputBaseDir: baseDir });
    const task = await runtime.getTask(taskId);

    assert.equal(task?.commandId, "build");
    assert.equal(task?.env && Object.keys(task.env).length, 0);
    assert.equal(task?.timeoutMs, null);
    assert.equal(task?.retryOfTaskId, null);
    assert.equal(task?.attempt, 1);
    assert.equal(task?.approvalRequired, false);
    assert.equal(task?.risk, "low");
    assert.equal(task?.durationMs, 0);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("ExecutionTaskRuntime reports malformed persisted JSON as an explicit metadata error", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-execution-task-contract-"));
  try {
    const taskId = "malformed-task";
    const taskDir = join(baseDir, taskId);
    await mkdir(taskDir, { recursive: true });
    await writeFile(join(taskDir, "task.json"), "{", "utf-8");

    const runtime = new ExecutionTaskRuntime({ outputBaseDir: baseDir });
    await assert.rejects(
      () => runtime.getTask(taskId),
      /Invalid execution task metadata .*malformed JSON/
    );
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
