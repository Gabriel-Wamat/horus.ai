import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type {
  FrontendProject,
  PreviewDeviceName,
  PreviewEvent,
  PreviewSession,
  WorkflowState,
  AgentResult,
} from "@u-build/shared";
import { getLatestSuccessfulAgentResult } from "@u-build/shared";
import { previewApi } from "../api/previewApi.js";
import { usePreviewEvents } from "../hooks/usePreviewEvents.js";
import { ExecutionConsolePanel } from "./ExecutionConsolePanel.js";
import { PreviewCanvas } from "./PreviewCanvas.js";
import { PreviewConversationPanel } from "./PreviewConversationPanel.js";
import { PreviewToolbar } from "./PreviewToolbar.js";
import {
  mergeEvents,
  normalizeRoute,
} from "../features/visual-preview/previewEventUtils.js";
import {
  canShowInDefaultPreviewList,
  selectDefaultProject,
  selectNewestProject,
} from "../features/visual-preview/projectSelection.js";
import { usePreviewChatRuntime } from "../features/visual-preview/usePreviewChatRuntime.js";

export function VisualPreviewConsole({
  workspaceFolderId,
  userStoryId,
  workflowState,
}: {
  readonly workspaceFolderId: string | undefined;
  readonly userStoryId: string | null;
  readonly workflowState?: WorkflowState;
}): JSX.Element {
  const [projects, setProjects] = useState<FrontendProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [route, setRoute] = useState("/");
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [timeline, setTimeline] = useState<PreviewEvent[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [isExecutionConsoleCollapsed, setIsExecutionConsoleCollapsed] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasUserSelectedProjectRef = useRef(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const { events: previewEvents, latestEvent, isConnected } = usePreviewEvents(
    session?.id ?? null
  );

  const handlePreviewSessionResolved = useCallback(
    (nextSession: PreviewSession, events: PreviewEvent[]): void => {
      setSession(nextSession);
      setTimeline((current) => mergeEvents(current, events));
    },
    []
  );

  const chatRuntime = usePreviewChatRuntime({
    selectedProject,
    workspaceFolderId,
    userStoryId,
    previewSession: session,
    onPreviewSessionResolved: handlePreviewSessionResolved,
    onError: setError,
  });

  useEffect(() => {
    let cancelled = false;

    void previewApi
      .listProjects({ visibility: "visible" })
      .then((items) => {
        if (cancelled) return;
        const defaultProject = hasUserSelectedProjectRef.current
          ? selectDefaultProject(items, selectedProjectId)
          : selectNewestProject(items);
        setProjects(items);
        setSelectedProjectId(defaultProject?.id ?? "");
        setRoute(defaultProject?.defaultRoute ?? "/");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao listar projetos.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProjects(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setRoute(selectedProject.defaultRoute);
    setSession(null);
    setTimeline([]);
    setError(null);
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;
    if (canShowInDefaultPreviewList(selectedProject)) return;

    const fallbackProject = selectNewestProject(
      projects.filter(canShowInDefaultPreviewList)
    );
    setSelectedProjectId(fallbackProject?.id ?? "");
  }, [projects, selectedProject]);

  useEffect(() => {
    if (previewEvents.length === 0) return;
    setTimeline((current) => mergeEvents(current, previewEvents));
  }, [previewEvents]);

  useEffect(() => {
    if (!latestEvent || !session) return;
    void previewApi
      .getSession(session.id)
      .then(setSession)
      .catch(() => undefined);
  }, [latestEvent, session?.id]);

  const [selectedWorkflowStoryId, setSelectedWorkflowStoryId] = useState("");

  const workflowHtmlArtifacts = useMemo(() => {
    if (!workflowState) return [];
    return workflowState.userStories
      .map((story) => {
        const results: AgentResult[] = workflowState.agentResults[story.id] ?? [];
        const frontResult = getLatestSuccessfulAgentResult(results, "front");
        const html =
          frontResult?.status === "success"
            ? (frontResult.output["html"] as string | undefined) ?? null
            : null;
        return { storyId: story.id, storyTitle: story.title, html };
      })
      .filter(
        (a): a is { storyId: string; storyTitle: string; html: string } =>
          Boolean(a.html)
      );
  }, [workflowState]);

  if (!isLoadingProjects && workflowHtmlArtifacts.length > 0 && !session) {
    const activeId =
      selectedWorkflowStoryId || (workflowHtmlArtifacts[0]?.storyId ?? "");
    const activeArtifact =
      workflowHtmlArtifacts.find((a) => a.storyId === activeId) ??
      workflowHtmlArtifacts[0];

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 82px)",
          overflow: "hidden",
          background: "var(--bg, #0b0e0c)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 16px",
            borderBottom: "1px solid var(--bd, #262c30)",
            background: "var(--s1, #14181a)",
            minHeight: 44,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--t3, #6f7a80)",
              flexShrink: 0,
            }}
          >
            Preview HTML
          </span>
          {workflowHtmlArtifacts.length > 1 ? (
            <div style={{ display: "flex", gap: 6, overflow: "hidden" }}>
              {workflowHtmlArtifacts.map((a) => (
                <button
                  key={a.storyId}
                  type="button"
                  onClick={() => setSelectedWorkflowStoryId(a.storyId)}
                  className={`inspector-tab${activeId === a.storyId ? " active" : ""}`}
                >
                  {a.storyTitle.length > 40
                    ? `${a.storyTitle.slice(0, 40)}…`
                    : a.storyTitle}
                </button>
              ))}
            </div>
          ) : (
            activeArtifact && (
              <span style={{ fontSize: 12, color: "var(--t2, #a4adb3)" }}>
                {activeArtifact.storyTitle}
              </span>
            )
          )}
        </div>
        {activeArtifact && (
          <iframe
            srcDoc={activeArtifact.html}
            title={`Preview: ${activeArtifact.storyTitle}`}
            sandbox="allow-scripts"
            style={{ flex: 1, width: "100%", border: "none", background: "#fff" }}
          />
        )}
      </div>
    );
  }

  const appendEvent = (event: PreviewEvent): void => {
    setTimeline((current) => mergeEvents(current, [event]));
  };

  const ensureSession = async (): Promise<PreviewSession> => {
    if (!selectedProject) {
      throw new Error("Selecione um projeto de frontend.");
    }

    if (session && session.projectId === selectedProject.id) {
      return session;
    }

    const result = await previewApi.createSession({
      projectId: selectedProject.id,
      route: normalizeRoute(route || selectedProject.defaultRoute),
      device: "pc",
    });
    setSession(result.session);
    appendEvent(result.event);
    const events = await previewApi.listTimeline(result.session.id);
    setTimeline((current) => mergeEvents(current, events));
    return result.session;
  };

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    setIsActing(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na ação do preview.");
    } finally {
      setIsActing(false);
    }
  };

  const handleStart = (): void => {
    void runAction(async () => {
      const activeSession = await ensureSession();
      const result = await previewApi.startSession(activeSession.id);
      setSession(result.session);
      appendEvent(result.event);
    });
  };

  const handleStop = (): void => {
    if (!session) return;
    void runAction(async () => {
      const result = await previewApi.stopSession(session.id);
      setSession(result.session);
      appendEvent(result.event);
    });
  };

  const handleReload = (): void => {
    if (!session) return;
    void runAction(async () => {
      const result = await previewApi.reloadSession(session.id);
      setSession(result.session);
      appendEvent(result.event);
    });
  };

  const handleSetDevice = (device: PreviewDeviceName): void => {
    if (!session || session.device.name === device) return;
    void runAction(async () => {
      const result = await previewApi.setDevice(session.id, device);
      setSession(result.session);
      appendEvent(result.event);
    });
  };

  const handleSelectProject = (projectId: string): void => {
    hasUserSelectedProjectRef.current = true;
    setSelectedProjectId(projectId);
  };

  return (
    <div
      className={`preview-console ${
        isExecutionConsoleCollapsed ? "is-execution-console-collapsed" : ""
      }`}
    >
      <PreviewConversationPanel
        projects={projects}
        selectedProjectId={selectedProjectId}
        selectedProject={selectedProject}
        session={session}
        chatMessages={chatRuntime.chatMessages}
        workflowActivity={chatRuntime.workflowActivity}
        route={route}
        isLoading={isLoadingProjects}
        error={error}
        instructionMessage={chatRuntime.instructionMessage}
        instructionMode={chatRuntime.instructionMode}
        isSubmittingInstruction={chatRuntime.isSubmittingInstruction}
        isChatReady={Boolean(!chatRuntime.chatDisabledReason)}
        chatDisabledReason={chatRuntime.chatDisabledReason}
        onSelectProject={handleSelectProject}
        onChangeRoute={setRoute}
        onChangeInstructionMessage={chatRuntime.setInstructionMessage}
        onChangeInstructionMode={chatRuntime.setInstructionMode}
        onCancelInstruction={chatRuntime.cancelInstruction}
        onRetryMessage={chatRuntime.retryInstruction}
        onSubmitInstruction={chatRuntime.submitInstruction}
      />

      <section className="preview-main-panel">
        <PreviewToolbar
          session={session}
          route={session?.route ?? route}
          isActing={isActing}
          isConnected={isConnected}
          onStart={handleStart}
          onStop={handleStop}
          onReload={handleReload}
          onSetDevice={handleSetDevice}
        />
        <PreviewCanvas
          session={session}
          refreshToken={chatRuntime.previewRefreshToken}
        />
      </section>

      <ExecutionConsolePanel
        isCollapsed={isExecutionConsoleCollapsed}
        selectedProject={selectedProject}
        workflowThreadId={chatRuntime.activeWorkflowThreadId}
        workflowEvents={chatRuntime.workflowEvents}
        fileOperations={chatRuntime.fileOperations}
        chatMessages={chatRuntime.chatMessages}
        onToggleCollapsed={() =>
          setIsExecutionConsoleCollapsed((current) => !current)
        }
      />
    </div>
  );
}
