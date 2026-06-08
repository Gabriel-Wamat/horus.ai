import { useEffect, useRef, useState, type JSX } from "react";
import type { Spec } from "@u-build/shared";
import { useAppNavigation } from "./app/useAppNavigation.js";
import { useDisplayedWorkflowState } from "./app/useDisplayedWorkflowState.js";
import {
  useProjectConstructionAction,
  type ProjectConstructionNotification as ProjectConstructionNotificationPayload,
} from "./app/useProjectConstructionAction.js";
import { useWorkspaceFolders } from "./app/useWorkspaceFolders.js";
import { useWorkflowRuntime } from "./app/useWorkflowRuntime.js";
import { RetryApproval } from "./components/RetryApproval.js";
import { ArtifactsPanel } from "./components/ArtifactsPanel.js";
import { Shell } from "./components/Shell.js";
import { LlmSettingsModal } from "./components/LlmSettingsModal.js";
import { StoryCreationDialog } from "./components/StoryCreationDialog.js";
import { StorySpecWorkspace } from "./components/StorySpecWorkspace.js";
import { VisualPreviewConsole } from "./components/VisualPreviewConsole.js";
import { WorkflowProgress } from "./components/WorkflowProgress.js";
import { Button, Panel, PanelHeader } from "./components/ui/index.js";
import { AgentFlowPage } from "./features/agent-flow-map/AgentFlowPage.js";
import { AgentTelemetryPage } from "./features/agent-flow-map/AgentTelemetryPage.js";
import { AgentSkillsPage } from "./features/agent-skills/AgentSkillsPage.js";
import { ProjectFilesPage } from "./features/project-files/ProjectFilesPage.js";

function CancelledPanel({ onRestart }: { onRestart: () => void }): JSX.Element {
  return (
    <Panel>
      <PanelHeader
        kicker="Human review"
        title="Workflow cancelado"
        action={
          <Button variant="panel" onClick={onRestart}>
          Nova tentativa
          </Button>
        }
      />
      <div className="panel-body">
        <div className="error-banner">
          A especificação foi rejeitada e a execução foi encerrada.
        </div>
      </div>
    </Panel>
  );
}

