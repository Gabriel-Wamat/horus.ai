import type { Spec } from "@u-build/shared";
import type { CuratorFeedback } from "../langgraph/state.js";

/**
 * Routing pattern: Odin analyzes the spec (and any curator feedback) to decide
 * which downstream agents to invoke. On retry, curator feedback narrows the target.
 */
export function decideRouting(
  spec: Spec,
  curatorFeedback?: CuratorFeedback
): string[] {
  // Reflection loop: curator told us exactly what to fix
  if (curatorFeedback && !curatorFeedback.passed) {
    switch (curatorFeedback.fixTarget) {
      case "front":
        return ["frontAgent"];
      case "qa":
        return ["qaAgent"];
      case "both":
        return ["frontAgent", "qaAgent"];
    }
  }

  // Initial routing based on spec structure
  const agents: string[] = [];

  const hasUiWork =
    spec.components.length > 0 &&
    spec.components.some((c) => c.type === "ui" || c.type === "utility");

  if (hasUiWork || spec.apiEndpoints.length === 0) {
    agents.push("frontAgent");
  }

  agents.push("qaAgent");
  return agents;
}