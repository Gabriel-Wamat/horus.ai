import { createBundledHighlighter } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";

const createProjectFilesHighlighter = createBundledHighlighter({
  langs: {
    css: () => import("@shikijs/langs/css"),
    html: () => import("@shikijs/langs/html"),
    javascript: () => import("@shikijs/langs/javascript"),
    json: () => import("@shikijs/langs/json"),
    jsx: () => import("@shikijs/langs/jsx"),
    markdown: () => import("@shikijs/langs/markdown"),
    python: () => import("@shikijs/langs/python"),
    shellscript: () => import("@shikijs/langs/shellscript"),
    tsx: () => import("@shikijs/langs/tsx"),
    typescript: () => import("@shikijs/langs/typescript"),
    yaml: () => import("@shikijs/langs/yaml"),
  },
  themes: {
    "github-dark-default": () => import("@shikijs/themes/github-dark-default"),
  },
  engine: () => createJavaScriptRegexEngine(),
});

const SUPPORTED_LANGUAGES = new Set([
  "css",
  "html",
  "javascript",
  "json",
  "jsx",
  "markdown",
  "python",
  "shellscript",
  "tsx",
  "typescript",
  "yaml",
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "shellscript",
  cjs: "javascript",
  htm: "html",
  js: "javascript",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  sh: "shellscript",
  shell: "shellscript",
  ts: "typescript",
  yml: "yaml",
  zsh: "shellscript",
};

export function normalizeProjectFileLanguage(language: string, path: string): string {
  const raw = language.toLowerCase();
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  const candidate =
    raw && raw !== "text" && raw !== "plaintext"
      ? LANGUAGE_ALIASES[raw] ?? raw
      : LANGUAGE_ALIASES[extension] ?? extension;
  return SUPPORTED_LANGUAGES.has(candidate) ? candidate : "text";
}

export async function highlightProjectFileCode(input: {
  code: string;
  language: string;
  path: string;
}): Promise<string> {
  const lang = normalizeProjectFileLanguage(input.language, input.path);
  if (lang === "text") {
    throw new Error("Linguagem sem gramática de highlight configurada.");
  }

  const highlighter = await createProjectFilesHighlighter({
    langs: [lang],
    themes: ["github-dark-default"],
  });
  return highlighter.codeToHtml(input.code, {
    lang,
    theme: "github-dark-default",
  });
}
