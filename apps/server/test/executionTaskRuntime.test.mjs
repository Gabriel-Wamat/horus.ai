import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { CliCommandPolicy } from "../dist/infrastructure/tools/CliCommandPolicy.js";
import { ExecutionTaskRuntime } from "../dist/infrastructure/tools/ExecutionTaskRuntime.js";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "horus-execution-task-"));
}

test("ExecutionTaskRuntime starts, follows, persists and resumes command output", async () => {
  const root = await tempRoot();
  const runtime = new ExecutionTaskRuntime({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: root,
    }),
    outputBaseDir: join(root, ".horus", "execution-tasks"),
  });
  const chunks = [];

  const handle = await runtime.start(
    {
      id: "follow-probe",
      traceId: "trace-follow",
      spanId: "span-follow",
      toolCallId: "tool-follow",
      runId: "run-follow",
      projectId: "project-follow",
      agentId: "qa_agent",
      executable: process.execPath,
      args: ["-e", "console.log('first'); setTimeout(()=>console.log('second'), 25)"],
      cwd: root,
      timeoutMs: 5_000,
    },
    {
      onOutput(event) {
        chunks.push(event);
      },
    }
  );

  assert.equal(handle.task.status, "running");
  assert.equal(handle.task.traceId, "trace-follow");
  const result = await handle.completion;
  assert.equal(result.task.status, "completed");
  const persistedOutput = await readFile(result.task.stdoutPath, "utf-8");
  assert.ok(persistedOutput.includes("first"));
  assert.ok(persistedOutput.includes("second"));
  assert.ok(persistedOutput.indexOf("first") < persistedOutput.indexOf("second"));

  const firstRead = await runtime.readOutput({
    taskId: result.task.taskId,
    stream: "stdout",
    offset: 0,
    limit: 5,
  });
  const secondRead = await runtime.readOutput({
    taskId: result.task.taskId,
    stream: "stdout",
    offset: firstRead.nextOffset,
    limit: 512,
  });
  assert.equal(firstRead.chunk, "first");
  const followedOutput = `${firstRead.chunk}${secondRead.chunk}`;
  assert.ok(followedOutput.includes("first"));
  assert.ok(followedOutput.includes("second"));

  const resumed = await runtime.getTask(result.task.taskId);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.stdoutPath, result.task.stdoutPath);
  assert.ok(chunks.some((chunk) => chunk.traceId === "trace-follow"));
  assert.ok(chunks.some((chunk) => chunk.toolCallId === "tool-follow"));
});

test("ExecutionTaskRuntime kills a running task and records aborted evidence", async () => {
  const root = await tempRoot();
  const runtime = new ExecutionTaskRuntime({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: root,
    }),
    outputBaseDir: join(root, ".horus", "execution-tasks"),
    killGraceMs: 25,
  });

  const handle = await runtime.start({
    id: "kill-probe",
    executable: process.execPath,
    args: ["-e", "setInterval(()=>console.log('tick'), 20)"],
    cwd: root,
    timeoutMs: 5_000,
  });

  await runtime.kill(handle.task.taskId);
  const result = await handle.completion;
  assert.equal(result.task.status, "aborted");
  assert.ok(result.task.errorMessage?.includes("aborted"));
});

test("ExecutionTaskRuntime detects interactive prompts while command is running", async () => {
  const root = await tempRoot();
  const runtime = new ExecutionTaskRuntime({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: root,
    }),
    outputBaseDir: join(root, ".horus", "execution-tasks"),
  });

  const handle = await runtime.start({
    id: "prompt-probe",
    executable: process.execPath,
    args: ["-e", "process.stdout.write('Continue? [y/n]'); setTimeout(()=>{}, 1000)"],
    cwd: root,
    timeoutMs: 250,
  });

  await delay(80);
  const running = await runtime.getTask(handle.task.taskId);
  assert.equal(running?.interactivePromptDetected, true);
  assert.equal(running?.interactivePromptText, "Continue? [y/n]");

  const result = await handle.completion;
  assert.equal(result.task.status, "timed_out");
  assert.equal(result.task.interactivePromptDetected, true);
});

test("ExecutionTaskRuntime retries a persisted terminal task as a new live task", async () => {
  const root = await tempRoot();
  const runtime = new ExecutionTaskRuntime({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: root,
    }),
    outputBaseDir: join(root, ".horus", "execution-tasks"),
  });

  const first = await runtime.run({
    id: "retry-probe",
    traceId: "trace-retry",
    spanId: "span-retry",
    executable: process.execPath,
    args: [
      "-e",
      "const fs=require('node:fs'); const n=Number(fs.existsSync('retry-marker')); fs.writeFileSync('retry-marker','ok'); console.log('attempt:' + (n + 1)); process.exit(n ? 0 : 1);",
    ],
    cwd: root,
    env: { HORUS_RETRY_TEST: "1" },
    timeoutMs: 5_000,
  });

  assert.equal(first.task.status, "failed");
  assert.equal(first.task.attempt, 1);
  assert.equal(first.task.env.HORUS_RETRY_TEST, "1");
  assert.equal(first.task.timeoutMs, 5_000);

  const retry = await runtime.retry(first.task.taskId);
  assert.notEqual(retry.task.taskId, first.task.taskId);
  assert.equal(retry.task.retryOfTaskId, first.task.taskId);
  assert.equal(retry.task.attempt, 2);

  const result = await retry.completion;
  assert.equal(result.task.status, "completed");
  assert.match(await readFile(result.task.stdoutPath, "utf-8"), /attempt:2/);
});

test("ExecutionTaskRuntime persists approval requests and starts approved shell tasks", async () => {
  const root = await tempRoot();
  const runtime = new ExecutionTaskRuntime({
    policy: new CliCommandPolicy({
      allowedRoot: root,
    }),
    outputBaseDir: join(root, ".horus", "execution-tasks"),
  });

  const awaiting = await runtime.start({
    id: "approval-probe",
    command: "printf approved > approval-output.txt",
    cwd: root,
    timeoutMs: 5_000,
  });

  assert.equal(awaiting.task.status, "awaiting_approval");
  assert.equal(awaiting.task.approvalRequired, true);
  assert.equal(awaiting.task.processId, null);

  const listed = await runtime.listTasks({ limit: 5 });
  assert.ok(listed.some((task) => task.taskId === awaiting.task.taskId));

  const approved = await runtime.approve(awaiting.task.taskId, {
    approvedBy: "test",
    approvalReason: "test approval",
  });
  assert.equal(approved.task.retryOfTaskId, awaiting.task.taskId);
  assert.equal(approved.task.approved, true);

  const result = await approved.completion;
  assert.equal(result.task.status, "completed");
  assert.equal(await readFile(join(root, "approval-output.txt"), "utf-8"), "approved");
});
