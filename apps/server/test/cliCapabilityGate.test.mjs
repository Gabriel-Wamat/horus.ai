import assert from "node:assert/strict";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CliCommandPolicy } from "../dist/infrastructure/tools/CliCommandPolicy.js";
import { SafeCliRunner } from "../dist/infrastructure/tools/SafeCliRunner.js";

test("feature 24 gate proves real CLI capability with auditable command evidence", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "horus-cli-gate-"));
  const canonicalCwd = await realpath(cwd);
  const runner = new SafeCliRunner({
    policy: new CliCommandPolicy({
      allowedExecutables: [process.execPath],
      allowedRoot: cwd,
    }),
  });

  const result = await runner.execute({
    id: "feature_24_real_cli_gate",
    executable: process.execPath,
    args: [
      "-e",
      [
        "console.log('HORUS_CLI_GATE_OK')",
        "console.error('HORUS_CLI_GATE_STDERR_OK')",
      ].join(";"),
    ],
    cwd,
    timeoutMs: 5_000,
  });

  assert.equal(result.commandId, "feature_24_real_cli_gate");
  assert.equal(result.executable, process.execPath);
  assert.deepEqual(result.args, [
    "-e",
    "console.log('HORUS_CLI_GATE_OK');console.error('HORUS_CLI_GATE_STDERR_OK')",
  ]);
  assert.equal(result.cwd, canonicalCwd);
  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.equal(result.timedOut, false);
  assert.equal(result.spawned, true);
  assert.equal(typeof result.processId, "number");
  assert.ok(result.durationMs >= 0);
  assert.match(result.stdout, /HORUS_CLI_GATE_OK/);
  assert.match(result.stderr, /HORUS_CLI_GATE_STDERR_OK/);
});