function ProjectConstructionNotification({
  notification,
  onClose,
}: {
  notification: ProjectConstructionNotificationPayload;
  onClose: () => void;
}): JSX.Element {
  return (
    <div
      className={`system-toast system-toast-${notification.kind}`}
      role={notification.kind === "error" ? "alert" : "status"}
      aria-live={notification.kind === "error" ? "assertive" : "polite"}
    >
      <div className="system-toast-indicator" aria-hidden="true" />
      <div className="system-toast-copy">
        <strong>{notification.title}</strong>
        <span>{notification.body}</span>
      </div>
      <button
        type="button"
        className="system-toast-close"
        aria-label="Fechar notificação"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}

export function App(): JSX.Element {
  const { appMode, setAppMode } = useAppNavigation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
  const storyCreateButtonRef = useRef<HTMLButtonElement>(null);

  const workspace = useWorkspaceFolders();
  const closeStoryModal = (): void => setIsStoryModalOpen(false);
  const workflow = useWorkflowRuntime({
    selectedWorkspaceFolderId: workspace.selectedWorkspaceFolderId,
    selectedStoryId: workspace.selectedStoryId,
    persistedSpecsByStoryId: workspace.persistedSpecsByStoryId,
    setPersistedStories: workspace.setPersistedStories,
    setPersistedSpecsByStoryId: workspace.setPersistedSpecsByStoryId,
    setLastSubmittedStories: workspace.setLastSubmittedStories,
    setSelectedStoryId: workspace.setSelectedStoryId,
    setStorySpecTab: workspace.setStorySpecTab,
    setWorkspaceFolderArtifactsById: workspace.setWorkspaceFolderArtifactsById,
    setWorkspaceFolderError: workspace.setWorkspaceFolderError,
    loadWorkspaceFolders: workspace.loadWorkspaceFolders,
    closeStoryModal,
  });

  useEffect(() => {
    if (!isStoryModalOpen) return;
    void workspace.loadWorkspaceFolders();
  }, [isStoryModalOpen]);

  const submittedStories =
    workflow.workflowState?.userStories ??
    (workspace.persistedStories.length > 0
      ? workspace.persistedStories
      : workspace.lastSubmittedStories);

  const hasTerminalWorkflowEvent = workflow.events.some(
    (event) =>
      event.type === "status_changed" &&
      (event.status === "completed" ||
        event.status === "cancelled" ||
        event.status === "error")
  );
  const hasRunningWorkflowEvent = workflow.events.some(
    (event) => event.type === "status_changed" && event.status === "running"
  );
  const isWorkflowRunning = Boolean(
    workflow.threadId && hasRunningWorkflowEvent && !hasTerminalWorkflowEvent
  );

  const { displayedWorkflowState, agentFlowState } = useDisplayedWorkflowState({
    workflowState: workflow.workflowState,
    threadId: workflow.threadId,
    selectedWorkspaceFolderId: workspace.selectedWorkspaceFolderId,
    selectedStoryId: workspace.selectedStoryId,
    submittedStories,
    persistedSpecsByStoryId: workspace.persistedSpecsByStoryId,
    pendingSpec: workflow.pendingSpec,
  });

  const projectConstruction = useProjectConstructionAction({
    selectedWorkspaceFolderId: workspace.selectedWorkspaceFolderId,
    workspaceFolders: workspace.workspaceFolders,
    submittedStories,
    persistedSpecsByStoryId: workspace.persistedSpecsByStoryId,
    setWorkspaceFolderError: workspace.setWorkspaceFolderError,
  });

  const handleUpdateWorkspaceSpec = async (
    storyId: string,
    spec: Spec
  ): Promise<void> => {
    const updated = await workspace.handleUpdateWorkspaceSpec(storyId, spec);
    if (!updated) return;
    workflow.setWorkflowState((current) =>
      current ? { ...current, specs: { ...current.specs, [storyId]: updated } } : current
    );
    workflow.setPendingSpec((current) =>
      current?.userStoryId === storyId ? { ...current, spec: updated } : current
    );
  };

  const specWorkspace = (
    <StorySpecWorkspace
      stories={submittedStories}
      workflowState={displayedWorkflowState}
      pendingSpec={workflow.pendingSpec}
      persistedSpecsByStoryId={workspace.persistedSpecsByStoryId}
      workspaceFolders={workspace.workspaceFolders}
      workspaceFolderArtifactsById={workspace.workspaceFolderArtifactsById}
      loadingWorkspaceFolderIds={workspace.loadingWorkspaceFolderIds}
      selectedWorkspaceFolderId={workspace.selectedWorkspaceFolderId}
      selectedStoryId={workspace.selectedStoryId}
      activeTab={workspace.storySpecTab}
      onCreateStory={() => setIsStoryModalOpen(true)}
      createStoryButtonRef={storyCreateButtonRef}
      onGenerateSpecs={() => {
        if (!workspace.selectedWorkspaceFolderId || submittedStories.length === 0) return;
        void workflow.handleStart(submittedStories, workspace.selectedWorkspaceFolderId, {
          workflowMode: "spec_generation",
        });
      }}
      onGenerateSpecsAndBuild={() => {
        if (!workspace.selectedWorkspaceFolderId || submittedStories.length === 0) return;
        void projectConstruction.startProjectConstruction();
      }}
      onSelectWorkspaceFolder={workspace.setSelectedWorkspaceFolderId}
      onLoadWorkspaceFolder={(folderId) => {
        void workspace.loadWorkspaceStoryArtifactsForFolder(folderId);
      }}
      onSelectStory={(storyId, folderId) => {
        if (folderId && folderId !== workspace.selectedWorkspaceFolderId) {
          workspace.setSelectedWorkspaceFolderId(folderId);
        }
        workspace.setSelectedStoryId(storyId);
        workspace.setStorySpecTab(
          workflow.pendingSpec?.userStoryId === storyId ? "spec" : workspace.storySpecTab
        );
      }}
      onUpdateStory={(story) => workspace.handleUpdateWorkspaceStory(story, submittedStories)}
      onDeleteStory={(storyId) => workspace.handleDeleteWorkspaceStory(storyId, submittedStories)}
      onUpdateSpec={handleUpdateWorkspaceSpec}
      onChangeTab={workspace.setStorySpecTab}
      onApproveSpec={(edited) => workflow.handleSpecApproval(true, edited)}
      onRejectSpec={() => workflow.handleSpecApproval(false)}
      isGeneratingSpecs={workflow.isStartingWorkflow || isWorkflowRunning}
      isLoadingStories={workspace.isLoadingWorkspaceStories}
    />
  );

  const actionPanels = (
    <>
      {workflow.threadId && (
        <WorkflowProgress
          threadId={workflow.threadId}
          events={workflow.events}
          isConnected={workflow.isConnected}
        />
      )}
      {workflow.pendingRetry && workflow.threadId && (
        <RetryApproval
          payload={workflow.pendingRetry}
          onContinue={() => workflow.handleRetryDecision(true)}
          onStop={() => workflow.handleRetryDecision(false)}
          isSubmitting={workflow.isRetrySubmitting}
        />
      )}
      {workflow.workflowState?.status === "cancelled" && (
        <CancelledPanel onRestart={workflow.resetWorkflow} />
      )}
      {workflow.workflowState?.status === "completed" && workflow.threadId && (
        <ArtifactsPanel state={workflow.workflowState} threadId={workflow.threadId} />
      )}
    </>
  );
  const hasActionPanels = Boolean(
    workflow.threadId ||
      workflow.pendingRetry ||
      workflow.workflowState?.status === "cancelled" ||
      workflow.workflowState?.status === "completed"
  );

  const mainContent =
    appMode === "preview" ? (
      <VisualPreviewConsole
        workspaceFolderId={workspace.selectedWorkspaceFolderId || undefined}
        userStoryId={workspace.selectedStoryId}
      />
    ) : appMode === "files" ? (
      <ProjectFilesPage />
    ) : appMode === "agents" ? (
      <AgentFlowPage workflowState={agentFlowState} events={workflow.events} />
    ) : appMode === "telemetry" ? (
      <AgentTelemetryPage workflowState={agentFlowState} events={workflow.events} />
    ) : appMode === "skills" ? (
      <AgentSkillsPage />
    ) : (
      <div className="user-story-screen">
        {specWorkspace}
        {hasActionPanels && <div className="user-story-ops-grid">{actionPanels}</div>}
      </div>
    );

  const llmStatus = workflow.isLoadingLlmProfile
    ? "checking"
    : workflow.llmProfile
    ? `${workflow.llmProfile.provider} ${workflow.llmProfile.validationStatus}`
    : "env";
  const shellStatus = workflow.threadId
    ? [
        {
          label: "thread",
          value: `${workflow.threadId.slice(0, 8)}…${workflow.threadId.slice(-4)}`,
        },
        {
          label: "stream",
          value: workflow.isConnected ? "live" : "offline",
          live: workflow.isConnected,
        },
        { label: "events", value: String(workflow.events.length) },
        { label: "llm", value: llmStatus },
      ]
    : [
        { label: "mode", value: appMode === "stories" ? "draft" : appMode },
        { label: "stories", value: String(submittedStories.length) },
        { label: "llm", value: llmStatus },
      ];

  return (
    <>
      <Shell
        title="horus.ai"
        subtitle="Agentic software delivery console"
        activeMode={appMode}
        onChangeMode={setAppMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        status={shellStatus}
      >
        {mainContent}
      </Shell>
      <LlmSettingsModal
        isOpen={isSettingsOpen}
        profile={workflow.llmProfile}
        onClose={() => setIsSettingsOpen(false)}
        onSave={async (settings) => {
          await workflow.saveLlmSettings(settings);
          setIsSettingsOpen(false);
        }}
        onTest={workflow.testLlmSettings}
        onDelete={workflow.deleteLlmSettings}
      />
      <StoryCreationDialog
        isOpen={isStoryModalOpen}
        triggerRef={storyCreateButtonRef}
        initialStories={workspace.lastSubmittedStories}
        workspaceFolders={workspace.workspaceFolders}
        selectedWorkspaceFolderId={workspace.selectedWorkspaceFolderId}
        isLoadingWorkspaceFolders={workspace.isLoadingWorkspaceFolders}
        workspaceFolderError={workspace.workspaceFolderError}
        onClose={closeStoryModal}
        onSubmit={workflow.handleStart}
        onSelectWorkspaceFolder={workspace.setSelectedWorkspaceFolderId}
        onCreateWorkspaceFolder={workspace.handleCreateWorkspaceFolder}
      />
      {projectConstruction.projectConstructionNotification && (
        <div className="system-toast-region">
          <ProjectConstructionNotification
            notification={projectConstruction.projectConstructionNotification}
            onClose={projectConstruction.dismissProjectConstructionNotification}
          />
        </div>
      )}
    </>
  );
}
