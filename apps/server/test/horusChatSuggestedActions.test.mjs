import assert from "node:assert/strict";
import test from "node:test";
import { deriveHorusChatSuggestedActions } from "../dist/application/services/HorusChatSuggestedActions.js";

function outcome(overrides = {}) {
  return {
    action: "answer",
    status: "completed",
    chatSessionId: "11111111-1111-4111-8111-111111111111",
    summary: "Resposta concluída.",
    ...overrides,
  };
}

test("deriveHorusChatSuggestedActions preserves existing actions without duplicates", () => {
  const actions = deriveHorusChatSuggestedActions(
    outcome({
      suggestedActions: [
        {
          type: "open_file",
          label: "abrir src/App.tsx",
          filePath: "src/App.tsx",
        },
      ],
      evidenceSources: [
        {
          type: "code_file",
          label: "src/App.tsx",
          path: "src/App.tsx",
          confidence: "high",
        },
      ],
    })
  );

  assert.deepEqual(actions, [
    {
      type: "open_file",
      label: "abrir src/App.tsx",
      filePath: "src/App.tsx",
    },
  ]);
});

test("deriveHorusChatSuggestedActions prefers evidence paths over textual mentions", () => {
  const actions = deriveHorusChatSuggestedActions(
    outcome({
      summary: "Também posso abrir App.tsx.",
      evidenceSources: [
        {
          type: "code_file",
          label: "src/App.tsx",
          path: "src/App.tsx",
          confidence: "high",
        },
      ],
    })
  );

  assert.equal(actions[0]?.type, "open_file");
  assert.equal(actions[0]?.filePath, "src/App.tsx");
});

test("deriveHorusChatSuggestedActions finds preview start offers from summary", () => {
  const actions = deriveHorusChatSuggestedActions(
    outcome({
      summary:
        "Se quiser, posso abrir src/App.tsx ou rodar o servidor de desenvolvimento.",
    })
  );

  assert.deepEqual(actions, [
    {
      type: "open_file",
      label: "abrir src/App.tsx",
      filePath: "src/App.tsx",
    },
    {
      type: "start_preview",
      label: "iniciar o preview registrado",
    },
  ]);
});
