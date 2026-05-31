import type {
  CodingValidationCommandEvidence,
  CodingValidationCommandKind,
  ProjectContextRuntimeHint,
  RuntimeValidationCommandEvidence,
  RuntimeValidationEvidence,
} from "@u-build/shared";

// Translates the various validation/preview evidence shapes Horus produces
// across the workflow into ProjectContextRuntimeHint[], the canonical
// "runtime feedback" payload the ProjectContextEngine carries forward into the
// next turn's snapshot. Pure function service — no IO, easy to unit test.
//
// This is the resilience seam: each new turn the agent can look at the
// previous run's failures (build error, type error, preview console error,
// network error) without re-deriving them from raw evidence blobs.

const MAX_OUTPUT_LENGTH = 600;
const DEFAULT_LIMIT = 24;

export interface CollectRuntimeHintsInput {
  readonly runtimeValidation?: RuntimeValidationEvidence | undefined;
  readonly codingValidationCommands?: readonly CodingValidationCommandEvidence[] | undefined;
  readonly previewErrors?:
    | readonly {
        message: string;
        url?: string | null;
        observedAt?: string | null;
      }[]
    | undefined;
  readonly limit?: number | undefined;
  readonly now?: (() => Date) | undefined;
}

export class RuntimeHintCollector {
  collect(input: CollectRuntimeHintsInput): ProjectContextRuntimeHint[] {
    const limit = clampPositive(input.limit ?? DEFAULT_LIMIT, 1, 128);
    const now = input.now ?? (() => new Date());

    const hints: ProjectContextRuntimeHint[] = [];

    if (input.runtimeValidation) {
      for (const command of input.runtimeValidation.commands) {
        const hint = fromRuntimeCommand(command, now);
        if (hint) hints.push(hint);
      }
      const previewHint = fromPreviewEvidence(input.runtimeValidation, now);
      if (previewHint) hints.push(previewHint);
    }

    if (input.codingValidationCommands) {
      for (const command of input.codingValidationCommands) {
        const hint = fromCodingCommand(command, now);
        if (hint) hints.push(hint);
      }
    }

    if (input.previewErrors) {
      for (const error of input.previewErrors) {
        if (!error.message?.trim()) continue;
        hints.push({
          kind: "preview_error",
          source: "preview_runtime",
          message: clip(error.message),
          ...(error.url ? { path: error.url } : {}),
          observedAt: error.observedAt ?? now().toISOString(),
        });
      }
    }

    return dedupeAndCap(hints, limit);
  }
}

function fromRuntimeCommand(
  command: RuntimeValidationCommandEvidence,
  now: () => Date
): ProjectContextRuntimeHint | null {
  if (command.exitCode === 0 || command.exitCode === null) {
    // Skipped / not-yet-run; only failed commands are hints.
    if (command.exitCode === null && !command.stderrTail?.trim()) return null;
    if (command.exitCode === 0) return null;
  }
  const message = clip(
    command.stderrTail?.trim() || command.stdoutTail?.trim() || command.command
  );
  if (!message) return null;
  return {
    kind: classifyValidationCommand(command.command),
    source: `validation:${command.commandId}`,
    message,
    observedAt: now().toISOString(),
  };
}

function fromCodingCommand(
  command: CodingValidationCommandEvidence,
  now: () => Date
): ProjectContextRuntimeHint | null {
  if (command.status === "passed" || command.status === "skipped") {
    return null;
  }
  const message = clip(
    command.errorMessage?.trim() ||
      command.stderrTail?.trim() ||
      command.stdoutTail?.trim() ||
      command.command
  );
  if (!message) return null;
  return {
    kind: mapCodingKind(command.kind),
    source: `coding_validation:${command.commandId}`,
    message,
    observedAt: command.finishedAt ?? now().toISOString(),
  };
}

function fromPreviewEvidence(
  evidence: RuntimeValidationEvidence,
  now: () => Date
): ProjectContextRuntimeHint | null {
  if (evidence.preview.status !== "failed") return null;
  const detail = evidence.preview.evidence;
  const message = clip(
    [evidence.preview.message, detail?.bodySnippet ?? ""]
      .filter((part) => part.trim().length > 0)
      .join(" — ")
  );
  if (!message) return null;
  return {
    kind: "preview_error",
    source: "runtime_validation:preview",
    message,
    ...(evidence.preview.url ? { path: evidence.preview.url } : {}),
    observedAt: evidence.createdAt ?? now().toISOString(),
  };
}

function classifyValidationCommand(command: string): ProjectContextRuntimeHint["kind"] {
  const lower = command.toLowerCase();
  if (/(tsc|typecheck|type-check)/.test(lower)) return "type_error";
  if (/(eslint|lint)/.test(lower)) return "lint_error";
  if (/(vitest|jest|playwright|node --test|node:test|test)/.test(lower)) return "test_failure";
  if (/(vite|next|build|compile|webpack|rollup|esbuild)/.test(lower)) return "build_error";
  return "other";
}

function mapCodingKind(
  kind: CodingValidationCommandKind
): ProjectContextRuntimeHint["kind"] {
  switch (kind) {
    case "type_check":
      return "type_error";
    case "lint":
      return "lint_error";
    case "test":
      return "test_failure";
    case "build":
      return "build_error";
    case "ast":
    case "static_gate":
    case "check":
      return "other";
    case "unknown":
    default:
      return "other";
  }
}

function clip(value: string | undefined | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= MAX_OUTPUT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_OUTPUT_LENGTH - 3)}...`;
}

function dedupeAndCap(
  hints: readonly ProjectContextRuntimeHint[],
  limit: number
): ProjectContextRuntimeHint[] {
  const seen = new Set<string>();
  const output: ProjectContextRuntimeHint[] = [];
  for (const hint of hints) {
    const key = `${hint.kind}|${hint.source}|${hint.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(hint);
    if (output.length >= limit) break;
  }
  return output;
}

function clampPositive(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export const defaultRuntimeHintCollector = new RuntimeHintCollector();
