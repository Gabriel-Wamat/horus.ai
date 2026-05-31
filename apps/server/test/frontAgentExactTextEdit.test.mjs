import assert from "node:assert/strict";
import test from "node:test";
import { generateFrontend } from "../dist/infrastructure/agents/FrontAgentImpl.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Editar titulo",
  description: "Editar titulo",
  acceptanceCriteria: ["Titulo alterado"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-28T00:00:00.000Z",
};

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: userStory.id,
  version: 1,
  summary: "Editar texto existente.",
  technicalApproach: "Aplicar alteracao minima.",
  components: [],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-05-28T00:00:00.000Z",
};

test("FrontAgent uses deterministic exact text edit for unique quoted replacements", async () => {
  const output = await generateFrontend(
    userStory,
    spec,
    undefined,
    undefined,
    'Troque o título grande "Titulo antigo" para "Titulo novo".',
    {
      projectId: "33333333-3333-4333-8333-333333333333",
      query: "Troque o título",
      inspectedFiles: ["src/App.tsx"],
      files: [
        {
          path: "src/App.tsx",
          bytes: 48,
          content: "export function App(){return <h1>Titulo antigo</h1>}",
        },
      ],
      omittedFilesCount: 0,
      totalBytes: 48,
      limits: {
        maxFiles: 12,
        maxBytesPerFile: 8000,
        maxTotalBytes: 32000,
      },
    }
  );

  assert.equal(output.operations.length, 1);
  assert.equal(output.operations[0].targetPath, "src/App.tsx");
  assert.match(output.operations[0].afterContent, /Titulo novo/);
  assert.doesNotMatch(output.operations[0].afterContent, /Titulo antigo/);
});

test("FrontAgent uses deterministic exact text edit when JSX wraps title text", async () => {
  const output = await generateFrontend(
    userStory,
    spec,
    undefined,
    undefined,
    'Troque o título grande "Interface de gerenciamento de projeto com dashboard, tarefas e calendario" para "Horus editou este título via chat".',
    {
      projectId: "33333333-3333-4333-8333-333333333333",
      query: "Troque o título",
      inspectedFiles: ["src/App.tsx"],
      files: [
        {
          path: "src/App.tsx",
          bytes: 126,
          content: [
            "export function App() {",
            "  return <h1>",
            "    Interface de gerenciamento de projeto com dashboard, tarefas e",
            "    calendario",
            "  </h1>;",
            "}",
          ].join("\n"),
        },
      ],
      omittedFilesCount: 0,
      totalBytes: 126,
      limits: {
        maxFiles: 12,
        maxBytesPerFile: 8000,
        maxTotalBytes: 32000,
      },
    }
  );

  assert.equal(output.operations.length, 1);
  assert.equal(output.operations[0].targetPath, "src/App.tsx");
  assert.match(output.operations[0].afterContent, /Horus editou este título via chat/);
  assert.doesNotMatch(
    output.operations[0].afterContent,
    /Interface de gerenciamento de projeto com dashboard/
  );
});
