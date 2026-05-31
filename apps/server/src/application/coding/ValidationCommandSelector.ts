import {
  CodingValidationPlanCommandSchema,
  type CodingValidationCommandKind,
  type CodingValidationPlanCommand,
  type HorusProjectConfig,
  type ProjectCommand,
} from "@u-build/shared";

const VALIDATION_KIND_PRIORITY: readonly CodingValidationCommandKind[] = [
  "type_check",
  "check",
  "test",
  "build",
  "lint",
];

const VALIDATION_ID_PREFIXES: Record<CodingValidationCommandKind, string[]> = {
  ast: [],
  static_gate: [],
  type_check: ["type-check-", "typecheck-", "tsc-"],
  check: ["check-"],
  test: ["test-"],
  build: ["build-"],
  lint: ["lint-"],
  unknown: [],
};

export class ValidationCommandSelector {
  select(config: HorusProjectConfig): CodingValidationPlanCommand[] {
    const validationCommands = config.commandCatalog
      .map((command) => ({ command, kind: classifyCommandKind(command) }))
      .filter(({ kind }) => kind !== "unknown")
      .sort((left, right) => {
        const priority = kindPriority(left.kind) - kindPriority(right.kind);
        if (priority !== 0) return priority;
        return left.command.id.localeCompare(right.command.id);
      });

    const seen = new Set<string>();
    const commands: CodingValidationPlanCommand[] = [];
    for (const { command, kind } of validationCommands) {
      if (seen.has(command.id)) continue;
      seen.add(command.id);
      commands.push(
        CodingValidationPlanCommandSchema.parse({
          id: command.id,
          kind,
          ...(command.label ? { label: command.label } : {}),
          executable: command.executable,
          args: command.args,
          cwd: command.cwd,
          env: command.env,
          ...(command.timeoutMs ? { timeoutMs: command.timeoutMs } : {}),
          required: true,
        })
      );
    }
    return commands;
  }
}

export function classifyCommandKind(command: ProjectCommand): CodingValidationCommandKind {
  const id = command.id.toLowerCase();
  for (const kind of VALIDATION_KIND_PRIORITY) {
    if ((VALIDATION_ID_PREFIXES[kind] ?? []).some((prefix) => id.startsWith(prefix))) {
      return kind;
    }
  }

  const terms = [command.executable, ...command.args].flatMap(splitCommandTerms);
  const termSet = new Set(terms);
  if (
    termSet.has("typecheck") ||
    termSet.has("tsc") ||
    hasAdjacentTerms(terms, "type", "check")
  ) {
    return "type_check";
  }
  if (termSet.has("check")) return "check";
  if (termSet.has("test") || termSet.has("vitest") || termSet.has("jest")) {
    return "test";
  }
  if (termSet.has("build")) return "build";
  if (termSet.has("lint") || termSet.has("eslint")) return "lint";
  return "unknown";
}

function kindPriority(kind: CodingValidationCommandKind): number {
  const index = VALIDATION_KIND_PRIORITY.indexOf(kind);
  return index === -1 ? VALIDATION_KIND_PRIORITY.length : index;
}

function splitCommandTerms(value: string): string[] {
  const terms: string[] = [];
  let current = "";

  for (const char of value.toLowerCase()) {
    if (isAsciiLetterOrDigit(char)) {
      current += char;
      continue;
    }

    if (current.length > 0) {
      terms.push(current);
      current = "";
    }
  }

  if (current.length > 0) terms.push(current);
  return terms;
}

function hasAdjacentTerms(
  terms: readonly string[],
  first: string,
  second: string
): boolean {
  for (let index = 0; index < terms.length - 1; index += 1) {
    if (terms[index] === first && terms[index + 1] === second) return true;
  }
  return false;
}

function isAsciiLetterOrDigit(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}
