import type {
  ProjectFramework,
  ProjectInspectionProfile,
  ProjectScript,
  ProjectScriptCategory,
  ValidationRequirement,
  ValidationStepKind,
  ValidationStrategy,
} from "@u-build/shared";
import {
  DEFAULT_VALIDATION_STRATEGY,
  ValidationStrategySchema,
} from "@u-build/shared";

// Declarative policy: for a given detected stack, which validation steps are
// required vs recommended vs optional. The agent should *not* decide whether
// to run typecheck/build/lint/test — it should follow this contract. The
// downstream runner is responsible for matching each requirement to an actual
// command via ValidationCommandSelector, and for downgrading "required" to
// "skip" when the script is not present in the project.
const STACK_POLICIES: Record<ProjectFramework, readonly ValidationRequirement[]> = {
  "react-vite": [
    {
      kind: "type_check",
      level: "required",
      reason: "React/Vite TS projects must compile types before any preview validation.",
      scriptHint: "typecheck",
    },
    {
      kind: "build",
      level: "required",
      reason: "Production build catches Vite plugin / import errors invisible to dev server.",
      scriptHint: "build",
    },
    {
      kind: "lint",
      level: "recommended",
      reason: "ESLint catches React-specific anti-patterns when configured.",
      scriptHint: "lint",
    },
    {
      kind: "test",
      level: "recommended",
      reason: "Run unit/integration tests if the project declares a test script.",
      scriptHint: "test",
    },
    {
      kind: "preview_smoke",
      level: "recommended",
      reason: "If a preview session exists, confirm the route still mounts without runtime errors.",
    },
  ],
  next: [
    {
      kind: "type_check",
      level: "required",
      reason: "Next + TypeScript: type errors break production builds.",
      scriptHint: "typecheck",
    },
    {
      kind: "build",
      level: "required",
      reason: "`next build` catches server/edge boundary violations not seen in dev.",
      scriptHint: "build",
    },
    {
      kind: "lint",
      level: "recommended",
      reason: "`next lint` enforces project-wide Next conventions.",
      scriptHint: "lint",
    },
    {
      kind: "test",
      level: "recommended",
      reason: "Run unit/integration tests if the project declares a test script.",
      scriptHint: "test",
    },
    {
      kind: "preview_smoke",
      level: "recommended",
      reason: "If a preview session exists, hit the changed route to confirm SSR/RSC still renders.",
    },
  ],
  react: [
    {
      kind: "type_check",
      level: "recommended",
      reason: "If the project ships a typecheck script, prefer running it.",
      scriptHint: "typecheck",
    },
    {
      kind: "build",
      level: "recommended",
      reason: "Optional for plain React without bundler config; run if script exists.",
      scriptHint: "build",
    },
    {
      kind: "lint",
      level: "optional",
      reason: "Lint only if a script is configured.",
      scriptHint: "lint",
    },
    {
      kind: "test",
      level: "recommended",
      reason: "Run tests when present — React projects often have Jest/Vitest suites.",
      scriptHint: "test",
    },
  ],
  node: [
    {
      kind: "type_check",
      level: "recommended",
      reason: "Run typecheck if declared — common in Node TS projects.",
      scriptHint: "typecheck",
    },
    {
      kind: "test",
      level: "required",
      reason: "Node libraries/services should always validate via tests when a script exists.",
      scriptHint: "test",
    },
    {
      kind: "lint",
      level: "optional",
      reason: "Lint only if a script is configured.",
      scriptHint: "lint",
    },
    {
      kind: "build",
      level: "optional",
      reason: "Build only if the project produces a compiled artifact.",
      scriptHint: "build",
    },
  ],
  unknown: [],
};

export class ValidationStrategyRegistry {
  resolve(inspection: ProjectInspectionProfile): ValidationStrategy {
    const stack = inspection.framework.name;
    const policy = STACK_POLICIES[stack] ?? STACK_POLICIES.unknown;
    const availableCategories = collectAvailableCategories(inspection.scripts);
    const notes: string[] = [];
    const requirements: ValidationRequirement[] = policy.map((requirement) => {
      const downgraded = downgradeIfScriptMissing(
        requirement,
        availableCategories,
        notes
      );
      return downgraded;
    });
    if (stack === "unknown") {
      return ValidationStrategySchema.parse(DEFAULT_VALIDATION_STRATEGY);
    }
    return ValidationStrategySchema.parse({
      stack,
      requirements,
      notes,
    });
  }
}

function collectAvailableCategories(
  scripts: readonly ProjectScript[]
): Set<ProjectScriptCategory> {
  return new Set(scripts.map((script) => script.category));
}

function downgradeIfScriptMissing(
  requirement: ValidationRequirement,
  available: Set<ProjectScriptCategory>,
  notes: string[]
): ValidationRequirement {
  const category = STEP_TO_CATEGORY[requirement.kind];
  if (!category) return requirement;
  if (available.has(category)) return requirement;
  if (requirement.level === "required") {
    notes.push(
      `Required step "${requirement.kind}" downgraded to optional: no "${category}" script found.`
    );
  }
  return {
    ...requirement,
    level: "optional",
    reason: `${requirement.reason} (downgraded: no project script of category "${category}").`,
  };
}

const STEP_TO_CATEGORY: Partial<Record<ValidationStepKind, ProjectScriptCategory>> = {
  type_check: "typecheck",
  build: "build",
  lint: "lint",
  test: "test",
  preview_smoke: "preview",
};

export const defaultValidationStrategyRegistry = new ValidationStrategyRegistry();
