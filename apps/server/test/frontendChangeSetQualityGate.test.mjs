import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { evaluateFrontendChangeSet } from "../dist/infrastructure/code/FrontendChangeSetQualityGate.js";

function changeSetFor(operations) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    workflowThreadId: "22222222-2222-4222-8222-222222222222",
    userStoryId: "33333333-3333-4333-8333-333333333333",
    sourceAgent: "front",
    status: "proposed",
    operations,
    validation: [],
    createdAt: "2026-05-26T00:00:00.000Z",
  };
}

async function createProject() {
  const root = await mkdtemp(join(tmpdir(), "horus-quality-gate-"));
  await mkdir(join(root, "src", "components"), { recursive: true });
  await writeFile(
    join(root, "src", "main.tsx"),
    'import { App } from "./App.js";\nimport "./index.css";\nconsole.log(App);\n',
    "utf8"
  );
  await writeFile(
    join(root, "src", "App.tsx"),
    "export function App() {\n  return <main>Ready</main>;\n}\n",
    "utf8"
  );
  await writeFile(join(root, "src", "index.css"), "body { margin: 0; }\n", "utf8");
  return root;
}

test("quality gate accepts source files reachable from the app import graph", async () => {
  const root = await createProject();
  try {
    const result = await evaluateFrontendChangeSet({
      projectRootPath: root,
      changeSet: changeSetFor([
        {
          targetPath: "src/App.tsx",
          changeType: "update",
          beforeContent: null,
          afterContent:
            'import { Greeting } from "./components/Greeting.js";\nexport function App() {\n  return <Greeting />;\n}\n',
          diff: "diff",
        },
        {
          targetPath: "src/components/Greeting.tsx",
          changeType: "create",
          beforeContent: null,
          afterContent: "export function Greeting() {\n  return <main>Horus</main>;\n}\n",
          diff: "diff",
        },
      ]),
    });

    assert.equal(result.passed, true);
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("quality gate rejects source files disconnected from the app import graph", async () => {
  const root = await createProject();
  try {
    const result = await evaluateFrontendChangeSet({
      projectRootPath: root,
      changeSet: changeSetFor([
        {
          targetPath: "src/components/FloatingWidget.tsx",
          changeType: "create",
          beforeContent: null,
          afterContent:
            "export function FloatingWidget() {\n  return <section>Not mounted</section>;\n}\n",
          diff: "diff",
        },
      ]),
    });

    assert.equal(result.passed, false);
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0], /not reachable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("quality gate rejects runtime mock or fake behavior in applied frontend source", async () => {
  const root = await createProject();
  try {
    const result = await evaluateFrontendChangeSet({
      projectRootPath: root,
      changeSet: changeSetFor([
        {
          targetPath: "src/App.tsx",
          changeType: "update",
          beforeContent: null,
          afterContent:
            "const mockStatus = 'ready';\nexport function App() {\n  return <main>{mockStatus}</main>;\n}\n",
          diff: "diff",
        },
      ]),
    });

    assert.equal(result.passed, false);
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0], /mock/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("quality gate rejects standalone HTML artifacts for React project implementation", async () => {
  const root = await createProject();
  try {
    const result = await evaluateFrontendChangeSet({
      projectRootPath: root,
      changeSet: changeSetFor([
        {
          targetPath: "generated/horus/story.html",
          changeType: "create",
          beforeContent: null,
          afterContent: "<!doctype html><html><body>Parallel app</body></html>",
          diff: "diff",
        },
      ]),
    });

    assert.equal(result.passed, false);
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0], /standalone HTML artifact/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
