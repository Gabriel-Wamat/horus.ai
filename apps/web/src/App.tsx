import { useState, useEffect, type JSX } from "react";
import type { WorkflowState, Spec } from "@u-build/shared";
import { workflowApi } from "./api/workflowApi.js";
import { useEventStream } from "./hooks/useEventStream.js";
import { UserStoryList } from "./components/UserStoryList.js";
import { SpecReview } from "./components/SpecReview.js";
import { WorkflowProgress } from "./components/WorkflowProgress.js";

export function App(): JSX.Element {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [pendingSpec, setPendingSpec] = useState<{
    userStoryId: string;
    spec: Spec;
  } | null>(null);

  const { latestEvent, isConnected } = useEventStream(threadId);

  useEffect(() => {
    if (!latestEvent || !threadId) return;

    if (latestEvent.type === "awaiting_approval") {
      setPendingSpec({
        userStoryId: latestEvent.userStoryId,
        spec: latestEvent.spec,
      });
    }

    if (
      latestEvent.type === "status_changed" &&
      (latestEvent.status === "completed" || latestEvent.status === "error")
    ) {
      void workflowApi.getStatus(threadId).then(setWorkflowState);
    }
  }, [latestEvent, threadId]);

  const handleStart = async (): Promise<void> => {
    // TODO: collect real user stories from a form input
    const { threadId: id } = await workflowApi.start([]);
    setThreadId(id);
  };

  const handleSpecApproval = async (
    approved: boolean,
    editedSpec?: Spec
  ): Promise<void> => {
    if (!threadId || !pendingSpec) return;

    await workflowApi.resume(threadId, pendingSpec.userStoryId, {
      approved,
      editedSpec,
      reviewedAt: new Date().toISOString(),
    });

    setPendingSpec(null);
  };

  return (
    <main>
      <h1>U-Build</h1>

      {!threadId && (
        <button onClick={handleStart}>Start Workflow</button>
      )}

      {threadId && (
        <>
          <WorkflowProgress
            threadId={threadId}
            latestEvent={latestEvent}
            isConnected={isConnected}
          />

          {workflowState && <UserStoryList state={workflowState} />}

          {pendingSpec && (
            <SpecReview
              spec={pendingSpec.spec}
              onApprove={(edited) => handleSpecApproval(true, edited)}
              onReject={() => handleSpecApproval(false)}
            />
          )}
        </>
      )}
    </main>
  );
}
