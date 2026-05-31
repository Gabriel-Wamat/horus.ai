import { createHash } from "node:crypto";

export type ProjectFailureCategory =
  | "syntax_error"
  | "lint_error"
  | "type_error"
  | "test_failure"
  | "build_failure"
  | "dependency_missing"
  | "timeout"
  | "permission_denied"
  | "unsafe_command"
  | "unknown";

export interface ProjectFailureAnalysis {
  category: ProjectFailureCategory;
  recoverable: boolean;
  reason: string;
  fingerprint: string;
  commandId: string | null;
}

const RECOVERABLE_CATEGORIES = new Set<ProjectFailureCategory>([
  "syntax_error",
  "lint_error",
  "type_error",
  "test_failure",
  "build_failure",
  "dependency_missing",
]);

const EXIT_CODE_CATEGORIES = new Map<number, ProjectFailureCategory>([
  [1, "test_failure"],
  [2, "syntax_error"],
  [126, "permission_denied"],
  [127, "dependency_missing"],
  [128, "unknown"],
  [130, "timeout"],
  [137, "timeout"],
  [139, "build_failure"],
  [143, "timeout"],
]);

export class ProjectFailureAnalysisService {
  analyzeQualityGate(
    qualityGate: Record<string, unknown> | null | undefined
  ): ProjectFailureAnalysis | null {
    if (!qualityGate || qualityGate["status"] !== "failed") return null;
    const failedChecks = Array.isArray(qualityGate["failedChecks"])
      ? qualityGate["failedChecks"]
      : Array.isArray(qualityGate["failed_checks"])
        ? qualityGate["failed_checks"]
        : [];
    if (failedChecks.length === 0) {
      return this.classify({
        commandId: null,
        kind: null,
        output: String(qualityGate["summary"] ?? "quality gate failed"),
      });
    }

    const first = failedChecks[0];
    if (!first || typeof first !== "object") {
      return this.classify({
        commandId: null,
        kind: null,
        output: String(first),
      });
    }

    const record = first as Record<string, unknown>;
    const output = [
      record["stdoutTail"],
      record["stderrTail"],
      record["stdout_tail"],
      record["stderr_tail"],
      record["summary"],
      record["message"],
    ]
      .map((value) => String(value ?? ""))
      .filter(Boolean)
      .join("\n");

    return this.classify({
      commandId: stringValue(record["commandId"] ?? record["command_id"]),
      kind: stringValue(record["kind"]),
      output,
      exitCode: numberValue(record["exitCode"] ?? record["exit_code"]),
    });
  }

