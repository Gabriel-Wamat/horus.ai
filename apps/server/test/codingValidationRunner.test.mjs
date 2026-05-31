import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { CodingValidationRunner } from "../dist/application/coding/CodingValidationRunner.js";
import { CodeChangeSetValidationWorkspace } from "../dist/infrastructure/code/CodeChangeSetValidationWorkspace.js";

const now = new Date("2026-05-28T22:00:00.000Z");

test("CodingValidationRunner validates the exact patched candidate workspace", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-validation-runner-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({ scripts: { test: "node test.js" } }),
    "utf8"
  );
  await writeFile(
    join(projectRoot, "src", "App.tsx"),
    "export function App() { return <main>Before</main>; }\n",
    "utf8"
  );
  const runner = new CodingValidationRunner(
    new CodeChangeSetValidationWorkspace(undefined, () => now),
    {
      async run(input) {
        const patched = await readFile(
          join(input.workspaceRootPath, "src", "App.tsx"),
          "utf8"
        );
        assert.match(patched, /After/);
        return commandRun({
          commandId: input.command.id,
          cwd: input.workspaceRootPath,
          status: "completed",
          exitCode: 0,
          stdout: "ok",
        });
      },
    },
    undefined,
    () => now,
    idGenerator()
  );

  const result = await runner.validate({
    projectRootPath: projectRoot,
    patchPlan: patchPlan({
      beforeContent: "export function App() { return <main>Before</main>; }\n",
      afterContent: "export function App() { return <main>After</main>; }\n",
    }),
  });

  assert.equal(result.status, "passed");
  assert.equal(result.passed, true);
  assert.equal(result.commands[0].kind, "test");
  assert.equal(
    await readFile(join(projectRoot, "src", "App.tsx"), "utf8"),
    "export function App() { return <main>Before</main>; }\n"
  );
});

test("CodingValidationRunner fails and redacts secret-like output", async () => {
  const workspace = fakeWorkspace({
    commands: [projectCommand("test-root-test", process.execPath, ["test.js"])],
  });
  const runner = new CodingValidationRunner(
    workspace,
    {
      async run(input) {
        return commandRun({
          commandId: input.command.id,
          cwd: input.workspaceRootPath,
          status: "failed",
          exitCode: 7,
          stderr: "api_key=secret-value " + "sk-" + "1234567890abcdefghijklmnop",
        });
      },
    },
    undefined,
    () => now,
    idGenerator()
  );

  const result = await runner.validate({
    projectRootPath: "/tmp/project",
    patchPlan: patchPlan({}),
  });

  assert.equal(result.status, "failed");
  assert.match(result.commands[0].stderrTail, /REDACTED_SECRET/);
  assert.doesNotMatch(result.commands[0].stderrTail, /secret-value/);
  assert.equal(result.codeChangeValidation[0].status, "failed");
});

test("CodingValidationRunner skips with explicit reason when no validation command exists", async () => {
  const runner = new CodingValidationRunner(
    fakeWorkspace({
      commands: [projectCommand("inspect-project", process.execPath, ["-e", "0"])],
    }),
    {
      async run() {
        throw new Error("must not run");
      },
    },
    undefined,
    () => now,
    idGenerator()
  );

  const result = await runner.validate({
    projectRootPath: "/tmp/project",
    patchPlan: patchPlan({}),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.passed, true);
  assert.match(result.skippedReason, /No deterministic/);
  assert.equal(result.codeChangeValidation[0].status, "not_run");
});

test("CodingValidationRunner promotes timeout evidence to terminal validation status", async () => {
  const runner = new CodingValidationRunner(
    fakeWorkspace({
      commands: [projectCommand("test-root-test", process.execPath, ["slow.js"])],
    }),
    {
      async run(input) {
        return commandRun({
          commandId: input.command.id,
          cwd: input.workspaceRootPath,
          status: "timed_out",
          exitCode: null,
          stderr: "command timed out",
        });
      },
    },
    undefined,
    () => now,
    idGenerator()
  );

  const result = await runner.validate({
    projectRootPath: "/tmp/project",
    patchPlan: patchPlan({}),
  });

  assert.equal(result.status, "timed_out");
  assert.equal(result.passed, false);
  assert.match(result.issues[0], /timed_out/);
});

function fakeWorkspace({ commands, staticIssues = [] }) {
  return {
    async prepare() {
      return {
        candidateRootPath: "/tmp/candidate",
        config: projectConfig(commands),
        staticIssues,
        async cleanup() {},
      };
    },
  };
}

function patchPlan({
  beforeContent = "export function App() { return <main>Before</main>; }\n",
  afterContent = "export function App() { return <main>After</main>; }\n",
}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "planned",
    fileChanges: [
      {
        targetPath: "src/App.tsx",
        changeType: "update",
        beforeContent,
        afterContent,
        diff: "diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx",
        diffStats: {
          addedLines: 1,
          removedLines: 1,
          changedFiles: 1,
        },
        preconditions: [
          {
            path: "src/App.tsx",
            kind: "content_hash",
            expected: sha256(beforeContent),
          },
        ],
        operations: [],
      },
    ],
    diagnostics: [],
    summary: {
      fileCount: 1,
      operationCount: 0,
      diagnosticCount: 0,
      diffStats: {
        addedLines: 1,
        removedLines: 1,
        changedFiles: 1,
      },
    },
    createdAt: now.toISOString(),
  };
}

function commandRun({
  commandId,
  cwd,
  status,
  exitCode,
  stdout = "",
  stderr = "",
}) {
  return {
    commandId,
    executable: process.execPath,
    args: ["test.js"],
    cwd,
    status,
    exitCode,
    stdout,
    stderr,
    durationMs: 12,
    errorMessage: status === "completed" ? null : `command ${status}`,
  };
}

function projectConfig(commandCatalog) {
  return {
    version: 1,
    projectName: "test",
    projectStack: "typescript-react",
    baseRef: "main",
    writeRoots: ["."],
    commandCatalog,
    testRunnerIds: [],
    bootstrapCommandIds: [],
    roleProfiles: {
      curator: {
        allowedCommandIds: commandCatalog.map((item) => item.id),
        defaultValidationCommandIds: [],
      },
    },
  };
}

function projectCommand(id, executable, args) {
  return {
    id,
    executable,
    args,
    cwd: ".",
    env: {},
    timeoutMs: 1_000,
  };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function idGenerator() {
  const ids = [
    "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
    "aaaaaaaa-aaaa-4aaa-8aaa-000000000002",
    "aaaaaaaa-aaaa-4aaa-8aaa-000000000003",
    "aaaaaaaa-aaaa-4aaa-8aaa-000000000004",
    "aaaaaaaa-aaaa-4aaa-8aaa-000000000005",
    "aaaaaaaa-aaaa-4aaa-8aaa-000000000006",
  ];
  return () => ids.shift() ?? "aaaaaaaa-aaaa-4aaa-8aaa-000000000099";
}
