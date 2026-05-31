import {
  RuntimeValidationEvidenceSchema,
  type AgentResult,
  type ProjectContextRuntimeHint,
  type RuntimeValidationEvidence,
} from "@u-build/shared";
import { defaultRuntimeHintCollector } from "../../application/services/RuntimeHintCollector.js";
import type { CuratorFeedback } from "./state.js";

// Shared helpers used by Front/QA/Curator nodes to extract the previous turn's
// runtime evidence and convert it (plus curator feedback) into the
// ProjectContextRuntimeHint[] the Engine carries forward. Keeps the per-node
// snapshot wiring small and consistent.

export function extractLatestRuntimeValidation(
  results: readonly AgentResult[]
): RuntimeValidationEvidence | undefined {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (!result || result.status !== "success") continue;
    const raw = (result.output as Record<string, unknown> | undefined)?.[
      "runtimeValidation"
    ];
    if (!raw) continue;
    const parsed = RuntimeValidationEvidenceSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

export function buildRuntimeHintsFromHistory(input: {
  runtimeValidation: RuntimeValidationEvidence | undefined;
  curatorFeedback: CuratorFeedback | undefined;
}): ProjectContextRuntimeHint[] {
  const hints = defaultRuntimeHintCollector.collect({
    ...(input.runtimeValidation
      ? { runtimeValidation: input.runtimeValidation }
      : {}),
  });
  if (input.curatorFeedback && !input.curatorFeedback.passed) {
    const observedAt = new Date().toISOString();
    if (input.curatorFeedback.notes?.trim()) {
      hints.push({
        kind: "other",
        source: "curator_feedback",
        message: input.curatorFeedback.notes.trim().slice(0, 600),
        observedAt,
      });
    }
    for (const item of input.curatorFeedback.missingItems ?? []) {
      if (!item?.trim()) continue;
      hints.push({
        kind: "other",
        source: "curator_missing_item",
        message: item.trim().slice(0, 600),
        observedAt,
      });
    }
  }
  return hints;
}
