import { z } from "zod";
import {
  ProjectFrameworkSchema,
  type ProjectFramework,
} from "./ProjectInspection.js";

// Aligns with CodingValidationCommandKind values that may be required by a
// stack policy. Kept independent from CodingValidationCommandKind so that
// strategies can also flag `preview` as a stack requirement without coupling
// to the runner's plan kinds.
export const ValidationStepKindSchema = z.enum([
  "type_check",
  "build",
  "lint",
  "test",
  "preview_smoke",
]);

export const ValidationRequirementLevelSchema = z.enum([
  "required",
  "recommended",
  "optional",
  "skip",
]);

export const ValidationRequirementSchema = z.object({
  kind: ValidationStepKindSchema,
  level: ValidationRequirementLevelSchema,
  reason: z.string().trim().min(1),
  // Free-form hint for the validation runner: what the typical script name is
  // for this stack (e.g. "typecheck", "build", "test"). Not authoritative —
  // the actual command is still resolved from the project's catalog.
  scriptHint: z.string().trim().min(1).optional(),
});

export const ValidationStrategySchema = z.object({
  stack: ProjectFrameworkSchema,
  // The agent should not "decide if it's worth running" — this is the contract
  // the engine produces for downstream validators.
  requirements: z.array(ValidationRequirementSchema).default([]),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export type ValidationStepKind = z.infer<typeof ValidationStepKindSchema>;
export type ValidationRequirementLevel = z.infer<
  typeof ValidationRequirementLevelSchema
>;
export type ValidationRequirement = z.infer<typeof ValidationRequirementSchema>;
export type ValidationStrategy = z.infer<typeof ValidationStrategySchema>;

export const DEFAULT_VALIDATION_STRATEGY: ValidationStrategy = {
  stack: "unknown" satisfies ProjectFramework,
  requirements: [],
  notes: ["No framework detected; falling back to project script catalog."],
};
