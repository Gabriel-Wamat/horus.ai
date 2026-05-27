import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ProjectCodeChangeSetApplier } from "../dist/infrastructure/code/ProjectCodeChangeSetApplier.js";

const baseChangeSet = {
  id: "11111111-1111-4111-8111-111111111111",
  workflowThreadId: "22222222-2222-4222-8222-222222222222",
  workspaceFolderId: "33333333-3333-4333-8333-333333333333",
  userStoryId: "44444444-4444-4444-8444-444444444444",
  sourceAgent: "front",
  status: "proposed",
  operations: [
    {
      targetPath: "generated/horus/preview.html",
      changeType: "create",
      beforeContent: null,
      afterContent: "<main>Horus</main>",
      diff: "--- /dev/null\n+++ generated/horus/preview.html\n+<main>Horus</main>",
    },
  ],
  validation: [],
  createdAt: "2026-05-26T10:00:00.000Z",
};

test("ProjectCodeChangeSetApplier writes relative operations inside selected project root", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-project-"));
  const applier = new ProjectCodeChangeSetApplier();

  const result = await applier.apply({
    changeSet: baseChangeSet,
    projectRootPath: projectRoot,
  });

  const written = await readFile(
    join(projectRoot, "generated", "horus", "preview.html"),
    "utf8"
  );

  assert.equal(written, "<main>Horus</main>");
  assert.equal(result.status, "applied");
  assert.equal(result.operations[0].beforeContent, null);
  assert.equal(result.operations[0].changeType, "create");
  assert.ok(result.appliedAt);
});

test("ProjectCodeChangeSetApplier captures previous file content on update", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-project-"));
  await writeFile(join(projectRoot, "existing.html"), "before", "utf8");
  const applier = new ProjectCodeChangeSetApplier();

  const result = await applier.apply({
    changeSet: {
      ...baseChangeSet,
      operations: [
        {
          ...baseChangeSet.operations[0],
          targetPath: "existing.html",
          afterContent: "after",
        },
      ],
    },
    projectRootPath: projectRoot,
  });

  assert.equal(await readFile(join(projectRoot, "existing.html"), "utf8"), "after");
  assert.equal(result.operations[0].beforeContent, "before");
  assert.equal(result.operations[0].changeType, "update");
});

test("ProjectCodeChangeSetApplier rejects paths outside selected project root", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-project-"));
  const applier = new ProjectCodeChangeSetApplier();

  await assert.rejects(
    () =>
      applier.apply({
        changeSet: {
          ...baseChangeSet,
          operations: [
            {
              ...baseChangeSet.operations[0],
              targetPath: "../outside.html",
            },
          ],
        },
        projectRootPath: projectRoot,
      }),
    /escapes the selected project/
  );
});

test("ProjectCodeChangeSetApplier rejects absolute target paths", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-project-"));
  const applier = new ProjectCodeChangeSetApplier();

  await assert.rejects(
    () =>
      applier.apply({
        changeSet: {
          ...baseChangeSet,
          operations: [
            {
              ...baseChangeSet.operations[0],
              targetPath: join(projectRoot, "absolute.html"),
            },
          ],
        },
        projectRootPath: projectRoot,
      }),
    /must be relative/
  );
});

test("ProjectCodeChangeSetApplier marks disconnected frontend files as failed without writing them", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-project-"));
  const applier = new ProjectCodeChangeSetApplier();

  try {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "main.tsx"),
      'import { App } from "./App.js";\nconsole.log(App);\n',
      "utf8"
    );
    await writeFile(
      join(projectRoot, "src", "App.tsx"),
      "export function App() { return <main />; }\n",
      "utf8"
    );

    const result = await applier.apply({
      changeSet: {
        ...baseChangeSet,
        operations: [
          {
            ...baseChangeSet.operations[0],
            targetPath: "src/components/Floating.tsx",
            afterContent:
              "export function Floating() { return <section>Hidden</section>; }\n",
          },
        ],
      },
      projectRootPath: projectRoot,
    });

    assert.equal(result.status, "failed");
    assert.match(result.failedReason, /not reachable/);
    await assert.rejects(
      readFile(join(projectRoot, "src", "components", "Floating.tsx"), "utf8"),
      /ENOENT/
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
