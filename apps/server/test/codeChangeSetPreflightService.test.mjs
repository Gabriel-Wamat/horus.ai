import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { CodeChangeSetPreflightService } from "../dist/infrastructure/code/CodeChangeSetPreflightService.js";

const workflowThreadId = "11111111-1111-4111-8111-111111111111";
const userStoryId = "22222222-2222-4222-8222-222222222222";
const projectId = "55555555-5555-4555-8555-555555555555";
const constructionRunId = "44444444-4444-4444-8444-444444444444";

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
  const outputEvents = [];
  const candidate = changeSet("export function App() { return <main>After</main>; }\n");
  const result = await service.validate({
    changeSet: candidate,
    projectRootPath: projectRoot,
    workflowThreadId,
    userStoryId,
    projectId,
    onCommandOutput: (event) => {
      outputEvents.push(event);
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.runtimeEvidence.status, "failed");
  assert.equal(result.runtimeEvidence.commands.length, 1);
  assert.equal(result.runtimeEvidence.commands[0].commandId, "test-root-test");
  assert.ok(outputEvents.length > 0);
  assert.equal(outputEvents[0].traceId, workflowThreadId);
  assert.equal(outputEvents[0].agentId, "curator_agent");
  assert.equal(outputEvents[0].projectId, projectId);
  assert.equal(outputEvents[0].filePath, "src/App.tsx");
  assert.equal(outputEvents[0].diffId, candidate.id);
  assert.match(result.runtimeEvidence.commands[0].stderrTail, /preflight terminal failure/);
  assert.match(result.issues[0], /test-root-test failed/);
  assert.equal(
    await readFile(join(projectRoot, "src", "App.tsx"), "utf8"),
    "export function App() { return <main>Before</main>; }\n"
  );
});

test("CodeChangeSetPreflightService surfaces stdout compiler errors ahead of package-manager warnings", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-preflight-stdout-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({ scripts: { "type-check": "node typecheck.js" } }),
    "utf8"
  );
  await writeFile(
    join(projectRoot, "typecheck.js"),
    [
      "process.stderr.write('npm warn Unknown env config \"recursive\"\\n');",
      "process.stdout.write('src/main.tsx(3,10): error TS2614: Module \"./App\" has no exported member \"App\".\\n');",
      "process.exit(2);",
      "",
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(projectRoot, "src", "App.tsx"),
    "export function App() { return <main>Before</main>; }\n",
    "utf8"
  );

  const service = new CodeChangeSetPreflightService();
  const result = await service.validate({
    changeSet: changeSet("export default function App() { return <main>After</main>; }\n"),
    projectRootPath: projectRoot,
    constructionRunId,
    workflowThreadId,
    userStoryId,
  });

  assert.equal(result.passed, false);
  assert.equal(result.runtimeEvidence.constructionRunId, constructionRunId);
  assert.match(result.issues.join("\n"), /TS2614/);
  assert.match(result.issues.join("\n"), /npm warn Unknown env config/);
  assert.ok(result.issues.join("\n").indexOf("TS2614") < result.issues.join("\n").indexOf("npm warn"));
});

test("CodeChangeSetPreflightService blocks static frontend gate failures before writing", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-preflight-static-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
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

test("CodeChangeSetPreflightService validates delete operations in an isolated workspace", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-preflight-delete-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(
    join(projectRoot, "src", "obsolete.ts"),
    "export const obsolete = true;\n",
    "utf8"
  );

  const service = new CodeChangeSetPreflightService();
  const result = await service.validate({
    changeSet: {
      ...changeSet(""),
      operations: [
        {
          targetPath: "src/obsolete.ts",
          changeType: "delete",
          beforeContent: null,
          afterContent: null,
          diff: "diff --git a/src/obsolete.ts b/src/obsolete.ts\n--- a/src/obsolete.ts\n+++ /dev/null",
        },
      ],
    },
    projectRootPath: projectRoot,
    workflowThreadId,
    userStoryId,
  });

  assert.equal(result.passed, true);
  assert.equal(result.validation[0].status, "not_run");
  assert.equal(
    await readFile(join(projectRoot, "src", "obsolete.ts"), "utf8"),
    "export const obsolete = true;\n"
  );
});
