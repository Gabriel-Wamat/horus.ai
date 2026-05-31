import type { HorusChatOutcome, HorusChatSuggestedAction } from "@u-build/shared";
import {
  containsPhrase,
  findPreferredProjectFileCandidate,
  hasAnyWord,
  hasKnownFileExtension,
  trimAgenticToken,
  wordsOfAgenticText,
} from "./AgenticTextParsing.js";

const PREVIEW_START_WORDS = new Set([
  "rodar",
  "rode",
  "subir",
  "iniciar",
  "abra",
  "abrir",
]);
const PREVIEW_TARGET_WORDS = new Set(["preview", "projeto"]);

export function deriveHorusChatSuggestedActions(
  outcome: HorusChatOutcome
): HorusChatSuggestedAction[] {
  const actions: HorusChatSuggestedAction[] = [];
  if (outcome.suggestedActions?.length) {
    for (const action of outcome.suggestedActions) {
      addSuggestedAction(actions, action);
    }
  }

  const filePath = findSuggestedFilePath(outcome);
  if (filePath) {
    addSuggestedAction(actions, {
      type: "open_file",
      label: `abrir ${filePath}`,
      filePath,
    });
  }

  if (mentionsPreviewStart(outcome.summary)) {
    addSuggestedAction(actions, {
      type: "start_preview",
      label: "iniciar o preview registrado",
    });
  }

  return actions;
}

function findSuggestedFilePath(outcome: HorusChatOutcome): string | null {
  const sourcePath = outcome.evidenceSources?.find((source) => source.path)?.path;
  if (sourcePath) return normalizeSuggestedPath(sourcePath);
  const contextPath = outcome.contextSources?.find((source) =>
    hasKnownFileExtension(normalizeSuggestedPath(source))
  );
  if (contextPath) return normalizeSuggestedPath(contextPath);
  return findPreferredProjectFileCandidate(outcome.summary);
}

function normalizeSuggestedPath(path: string): string {
  return trimAgenticToken(path);
}

function mentionsPreviewStart(text: string): boolean {
  const words = wordsOfAgenticText(text);
  if (!hasAnyWord(words, PREVIEW_START_WORDS)) return false;
  return (
    hasAnyWord(words, PREVIEW_TARGET_WORDS) ||
    containsPhrase(words, ["servidor", "de", "desenvolvimento"])
  );
}

function addSuggestedAction(
  actions: HorusChatSuggestedAction[],
  action: HorusChatSuggestedAction
): void {
  if (
    actions.some(
      (item) =>
        item.type === action.type &&
        item.label === action.label &&
        item.filePath === action.filePath
    )
  ) {
    return;
  }
  actions.push(action);
}
