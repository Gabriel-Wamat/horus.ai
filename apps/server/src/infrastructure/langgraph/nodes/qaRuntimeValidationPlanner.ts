import type {
  ProjectContextSnapshot,
  ProjectScript,
  ProjectScriptCategory,
  RuntimeValidationCommandEvidence,
  ValidationStepKind,
} from "@u-build/shared";

const COMMAND_LIMIT = 6;
const EXECUTABLE_VALIDATION_CATEGORIES = new Set<ProjectScriptCategory>([
  "typecheck",
  "check",
  "build",
  "lint",
  "test",
]);

const STEP_TO_CATEGORY: Partial<Record<ValidationStepKind, ProjectScriptCategory>> = {
  type_check: "typecheck",
  build: "build",
  lint: "lint",
  test: "test",
};

export interface QaRuntimeValidationPlan {
  commandIds: string[];
  missingEvidence: RuntimeValidationCommandEvidence[];
}

export function planQaRuntimeValidation(
  snapshot: ProjectContextSnapshot
): QaRuntimeValidationPlan {
  const commandIds = selectValidationCommandIds(snapshot);
  if (commandIds.length > 0) {
    return { commandIds, missingEvidence: [] };
  }

  return {
    commandIds,
    missingEvidence: [
      missingValidationCommandEvidence({
        snapshot,
        reason: missingValidationReason(snapshot),
      }),
    ],
  };
}

export function missingQaRuntimeToolEvidence(
  snapshot: ProjectContextSnapshot,
  reason: string
): RuntimeValidationCommandEvidence {
  return missingValidationCommandEvidence({ snapshot, reason });
}

function selectValidationCommandIds(snapshot: ProjectContextSnapshot): string[] {
  const scripts = snapshot.inspection.scripts;
  const byCategory = groupScriptsByCategory(scripts);
  const selected: string[] = [];

  for (const requirement of snapshot.validationStrategy.requirements) {
    if (requirement.level === "skip") continue;
    const category = STEP_TO_CATEGORY[requirement.kind];
    if (!category) continue;
    const script = chooseScriptForRequirement(
      byCategory.get(category) ?? [],
      requirement.scriptHint
    );
    if (script) selected.push(rootScriptCommandId(category, script.name));
  }

  if (selected.length === 0) {
    for (const script of scripts) {
      if (!EXECUTABLE_VALIDATION_CATEGORIES.has(script.category)) continue;
      selected.push(rootScriptCommandId(script.category, script.name));
    }
  }

  const bootstrap = selectBootstrapCommandIds(snapshot, selected);
  return [...new Set([...bootstrap, ...selected])].slice(0, COMMAND_LIMIT);
}

function selectBootstrapCommandIds(
  snapshot: ProjectContextSnapshot,
  validationCommandIds: readonly string[]
): string[] {
  if (validationCommandIds.length === 0) return [];
  const packageManager = snapshot.inspection.packageManager;
  if (!packageManager || packageManager.status !== "detected") return [];
  if (packageManager.name === "unknown") return [];
  return ["install-root-dependencies"];
}

function groupScriptsByCategory(
  scripts: readonly ProjectScript[]
): Map<ProjectScriptCategory, ProjectScript[]> {
  const grouped = new Map<ProjectScriptCategory, ProjectScript[]>();
  for (const script of scripts) {
    const current = grouped.get(script.category) ?? [];
    current.push(script);
    grouped.set(script.category, current);
  }
  for (const [category, values] of grouped.entries()) {
    grouped.set(
      category,
      values.slice().sort((left, right) => left.name.localeCompare(right.name))
    );
  }
  return grouped;
}

function chooseScriptForRequirement(
  scripts: readonly ProjectScript[],
  scriptHint: string | undefined
): ProjectScript | undefined {
  if (scriptHint) {
    const hinted = scripts.find((script) => script.name === scriptHint);
    if (hinted) return hinted;
  }
  return scripts[0];
}

function missingValidationReason(snapshot: ProjectContextSnapshot): string {
  const categories = [
    ...new Set(snapshot.inspection.scripts.map((script) => script.category)),
  ].sort();
  const requiredSteps = snapshot.validationStrategy.requirements
    .filter((requirement) => requirement.level === "required")
    .map((requirement) => requirement.kind);
  const expected = requiredSteps.length
    ? requiredSteps.join(", ")
    : "build, typecheck, test, lint or check";
  const available = categories.length ? categories.join(", ") : "none";
  return `QA validation commands unavailable. Expected ${expected}; available script categories: ${available}.`;
}

function missingValidationCommandEvidence(input: {
  snapshot: ProjectContextSnapshot;
  reason: string;
}): RuntimeValidationCommandEvidence {
  return {
    commandId: "qa-validation-command-discovery",
    taskId: null,
    command: "discover validation commands",
    cwd: input.snapshot.projectRootPath,
    approvalRequired: false,
    risk: "high",
    policyReason: input.reason,
    approved: false,
    approvedBy: null,
    approvalReason: null,
    exitCode: 1,
    stdoutTail: "",
    stderrTail: input.reason,
    stdoutPath: null,
    stderrPath: null,
    interactivePromptDetected: false,
    interactivePromptText: null,
    durationMs: 0,
  };
}

function rootScriptCommandId(category: ProjectScriptCategory, scriptName: string): string {
  const kind = category === "typecheck" ? "type-check" : category;
  return normalizeCommandId([kind, "root", scriptName]);
}

function normalizeCommandId(parts: readonly string[]): string {
  const tokens: string[] = [];
  let current = "";
  for (const char of parts.join("-").toLowerCase().normalize("NFD")) {
    const code = char.charCodeAt(0);
    const isCombiningMark = code >= 0x0300 && code <= 0x036f;
    const isDigit = code >= 48 && code <= 57;
    const isLowerAscii = code >= 97 && code <= 122;
    if (isCombiningMark) continue;
    if (isDigit || isLowerAscii) {
      current += char;
      continue;
    }
    if (current) {
      tokens.push(current);
      current = "";
    }
  }
  if (current) tokens.push(current);
  return tokens.join("-");
}
