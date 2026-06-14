// On Windows, CLI tools installed via npm (npm, npx, pnpm, yarn, tsc, vite, …)
// are batch scripts (.cmd) that cannot be spawned without shell:true or the .cmd suffix.
// This set covers the most common cases; add more as needed.
const WINDOWS_CMD_TOOLS = new Set([
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "tsc",
  "vite",
  "turbo",
  "eslint",
  "prettier",
  "node-gyp",
  "bun",
]);

export function resolveWindowsExecutable(executable: string): string {
  if (process.platform !== "win32") return executable;
  if (
    executable.includes("/") ||
    executable.includes("\\") ||
    /\.(cmd|exe|bat|ps1)$/iu.test(executable)
  )
    return executable;
  return WINDOWS_CMD_TOOLS.has(executable) ? `${executable}.cmd` : executable;
}

export const DEFAULT_INHERITED_CHILD_ENV_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SHELL",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "TERM",
  "SystemRoot",
  "ComSpec",
  "USERPROFILE",
  "LOCALAPPDATA",
  "APPDATA",
  "PNPM_HOME",
] as const;

export function buildAllowlistedChildEnv(
  explicitEnv: Record<string, string> = {},
  inheritedEnvKeys: readonly string[] = DEFAULT_INHERITED_CHILD_ENV_KEYS
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of inheritedEnvKeys) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...explicitEnv };
}
