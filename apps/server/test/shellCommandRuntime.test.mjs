import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { ShellCommandRuntime } from "../dist/infrastructure/tools/ShellCommandRuntime.js";

async function tempProject() {
  return mkdtemp(join(tmpdir(), "horus-shell-runtime-"));
}

test("ShellCommandRuntime executes allowlisted commands and streams bounded output", async () => {
  const projectRootPath = await tempProject();
  const events = [];
  const runtime = new ShellCommandRuntime();

  const result = await runtime.execute({
    projectRootPath,
    request: {
      commandId: "node-probe",
      traceId: "trace-shell",
      spanId: "span-shell",
      toolCallId: "tool-shell",
      runId: "run-shell",
      projectId: "project-shell",
      agentId: "front_agent",
      kind: "test",
      executable: process.execPath,
      args: ["-e", "console.log('hello shell runtime')"],
      cwd: ".",
      timeoutMs: 5_000,
    },
    onOutput(event) {
      events.push(event);
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.traceId, "trace-shell");
  assert.equal(result.spanId, "span-shell");
  assert.equal(result.toolCallId, "tool-shell");
  assert.match(result.stdoutTail, /hello shell runtime/);
  assert.equal(typeof result.taskId, "string");
  assert.equal(typeof result.stdoutPath, "string");
  assert.equal(typeof result.stderrPath, "string");
  assert.equal(result.stdoutBytes > 0, true);
  assert.equal((await stat(result.stdoutPath)).isFile(), true);
  assert.match(await readFile(result.stdoutPath, "utf-8"), /hello shell runtime/);
  assert.equal(events.length >= 1, true);
  assert.equal(events[0].commandId, "node-probe");
  assert.equal(events[0].taskId, result.taskId);
  assert.equal(events[0].traceId, "trace-shell");
  assert.equal(events[0].toolCallId, "tool-shell");
  assert.equal(events[0].stream, "stdout");
});

test("ShellCommandRuntime rejects commands outside policy before spawn", async () => {
  const projectRootPath = await tempProject();
  const runtime = new ShellCommandRuntime();

  const result = await runtime.execute({
    projectRootPath,
    request: {
      commandId: "curl-probe",
      executable: "curl",
      args: ["http://127.0.0.1"],
      cwd: ".",
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.spawned, false);
  assert.match(result.errorMessage, /not allowed|not allowlisted/i);
});

test("ShellCommandRuntime executes governed shell command text with pipeline output", async () => {
  const projectRootPath = await tempProject();
  const runtime = new ShellCommandRuntime();
  const events = [];
  const command = "printf 'alpha\\nbeta\\n' | wc -l";

  const result = await runtime.execute({
    projectRootPath,
    request: {
      commandId: "shell-pipeline-probe",
      agentId: "qa_agent",
      kind: "check",
      command,
      cwd: ".",
      timeoutMs: 5_000,
    },
    onOutput(event) {
      events.push(event);
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.command, command);
  assert.equal(result.executable, "/bin/bash");
  assert.deepEqual(result.args, ["-lc", command]);
  assert.match(result.stdoutTail.trim(), /^2$/);
  assert.ok(events.some((event) => event.stream === "stdout"));
});

test("ShellCommandRuntime rejects destructive shell command text before spawn", async () => {
  const projectRootPath = await tempProject();
  const runtime = new ShellCommandRuntime();

  const result = await runtime.execute({
    projectRootPath,
    request: {
      commandId: "shell-danger-probe",
      agentId: "qa_agent",
      command: "rm -rf /",
      cwd: ".",
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.spawned, false);
  assert.match(result.errorMessage, /destructive recursive rm target/);
});

test("ShellCommandRuntime keeps profile permissions for shell package installs", async () => {
  const projectRootPath = await tempProject();
  const runtime = new ShellCommandRuntime();

  const result = await runtime.execute({
    projectRootPath,
    request: {
      commandId: "front-install-probe",
      agentId: "front_agent",
      command: "npm install left-pad",
      cwd: ".",
      approved: true,
      approvedBy: "test",
      approvalReason: "test approval should not override profile install denial",
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.spawned, false);
  assert.match(result.errorMessage, /outside this agent profile/);
});

test("ShellCommandRuntime times out long-running commands", async () => {
  const projectRootPath = await tempProject();
  const runtime = new ShellCommandRuntime();

  const result = await runtime.execute({
    projectRootPath,
    request: {
      commandId: "timeout-probe",
      executable: process.execPath,
      args: ["-e", "setTimeout(() => console.log('late'), 1000)"],
      cwd: ".",
      timeoutMs: 50,
    },
  });

  assert.equal(result.status, "timed_out");
  assert.equal(result.timedOut, true);
  assert.match(result.errorMessage, /timed out/);
});

test("ShellCommandRuntime can start a followable background task without waiting for completion", async () => {
  const projectRootPath = await tempProject();
  const runtime = new ShellCommandRuntime();
  const events = [];
  const completions = [];

  const result = await runtime.execute({
    projectRootPath,
    request: {
      commandId: "background-probe",
      executable: process.execPath,
      args: [
        "-e",
        "console.log('background-started'); setTimeout(()=>console.log('background-done'), 120)",
      ],
      cwd: ".",
      timeoutMs: 2_000,
      background: true,
    },
    onOutput(event) {
      events.push(event);
    },
    onComplete(result) {
      completions.push(result);
    },
  });

  assert.equal(result.status, "running");
  assert.equal(result.background, true);
  assert.equal(typeof result.taskId, "string");
  assert.equal(result.finishedAt, null);
  assert.equal(typeof result.stdoutPath, "string");

  await delay(240);
  const output = await readFile(result.stdoutPath, "utf-8");
  assert.match(output, /background-started/);
  assert.match(output, /background-done/);
  assert.ok(events.some((event) => event.taskId === result.taskId));
  assert.equal(completions.length, 1);
  assert.equal(completions[0].taskId, result.taskId);
  assert.equal(completions[0].status, "completed");
  assert.equal(completions[0].background, true);
});
