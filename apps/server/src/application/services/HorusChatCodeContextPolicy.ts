import {
  hasAnyWord,
  hasKnownFileExtension,
  normalizeAgenticText,
  wordsOfAgenticText,
} from "./AgenticTextParsing.js";

const EXACT_RESPONSE_WORDS = new Set(["responda", "diga", "retorne", "escreva"]);
const EXACT_ONLY_WORDS = new Set(["apenas", "exatamente", "somente"]);
const GREETING_WORDS = new Set([
  "oi",
  "ola",
  "bom",
  "boa",
  "dia",
  "tarde",
  "noite",
  "hello",
  "hi",
]);
const CODE_CONTEXT_WORDS = new Set([
  "codigo",
  "code",
  "arquivo",
  "file",
  "funcao",
  "function",
  "classe",
  "component",
  "componente",
  "tsx",
  "jsx",
  "ts",
  "js",
  "css",
  "html",
  "json",
  "bug",
  "erro",
  "stack",
  "contrato",
  "schema",
  "api",
  "endpoint",
  "estado",
  "state",
  "spec",
  "contexto",
  "implementacao",
  "botao",
  "layout",
  "tela",
  "preview",
  "projeto",
]);
const CODE_CONTEXT_SUBSTRINGS = ["src/", "app.", "user story"];

export function shouldLoadCodeContextForChatAnswer(message: string): boolean {
  const normalized = normalizeAgenticText(message);
  const words = wordsOfAgenticText(normalized);

  if (
    hasAnyWord(words, EXACT_RESPONSE_WORDS) &&
    hasAnyWord(words, EXACT_ONLY_WORDS)
  ) {
    return false;
  }

  if (isGreetingOnly(words)) {
    return false;
  }

  return (
    hasAnyWord(words, CODE_CONTEXT_WORDS) ||
    words.some((word) => hasKnownFileExtension(word)) ||
    CODE_CONTEXT_SUBSTRINGS.some((fragment) => normalized.includes(fragment))
  );
}

function isGreetingOnly(words: string[]): boolean {
  return words.length > 0 && words.every((word) => GREETING_WORDS.has(word));
}
