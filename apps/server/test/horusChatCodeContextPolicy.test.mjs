import assert from "node:assert/strict";
import test from "node:test";
import { shouldLoadCodeContextForChatAnswer } from "../dist/application/services/HorusChatCodeContextPolicy.js";

test("HorusChatCodeContextPolicy avoids code lookup for exact terse replies", () => {
  assert.equal(
    shouldLoadCodeContextForChatAnswer("responda apenas: ok"),
    false
  );
  assert.equal(shouldLoadCodeContextForChatAnswer("oi"), false);
});

test("HorusChatCodeContextPolicy loads context for code and file questions", () => {
  assert.equal(
    shouldLoadCodeContextForChatAnswer("abra src/App.tsx e veja o erro"),
    true
  );
  assert.equal(
    shouldLoadCodeContextForChatAnswer("como está a implementação do botão?"),
    true
  );
});
