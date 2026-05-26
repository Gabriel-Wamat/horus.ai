import { useState, useEffect, useRef, type JSX } from "react";
import type {
  WorkflowState,
  Spec,
  UserStory,
  LlmSettings,
} from "@u-build/shared";
import { workflowApi } from "./api/workflowApi.js";
import { useEventStream } from "./hooks/useEventStream.js";
import { UserStoryInputPage } from "./components/UserStoryInputPage.js";
import { UserStoryList } from "./components/UserStoryList.js";
import { SpecReview } from "./components/SpecReview.js";
import { WorkflowProgress } from "./components/WorkflowProgress.js";
import { RetryApproval, type RetryApprovalPayload } from "./components/RetryApproval.js";
import { ArtifactsPanel } from "./components/ArtifactsPanel.js";
import { Shell } from "./components/Shell.js";
import { LlmSettingsModal } from "./components/LlmSettingsModal.js";

const FLOW_STEPS = [
  ["01", "Briefing", "Cadastrar histórias, critérios e prioridade."],
  ["02", "Spec HITL", "Gerar a especificação e aguardar revisão humana."],
  ["03", "Execução", "Odin roteia FrontAgent, QAAgent e Curador."],
  ["04", "Entrega", "Expor preview, testes e pacote para download."],
] as const;

function WorkflowBlueprint(): JSX.Element {
  return (
    <section className="workflow-panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Run sequence</p>
          <h2 className="panel-title">Fluxo operacional</h2>
        </div>
      </div>
      <div className="workflow-list">
        {FLOW_STEPS.map(([index, title, description], i) => (
          <div className={`workflow-step ${i === 0 ? "active" : ""}`} key={title}>
            <span className={`step-dot ${i === 0 ? "running" : ""}`} aria-hidden="true" />
            <div>
              <p className="workflow-title">{title}</p>
              <p className="workflow-meta">{description}</p>
            </div>
            <span className="status-chip-value">{index}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkflowInspector({
  threadId,
  workflowState,
  pendingSpec,
  pendingRetry,
  eventCount,
}: {
  threadId: string | null;
  workflowState: WorkflowState | null;
  pendingSpec: { userStoryId: string; spec: Spec } | null;
  pendingRetry: RetryApprovalPayload | null;
  eventCount: number;
}): JSX.Element {
  const payload = {
    threadId,
    status: workflowState?.status ?? (threadId ? "running" : "drafting"),
    currentUserStory: workflowState?.userStories[workflowState.currentUSIndex]?.title ?? null,
    userStories: workflowState?.userStories.length ?? 0,
    specs: workflowState ? Object.keys(workflowState.specs).length : 0,
    pendingHumanReview: pendingSpec?.userStoryId ?? null,
    pendingRetry,
    events: eventCount,
  };

  return (
    <section className="inspector">
      <div className="inspector-head">
        <div>
          <p className="panel-kicker">Inspector</p>
          <h2 className="panel-title">Estado técnico</h2>
        </div>
        <div className="inspector-tabs">
          <span className="inspector-tab active">JSON</span>
        </div>
      </div>
      <pre className="json-view">{JSON.stringify(payload, null, 2)}</pre>
    </section>
  );
}

function CancelledPanel({
  onRestart,
}: {
  onRestart: () => void;
}): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Human review</p>
          <h2 className="panel-title">Workflow cancelado</h2>
        </div>
        <button className="panel-action" type="button" onClick={onRestart}>
          Nova tentativa
        </button>
      </div>
      <div className="panel-body">
        <div className="error-banner">
          A especificação foi rejeitada e a execução foi encerrada.
        </div>
      </div>
    </section>
  );
}

export function App(): JSX.Element {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
          if (
            event.status === "completed" ||
            event.status === "cancelled" ||
            event.status === "error"
          ) {
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
    const { threadId: id } = await workflowApi.start(
      stories,
      llmSettings ?? undefined
    );
    setThreadId(id);
  };

  const handleSpecApproval = async (
    approved: boolean,
    editedSpec?: Spec
  ): Promise<void> => {
    if (!threadId || !pendingSpec) return;

    if (!approved) {
      await workflowApi.resume(threadId, pendingSpec.userStoryId, {
        approved: false,
        reviewedAt: new Date().toISOString(),
      });
      setPendingSpec(null);
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

  const llmStatus = llmSettings ? llmSettings.provider : "env";
  const settingsModal = (
    <LlmSettingsModal
      isOpen={isSettingsOpen}
      settings={llmSettings}
      onClose={() => setIsSettingsOpen(false)}
      onSave={(settings) => {
        setLlmSettings(settings);
        setIsSettingsOpen(false);
      }}
    />
  );

  if (!threadId) {
    return (
      <>
        <Shell
          title="horus.ai"
          subtitle="Agentic software delivery console"
          onOpenSettings={() => setIsSettingsOpen(true)}
          status={[
            { label: "mode", value: "draft" },
            { label: "stories", value: String(lastSubmittedStories.length || 1) },
            { label: "llm", value: llmStatus },
          ]}
        >
          <div className="workspace">
            <div className="stack">
              <UserStoryInputPage
                onSubmit={handleStart}
                initialStories={lastSubmittedStories}
              />
            </div>
            <div className="stack">
              <WorkflowBlueprint />
              <WorkflowInspector
                threadId={null}
                workflowState={null}
                pendingSpec={null}
                pendingRetry={null}
                eventCount={0}
              />
            </div>
          </div>
        </Shell>
        {settingsModal}
      </>
    );
  }

  return (
    <>
      <Shell
        title="horus.ai"
        subtitle="Agentic software delivery console"
        onOpenSettings={() => setIsSettingsOpen(true)}
        status={[
          { label: "thread", value: `${threadId.slice(0, 8)}…${threadId.slice(-4)}` },
          { label: "stream", value: isConnected ? "live" : "offline", live: isConnected },
          { label: "events", value: String(events.length) },
          { label: "llm", value: llmStatus },
        ]}
      >
        <div className="workspace">
          <div className="stack">
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

            {workflowState?.status === "cancelled" && (
              <CancelledPanel
                onRestart={() => {
                  setThreadId(null);
                  setPendingSpec(null);
                  setWorkflowState(null);
                }}
              />
            )}

            {workflowState?.status === "completed" && threadId && (
              <ArtifactsPanel state={workflowState} threadId={threadId} />
            )}

            {workflowState && <UserStoryList state={workflowState} />}
          </div>

          <div className="stack">
            <WorkflowProgress
              threadId={threadId}
              events={events}
              isConnected={isConnected}
            />
            <WorkflowInspector
              threadId={threadId}
              workflowState={workflowState}
              pendingSpec={pendingSpec}
              pendingRetry={pendingRetry}
              eventCount={events.length}
            />
          </div>
        </div>
      </Shell>
      {settingsModal}
    </>
  );
}
