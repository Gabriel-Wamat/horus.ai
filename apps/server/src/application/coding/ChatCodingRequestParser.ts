import type { AstSymbolKind } from "@u-build/shared";
import {
  containsPhrase,
  hasAnyWord,
  normalizeAgenticText,
  trimAgenticToken,
  wordsOfAgenticText,
} from "../services/AgenticTextParsing.js";

export interface ChatCodeBlock {
  readonly language: string | null;
  readonly code: string;
}

const REPLACE_WORDS = new Set([
  "ajuste",
  "altere",
  "alterar",
  "atualize",
  "atualizar",
  "corrija",
  "corrigir",
  "troque",
  "trocar",
  "substitua",
  "substituir",
  "replace",
  "update",
  "fix",
  "change",
]);

const INSERT_WORDS = new Set([
  "adicione",
  "adicionar",
  "inclua",
  "incluir",
  "insira",
  "inserir",
  "create",
  "crie",
  "add",
  "insert",
]);

const DELETE_WORDS = new Set([
  "remova",
  "remover",
  "delete",
  "deletar",
  "apague",
  "apagar",
]);

const RENAME_WORDS = new Set([
  "renomeie",
  "renomear",
  "rename",
]);

const NON_CODE_BLOCK_LANGUAGES = new Set([
  "json",
  "jsonc",
  "md",
  "markdown",
]);

const CODE_KEYWORDS = new Set([
  "export",
  "function",
  "class",
  "interface",
  "type",
  "const",
  "let",
  "var",
  "return",
  "import",
]);

const SYMBOL_HINT_WORDS = new Set([
  "componente",
  "component",
  "funcao",
  "function",
  "classe",
  "class",
  "simbolo",
  "interface",
  "type",
  "tipo",
]);

export function extractChatCodeBlocks(message: string): ChatCodeBlock[] {
  const blocks: ChatCodeBlock[] = [];
  const lines = message.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.startsWith("```")) {
      index += 1;
      continue;
    }

    const language = readFenceLanguage(line);
    const codeLines: string[] = [];
    let closed = false;
    index += 1;

    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.startsWith("```")) {
        closed = true;
        index += 1;
        break;
      }
      codeLines.push(current);
      index += 1;
    }

    if (closed) {
      blocks.push({
        language,
        code: codeLines.join("\n"),
      });
    }
  }

  return blocks;
}

export function hasRenameRequest(message: string): boolean {
  const words = wordsOfAgenticText(message);
  return (
    hasAnyWord(words, RENAME_WORDS) ||
    containsPhrase(words, ["mude", "o", "nome"]) ||
    containsPhrase(words, ["mudar", "o", "nome"])
  );
}

export function isLikelyCodeBlock(language: string | null, code: string): boolean {
  if (language && NON_CODE_BLOCK_LANGUAGES.has(language.toLowerCase())) {
    return false;
  }
  const tokens = readCodeTokens(code).map((token) => normalizeAgenticText(token));
  return tokens.some((token) => CODE_KEYWORDS.has(token));
}

export function inferOperationKind(
  message: string,
  hasSymbol: boolean
): "replace" | "insert" | "delete" {
  const words = wordsOfAgenticText(message);
  const shouldInsert = hasAnyWord(words, INSERT_WORDS);
  const shouldReplace = hasAnyWord(words, REPLACE_WORDS);
  if (hasAnyWord(words, DELETE_WORDS)) return "delete";
  if (shouldInsert && !shouldReplace && !hasSymbol) return "insert";
  return "replace";
}

export function inferSymbolFromContent(
  content: string
): { name: string; kind: AstSymbolKind } | null {
  const tokens = readCodeTokens(content);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (!token || !next) continue;

    if (token === "function" && isIdentifierName(next)) {
      return {
        name: next,
        kind: startsWithUppercaseAscii(next) ? "component" : "function",
      };
    }
    if (token === "class" && isIdentifierName(next)) {
      return { name: next, kind: "class" };
    }
    if (
      (token === "const" || token === "let" || token === "var") &&
      isIdentifierName(next) &&
      tokens[index + 2] === "="
    ) {
      return {
        name: next,
        kind: startsWithUppercaseAscii(next) ? "component" : "variable",
      };
    }
    if (token === "interface" && isIdentifierName(next)) {
      return { name: next, kind: "interface" };
    }
    if (token === "type" && isIdentifierName(next)) {
      return { name: next, kind: "type" };
    }
  }
  return null;
}

export function inferSymbolNameFromMessage(message: string): string | undefined {
  const tokens = readTextTokens(message);
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const normalized = normalizeAgenticText(tokens[index] ?? "");
    const candidate = tokens[index + 1];
    if (
      SYMBOL_HINT_WORDS.has(normalized) &&
      candidate &&
      isIdentifierName(candidate)
    ) {
      return candidate;
    }
  }
  return undefined;
}

function readFenceLanguage(line: string): string | null {
  const raw = line.slice(3).trim();
  if (!raw) return null;
  let language = "";
  for (const char of raw) {
    if (isWhitespace(char)) break;
    if (!isLanguageNameChar(char)) break;
    language += char;
  }
  return language || null;
}

function readCodeTokens(value: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < value.length) {
    const char = value[index] ?? "";
    if (isIdentifierStart(char)) {
      let token = char;
      index += 1;
      while (index < value.length && isIdentifierPart(value[index] ?? "")) {
        token += value[index];
        index += 1;
      }
      tokens.push(token);
      continue;
    }
    if (char === "=") {
      tokens.push(char);
    }
    index += 1;
  }
  return tokens;
}

function readTextTokens(value: string): string[] {
  const tokens: string[] = [];
  let token = "";
  const pushToken = () => {
    const normalized = trimAgenticToken(token);
    token = "";
    if (normalized) tokens.push(normalized);
  };

  for (const char of value) {
    if (isTextTokenBoundary(char)) {
      pushToken();
      continue;
    }
    token += char;
  }
  pushToken();
  return tokens;
}

function isTextTokenBoundary(char: string): boolean {
  return (
    isWhitespace(char) ||
    char === "." ||
    char === "," ||
    char === ";" ||
    char === ":" ||
    char === "(" ||
    char === ")" ||
    char === "[" ||
    char === "]" ||
    char === "{" ||
    char === "}" ||
    char === "<" ||
    char === ">" ||
    char === "/" ||
    char === "\\" ||
    char === "`" ||
    char === '"' ||
    char === "'"
  );
}

function isLanguageNameChar(char: string): boolean {
  return isAsciiLetter(char) || isDigit(char) || char === "_" || char === "-";
}

function isIdentifierName(value: string): boolean {
  if (!isIdentifierStart(value[0] ?? "")) return false;
  for (let index = 1; index < value.length; index += 1) {
    if (!isIdentifierPart(value[index] ?? "")) return false;
  }
  return true;
}

function isIdentifierStart(char: string): boolean {
  return isAsciiLetter(char) || char === "_" || char === "$";
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char);
}

function startsWithUppercaseAscii(value: string): boolean {
  const first = value[0] ?? "";
  return first >= "A" && first <= "Z";
}

function isAsciiLetter(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\t" || char === "\r";
}
