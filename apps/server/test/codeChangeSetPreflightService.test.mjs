import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { CodeChangeSetPreflightService } from "../dist/infrastructure/code/CodeChangeSetPreflightService.js";

const workflowThreadId = "11111111-1111-4111-8111-111111111111";
const userStoryId = "22222222-2222-4222-8222-222222222222";

function changeSet(afterContent) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    workflowThreadId,
    userStoryId,
    sourceAgent: "front",
    status: "proposed",
    operations: [
      {
        targetPath: "src/App.tsx",
        changeType: "update",
        beforeContent: "export function App() { return <main>Before</main>; }\n",
        afterContent,
        diff: "diff --git a/src/App.tsx b/src/App.tsx\n@@\n-change\n+change",
      },
    ],
    validation: [],
    createdAt: "2026-05-27T00:00:00.000Z",
  };
}

test("CodeChangeSetPreflightService runs terminal validation, captures stderr and rolls back candidate files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-preflight-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({ scripts: { test: "node test.js" } }),
    "utf8"
  );
  await writeFile(
    join(projectRoot, "test.js"),
    "console.error('preflight terminal failure'); process.exit(7);\n",
    "utf8"
  );
  await writeFile(
    join(projectRoot, "src", "App.tsx"),
    "export function App() { return <main>Before</main>; }\n",
    "utf8"
  );

  const service = new CodeChangeSetPreflightService();
  const result = await service.validate({
    changeSet: changeSet("export function App() { return <main>After</main>; }\n"),
    projectRootPath: projectRoot,
    workflowThreadId,
    userStoryId,
  });

  assert.equal(result.passed, false);
  assert.equal(result.runtimeEvidence.status, "failed");
  assert.equal(result.runtimeEvidence.commands.length, 1);
  assert.equal(result.runtimeEvidence.commands[0].commandId, "test-root-test");
  assert.match(result.runtimeEvidence.commands[0].stderrTail, /preflight terminal failure/);
  assert.match(result.issues[0], /test-root-test failed/);
  assert.equal(
    await readFile(join(projectRoot, "src", "App.tsx"), "utf8"),
    "export function App() { return <main>Before</main>; }\n"
  );
});

test("CodeChangeSetPreflightService blocks static frontend gate failures before writing", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-preflight-static-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({ dependencies: { react: "latest", vite: "latest" } }),
    "utf8"
  );
  await writeFile(
    join(projectRoot, "src", "main.tsx"),
    "import './App';\n",
    "utf8"
  );

  const service = new CodeChangeSetPreflightService();
  const result = await service.validate({
    changeSet: {
      ...changeSet("export function Extra() { return <main>Disconnected</main>; }\n"),
      operations: [
        {
          ...changeSet("").operations[0],
          targetPath: "src/Disconnected.tsx",
          changeType: "create",
          beforeContent: null,
          afterContent: "export function Extra() { return <main>Disconnected</main>; }\n",
        },
      ],
    },
    projectRootPath: projectRoot,
    workflowThreadId,
    userStoryId,
  });

  assert.equal(result.passed, false);
  assert.equal(result.validation[0].command, "frontend-change-set-quality-gate");
  assert.match(result.issues.join("\n"), /not reachable/);
  await assert.rejects(
    () => access(join(projectRoot, "src", "Disconnected.tsx")),
    { code: "ENOENT" }
  );
});
