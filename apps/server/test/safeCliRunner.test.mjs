import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
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

test("SafeCliRunner does not inherit arbitrary process env by default", async () => {
  const cwd = await tempCwd();
  process.env.HORUS_SECRET_PROBE = "must-not-leak";
  const runner = new SafeCliRunner({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: cwd,
    }),
  });

  const result = await runner.execute({
    id: "env_probe",
    executable: process.execPath,
    args: [
      "-e",
      "console.log(JSON.stringify({secret:process.env.HORUS_SECRET_PROBE ?? null, explicit:process.env.HORUS_EXPLICIT_PROBE ?? null, hasPath:Boolean(process.env.PATH)}))",
    ],
    cwd,
    env: {
      HORUS_EXPLICIT_PROBE: "allowed",
    },
    timeoutMs: 5_000,
  });

  delete process.env.HORUS_SECRET_PROBE;

  assert.equal(result.status, "completed");
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.secret, null);
  assert.equal(parsed.explicit, "allowed");
  assert.equal(parsed.hasPath, true);
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

test("SafeCliRunner rejects dangerous package scripts before spawning", async () => {
  const cwd = await tempCwd();
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      scripts: {
        wipe: "rm -rf /",
      },
    })
  );
  const runner = new SafeCliRunner({
    policy: new CliCommandPolicy({
      allowedExecutables: ["pnpm"],
      allowedRoot: cwd,
    }),
  });

  const result = await runner.execute({
    id: "dangerous_package_script",
    executable: "pnpm",
    args: ["run", "wipe"],
    cwd,
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.spawned, false);
  assert.match(result.errorMessage, /package script wipe rejected/);
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

test("SafeCliRunner abort signal terminates a running child process", async () => {
  const cwd = await tempCwd();
  const controller = new AbortController();
  const runner = new SafeCliRunner({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: cwd,
    }),
    killGraceMs: 50,
  });

  const run = runner.executeWithOptions(
    {
      id: "abort_probe",
      executable: process.execPath,
      args: ["-e", "setTimeout(() => console.log('late'), 1000)"],
      cwd,
      timeoutMs: 5_000,
    },
    { signal: controller.signal }
  );
  setTimeout(() => controller.abort(), 30);

  const result = await run;

  assert.equal(result.status, "aborted");
  assert.equal(result.timedOut, false);
  assert.equal(result.spawned, true);
  assert.equal(result.exitCode, null);
  assert.ok(result.signal === "SIGTERM" || result.signal === "SIGKILL");
  assert.match(result.errorMessage, /aborted/);
});

test("SafeCliRunner streams output chunks without crashing", async () => {
  const cwd = await tempCwd();
  const runner = new SafeCliRunner({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: cwd,
    }),
  });
  const chunks = [];

  const result = await runner.executeWithOptions(
    {
      id: "stream_probe",
      executable: process.execPath,
      args: [
        "-e",
        "console.log('stream-stdout'); console.error('stream-stderr')",
      ],
      cwd,
      timeoutMs: 5_000,
    },
    {
      onOutput: (event) => chunks.push(event),
    }
  );

  assert.equal(result.status, "completed");
  assert.match(result.stdout, /stream-stdout/);
  assert.match(result.stderr, /stream-stderr/);
  assert.ok(
    chunks.some((chunk) => chunk.stream === "stdout" && chunk.chunk.includes("stream-stdout"))
  );
  assert.ok(
    chunks.some((chunk) => chunk.stream === "stderr" && chunk.chunk.includes("stream-stderr"))
  );
});
