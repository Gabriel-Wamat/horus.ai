import {
  CodeChangeSetSchema,
  RuntimeValidationEvidenceSchema,
  getLatestSuccessfulAgentResult,
  type AgentResult,
  type CodeChangeSet,
} from "@u-build/shared";
import type { QaOutput } from "../agents/QaAgentImpl.js";

export interface CuratorInputs {
  html: string;
  qaOutput: QaOutput;
  codeChangeSet?: CodeChangeSet;
}

function asTestCases(value: unknown): QaOutput["testCases"] {
  return Array.isArray(value) ? (value as QaOutput["testCases"]) : [];
}

function asPreviewSmoke(value: unknown): QaOutput["previewSmoke"] {
  return value && typeof value === "object"
    ? (value as QaOutput["previewSmoke"])
    : undefined;
}

function asRuntimeValidation(value: unknown): QaOutput["runtimeValidation"] {
  return value && typeof value === "object"
    ? RuntimeValidationEvidenceSchema.parse(value)
    : undefined;
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
      ...(asPreviewSmoke(qaResult?.output["previewSmoke"])
        ? { previewSmoke: asPreviewSmoke(qaResult?.output["previewSmoke"]) }
        : {}),
      ...(asRuntimeValidation(qaResult?.output["runtimeValidation"])
        ? { runtimeValidation: asRuntimeValidation(qaResult?.output["runtimeValidation"]) }
        : {}),
    },
    ...(frontResult?.output["codeChangeSet"]
      ? {
          codeChangeSet: CodeChangeSetSchema.parse(
            frontResult.output["codeChangeSet"]
          ),
        }
      : {}),
  };
}
