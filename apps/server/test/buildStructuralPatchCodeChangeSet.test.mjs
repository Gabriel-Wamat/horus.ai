import assert from "node:assert/strict";
import test from "node:test";
import { buildStructuralPatchCodeChangeSet } from "../dist/infrastructure/code/buildStructuralPatchCodeChangeSet.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ajustar copy",
  description: "Como usuário, quero copy em português.",
  acceptanceCriteria: ["Copy atualizada"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-29T10:00:00.000Z",
};

test("buildStructuralPatchCodeChangeSet compiles StructuralPatchIntent to a preconditioned CodeChangeSet", async () => {
  const content = [
    "export function App() {",
    "  return <main>Home</main>;",
    "}",
    "",
  ].join("\n");

  const changeSet = await buildStructuralPatchCodeChangeSet({
    workflowThreadId: "22222222-2222-4222-8222-222222222222",
    userStory,
    codeContext: {
      projectId: "33333333-3333-4333-8333-333333333333",
      query: "Troque Home por Inicio",
      inspectedFiles: ["src/App.tsx"],
      files: [
        {
          path: "src/App.tsx",
          bytes: Buffer.byteLength(content, "utf-8"),
          content,
          startLine: 1,
          matchedTerms: [],
        },
      ],
      excerpts: [],
      omittedFilesCount: 0,
      totalBytes: Buffer.byteLength(content, "utf-8"),
      limits: {
        maxFiles: 12,
        maxBytesPerFile: 8000,
        maxTotalBytes: 32000,
      },
      retrievalStatus: "matched",
      retrievalNotes: [],
      structuralContext: null,
    },
    structuralPatchIntents: [
      {
        id: "replace-app",
        kind: "replace",
        targetPath: "src/App.tsx",
        targetSymbolName: "App",
        targetSymbolKind: "component",
        content: [
          "export function App() {",
          "  return <main>Início</main>;",
          "}",
        ].join("\n"),
      },
    ],
  });

  assert.equal(changeSet.sourceAgent, "front");
  assert.equal(changeSet.operations.length, 1);
  assert.equal(changeSet.operations[0].targetPath, "src/App.tsx");
  assert.equal(changeSet.operations[0].changeType, "update");
  assert.match(changeSet.operations[0].afterContent, /Início/);
  assert.equal(changeSet.operations[0].preconditions[0].kind, "content_hash");
  assert.equal(changeSet.operations[0].metadata.patchStrategy, "structural_ast");
  assert.deepEqual(changeSet.operations[0].metadata.structuralIntentKinds, ["replace"]);
  assert.deepEqual(changeSet.operations[0].metadata.structuralTargets, [
    {
      kind: "replace",
      targetSymbolName: "App",
      targetSymbolKind: "component",
    },
  ]);
  assert.match(changeSet.operations[0].diff, /^diff --git/m);
});

test("buildStructuralPatchCodeChangeSet blocks missing structural targets", async () => {
  await assert.rejects(
    () =>
      buildStructuralPatchCodeChangeSet({
        workflowThreadId: "22222222-2222-4222-8222-222222222222",
        userStory,
        codeContext: {
          projectId: "33333333-3333-4333-8333-333333333333",
          query: "Troque Missing",
          inspectedFiles: ["src/App.tsx"],
          files: [
            {
              path: "src/App.tsx",
              bytes: 45,
              content: "export function App() { return <main />; }\n",
              startLine: 1,
              matchedTerms: [],
            },
          ],
          excerpts: [],
          omittedFilesCount: 0,
          totalBytes: 45,
          limits: {
            maxFiles: 12,
            maxBytesPerFile: 8000,
            maxTotalBytes: 32000,
          },
          retrievalStatus: "matched",
          retrievalNotes: [],
          structuralContext: null,
        },
        structuralPatchIntents: [
          {
            id: "replace-missing",
            kind: "replace",
            targetPath: "src/App.tsx",
            targetSymbolName: "Missing",
            targetSymbolKind: "component",
            content: "export function Missing() { return null; }",
          },
        ],
      }),
    /Structural patch plan blocked/
  );
});

test("buildStructuralPatchCodeChangeSet compiles add_import intents without full-file rewrite", async () => {
  const content = [
    "export function App() {",
    "  return <main>Home</main>;",
    "}",
    "",
  ].join("\n");

  const changeSet = await buildStructuralPatchCodeChangeSet({
    workflowThreadId: "22222222-2222-4222-8222-222222222222",
    userStory,
    codeContext: {
      projectId: "33333333-3333-4333-8333-333333333333",
      query: "Adicionar import de useMemo",
      inspectedFiles: ["src/App.tsx"],
      files: [
        {
          path: "src/App.tsx",
          bytes: Buffer.byteLength(content, "utf-8"),
          content,
          startLine: 1,
          matchedTerms: [],
        },
      ],
      excerpts: [],
      omittedFilesCount: 0,
      totalBytes: Buffer.byteLength(content, "utf-8"),
      limits: {
        maxFiles: 12,
        maxBytesPerFile: 8000,
        maxTotalBytes: 32000,
      },
      retrievalStatus: "matched",
      retrievalNotes: [],
      structuralContext: null,
    },
    structuralPatchIntents: [
      {
        id: "add-use-memo",
        kind: "add_import",
        targetPath: "src/App.tsx",
        importSource: "react",
        namedImports: ["useMemo"],
      },
    ],
  });

  assert.equal(changeSet.operations.length, 1);
  assert.match(changeSet.operations[0].afterContent, /^import \{ useMemo \} from "react";/);
  assert.equal(changeSet.operations[0].metadata.patchStrategy, "structural_ast");
  assert.deepEqual(changeSet.operations[0].metadata.structuralIntentKinds, ["add_import"]);
  assert.deepEqual(changeSet.operations[0].metadata.structuralTargets, [
    {
      kind: "add_import",
      targetSymbolName: null,
      targetSymbolKind: null,
    },
  ]);
});
