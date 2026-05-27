import assert from "node:assert/strict";
import test from "node:test";
import { buildFrontendCodeChangeSet } from "../dist/infrastructure/code/buildFrontendCodeChangeSet.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ajustar tela",
  description: "Como usuário, quero uma tela ajustada.",
  acceptanceCriteria: ["Tela renderiza"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-26T10:00:00.000Z",
};

test("buildFrontendCodeChangeSet creates auditable operations from inspected source files", () => {
  const changeSet = buildFrontendCodeChangeSet({
    workflowThreadId: "22222222-2222-4222-8222-222222222222",
    userStory,
    artifactContext: {
      workspaceFolderId: "33333333-3333-4333-8333-333333333333",
      specRevisionId: "spec:active",
    },
    codeContext: {
      projectId: "44444444-4444-4444-8444-444444444444",
      query: "Ajustar tela",
      inspectedFiles: ["src/App.tsx"],
      files: [
        {
          path: "src/App.tsx",
          bytes: 31,
          content: "export function App(){return null}",
        },
      ],
      omittedFilesCount: 0,
      totalBytes: 31,
      limits: {
        maxFiles: 12,
        maxBytesPerFile: 8000,
        maxTotalBytes: 32000,
      },
    },
    operations: [
      {
        targetPath: "src/App.tsx",
        afterContent: "export function App(){return <main>Horus</main>}",
        rationale: "Implementa a tela pedida.",
      },
    ],
  });

  assert.equal(changeSet.status, "proposed");
  assert.equal(changeSet.workspaceFolderId, "33333333-3333-4333-8333-333333333333");
  assert.equal(changeSet.specRevisionId, "spec:active");
  assert.equal(changeSet.operations[0].targetPath, "src/App.tsx");
  assert.equal(changeSet.operations[0].changeType, "update");
  assert.equal(
    changeSet.operations[0].beforeContent,
    "export function App(){return null}"
  );
  assert.match(changeSet.operations[0].diff, /--- a\/src\/App\.tsx/);
  assert.match(changeSet.operations[0].diff, /\+export function App/);
});

test("buildFrontendCodeChangeSet marks new files as create operations", () => {
  const changeSet = buildFrontendCodeChangeSet({
    workflowThreadId: "22222222-2222-4222-8222-222222222222",
    userStory,
    operations: [
      {
        targetPath: "src/NewPanel.tsx",
        afterContent: "export function NewPanel(){return null}",
        rationale: "Novo componente.",
      },
    ],
  });

  assert.equal(changeSet.operations[0].changeType, "create");
  assert.equal(changeSet.operations[0].beforeContent, null);
  assert.match(changeSet.operations[0].diff, /--- \/dev\/null/);
});
