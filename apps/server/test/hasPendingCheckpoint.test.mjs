import assert from "node:assert/strict";
import test from "node:test";
import { hasPendingCheckpoint } from "../dist/domain/services/resumeCheckpoint.js";

test("hasPendingCheckpoint detects a resumable LangGraph node", () => {
  assert.equal(
    hasPendingCheckpoint({ next: ["hitlCheckpoint"] }, "hitlCheckpoint"),
    true
  );
});

test("hasPendingCheckpoint rejects missing or different pending nodes", () => {
  assert.equal(
    hasPendingCheckpoint({ next: ["retryCheckpoint"] }, "hitlCheckpoint"),
    false
  );
  assert.equal(hasPendingCheckpoint({}, "hitlCheckpoint"), false);
});
