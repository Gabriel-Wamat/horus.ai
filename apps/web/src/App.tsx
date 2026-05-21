import { useState, useEffect, useRef, type JSX } from "react";
import type { WorkflowState, Spec, UserStory } from "@u-build/shared";
import { workflowApi } from "./api/workflowApi.js";
import { useEventStream } from "./hooks/useEventStream.js";
import { UserStoryInputPage } from "./components/UserStoryInputPage.js";
import { UserStoryList } from "./components/UserStoryList.js";
import { SpecReview } from "./components/SpecReview.js";
import { WorkflowProgress } from "./components/WorkflowProgress.js";
import { RetryApproval, type RetryApprovalPayload } from "./components/RetryApproval.js";

export function App(): JSX.Element {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);

  // Spec approval HITL
  const [pendingSpec, setPendingSpec] = useState<{
    userStoryId: string;
    spec: Spec;
  } | null>(null);

  // Retry approval HITL (escalation after max retries)
  const [pendingRetry, setPendingRetry] = useState<RetryApprovalPayload | null>(null);
  const [isRetrySubmitting, setIsRetrySubmitting] = useState(false);

  const [lastSubmittedStories, setLastSubmittedStories] = useState<UserStory[]>([]);

  const { events, isConnected } = useEventStream(threadId);
  // Track how many events have been processed to avoid re-processing on re-render.
  // React 18 automatic batching can cause latestEvent to skip events when two SSE
  // messages arrive in the same microtask, so we drain the events array instead.
  const processedCountRef = useRef(0);

  useEffect(() => {
    if (!threadId) return;

    const newEvents = events.slice(processedCountRef.current);
    processedCountRef.current = events.length;

    for (const event of newEvents) {
      switch (event.type) {
        case "awaiting_approval":
          setPendingSpec({
            userStoryId: event.userStoryId,
            spec: event.spec,
          });
          break;

        case "awaiting_retry_approval":
          setPendingRetry({
            userStoryId: event.userStoryId,
            retryCount: event.retryCount,
            score: event.score,
            notes: event.notes,
            missingItems: event.missingItems,
          });
          break;

        case "status_changed":
          if (event.status === "completed" || event.status === "error") {
            void workflowApi.getStatus(threadId).then(setWorkflowState);
          }
          if (event.status === "running") {
            setPendingRetry(null);
          }
          break;
      }
    }
  }, [events, threadId]);

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

  const handleRetryDecision = async (continueRetry: boolean): Promise<void> => {
    if (!threadId || !pendingRetry) return;

    setIsRetrySubmitting(true);
    try {
      await workflowApi.retryDecision(
        threadId,
        pendingRetry.userStoryId,
        continueRetry
      );
      if (!continueRetry) {
        // User stopped: fetch final state
        const state = await workflowApi.getStatus(threadId);
        setWorkflowState(state);
      }
      setPendingRetry(null);
    } finally {
      setIsRetrySubmitting(false);
    }
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

        {pendingRetry && (
          <RetryApproval
            payload={pendingRetry}
            onContinue={() => handleRetryDecision(true)}
            onStop={() => handleRetryDecision(false)}
            isSubmitting={isRetrySubmitting}
          />
        )}
      </main>
    </div>
  );
}