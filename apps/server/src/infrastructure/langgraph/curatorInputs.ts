import {
  getLatestSuccessfulAgentResult,
  type AgentResult,
} from "@u-build/shared";
import type { QaOutput } from "../agents/QaAgentImpl.js";

export interface CuratorInputs {
  html: string;
  qaOutput: QaOutput;
}

function asTestCases(value: unknown): QaOutput["testCases"] {
  return Array.isArray(value) ? (value as QaOutput["testCases"]) : [];
}

export function selectCuratorInputs(
  results: readonly AgentResult[]
): CuratorInputs {
  const frontResult = getLatestSuccessfulAgentResult(results, "front");
  const qaResult = getLatestSuccessfulAgentResult(results, "qa");

  return {
    html: (frontResult?.output["html"] as string | undefined) ?? "",
    qaOutput: {
      testCases: asTestCases(qaResult?.output["testCases"]),
    },
  };
}
