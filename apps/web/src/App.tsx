import { useState, useEffect, type JSX } from "react";
import type { WorkflowState, Spec, UserStory } from "@u-build/shared";
import { workflowApi } from "./api/workflowApi.js";
import { useEventStream } from "./hooks/useEventStream.js";
import { UserStoryInputPage } from "./components/UserStoryInputPage.js";
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
  const [lastSubmittedStories, setLastSubmittedStories] = useState<UserStory[]>([]);

  const { latestEvent, events, isConnected } = useEventStream(threadId);

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

  const handleStart = async (stories: UserStory[]): Promise<void> => {
    setLastSubmittedStories(stories);
    const { threadId: id } = await workflowApi.start(stories);
    setThreadId(id);
  };

  const handleSpecApproval = async (
    approved: boolean,
    editedSpec?: Spec
  ): Promise<void> => {
    if (!threadId || !pendingSpec) return;

    if (!approved) {
      setThreadId(null);
      setPendingSpec(null);
      setWorkflowState(null);
      return;
    }

    await workflowApi.resume(threadId, pendingSpec.userStoryId, {
      approved: true,
      editedSpec,
      reviewedAt: new Date().toISOString(),
    });

    setPendingSpec(null);
  };

  if (!threadId) {
    return <UserStoryInputPage onSubmit={handleStart} initialStories={lastSubmittedStories} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="size-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <svg className="size-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
          </div>
          <span className="font-semibold text-white tracking-tight">
            horus<span className="text-violet-400">.ai</span>
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 flex flex-col gap-6">
        <WorkflowProgress
          threadId={threadId}
          latestEvent={latestEvent}
          events={events}
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
      </main>
    </div>
  );
}
