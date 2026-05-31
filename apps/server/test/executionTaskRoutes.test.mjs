import assert from "node:assert/strict";
import express from "express";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { CliCommandPolicy } from "../dist/infrastructure/tools/CliCommandPolicy.js";
import { ExecutionTaskRuntime } from "../dist/infrastructure/tools/ExecutionTaskRuntime.js";
import { createExecutionTaskRouter } from "../dist/infrastructure/http/routes/executionTaskRoutes.js";

const projectId = "33333333-3333-4333-8333-333333333333";

test("execution task routes read task metadata, follow output and kill running tasks", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-execution-task-routes-"));
  const runtime = new ExecutionTaskRuntime({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: root,
    }),
    outputBaseDir: join(root, ".horus", "execution-tasks"),
    killGraceMs: 25,
  });
  const completed = await runtime.run({
    id: "route-output-probe",
    executable: process.execPath,
    args: ["-e", "console.log('route output ok')"],
    cwd: root,
    timeoutMs: 5_000,
  });
  const retryable = await runtime.run({
    id: "route-retry-probe",
    executable: process.execPath,
    args: [
      "-e",
      "const fs=require('node:fs'); const ok=fs.existsSync('route-retry-marker'); fs.writeFileSync('route-retry-marker','ok'); console.log(ok ? 'retry ok' : 'retry failed'); process.exit(ok ? 0 : 1);",
    ],
    cwd: root,
    timeoutMs: 5_000,
  });
  const running = await runtime.start({
    id: "route-kill-probe",
    executable: process.execPath,
    args: ["-e", "setInterval(()=>console.log('tick'), 20)"],
    cwd: root,
    timeoutMs: 5_000,
  });
  const awaiting = await runtime.start({
    id: "route-approval-probe",
    command: "printf approved > route-approval-output.txt",
    cwd: root,
    timeoutMs: 5_000,
  });

  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createExecutionTaskRouter({
      projectConstruction: {
        async getProjectWorkspace(id) {
          if (id !== projectId) throw new Error(`Project workspace not found: ${id}`);
          return { id, rootPath: root };
        },
      },
    })
  );
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/projects/${projectId}/execution-tasks`;

  try {
    const taskResponse = await fetch(`${baseUrl}/${completed.task.taskId}`);
    assert.equal(taskResponse.status, 200);
    const task = await taskResponse.json();
    assert.equal(task.status, "completed");
    assert.equal(task.taskId, completed.task.taskId);

    const outputResponse = await fetch(
      `${baseUrl}/${completed.task.taskId}/output?stream=stdout&offset=0&limit=1024`
    );
    assert.equal(outputResponse.status, 200);
    const output = await outputResponse.json();
    assert.match(output.chunk, /route output ok/);
    assert.equal(output.nextOffset > 0, true);

    const listResponse = await fetch(`${baseUrl}?limit=10`);
    assert.equal(listResponse.status, 200);
    const list = await listResponse.json();
    assert.ok(list.tasks.some((task) => task.taskId === completed.task.taskId));
    assert.ok(list.tasks.some((task) => task.status === "awaiting_approval"));

    const retryResponse = await fetch(`${baseUrl}/${retryable.task.taskId}/retry`, {
      method: "POST",
    });
    assert.equal(retryResponse.status, 202);
    const retryTask = await retryResponse.json();
    assert.notEqual(retryTask.taskId, retryable.task.taskId);
    assert.equal(retryTask.retryOfTaskId, retryable.task.taskId);
    assert.equal(retryTask.attempt, 2);

    const retried = await waitForTerminalTask(`${baseUrl}/${retryTask.taskId}`);
    assert.equal(retried.status, "completed");

    const approvalResponse = await fetch(`${baseUrl}/${awaiting.task.taskId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        approvedBy: "test",
        approvalReason: "route approval test",
      }),
    });
    assert.equal(approvalResponse.status, 202);
    const approvedTask = await approvalResponse.json();
    assert.equal(approvedTask.retryOfTaskId, awaiting.task.taskId);
    const approved = await waitForTerminalTask(`${baseUrl}/${approvedTask.taskId}`);
    assert.equal(approved.status, "completed");

    const killResponse = await fetch(`${baseUrl}/${running.task.taskId}/kill`, {
      method: "POST",
    });
    assert.equal(killResponse.status, 200);
    await running.completion;
    const killedResponse = await fetch(`${baseUrl}/${running.task.taskId}`);
    const killed = await killedResponse.json();
    assert.equal(killed.status, "aborted");
  } finally {
    await close(server);
  }
});

async function waitForTerminalTask(url) {
  for (let index = 0; index < 20; index += 1) {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const task = await response.json();
    if (!["queued", "running"].includes(task.status)) return task;
    await delay(50);
  }
  throw new Error(`Timed out waiting for task: ${url}`);
}

function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  return new Promise((resolve) => server.once("listening", () => resolve(server)));
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}