  classify(input: {
    commandId: string | null;
    kind: string | null;
    output: string;
    exitCode?: number | null | undefined;
  }): ProjectFailureAnalysis {
    const normalized = input.output.toLocaleLowerCase();
    const commandSearch = `${input.commandId ?? ""} ${input.kind ?? ""}`.toLocaleLowerCase();
    const categoryFromExit =
      input.exitCode == null ? undefined : EXIT_CODE_CATEGORIES.get(input.exitCode);

    let category: ProjectFailureCategory;
    if (
      normalized.includes("syntaxerror") ||
      normalized.includes("syntax error") ||
      normalized.includes("invalid syntax") ||
      /\bE999\b/u.test(input.output)
    ) {
      category = "syntax_error";
    } else if (
      normalized.includes("forbidden command") ||
      normalized.includes("unsafe") ||
      normalized.includes("rejected by safety policy") ||
      normalized.includes("dangerous command blocked")
    ) {
      category = "unsafe_command";
    } else if (
      normalized.includes("permission denied") ||
      normalized.includes("not allowed") ||
      normalized.includes("outside writeroots") ||
      normalized.includes("outside write_roots") ||
      normalized.includes("outside workspace")
    ) {
      category = "permission_denied";
    } else if (looksLikeDependencyFailure(normalized)) {
      category = "dependency_missing";
    } else if (
      normalized.includes("error ts") ||
      normalized.includes("typeerror") ||
      commandSearch.includes("type-check") ||
      commandSearch.includes("typecheck") ||
      commandSearch.includes("tsc") ||
      commandSearch.includes("pyright") ||
      commandSearch.includes("mypy")
    ) {
      category = "type_error";
    } else if (
      commandSearch.includes("build") ||
      normalized.includes("build failed") ||
      normalized.includes("compilation failed") ||
      normalized.includes("compile error")
    ) {
      category = "build_failure";
    } else if (
      commandSearch.includes("lint") ||
      commandSearch.includes("eslint") ||
      normalized.includes("eslint") ||
      normalized.includes("lint error")
    ) {
      category = "lint_error";
    } else if (
      categoryFromExit &&
      categoryFromExit !== "test_failure" &&
      categoryFromExit !== "unknown"
    ) {
      category = categoryFromExit;
    } else if (
      commandSearch.includes("test") ||
      normalized.includes("failed") ||
      normalized.includes("failures") ||
      normalized.includes("assertion") ||
      normalized.includes("assertionerror")
    ) {
      category = "test_failure";
    } else if (categoryFromExit) {
      category = categoryFromExit;
    } else if (normalized.includes("timed out") || normalized.includes("timeout")) {
      category = "timeout";
    } else {
      category = "unknown";
    }

    return {
      category,
      recoverable: RECOVERABLE_CATEGORIES.has(category),
      reason: reasonFor(category),
      fingerprint: fingerprint({
        category,
        commandId: input.commandId,
        output: input.output,
      }),
      commandId: input.commandId,
    };
  }
}

export function looksLikeDependencyFailure(output: string): boolean {
  return [
    "no module named",
    "modulenotfounderror",
    "cannot find module",
    "err_module_not_found",
    "command not found",
    "npm err! code eresolve",
    "unable to resolve dependency tree",
    "could not resolve dependency",
    "missing module",
    "pytest: command not found",
  ].some((pattern) => output.includes(pattern));
}

function reasonFor(category: ProjectFailureCategory): string {
  const reasons: Record<ProjectFailureCategory, string> = {
    syntax_error: "Syntax diagnostics indicate the generated code cannot be parsed.",
    lint_error: "Lint diagnostics indicate style or static-analysis violations.",
    type_error: "Type-check diagnostics indicate incompatible types or APIs.",
    test_failure: "A test or assertion failed.",
    build_failure: "A build or compile command failed.",
    dependency_missing:
      "A validation command failed because a dependency or executable is missing.",
    timeout: "Validation exceeded the configured timeout.",
    permission_denied: "The requested action is outside the allowed policy.",
    unsafe_command: "The requested command was blocked by safety policy.",
    unknown: "The failure could not be classified deterministically.",
  };
  return reasons[category];
}

function fingerprint(input: {
  category: ProjectFailureCategory;
  commandId: string | null;
  output: string;
}): string {
  const importantLines = normalizeOutput(input.output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
  return createHash("sha256")
    .update(`${input.category}:${input.commandId ?? ""}:${importantLines.join("\n")}`)
    .digest("hex")
    .slice(0, 16);
}

function normalizeOutput(output: string): string {
  return output
    .replace(
      /\b\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\b/gu,
      "<TIMESTAMP>"
    )
    .replace(/\b(?:PID|pid)[:\s=]+\d+\b/gu, "PID:<NUM>")
    .replace(/\((?:process\s+)?\d{4,}\)/gu, "(<PID>)")
    .replace(/\/tmp\/[\w.-]+/gu, "/tmp/<TEMP>")
    .replace(/\/var\/folders\/[^/\s]+\/[^/\s]+/gu, "/var/folders/<TEMP>")
    .replace(/\b0x[0-9a-fA-F]{8,}\b/gu, "<ADDR>")
    .replace(/\bin\s+\d+(?:\.\d+)?(?:ms|s)\b/gu, "in <DURATION>")
    .replace(/\btook\s+\d+(?:\.\d+)?(?:ms|s)\b/gu, "took <DURATION>");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
