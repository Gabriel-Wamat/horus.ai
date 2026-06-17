const MAX_TAIL_LENGTH = 2_000;
const SECRET_VALUE_PATTERN =
  /((?:api[_-]?key|token|secret|password|passwd|authorization)\s*[=:]\s*)(["']?)[^\s"'&]+/gi;

export interface PreviewRuntimeEvidenceInput {
  commandId?: unknown;
  executable?: unknown;
  args?: unknown;
  cwd?: unknown;
  processId?: unknown;
  stdoutTail?: unknown;
  stderrTail?: unknown;
  exitCode?: unknown;
  signal?: unknown;
  durationMs?: unknown;
  previewUrl?: unknown;
  reason?: unknown;
  timeoutMs?: unknown;
  dependencyBootstrap?: unknown;
}

export interface PreviewDependencyBootstrapEvidence {
  commandId: string | null;
  executable: string | null;
  args: string[];
  cwd: string | null;
  stdoutTail: string;
  stderrTail: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number | null;
  reason: string | null;
}

export interface PreviewRuntimeEvidence {
  commandId: string | null;
  executable: string | null;
  args: string[];
  cwd: string | null;
  processId: number | null;
  stdoutTail: string;
  stderrTail: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number | null;
  previewUrl: string | null;
  reason: string | null;
  timeoutMs: number | null;
  dependencyBootstrap: PreviewDependencyBootstrapEvidence | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeText(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const redacted = value.replace(SECRET_VALUE_PATTERN, "$1$2[redacted]");
  return redacted.length <= MAX_TAIL_LENGTH
    ? redacted
    : redacted.slice(redacted.length - MAX_TAIL_LENGTH);
}

function sanitizeArgs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((arg) => sanitizeText(String(arg))).slice(0, 48);
}

function sanitizeDependencyBootstrap(
  value: unknown
): PreviewDependencyBootstrapEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    commandId: asString(record["commandId"]),
    executable: asString(record["executable"]),
    args: sanitizeArgs(record["args"]),
    cwd: asString(record["cwd"]),
    stdoutTail: sanitizeText(record["stdoutTail"]),
    stderrTail: sanitizeText(record["stderrTail"]),
    exitCode: asNumber(record["exitCode"]),
    signal: asString(record["signal"]),
    durationMs: asNumber(record["durationMs"]),
    reason: asString(record["reason"]),
  };
}

export function buildPreviewRuntimeEvidence(
  input: PreviewRuntimeEvidenceInput = {}
): PreviewRuntimeEvidence {
  return {
    commandId: asString(input.commandId),
    executable: asString(input.executable),
    args: sanitizeArgs(input.args),
    cwd: asString(input.cwd),
    processId: asNumber(input.processId),
    stdoutTail: sanitizeText(input.stdoutTail),
    stderrTail: sanitizeText(input.stderrTail),
    exitCode: asNumber(input.exitCode),
    signal: asString(input.signal),
    durationMs: asNumber(input.durationMs),
    previewUrl: asString(input.previewUrl),
    reason: asString(input.reason),
    timeoutMs: asNumber(input.timeoutMs),
    dependencyBootstrap: sanitizeDependencyBootstrap(input.dependencyBootstrap),
  };
}
