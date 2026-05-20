import type { JSX } from "react";
import type { WorkflowEvent } from "@u-build/shared";

interface WorkflowProgressProps {
  threadId: string;
  latestEvent: WorkflowEvent | null;
  isConnected: boolean;
}

export function WorkflowProgress({
  threadId,
  latestEvent,
  isConnected,
}: WorkflowProgressProps): JSX.Element {
  return (
    <section>
      <h2>Workflow Progress</h2>
      <p>Thread: {threadId}</p>
      <p>SSE: {isConnected ? "Connected" : "Disconnected"}</p>
      {latestEvent && (
        <p>
          Last event: <code>{latestEvent.type}</code> at {latestEvent.timestamp}
        </p>
      )}
    </section>
  );
}
