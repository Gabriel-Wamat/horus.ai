const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  css: "css",
  env: "ini",
  gitignore: "plaintext",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  lock: "plaintext",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  sh: "shell",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  yaml: "yaml",
  yml: "yaml",
};

const BACKEND_LANGUAGE_MAP: Record<string, string> = {
  bash: "shell",
  dockerfile: "dockerfile",
  html: "html",
  javascript: "javascript",
  json: "json",
  markdown: "markdown",
  plaintext: "plaintext",
  python: "python",
  shell: "shell",
  text: "plaintext",
  typescript: "typescript",
  yaml: "yaml",
};

function extensionForPath(path: string): string | null {
  const filename = path.split("/").pop() ?? path;
  if (filename === ".env" || filename.endsWith(".env")) return "env";
  if (filename === ".gitignore") return "gitignore";
  const extension = filename.includes(".") ? filename.split(".").pop() : null;
  return extension?.toLowerCase() ?? null;
}

export function toMonacoLanguage(language: string | null | undefined, path: string): string {
  const normalizedLanguage = language?.trim().toLowerCase();
  if (normalizedLanguage && BACKEND_LANGUAGE_MAP[normalizedLanguage]) {
    return BACKEND_LANGUAGE_MAP[normalizedLanguage];
  }

  const extension = extensionForPath(path);
  if (extension && EXTENSION_LANGUAGE_MAP[extension]) {
    return EXTENSION_LANGUAGE_MAP[extension];
  }

  return "plaintext";
}
