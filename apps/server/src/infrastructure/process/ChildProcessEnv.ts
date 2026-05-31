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
