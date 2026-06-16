import type { WorkflowProgressEvent } from "../../features/visual-preview/workflowProgress.js";
import type { ContextReceiptRow } from "./types.js";

export function selectContextReceiptRows(
  events: readonly WorkflowProgressEvent[]
): ContextReceiptRow[] {
  return events
    .filter((event) => event.type === "context_receipt" && event.receipt)
    .map((event) => {
      const receipt = event.receipt!;
      return {
        id: receipt.id,
        agent: receipt.agentName,
        profile: receipt.agentProfileId,
        snapshotId: receipt.snapshotId,
        timestamp: event.timestamp ?? new Date(0).toISOString(),
        confidence: receipt.confidence,
        selectedFiles: receipt.selectedFiles.map((file) =>
          file.startLine
            ? `${file.path}:${file.startLine}${file.endLine ? `-${file.endLine}` : ""}`
            : file.path
        ),
        omittedFiles: receipt.budget.omittedFiles,
        selectedBytes: receipt.budget.selectedBytes,
        contextChannels: receipt.contextChannels ?? [],
        retrievalStatus: receipt.retrievalStatus ?? "partial",
        channels: receipt.retrievalChannels,
        reasons: receipt.selectionReasons
          .slice(0, 4)
          .map((reason) =>
            reason.path ? `${reason.path}: ${reason.reason}` : reason.reason
          ),
      };
    })
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, 6);
}
