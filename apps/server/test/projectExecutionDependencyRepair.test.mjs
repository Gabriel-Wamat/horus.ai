import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ProjectExecutionService } from "../dist/infrastructure/project/ProjectExecutionService.js";

const constructionRunId = "11111111-1111-4111-8111-111111111111";

test("ProjectExecutionService repairs missing dependencies for QA test commands and retries once", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-project-repair-"));
  await mkdir(join(root, "node_modules"), { recursive: true });
  const config = {
    version: 1,
    projectName: "Repair Demo",
    projectStack: "typescript-react",
    baseRef: "main",
    writeRoots: ["."],
    commandCatalog: [
      {
        id: "test-root-test",
        executable: process.execPath,
        args: [
          "-e",
          [
            "const fs=require('node:fs');",
            "if(!fs.existsSync('node_modules/.repaired')){",
            "console.error('Cannot find module test-runner');",
            "process.exit(1);",
            "}",
            "console.log('tests passed after repair');",
          ].join(""),
        ],
        cwd: ".",
        env: {},
        timeoutMs: 5_000,
      },
      {
        id: "install-root-dependencies",
        executable: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync('node_modules/.repaired','ok')",
        ],
        cwd: ".",
        env: {},
        timeoutMs: 5_000,
      },
    ],
    testRunnerIds: ["test-root-test"],
    bootstrapCommandIds: ["install-root-dependencies"],
    roleProfiles: {
      qa_specialist: {
        allowedCommandIds: ["test-root-test", "install-root-dependencies"],
        defaultValidationCommandIds: ["test-root-test"],
      },
    },
  };

  const runs = await new ProjectExecutionService().executeCommandRequests({
    constructionRunId,
    roleName: "qa_specialist",
    projectRoot: root,
    config,
    plan: {
      summary: "Run tests",
      fileOperations: [],
      commandRequests: [],
      validationCommandIds: ["test-root-test"],
      risks: [],
    },
  });

  assert.deepEqual(
    runs.map((run) => run.commandId),
    ["test-root-test", "install-root-dependencies", "test-root-test"]
  );
  assert.deepEqual(
    runs.map((run) => run.exitCode),
    [1, 0, 0]
  );
  assert.match(runs[0].stderrTail, /Cannot find module/);
  assert.match(runs[2].stdoutTail, /tests passed after repair/);
  assert.equal(typeof runs[2].taskId, "string");
  assert.equal(typeof runs[2].stdoutPath, "string");
  assert.match(await readFile(runs[2].stdoutPath, "utf-8"), /tests passed after repair/);
});

test("ProjectExecutionService repairs missing dependencies for QA build commands and retries once", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-project-build-repair-"));
  await mkdir(join(root, "node_modules"), { recursive: true });
  const config = {
    version: 1,
    projectName: "Build Repair Demo",
    projectStack: "typescript-react",
    baseRef: "main",
    writeRoots: ["."],
    commandCatalog: [
      {
        id: "build-root-build",
        executable: process.execPath,
        args: [
          "-e",
          [
            "const fs=require('node:fs');",
            "if(!fs.existsSync('node_modules/.repaired')){",
            "console.error('sh: vite: command not found');",
            "process.exit(1);",
            "}",
            "console.log('build passed after install');",
          ].join(""),
        ],
        cwd: ".",
        env: {},
        timeoutMs: 5_000,
      },
      {
        id: "install-root-dependencies",
        executable: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync('node_modules/.repaired','ok')",
        ],
        cwd: ".",
        env: {},
        timeoutMs: 5_000,
      },
    ],
    testRunnerIds: [],
    bootstrapCommandIds: ["install-root-dependencies"],
    roleProfiles: {
      qa_specialist: {
        allowedCommandIds: ["build-root-build", "install-root-dependencies"],
        defaultValidationCommandIds: ["build-root-build"],
      },
    },
  };

  const runs = await new ProjectExecutionService().executeCommandRequests({
    constructionRunId,
    roleName: "qa_specialist",
    projectRoot: root,
    config,
    plan: {
      summary: "Run build",
      fileOperations: [],
      commandRequests: [],
      validationCommandIds: ["build-root-build"],
      risks: [],
    },
  });

  assert.deepEqual(
    runs.map((run) => run.commandId),
    ["build-root-build", "install-root-dependencies", "build-root-build"]
  );
  assert.deepEqual(
    runs.map((run) => run.exitCode),
    [1, 0, 0]
  );
  assert.match(runs[0].stderrTail, /vite: command not found/);
  assert.match(runs[2].stdoutTail, /build passed after install/);
  assert.equal(typeof runs[2].taskId, "string");
  assert.equal(typeof runs[2].stdoutPath, "string");
  assert.match(await readFile(runs[2].stdoutPath, "utf-8"), /build passed after install/);
});

test("ProjectExecutionService repairs dependencies for any role with explicit repair command permission", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-project-front-repair-"));
  await mkdir(join(root, "node_modules"), { recursive: true });
  const config = {
    version: 1,
    projectName: "Front Repair Demo",
    projectStack: "typescript-react",
    baseRef: "main",
    writeRoots: ["."],
    commandCatalog: [
      {
        id: "build-root-build",
        executable: process.execPath,
        args: [
          "-e",
          [
            "const fs=require('node:fs');",
            "if(!fs.existsSync('node_modules/.repaired')){",
            "console.error('Cannot find module vite');",
            "process.exit(1);",
            "}",
            "console.log('front build passed after repair');",
          ].join(""),
        ],
        cwd: ".",
        env: {},
        timeoutMs: 5_000,
      },
      {
        id: "install-root-dependencies",
        executable: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync('node_modules/.repaired','ok')",
        ],
        cwd: ".",
        env: {},
        timeoutMs: 5_000,
      },
    ],
    testRunnerIds: [],
    bootstrapCommandIds: ["install-root-dependencies"],
    roleProfiles: {
      frontend_specialist: {
        allowedCommandIds: ["build-root-build", "install-root-dependencies"],
        defaultValidationCommandIds: ["build-root-build"],
      },
    },
  };

  const runs = await new ProjectExecutionService().executeCommandRequests({
    constructionRunId,
    roleName: "frontend_specialist",
    projectRoot: root,
    config,
    plan: {
      summary: "Run frontend build",
      fileOperations: [],
      commandRequests: [],
      validationCommandIds: ["build-root-build"],
      risks: [],
    },
  });

  assert.deepEqual(
    runs.map((run) => run.commandId),
    ["build-root-build", "install-root-dependencies", "build-root-build"]
  );
  assert.deepEqual(
    runs.map((run) => run.exitCode),
    [1, 0, 0]
  );
  assert.equal(runs[2].stdoutTail.includes("front build passed after repair"), true);
});
