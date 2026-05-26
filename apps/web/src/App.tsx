import { useState, useEffect, useRef, type JSX } from "react";
import type {
  WorkflowState,
  Spec,
  UserStory,
  LlmSettings,
  WorkspaceFolder,
} from "@u-build/shared";
import { workflowApi } from "./api/workflowApi.js";
import { useEventStream } from "./hooks/useEventStream.js";
import { UserStoryInputPage } from "./components/UserStoryInputPage.js";
import { RetryApproval, type RetryApprovalPayload } from "./components/RetryApproval.js";
import { ArtifactsPanel } from "./components/ArtifactsPanel.js";
import { Shell } from "./components/Shell.js";
import { LlmSettingsModal } from "./components/LlmSettingsModal.js";
import { StorySpecWorkspace } from "./components/StorySpecWorkspace.js";
import { VisualPreviewConsole } from "./components/VisualPreviewConsole.js";
import { WorkflowProgress } from "./components/WorkflowProgress.js";

type StorySpecTab = "story" | "spec";
type AppMode = "stories" | "preview";

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
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    return mode === "preview" ? "preview" : "stories";
  });
  const [threadId, setThreadId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([]);
  const [selectedWorkspaceFolderId, setSelectedWorkspaceFolderId] = useState("");
  const [isLoadingWorkspaceFolders, setIsLoadingWorkspaceFolders] = useState(false);
  const [workspaceFolderError, setWorkspaceFolderError] = useState<string | null>(null);
  const [persistedStories, setPersistedStories] = useState<UserStory[]>([]);
  const [persistedSpecsByStoryId, setPersistedSpecsByStoryId] = useState<Record<string, Spec>>({});
  const [isLoadingWorkspaceStories, setIsLoadingWorkspaceStories] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [storySpecTab, setStorySpecTab] = useState<StorySpecTab>("story");
  const [isStartingWorkflow, setIsStartingWorkflow] = useState(false);

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
  const autoApproveBuildRef = useRef(false);
  const autoApprovedSpecIdsRef = useRef(new Set<string>());
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

  useEffect(() => {
    if (!pendingSpec) return;
    setSelectedStoryId(pendingSpec.userStoryId);
    setStorySpecTab("spec");
  }, [pendingSpec]);

  const loadWorkspaceFolders = async (): Promise<void> => {
    setIsLoadingWorkspaceFolders(true);
    setWorkspaceFolderError(null);
    await workflowApi
      .listWorkspaceFolders()
      .then((folders) => {
        setWorkspaceFolders(folders);
        setSelectedWorkspaceFolderId((current) => {
          if (current && folders.some((folder) => folder.id === current)) {
            return current;
          }
          const sorted = [...folders].sort((a, b) => b.storyCount - a.storyCount);
          return sorted[0]?.id ?? "";
        });
      })
      .catch((error) => {
        setWorkspaceFolderError(
          error instanceof Error ? error.message : "Falha ao carregar pastas."
        );
      })
      .finally(() => setIsLoadingWorkspaceFolders(false));
  };

  useEffect(() => {
    void loadWorkspaceFolders();
  }, []);

  useEffect(() => {
    if (!isStoryModalOpen) return;
    void loadWorkspaceFolders();
  }, [isStoryModalOpen]);

  useEffect(() => {
    if (!selectedWorkspaceFolderId) {
      setPersistedStories([]);
      setPersistedSpecsByStoryId({});
      setIsLoadingWorkspaceStories(false);
      return;
    }

    let isCurrentRequest = true;
    setIsLoadingWorkspaceStories(true);
    setWorkspaceFolderError(null);

    void workflowApi
      .listWorkspaceStoryArtifacts(selectedWorkspaceFolderId)
      .then(({ userStories, specsByStoryId }) => {
        if (!isCurrentRequest) return;
        setPersistedStories(userStories);
        setPersistedSpecsByStoryId(specsByStoryId);
        setLastSubmittedStories([]);
        setSelectedStoryId((current) => {
          if (current && userStories.some((story) => story.id === current)) {
            return current;
          }
          return userStories[0]?.id ?? null;
        });
      })
      .catch((error) => {
        if (!isCurrentRequest) return;
        setWorkspaceFolderError(
          error instanceof Error ? error.message : "Falha ao carregar user stories."
        );
      })
      .finally(() => {
        if (isCurrentRequest) {
          setIsLoadingWorkspaceStories(false);
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [selectedWorkspaceFolderId]);

  const handleCreateWorkspaceFolder = async (name: string): Promise<void> => {
    const folder = await workflowApi.createWorkspaceFolder(name);
    setWorkspaceFolders((current) => [...current, folder]);
    setSelectedWorkspaceFolderId(folder.id);
    setWorkspaceFolderError(null);
  };

  const handleUpdateWorkspaceStory = async (story: UserStory): Promise<void> => {
    if (!selectedWorkspaceFolderId) return;
    const updated = await workflowApi.updateWorkspaceUserStory(
      selectedWorkspaceFolderId,
      story
    );
    setPersistedStories((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    );
    setPersistedSpecsByStoryId((current) => current);
    setLastSubmittedStories((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    );
  };

  const handleDeleteWorkspaceStory = async (storyId: string): Promise<void> => {
    if (!selectedWorkspaceFolderId) return;
    await workflowApi.deleteWorkspaceUserStory(selectedWorkspaceFolderId, storyId);
    const nextStories = submittedStories.filter((story) => story.id !== storyId);
    setPersistedStories((current) => current.filter((story) => story.id !== storyId));
    setPersistedSpecsByStoryId((current) => {
      const next = { ...current };
      delete next[storyId];
      return next;
    });
    setLastSubmittedStories((current) => current.filter((story) => story.id !== storyId));
    setSelectedStoryId(nextStories[0]?.id ?? null);
    void loadWorkspaceFolders();
  };

  const handleUpdateWorkspaceSpec = async (
    storyId: string,
    spec: Spec
  ): Promise<void> => {
    if (!selectedWorkspaceFolderId) return;
    const updated = await workflowApi.updateWorkspaceSpec(
      selectedWorkspaceFolderId,
      storyId,
      spec
    );
    setWorkflowState((current) =>
      current
        ? {
            ...current,
            specs: { ...current.specs, [storyId]: updated },
          }
        : current
    );
    setPersistedSpecsByStoryId((current) => ({ ...current, [storyId]: updated }));
    setPendingSpec((current) =>
      current?.userStoryId === storyId ? { ...current, spec: updated } : current
    );
  };

  const handleStart = async (
    stories: UserStory[],
    workspaceFolderId: string,
    options: {
      autoApproveAndBuild?: boolean;
      workflowMode?: "standard" | "spec_generation";
    } = {}
  ): Promise<void> => {
    setIsStartingWorkflow(true);
    autoApproveBuildRef.current = Boolean(options.autoApproveAndBuild);
    autoApprovedSpecIdsRef.current = new Set();
    setLastSubmittedStories(stories);
    setWorkflowState(null);
    setPendingSpec(null);
    setPendingRetry(null);
    processedCountRef.current = 0;
    setSelectedStoryId(stories[0]?.id ?? null);
    setStorySpecTab("spec");
    try {
      const { threadId: id } = await workflowApi.start(
        stories,
        workspaceFolderId,
        options.workflowMode ?? "standard",
        llmSettings ?? undefined
      );
      setPersistedStories(stories);
      void loadWorkspaceFolders();
      setThreadId(id);
      setIsStoryModalOpen(false);
    } finally {
      setIsStartingWorkflow(false);
    }
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

  useEffect(() => {
    if (!threadId || !pendingSpec || !autoApproveBuildRef.current) return;

    const approvalKey = `${threadId}:${pendingSpec.userStoryId}:${pendingSpec.spec.id}:${pendingSpec.spec.version}`;
    if (autoApprovedSpecIdsRef.current.has(approvalKey)) return;
    autoApprovedSpecIdsRef.current.add(approvalKey);

    void workflowApi
      .resume(threadId, pendingSpec.userStoryId, {
        approved: true,
        editedSpec: {
          ...pendingSpec.spec,
          approvedBy: "auto",
        },
        reviewedAt: new Date().toISOString(),
        reviewedBy: "horus-auto-build",
      })
      .then(() => {
        setPendingSpec(null);
        setStorySpecTab("spec");
      })
      .catch((error) => {
        setWorkspaceFolderError(
          error instanceof Error
            ? error.message
            : "Falha ao autorizar a construção automaticamente."
        );
      });
  }, [pendingSpec, threadId]);

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
  const submittedStories = workflowState?.userStories ??
    (persistedStories.length > 0 ? persistedStories : lastSubmittedStories);
  const hasTerminalWorkflowEvent = events.some(
    (event) =>
      event.type === "status_changed" &&
      (event.status === "completed" ||
        event.status === "cancelled" ||
        event.status === "error")
  );
  const hasRunningWorkflowEvent = events.some(
    (event) => event.type === "status_changed" && event.status === "running"
  );
  const isWorkflowRunning = Boolean(
    threadId && hasRunningWorkflowEvent && !hasTerminalWorkflowEvent
  );
  const displayedWorkflowState = workflowState
    ? {
        ...workflowState,
        specs: { ...persistedSpecsByStoryId, ...workflowState.specs },
      }
    : Object.keys(persistedSpecsByStoryId).length > 0
    ? {
        threadId: "00000000-0000-4000-8000-000000000000",
        ...(selectedWorkspaceFolderId
          ? { workspaceFolderId: selectedWorkspaceFolderId }
          : {}),
        userStories: submittedStories,
        currentUSIndex: 0,
        workflowMode: "standard" as const,
        specs: persistedSpecsByStoryId,
        workspaceArtifactContext: {},
        humanFeedback: {},
        agentResults: {},
        status: "idle" as const,
        startedAt: new Date(0).toISOString(),
      }
    : null;

  const specWorkspace = (
    <StorySpecWorkspace
      stories={submittedStories}
      workflowState={displayedWorkflowState}
      pendingSpec={pendingSpec}
      workspaceFolders={workspaceFolders}
      selectedWorkspaceFolderId={selectedWorkspaceFolderId}
      selectedStoryId={selectedStoryId}
      activeTab={storySpecTab}
      onCreateStory={() => setIsStoryModalOpen(true)}
      onGenerateSpecs={() => {
        if (!selectedWorkspaceFolderId || submittedStories.length === 0) return;
        void handleStart(submittedStories, selectedWorkspaceFolderId, {
          workflowMode: "spec_generation",
        });
      }}
      onGenerateSpecsAndBuild={() => {
        if (!selectedWorkspaceFolderId || submittedStories.length === 0) return;
        void handleStart(submittedStories, selectedWorkspaceFolderId, {
          autoApproveAndBuild: true,
        });
      }}
      onSelectWorkspaceFolder={setSelectedWorkspaceFolderId}
      onSelectStory={(storyId) => {
        setSelectedStoryId(storyId);
        setStorySpecTab(pendingSpec?.userStoryId === storyId ? "spec" : storySpecTab);
      }}
      onUpdateStory={handleUpdateWorkspaceStory}
      onDeleteStory={handleDeleteWorkspaceStory}
      onUpdateSpec={handleUpdateWorkspaceSpec}
      onChangeTab={setStorySpecTab}
      onApproveSpec={(edited) => handleSpecApproval(true, edited)}
      onRejectSpec={() => handleSpecApproval(false)}
      isGeneratingSpecs={isStartingWorkflow || isWorkflowRunning}
      isLoadingStories={isLoadingWorkspaceStories}
    />
  );

  const actionPanels = (
    <>
      {threadId && (
        <WorkflowProgress
          threadId={threadId}
          events={events}
          isConnected={isConnected}
        />
      )}

      {pendingRetry && threadId && (
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
            setStorySpecTab("story");
          }}
        />
      )}

      {workflowState?.status === "completed" && threadId && (
        <ArtifactsPanel state={workflowState} threadId={threadId} />
      )}
    </>
  );
  const hasActionPanels = Boolean(
    threadId ||
    pendingRetry ||
    workflowState?.status === "cancelled" ||
    workflowState?.status === "completed"
  );
  const storyModal = isStoryModalOpen ? (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setIsStoryModalOpen(false);
        }
      }}
    >
      <div
        className="story-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-modal-title"
      >
        <div className="modal-head">
          <div>
            <p className="panel-kicker">Briefing</p>
            <h2 id="story-modal-title" className="panel-title">
              Criar user-stories
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar criação de user-stories"
            onClick={() => setIsStoryModalOpen(false)}
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <UserStoryInputPage
          onSubmit={handleStart}
          initialStories={lastSubmittedStories}
          workspaceFolders={workspaceFolders}
          selectedWorkspaceFolderId={selectedWorkspaceFolderId}
          isLoadingWorkspaceFolders={isLoadingWorkspaceFolders}
          workspaceFolderError={workspaceFolderError}
          onSelectWorkspaceFolder={setSelectedWorkspaceFolderId}
          onCreateWorkspaceFolder={handleCreateWorkspaceFolder}
        />
      </div>
    </div>
  ) : null;

  const handleChangeMode = (mode: AppMode): void => {
    setAppMode(mode);
    const url = new URL(window.location.href);
    if (mode === "preview") {
      url.searchParams.set("mode", "preview");
    } else {
      url.searchParams.delete("mode");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const mainContent =
    appMode === "preview" ? (
      <VisualPreviewConsole
        workspaceFolderId={selectedWorkspaceFolderId || undefined}
        userStoryId={selectedStoryId}
      />
    ) : (
      <div className="user-story-screen">
        {specWorkspace}
        {hasActionPanels && <div className="user-story-ops-grid">{actionPanels}</div>}
      </div>
    );

  if (!threadId) {
    return (
      <>
        <Shell
          title="horus.ai"
          subtitle="Agentic software delivery console"
          activeMode={appMode}
          onChangeMode={handleChangeMode}
          onOpenSettings={() => setIsSettingsOpen(true)}
          status={[
            { label: "mode", value: appMode === "preview" ? "preview" : "draft" },
            { label: "stories", value: String(submittedStories.length) },
            { label: "llm", value: llmStatus },
          ]}
        >
          {mainContent}
        </Shell>
        {settingsModal}
        {storyModal}
      </>
    );
  }

  return (
    <>
      <Shell
        title="horus.ai"
        subtitle="Agentic software delivery console"
        activeMode={appMode}
        onChangeMode={handleChangeMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        status={[
          { label: "thread", value: `${threadId.slice(0, 8)}…${threadId.slice(-4)}` },
          { label: "stream", value: isConnected ? "live" : "offline", live: isConnected },
          { label: "events", value: String(events.length) },
          { label: "llm", value: llmStatus },
        ]}
      >
        {mainContent}
      </Shell>
      {settingsModal}
      {storyModal}
    </>
  );
}
