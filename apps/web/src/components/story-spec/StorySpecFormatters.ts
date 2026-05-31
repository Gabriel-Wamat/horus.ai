import type { Spec, UserStory, WorkflowState, WorkspaceFolder } from "@u-build/shared";

export type DetailTab = "story" | "spec";
export type SpecMode = "view" | "edit";

export interface PendingSpec {
  userStoryId: string;
  spec: Spec;
}

export interface WorkspaceFolderArtifacts {
  userStories: UserStory[];
  specsByStoryId: Record<string, Spec>;
}

export const PRIORITY_LABELS: Record<UserStory["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export function createStorySlug(story: UserStory, index: number): string {
  const base = toSlug(story.title).slice(0, 34);
  return `US-${String(index + 1).padStart(2, "0")}-${base || story.id.slice(0, 8)}.md`;
}

export function createDomId(value: string): string {
  let result = "";
  for (const char of value) {
    result += isDomIdChar(char) ? char : "-";
  }
  return result;
}

export function getSpecMap(
  workflowState: WorkflowState | null,
  pendingSpec: PendingSpec | null,
  persistedSpecsByStoryId: Record<string, Spec>
): Record<string, Spec> {
  return {
    ...persistedSpecsByStoryId,
    ...(workflowState?.specs ?? {}),
    ...(pendingSpec ? { [pendingSpec.userStoryId]: pendingSpec.spec } : {}),
  };
}

export function formatFolderA11yLabel({
  folder,
  expanded,
  storyCount,
  specCount,
  pendingCount,
  loaded,
  loading,
}: {
  folder: WorkspaceFolder;
  expanded: boolean;
  storyCount: number;
  specCount: number;
  pendingCount: number;
  loaded: boolean;
  loading: boolean;
}): string {
  const base = `Pasta ${folder.name}, ${storyCount} ${
    storyCount === 1 ? "história" : "histórias"
  }`;

  if (!expanded) {
    return `${base}. ${storyCount === 0 ? "Vazia" : "Recolhida"}.`;
  }

  if (loading && !loaded) {
    return `${base}. Expandida e carregando conteúdo.`;
  }

  if (!loaded) {
    return `${base}. Expandida, conteúdo ainda não carregado.`;
  }

  return `${base}, ${specCount} ${specCount === 1 ? "spec pronta" : "specs prontas"}, ${pendingCount} ${
    pendingCount === 1 ? "pendente" : "pendentes"
  }. Expandida.`;
}

export function formatStoryA11yLabel({
  story,
  index,
  total,
  slug,
  status,
  selected,
}: {
  story: UserStory;
  index: number;
  total: number;
  slug: string;
  status: string;
  selected: boolean;
}): string {
  return `User story ${index + 1} de ${total}: ${story.title}. Arquivo ${slug}. Status: ${status}.${
    selected ? " Selecionada." : ""
  }`;
}

export function getStoryStatus(
  story: UserStory,
  index: number,
  workflowState: WorkflowState | null,
  pendingSpec: PendingSpec | null,
  hasSpec: boolean
): { label: string; tone: "neutral" | "active" | "done" | "warn" | "danger" } {
  if (pendingSpec?.userStoryId === story.id) {
    return { label: "revisão", tone: "warn" };
  }

  if (!workflowState) {
    return hasSpec
      ? { label: "ok", tone: "done" }
      : { label: "rascunho", tone: "neutral" };
  }

  if (workflowState.status === "idle") {
    return hasSpec
      ? { label: "ok", tone: "done" }
      : { label: "rascunho", tone: "neutral" };
  }

  if (workflowState.status === "cancelled") {
    return { label: "off", tone: "danger" };
  }

  if (workflowState.status === "error") {
    return { label: "erro", tone: "danger" };
  }

  if (workflowState.status === "completed") {
    return { label: "feito", tone: "done" };
  }

  if (index < workflowState.currentUSIndex) {
    return { label: "feito", tone: "done" };
  }

  if (index === workflowState.currentUSIndex) {
    return workflowState.status === "awaiting_human"
      ? { label: "revisão", tone: "warn" }
      : { label: "gerando", tone: "active" };
  }

  return { label: "fila", tone: "neutral" };
}

function toSlug(value: string): string {
  const normalized = value.toLowerCase().normalize("NFD");
  let slug = "";
  let needsSeparator = false;

  for (const char of normalized) {
    if (isCombiningMark(char)) continue;
    if (isAsciiLowerAlpha(char) || isDigit(char)) {
      if (needsSeparator && slug.length > 0) slug += "-";
      slug += char;
      needsSeparator = false;
      continue;
    }
    needsSeparator = slug.length > 0;
  }

  return slug;
}

function isDomIdChar(char: string): boolean {
  return (
    isAsciiUpperAlpha(char) ||
    isAsciiLowerAlpha(char) ||
    isDigit(char) ||
    char === "_" ||
    char === "-"
  );
}

function isCombiningMark(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x0300 && code <= 0x036f;
}

function isAsciiUpperAlpha(char: string): boolean {
  return char >= "A" && char <= "Z";
}

function isAsciiLowerAlpha(char: string): boolean {
  return char >= "a" && char <= "z";
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}
