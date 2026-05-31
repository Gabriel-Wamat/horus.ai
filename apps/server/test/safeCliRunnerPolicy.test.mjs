import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { CliCommandPolicy } from "../dist/infrastructure/tools/CliCommandPolicy.js";
import { SafeCliValidationCommandRunner } from "../dist/infrastructure/tools/SafeCliValidationCommandRunner.js";

test("CliCommandPolicy requires explicit approval for package manager installs", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "horus-cli-approval-"));
  const policy = new CliCommandPolicy({
    allowedRoot: workspaceRootPath,
    allowedExecutables: ["pnpm"],
  });

  const decision = await policy.evaluate({
    id: "install-root-dependencies",
    executable: "pnpm",
    args: ["install"],
    cwd: workspaceRootPath,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.action, "ask");
  assert.equal(decision.approvalRequired, true);
  assert.equal(decision.risk, "medium");
  assert.match(decision.reason, /requires approval/i);
});

test("CliCommandPolicy allows approved package manager installs with policy evidence", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "horus-cli-approval-"));
  const policy = new CliCommandPolicy({
    allowedRoot: workspaceRootPath,
    allowedExecutables: ["pnpm"],
  });

  const decision = await policy.evaluate({
    id: "install-root-dependencies",
    executable: "pnpm",
    args: ["install"],
    cwd: workspaceRootPath,
    approved: true,
    approvedBy: "system:test",
    approvalReason: "test approved command",
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.action, "allow");
  assert.equal(decision.approvalRequired, true);
  assert.equal(decision.risk, "medium");
  assert.equal(decision.normalized?.approved, true);
  assert.equal(decision.normalized?.approvedBy, "system:test");
  assert.equal(decision.normalized?.approvalReason, "test approved command");
});

test("CliCommandPolicy blocks package installs for frontend agent profile", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "horus-cli-profile-"));
  const policy = new CliCommandPolicy({
    allowedRoot: workspaceRootPath,
    allowedExecutables: ["pnpm"],
  });

  const decision = await policy.evaluate({
    id: "install-root-dependencies",
    executable: "pnpm",
    args: ["install"],
    cwd: workspaceRootPath,
    agentId: "front_agent",
    approved: true,
    approvedBy: "system:test",
    approvalReason: "test approved command",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.action, "deny");
  assert.equal(decision.risk, "high");
  assert.ok(decision.reason?.includes("front_agent"));
  assert.ok(decision.reason?.includes("pnpm install"));
});

test("CliCommandPolicy allows approved dependency installs for QA agent profile", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "horus-cli-profile-"));
  const policy = new CliCommandPolicy({
    allowedRoot: workspaceRootPath,
    allowedExecutables: ["pnpm"],
  });

  const decision = await policy.evaluate({
    id: "install-root-dependencies",
    executable: "pnpm",
    args: ["install"],
    cwd: workspaceRootPath,
    agentId: "qa_agent",
    approved: true,
    approvedBy: "system:test",
    approvalReason: "test approved command",
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.normalized?.agentId, undefined);
  assert.equal(decision.normalized?.approvalRequired, true);
  assert.equal(decision.normalized?.approvedBy, "system:test");
});

test("CliCommandPolicy requires approval for curator command execution", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "horus-cli-profile-"));
  const policy = new CliCommandPolicy({
    allowedRoot: workspaceRootPath,
    allowedExecutables: ["pnpm"],
  });

  const decision = await policy.evaluate({
    id: "run-tests",
    executable: "pnpm",
    args: ["test"],
    cwd: workspaceRootPath,
    agentId: "curator_agent",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.approvalRequired, true);
  assert.equal(decision.risk, "medium");
  assert.ok(decision.reason?.includes("curator_agent"));
});

test("CliCommandPolicy inspects package scripts and blocks shell operators", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "horus-cli-script-"));
  await writeFile(
    join(workspaceRootPath, "package.json"),
    JSON.stringify({
      scripts: {
        build: "vite build > build.log",
      },
    })
  );
  const policy = new CliCommandPolicy({
    allowedRoot: workspaceRootPath,
    allowedExecutables: ["pnpm"],
  });

  const decision = await policy.evaluate({
    id: "build-root",
    executable: "pnpm",
    args: ["run", "build"],
    cwd: workspaceRootPath,
    agentId: "qa_agent",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.approvalRequired, false);
  assert.equal(decision.risk, "high");
  assert.ok(decision.reason?.includes("package script build rejected"));
  assert.ok(decision.reason?.includes("shell operator >"));
});

test("CliCommandPolicy inspects package scripts and blocks command substitution", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "horus-cli-script-"));
  await writeFile(
    join(workspaceRootPath, "package.json"),
    JSON.stringify({
      scripts: {
        test: "node -e \"console.log($(whoami))\"",
      },
    })
  );
  const policy = new CliCommandPolicy({
    allowedRoot: workspaceRootPath,
    allowedExecutables: ["pnpm"],
  });

  const decision = await policy.evaluate({
    id: "test-root",
    executable: "pnpm",
    args: ["test"],
    cwd: workspaceRootPath,
    agentId: "qa_agent",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.risk, "high");
  assert.ok(decision.reason?.includes("command substitution"));
});

test("CliCommandPolicy blocks direct runtime commands for spec agent profile", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "horus-cli-profile-"));
  const policy = new CliCommandPolicy({
    allowedRoot: workspaceRootPath,
    allowedExecutables: [process.execPath],
  });

  const decision = await policy.evaluate({
    id: "node-probe",
    executable: process.execPath,
    args: ["-e", "console.log('nope')"],
    cwd: workspaceRootPath,
    agentId: "spec_agent",
    approved: true,
    approvedBy: "system:test",
    approvalReason: "test approved command",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.risk, "high");
  assert.ok(decision.reason?.includes("spec_agent"));
});

test("SafeCliValidationCommandRunner rejects network transfer executables", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "horus-validation-policy-"));
  const runner = new SafeCliValidationCommandRunner();
  const result = await runner.run({
    workspaceRootPath,
    command: {
      id: "curl-probe",
      kind: "test",
      executable: "curl",
      args: ["http://127.0.0.1"],
      cwd: ".",
      env: {},
      required: true,
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.exitCode, null);
  assert.match(result.errorMessage, /not allowed|not allowlisted/i);
});

test("SafeCliValidationCommandRunner executes inside workspace root only", async () => {
  const workspaceRootPath = await mkdtemp(join(tmpdir(), "horus-validation-policy-"));
  const runner = new SafeCliValidationCommandRunner();
  const result = await runner.run({
    workspaceRootPath,
    command: {
      id: "cwd-probe",
      kind: "test",
      executable: process.execPath,
      args: ["-e", "console.log(process.cwd())"],
      cwd: ".",
      env: {},
      timeoutMs: 5_000,
      required: true,
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout.trim(), /horus-validation-policy-/);
});
