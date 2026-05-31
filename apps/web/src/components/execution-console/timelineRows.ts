import type { PreviewChatMessage } from "../PreviewConversationPanel.js";
import type { WorkflowProgressEvent } from "../../features/visual-preview/workflowProgress.js";
import type { TimelineRow } from "./types.js";
import {
  codingEvidenceDetail,
  toolStepDetail,
} from "./legacyToolSteps.js";
import { eventDetail, eventTitle } from "./workflowEventText.js";

export function selectTimelineRows(
  events: readonly WorkflowProgressEvent[],
  messages: readonly PreviewChatMessage[]
): TimelineRow[] {
  const rows: TimelineRow[] = events.map((event) => ({
    id: event.id,
    title: eventTitle(event),
    detail: eventDetail(event),
    timestamp: event.timestamp ?? "",
  }));

  for (const message of messages) {
    for (const step of message.toolSteps ?? []) {
      rows.push({
        id: `chat-tool:${message.id}:${step.sequence ?? step.title}:${step.phase}`,
        title: step.title,
        detail:
          step.detail ??
          toolStepDetail(step.tool, step.phase, step.filePaths ?? []),
        timestamp: message.createdAt,
      });
    }
    if (message.codingEvidence) {
      rows.push({
        id: `coding:${message.id}:${message.codingEvidence.taskId}`,
        title: "Resultado do agente",
        detail: codingEvidenceDetail(message),
        timestamp: message.createdAt,
      });
    }
  }

  return rows
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 14);
}
