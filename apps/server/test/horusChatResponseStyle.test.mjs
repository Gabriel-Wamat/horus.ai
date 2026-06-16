import assert from "node:assert/strict";
import test from "node:test";
import {
  HORUS_CHAT_RESPONSE_STYLE_PROMPT,
  polishHorusChatAssistantText,
  streamPolishedHorusChatText,
} from "../dist/application/services/HorusChatResponseStyle.js";

test("Horus chat response style sets a product-grade conversation contract", () => {
  assert.equal(
    HORUS_CHAT_RESPONSE_STYLE_PROMPT.includes("comece pelo ponto principal"),
    true
  );
  assert.equal(
    HORUS_CHAT_RESPONSE_STYLE_PROMPT.includes("validação"),
    true
  );
  assert.equal(
    HORUS_CHAT_RESPONSE_STYLE_PROMPT.includes("arquivos tocados"),
    true
  );
  assert.equal(
    HORUS_CHAT_RESPONSE_STYLE_PROMPT.includes("não termine com convite genérico"),
    true
  );
  assert.equal(
    HORUS_CHAT_RESPONSE_STYLE_PROMPT.includes("nunca invente arquivos alterados"),
    true
  );
  assert.equal(
    HORUS_CHAT_RESPONSE_STYLE_PROMPT.includes("respeite limites explícitos"),
    true
  );
});

test("Horus chat response polish removes generic trailing assistant invites", () => {
  assert.equal(
    polishHorusChatAssistantText(
      "Ajustei o contrato textual do chat.\n\nSe quiser, posso ajudar no próximo passo."
    ),
    "Ajustei o contrato textual do chat."
  );
  assert.equal(
    polishHorusChatAssistantText("Encontrei o problema em src/App.tsx."),
    "Encontrei o problema em src/App.tsx."
  );
});

test("Horus chat stream polish keeps live chunks but cleans the final tail", async () => {
  const chunks = [
    "Ajustei a conversa do chat",
    " e validei o build.",
    "\n\nSe quiser, posso ajudar",
    " no próximo passo.",
  ];
  const streamed = [];

  for await (const chunk of streamPolishedHorusChatText(toAsync(chunks))) {
    streamed.push(chunk);
  }

  assert.equal(
    streamed.join(""),
    "Ajustei a conversa do chat e validei o build."
  );
  assert.equal(streamed.length > 1, true);
});

async function* toAsync(values) {
  for (const value of values) {
    yield value;
  }
}
