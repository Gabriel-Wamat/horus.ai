import assert from "node:assert/strict";
import test from "node:test";
import {
  collapseWhitespace,
  collectProjectFileCandidates,
  containsPhrase,
  findPreferredProjectFileCandidate,
  hasAnyWord,
  hasKnownFileExtension,
  hasProjectPathPrefix,
  normalizeAgenticText,
  trimAgenticToken,
  wordsOfAgenticText,
} from "../dist/application/services/AgenticTextParsing.js";

test("AgenticTextParsing normalizes human text without regex rules", () => {
  assert.equal(
    normalizeAgenticText("  AÇÃO   rápida\nno Código  "),
    "acao rapida no codigo"
  );
  assert.deepEqual(wordsOfAgenticText("Não funciona no CÓDIGO."), [
    "nao",
    "funciona",
    "no",
    "codigo",
  ]);
  assert.equal(collapseWhitespace(" a\n\t b   c "), "a b c");
});

test("AgenticTextParsing exposes word and phrase helpers for intent routing", () => {
  const words = wordsOfAgenticText("analise se o projeto não funciona");

  assert.equal(containsPhrase(words, ["nao", "funciona"]), true);
  assert.equal(hasAnyWord(words, new Set(["projeto"])), true);
  assert.equal(hasAnyWord(words, new Set(["preview"])), false);
});

test("AgenticTextParsing collects project file candidates while preserving path case", () => {
  assert.deepEqual(
    collectProjectFileCandidates(
      'Abra `src/App.tsx`; depois veja components/UserMenu.test.ts.'
    ),
    ["src/App.tsx", "components/UserMenu.test.ts"]
  );
  assert.equal(trimAgenticToken('"`src/App.tsx";'), "src/App.tsx");
  assert.equal(
    findPreferredProjectFileCandidate("Veja App.tsx e depois src/App.tsx."),
    "src/App.tsx"
  );
  assert.equal(
    findPreferredProjectFileCandidate("Veja apenas App.tsx."),
    "App.tsx"
  );
  assert.equal(hasProjectPathPrefix("src/App.tsx"), true);
  assert.equal(hasProjectPathPrefix("App.tsx"), false);
  assert.equal(hasKnownFileExtension("components/UserMenu.test.ts"), true);
});
