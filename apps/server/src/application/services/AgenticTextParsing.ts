const PROJECT_PATH_PREFIXES = [
  "src/",
  "app/",
  "apps/",
  "packages/",
  "components/",
  "pages/",
  "lib/",
];

const KNOWN_FILE_EXTENSIONS = [
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".css",
  ".json",
  ".html",
];

const TEXT_TOKEN_BOUNDARIES = new Set([
  " ",
  "\n",
  "\t",
  "\r",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "<",
  ">",
  ",",
  ";",
  ":",
  '"',
  "'",
  "`",
]);

const TOKEN_TRIM_CHARS = new Set([
  "`",
  '"',
  "'",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "<",
  ">",
  ",",
  ".",
  ";",
  ":",
  "!",
  "?",
]);

export function normalizeAgenticText(value: string): string {
  return collapseWhitespace(stripDiacritics(value.normalize("NFD")).toLowerCase());
}

export function wordsOfAgenticText(value: string): string[] {
  const normalized = normalizeAgenticText(value);
  if (!normalized) return [];
  return normalized.split(" ").map(trimAgenticToken).filter(Boolean);
}

export function collectProjectFileCandidates(text: string): string[] {
  const candidates: string[] = [];
  let token = "";
  const pushToken = () => {
    const normalized = trimAgenticToken(token);
    token = "";
    if (!normalized || !hasKnownFileExtension(normalized)) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  for (const char of text) {
    if (TEXT_TOKEN_BOUNDARIES.has(char)) {
      pushToken();
      continue;
    }
    token += char;
  }
  pushToken();
  return candidates;
}

export function findPreferredProjectFileCandidate(text: string): string | null {
  const candidates = collectProjectFileCandidates(text);
  const projectPath = candidates.find((candidate) => hasProjectPathPrefix(candidate));
  return projectPath ?? candidates[0] ?? null;
}

export function hasProjectPathPrefix(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return PROJECT_PATH_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function hasKnownFileExtension(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return KNOWN_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function startsWithWords(words: string[], expected: string[]): boolean {
  if (words.length < expected.length) return false;
  return expected.every((word, index) => words[index] === word);
}

export function containsPhrase(words: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || words.length < phrase.length) return false;
  for (let start = 0; start <= words.length - phrase.length; start += 1) {
    if (phrase.every((word, index) => words[start + index] === word)) {
      return true;
    }
  }
  return false;
}

export function hasAnyWord(words: string[], allowed: Set<string>): boolean {
  return words.some((word) => allowed.has(word));
}

export function hasBothWords(words: string[], first: string, second: string): boolean {
  return words.includes(first) && words.includes(second);
}

export function trimAgenticToken(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && TOKEN_TRIM_CHARS.has(value[start] ?? "")) start += 1;
  while (end > start && TOKEN_TRIM_CHARS.has(value[end - 1] ?? "")) end -= 1;
  return value.slice(start, end);
}

export function collapseWhitespace(value: string): string {
  let result = "";
  let previousWasWhitespace = false;
  for (const char of value) {
    if (isWhitespace(char)) {
      if (!previousWasWhitespace && result.length > 0) result += " ";
      previousWasWhitespace = true;
      continue;
    }
    result += char;
    previousWasWhitespace = false;
  }
  return result.trim();
}

function stripDiacritics(value: string): string {
  let result = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) continue;
    result += char;
  }
  return result;
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\t" || char === "\r";
}
