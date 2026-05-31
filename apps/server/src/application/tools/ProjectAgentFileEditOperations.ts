export function sliceFileContentByLineRange(
  content: string | null,
  input: {
    startLine?: number | undefined;
    endLine?: number | undefined;
  }
): {
  content: string | null;
  startLine?: number | undefined;
  endLine?: number | undefined;
  lineCount?: number | undefined;
} {
  if (content === null || (input.startLine === undefined && input.endLine === undefined)) {
    return { content };
  }

  const lines = content.split("\n");
  const lineCount = lines.length;
  const startLine = Math.min(Math.max(input.startLine ?? 1, 1), Math.max(lineCount, 1));
  const endLine = Math.min(
    Math.max(input.endLine ?? startLine + 120, startLine),
    lineCount
  );

  return {
    content: lines.slice(startLine - 1, endLine).join("\n"),
    startLine,
    endLine,
    lineCount,
  };
}

export function applyExactIncrementalEdit(input: {
  path: string;
  currentContent: string;
  oldString: string;
  newString: string;
  replaceAll: boolean;
}): { nextContent: string; replacementCount: number } {
  const lineEnding = detectLineEnding(input.currentContent);
  const normalizedCurrent = normalizeLineEndings(input.currentContent);
  const normalizedOld = normalizeLineEndings(input.oldString);
  const normalizedNew = normalizeLineEndings(input.newString);

  if (normalizedOld === normalizedNew) {
    return {
      nextContent: input.currentContent,
      replacementCount: 0,
    };
  }

  const replacementCount = countOccurrences(normalizedCurrent, normalizedOld);
  if (replacementCount === 0) {
    throw new Error(`edit_file no_match for ${input.path}: oldString was not found.`);
  }
  if (replacementCount > 1 && !input.replaceAll) {
    throw new Error(
      `edit_file ambiguous_match for ${input.path}: oldString matched ${replacementCount} times. Set replaceAll=true only when every match should change.`
    );
  }

  const normalizedNext = input.replaceAll
    ? normalizedCurrent.split(normalizedOld).join(normalizedNew)
    : normalizedCurrent.replace(normalizedOld, normalizedNew);

  return {
    nextContent: convertToLineEnding(normalizedNext, lineEnding),
    replacementCount: input.replaceAll ? replacementCount : 1,
  };
}

export function applyLineRangeReplacement(input: {
  path: string;
  currentContent: string;
  startLine: number;
  endLine: number;
  replacement: string;
}): { nextContent: string } {
  const lineEnding = detectLineEnding(input.currentContent);
  const normalizedCurrent = normalizeLineEndings(input.currentContent);
  const normalizedReplacement = normalizeLineEndings(input.replacement);
  const lines = normalizedCurrent.split("\n");
  const lineCount = lines.length;
  if (input.startLine > input.endLine) {
    throw new Error(
      `replace_file_range invalid_range for ${input.path}: startLine > endLine.`
    );
  }
  if (input.startLine > lineCount) {
    throw new Error(
      `replace_file_range invalid_range for ${input.path}: startLine exceeds line count ${lineCount}.`
    );
  }

  const startIndex = input.startLine - 1;
  const endIndex = Math.min(input.endLine, lineCount);
  const replacementLines =
    normalizedReplacement.length === 0 ? [] : normalizedReplacement.split("\n");
  const nextLines = [
    ...lines.slice(0, startIndex),
    ...replacementLines,
    ...lines.slice(endIndex),
  ];

  return {
    nextContent: convertToLineEnding(nextLines.join("\n"), lineEnding),
  };
}

export function buildMinimalLineRangeReplacement(input: {
  currentContent: string;
  nextContent: string;
}): {
  startLine: number;
  endLine: number;
  replacement: string;
  removedLineCount: number;
  addedLineCount: number;
} | null {
  const normalizedCurrent = normalizeLineEndings(input.currentContent);
  const normalizedNext = normalizeLineEndings(input.nextContent);
  if (normalizedCurrent === normalizedNext) return null;

  const currentLines = normalizedCurrent.split("\n");
  const nextLines = normalizedNext.split("\n");
  let prefixLength = 0;
  const sharedLength = Math.min(currentLines.length, nextLines.length);
  while (
    prefixLength < sharedLength &&
    currentLines[prefixLength] === nextLines[prefixLength]
  ) {
    prefixLength += 1;
  }

  let currentSuffixIndex = currentLines.length - 1;
  let nextSuffixIndex = nextLines.length - 1;
  while (
    currentSuffixIndex >= prefixLength &&
    nextSuffixIndex >= prefixLength &&
    currentLines[currentSuffixIndex] === nextLines[nextSuffixIndex]
  ) {
    currentSuffixIndex -= 1;
    nextSuffixIndex -= 1;
  }

  if (currentSuffixIndex < prefixLength) {
    const insertedLines = nextLines.slice(prefixLength, nextSuffixIndex + 1);
    const anchorIndex =
      prefixLength > 0 ? prefixLength - 1 : Math.min(prefixLength, currentLines.length - 1);
    const replacementLines =
      prefixLength > 0
        ? [currentLines[anchorIndex] ?? "", ...insertedLines]
        : [...insertedLines, currentLines[anchorIndex] ?? ""];
    return {
      startLine: anchorIndex + 1,
      endLine: anchorIndex + 1,
      replacement: replacementLines.join("\n"),
      removedLineCount: 1,
      addedLineCount: replacementLines.length,
    };
  }

  const replacementLines = nextLines.slice(prefixLength, nextSuffixIndex + 1);
  return {
    startLine: prefixLength + 1,
    endLine: currentSuffixIndex + 1,
    replacement: replacementLines.join("\n"),
    removedLineCount: currentSuffixIndex - prefixLength + 1,
    addedLineCount: replacementLines.length,
  };
}

function normalizeLineEndings(content: string): string {
  let normalized = "";
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index] ?? "";
    if (char === "\r") {
      if (content[index + 1] === "\n") index += 1;
      normalized += "\n";
      continue;
    }
    normalized += char;
  }
  return normalized;
}

function detectLineEnding(content: string): "\n" | "\r\n" {
  let crlf = 0;
  let lf = 0;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index] ?? "";
    if (char === "\r" && content[index + 1] === "\n") {
      crlf += 1;
      index += 1;
      continue;
    }
    if (char === "\n") lf += 1;
  }
  return crlf > lf ? "\r\n" : "\n";
}

function convertToLineEnding(
  normalizedContent: string,
  lineEnding: "\n" | "\r\n"
): string {
  if (lineEnding === "\n") return normalizedContent;
  return normalizedContent.split("\n").join("\r\n");
}

function countOccurrences(content: string, search: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = content.indexOf(search, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + search.length;
  }
}
