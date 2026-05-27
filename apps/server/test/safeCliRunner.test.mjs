import assert from "node:assert/strict";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CliCommandPolicy } from "../dist/infrastructure/tools/CliCommandPolicy.js";
import { SafeCliRunner } from "../dist/infrastructure/tools/SafeCliRunner.js";

async function tempCwd() {
  return mkdtemp(join(tmpdir(), "horus-cli-runner-"));
}

test("SafeCliRunner executes a real allowlisted CLI process and captures evidence", async () => {
  const cwd = await tempCwd();
  const canonicalCwd = await realpath(cwd);
  const runner = new SafeCliRunner({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: cwd,
    }),
  });

  const result = await runner.execute({
    id: "real_node_probe",
    executable: process.execPath,
    args: ["-e", "console.log(JSON.stringify({cli:true,cwd:process.cwd()}))"],
    cwd,
    timeoutMs: 5_000,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.equal(result.timedOut, false);
  assert.equal(result.spawned, true);
  assert.equal(typeof result.processId, "number");
  assert.ok(result.durationMs >= 0);
  assert.equal(result.cwd, canonicalCwd);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.cli, true);
  assert.equal(parsed.cwd, canonicalCwd);
});

test("SafeCliRunner rejects dangerous commands before spawning a process", async () => {
  const cwd = await tempCwd();
  const runner = new SafeCliRunner({
    policy: new CliCommandPolicy({
      allowedExecutables: ["rm"],
      allowedRoot: cwd,
    }),
  });

  const result = await runner.execute({
    id: "dangerous_rm",
    executable: "rm",
    args: ["-rf", "/"],
    cwd,
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.spawned, false);
  assert.equal(result.processId, null);
  assert.equal(result.exitCode, null);
  assert.match(result.errorMessage, /dangerous command blocked|destructive/i);
});

test("SafeCliRunner rejects non-allowlisted executables before spawning", async () => {
  const cwd = await tempCwd();
  const runner = new SafeCliRunner({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: cwd,
    }),
  });

  const result = await runner.execute({
    id: "unknown_executable",
    executable: "echo",
    args: ["should-not-run"],
    cwd,
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.spawned, false);
  assert.match(result.errorMessage, /not allowlisted/);
});

test("SafeCliRunner times out and reports timeout evidence", async () => {
  const cwd = await tempCwd();
  const runner = new SafeCliRunner({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: cwd,
    }),
    killGraceMs: 50,
  });

  const result = await runner.execute({
    id: "timeout_probe",
    executable: process.execPath,
    args: ["-e", "setTimeout(() => console.log('late'), 1000)"],
    cwd,
    timeoutMs: 50,
  });

  assert.equal(result.status, "timed_out");
  assert.equal(result.timedOut, true);
  assert.equal(result.spawned, true);
  assert.equal(result.exitCode, null);
  assert.ok(result.signal === "SIGTERM" || result.signal === "SIGKILL");
  assert.match(result.errorMessage, /timed out/);
});
