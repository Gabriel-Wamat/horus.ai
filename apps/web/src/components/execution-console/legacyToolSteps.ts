import type {
  AgentFileOperationStatus,
  AgentFileOperationType,
} from "@u-build/shared";
import type { PreviewChatMessage } from "../PreviewConversationPanel.js";

export function legacyPathFromToolStep(toolName: string, title: string): string | null {
  if (!fileToolNames.has(toolName)) return null;
  return suffixAfterMarker(title, ": ");
}

export function legacyCommandIdsFromToolStep(
  toolName: string,
  title: string
): string[] {
  if (toolName !== "run_validation_command" && toolName !== "run_command") {
    return [];
  }
  const commandId = suffixAfterMarker(title, ": ");
  return commandId ? [commandId] : [];
}

export function operationTypeFromToolName(toolName: string): AgentFileOperationType {
  if (toolName === "read_file" || toolName === "search_code") return "read";
  if (toolName === "write_file") return "create";
  if (toolName === "delete_file") return "delete";
  if (toolName === "get_git_diff") return "diff";
  if (toolName === "run_validation_command" || toolName === "run_command") {
    return "validate";
  }
  if (toolName === "edit_file" || toolName === "replace_file_range") return "update";
  return "unknown";
}

export function statusFromToolStepPhase(
  phase: "started" | "succeeded" | "failed"
): AgentFileOperationStatus {
  if (phase === "started") return "running";
  if (phase === "failed") return "failed";
  return "changed";
}

export function toolStepDetail(
  toolName: string,
  phase: string,
  filePaths: readonly string[]
): string {
  const fileText = filePaths.length ? ` · ${filePaths.join(", ")}` : "";
  return `${toolName} ${phase}${fileText}`;
}

export function codingEvidenceDetail(message: PreviewChatMessage): string {
  const evidence = message.codingEvidence;
  if (!evidence) return message.body;
  const validation = evidence.validation
    ? ` Validação: ${evidence.validation.status}.`
    : "";
  const files = evidence.changedFiles.length
    ? ` Arquivos: ${evidence.changedFiles.join(", ")}.`
    : "";
  return `${evidence.state}.${files}${validation}`.trim();
}

function suffixAfterMarker(value: string, marker: string): string | null {
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return null;
  const suffix = value.slice(markerIndex + marker.length).trim();
  return suffix.length > 0 ? suffix : null;
}

const fileToolNames = new Set([
  "read_file",
  "write_file",
  "edit_file",
  "replace_file_range",
  "delete_file",
  "get_git_diff",
]);
