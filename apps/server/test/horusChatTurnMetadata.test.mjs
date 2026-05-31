import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHorusChatAssistantTurnMetadata,
  buildHorusChatCancelledTurnMetadata,
  buildHorusChatFailedTurnMetadata,
  buildHorusChatOutcomeBase,
  buildHorusChatUserTurnMetadata,
  readHorusChatMetadata,
} from "../dist/application/services/HorusChatTurnMetadata.js";

const input = {
  chatSessionId: "11111111-1111-4111-8111-111111111111",
  message: "abra",
  idempotencyKey: "turn:test",
  projectId: "22222222-2222-4222-8222-222222222222",
  previewSessionId: "33333333-3333-4333-8333-333333333333",
};

const intent = {
  kind: "answer_question",
  mode: "chat",
  confidence: 0.93,
  rationale: "Resolved contextual follow-up.",
};

test("HorusChatTurnMetadata builds pending user metadata", () => {
  const metadata = buildHorusChatUserTurnMetadata(
    input,
    "2026-05-29T12:00:00.000Z"
  );

  assert.deepEqual(metadata, {
    horusChat: {
      idempotencyKey: "turn:test",
      turnStatus: "pending",
      submittedAt: "2026-05-29T12:00:00.000Z",
    },
  });
});

test("HorusChatTurnMetadata builds assistant metadata with derived suggested actions", () => {
  const metadata = buildHorusChatAssistantTurnMetadata(
    input,
    intent,
    {
      ...buildHorusChatOutcomeBase(input),
      action: "answer",
      status: "completed",
      summary: "Abri src/App.tsx.",
      evidenceSources: [
        {
          type: "code_file",
          label: "src/App.tsx",
          path: "src/App.tsx",
          confidence: "high",
        },
      ],
      groundingStatus: "grounded",
    },
    "2026-05-29T12:01:00.000Z"
  );

  assert.equal(metadata.horusChat.turnStatus, "completed");
  assert.equal(metadata.horusChat.completedAt, "2026-05-29T12:01:00.000Z");
  assert.equal(metadata.horusChat.suggestedActions[0].filePath, "src/App.tsx");
  assert.equal(
    metadata.horusChat.outcome.suggestedActions[0].filePath,
    "src/App.tsx"
  );
  assert.equal(metadata.horusChat.evidenceSources[0].path, "src/App.tsx");
  assert.equal(metadata.horusChat.groundingStatus, "grounded");
});

test("HorusChatTurnMetadata builds terminal failed and cancelled metadata", () => {
  const failed = buildHorusChatFailedTurnMetadata(
    input,
    "Falhou.",
    "streaming_answer_failed",
    true,
    "2026-05-29T12:02:00.000Z"
  );
  const cancelled = buildHorusChatCancelledTurnMetadata(
    input,
    "Cancelado.",
    "2026-05-29T12:03:00.000Z"
  );

  assert.equal(failed.horusChat.turnStatus, "failed");
  assert.equal(failed.horusChat.outcome.summary, "Falhou.");
  assert.equal(failed.horusChat.errorCode, "streaming_answer_failed");
  assert.equal(cancelled.horusChat.turnStatus, "cancelled");
  assert.equal(cancelled.horusChat.errorCode, "turn_cancelled");
  assert.equal(cancelled.horusChat.cancelledAt, cancelled.horusChat.completedAt);
});

test("HorusChatTurnMetadata reads stored horus metadata defensively", () => {
  const metadata = buildHorusChatUserTurnMetadata(
    input,
    "2026-05-29T12:04:00.000Z"
  );

  assert.equal(
    readHorusChatMetadata({ metadata })?.idempotencyKey,
    "turn:test"
  );
  assert.equal(readHorusChatMetadata({ metadata: { horusChat: null } }), undefined);
});
