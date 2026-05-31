import type { AgentToolName } from "@u-build/shared";
import { recordOperation } from "./AgentToolLoopOperationalSession.js";
import type { AgentToolLoopOperationalSessionInput } from "./AgentToolLoopOperationalSession.js";
import {
  asRecord,
  boundedString,
  codeChangeOperationTelemetry,
  commandStatus,
  compactInspectionMetadata,
  inferChangeType,
  nullableInteger,
  nonnegativeInteger,
  operationChangeTelemetry,
  stringValue,
  summarizeToolOutput,
} from "./AgentToolLoopToolTelemetry.js";

export async function recordToolOutputEvidence(
  input: AgentToolLoopOperationalSessionInput,
  sessionId: string | undefined,
  toolName: AgentToolName,
  toolInput: Record<string, unknown>,
  output: unknown,
  operationMetadata: Record<string, unknown> | undefined = undefined
): Promise<void> {
  if (!sessionId || !input.operationalSessionRepository) return;
  const outputRecord = asRecord(output);
  if (toolName === "read_file") {
    const path = stringValue(outputRecord["path"]) ?? stringValue(toolInput["path"]);
    if (!path) return;
    const version = asRecord(outputRecord["version"]);
    await recordOperation(input, sessionId, {
      type: "file_read",
      summary: `Leu ${path}.`,
      filePaths: [path],
      metadata: {
        evidence: {
          path,
          versionHash:
            stringValue(outputRecord["versionHash"]) ?? stringValue(version["hash"]) ?? null,
          baseVersion: Object.keys(version).length > 0 ? version : null,
          readAt: new Date().toISOString(),
        },
      },
    });
    return;
  }

  if (
    toolName === "edit_file" ||
    toolName === "replace_file_range" ||
    toolName === "write_file" ||
    toolName === "save_file" ||
    toolName === "delete_file"
  ) {
    const path = stringValue(outputRecord["path"]) ?? stringValue(toolInput["path"]);
    if (!path) return;
    const changed =
      outputRecord["changed"] === true || outputRecord["deleted"] === true;
    if (!changed) return;
    await recordOperation(input, sessionId, {
      type: "file_changed",
      summary: `${toolName} alterou ${path}.`,
      filePaths: [path],
      metadata: {
        change: {
          path,
          changeType: inferChangeType(toolName),
          newVersionHash: stringValue(outputRecord["newVersionHash"]) ?? null,
          additions: nonnegativeInteger(outputRecord["additions"]),
          deletions: nonnegativeInteger(outputRecord["deletions"]),
          replacementCount: nonnegativeInteger(outputRecord["replacementCount"]),
          diffPreview: boundedString(stringValue(outputRecord["diff"]) ?? "", 8_000),
          ...operationChangeTelemetry(operationMetadata),
          changedAt: new Date().toISOString(),
        },
      },
    });
    return;
  }

  if (toolName === "apply_code_change_set") {
    const paths = Array.isArray(outputRecord["appliedOperations"])
      ? outputRecord["appliedOperations"].filter(
          (item): item is string => typeof item === "string"
        )
      : [];
    await Promise.all(
      paths.map((path) =>
        recordOperation(input, sessionId, {
          type: "file_changed",
          summary: `apply_code_change_set alterou ${path}.`,
          filePaths: [path],
          metadata: {
            change: {
              path,
              changeType: "unknown",
              changedAt: new Date().toISOString(),
            },
          },
        })
      )
    );
    return;
  }

  if (toolName === "run_validation_command" || toolName === "run_command") {
    const commandId = stringValue(outputRecord["commandId"]);
    if (!commandId) return;
    await recordOperation(input, sessionId, {
      type: "command_ran",
      summary: `${toolName} executou ${commandId}.`,
      commandIds: [commandId],
      metadata: {
        command: {
          commandId,
          status: commandStatus(outputRecord),
          exitCode: nullableInteger(outputRecord["exitCode"]),
          durationMs: nonnegativeInteger(outputRecord["durationMs"]),
          ranAt: new Date().toISOString(),
        },
      },
    });
    return;
  }

  if (toolName === "get_git_diff") {
    const files = Array.isArray(outputRecord["files"])
      ? outputRecord["files"].filter((item): item is string => typeof item === "string")
      : [];
    await recordOperation(input, sessionId, {
      type: "diff_recorded",
      summary: stringValue(outputRecord["patchSummary"]) ?? "Diff inspecionado.",
      filePaths: files,
      metadata: {
        patchSummary: stringValue(outputRecord["patchSummary"]) ?? "",
      },
    });
    return;
  }

  if (toolName === "inspect_project") {
    await recordOperation(input, sessionId, {
      type: "decision_recorded",
      summary: summarizeToolOutput(toolName, output),
      metadata: {
        inspection: compactInspectionMetadata(output),
      },
    });
  }
}
