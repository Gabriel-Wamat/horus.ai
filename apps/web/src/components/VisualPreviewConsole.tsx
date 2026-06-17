import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type {
  FrontendProject,
  PreviewDeviceName,
  PreviewEvent,
  PreviewSession,
} from "@u-build/shared";
import { previewApi } from "../api/previewApi.js";
import type { ActiveProjectConstruction } from "../app/activeProjectConstruction.js";
import { usePreviewEvents } from "../hooks/usePreviewEvents.js";
import { ExecutionConsolePanel } from "./ExecutionConsolePanel.js";
import { PreviewCanvas } from "./PreviewCanvas.js";
import { PreviewConversationPanel } from "./PreviewConversationPanel.js";
import { PreviewTimeline } from "./PreviewTimeline.js";
import { PreviewToolbar } from "./PreviewToolbar.js";
import {
  mergeEvents,
  normalizeRoute,
} from "../features/visual-preview/previewEventUtils.js";
import {
  canShowInDefaultPreviewList,
  selectDefaultProject,
  selectNewestProject,
  upsertPreviewProject,
} from "../features/visual-preview/projectSelection.js";
import { usePreviewChatRuntime } from "../features/visual-preview/usePreviewChatRuntime.js";

export function VisualPreviewConsole({
  workspaceFolderId,
  userStoryId,
  activeConstruction,
}: {
  readonly workspaceFolderId: string | undefined;
  readonly userStoryId: string | null;
  readonly activeConstruction: ActiveProjectConstruction | null;
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
  const autoStartedConstructionRunRef = useRef<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const {
    events: previewEvents,
    latestEvent,
    isConnected,
    error: previewStreamError,
  } = usePreviewEvents(session?.id ?? null);

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
    workflowThreadId: activeConstruction?.workflowThreadId ?? null,
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
    if (!activeConstruction) return;
    let cancelled = false;
    const activeProject = activeConstruction.frontendProject;
    const activeSession = activeConstruction.previewSession;

    if (activeProject) {
      setProjects((current) => upsertPreviewProject(current, activeProject));
      setSelectedProjectId(activeProject.id);
      setRoute(activeProject.defaultRoute);
      setSession(activeSession ?? null);
      setTimeline([]);
      setError(null);
      if (activeSession) {
        void previewApi
          .listTimeline(activeSession.id)
          .then((events) => {
            if (!cancelled) {
              setTimeline((current) => mergeEvents(current, events));
            }
          })
          .catch((err) => {
            if (!cancelled) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Falha ao carregar timeline do preview."
              );
            }
          });
      }
    }

    setIsLoadingProjects(true);
    void previewApi
      .listProjects({ visibility: "visible" })
      .then((items) => {
        if (cancelled) return;
        const mergedProjects = activeProject
          ? upsertPreviewProject(items, activeProject)
          : items;
        const selected =
          activeConstruction.frontendProjectId
            ? mergedProjects.find(
                (project) => project.id === activeConstruction.frontendProjectId
              ) ?? null
            : selectNewestProject(mergedProjects);
        setProjects(mergedProjects);
        if (selected) {
          setSelectedProjectId(selected.id);
          setRoute(selected.defaultRoute);
        }
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
  }, [activeConstruction]);

  useEffect(() => {
    if (!selectedProject) return;
    const activeSession = activeConstruction?.previewSession ?? null;
    setRoute(selectedProject.defaultRoute);
    if (activeSession?.projectId === selectedProject.id) {
      setSession(activeSession);
      return;
    }
    setSession(null);
    setTimeline([]);
    setError(null);
  }, [activeConstruction?.previewSession, selectedProject]);

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
    setError(null);
    setTimeline((current) => mergeEvents(current, previewEvents));
  }, [previewEvents]);

  useEffect(() => {
    if (!previewStreamError) return;
    setError(previewStreamError);
  }, [previewStreamError]);

  useEffect(() => {
    if (!latestEvent || !session) return;
    void previewApi
      .getSession(session.id)
      .then(setSession)
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "Falha ao atualizar sessão de preview."
        );
      });
  }, [latestEvent, session?.id]);

  const appendEvent = useCallback((event: PreviewEvent): void => {
    setTimeline((current) => mergeEvents(current, [event]));
  }, []);

  const ensureSession = useCallback(async (): Promise<PreviewSession> => {
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
  }, [appendEvent, route, selectedProject, session]);

  const runAction = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setIsActing(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na ação do preview.");
    } finally {
      setIsActing(false);
    }
  }, []);

  useEffect(() => {
    if (!activeConstruction?.frontendProjectId || !selectedProject) return;
    if (selectedProject.id !== activeConstruction.frontendProjectId) return;
    if (autoStartedConstructionRunRef.current === activeConstruction.constructionRunId) {
      return;
    }
    if (
      session?.projectId === selectedProject.id &&
      (session.status === "running" ||
        session.status === "starting" ||
        session.status === "error")
    ) {
      return;
    }

    autoStartedConstructionRunRef.current = activeConstruction.constructionRunId;
    void runAction(async () => {
      const activeSession = await ensureSession();
      const result = await previewApi.startSession(activeSession.id);
      setSession(result.session);
      appendEvent(result.event);
    });
  }, [
    activeConstruction?.constructionRunId,
    activeConstruction?.frontendProjectId,
    appendEvent,
    ensureSession,
    runAction,
    selectedProject,
    session?.projectId,
    session?.status,
  ]);

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
        <section
          className="preview-runtime-panel"
          aria-label="Evidência de execução do preview"
        >
          <div className="preview-runtime-head">
            <span>Evidência de runtime</span>
            <strong>{timeline.length} eventos</strong>
          </div>
          <PreviewTimeline events={timeline} />
        </section>
      </section>

      <ExecutionConsolePanel
        isCollapsed={isExecutionConsoleCollapsed}
        selectedProject={selectedProject}
        workflowThreadId={chatRuntime.activeWorkflowThreadId}
        workflowEvents={chatRuntime.workflowEvents}
        fileOperations={chatRuntime.fileOperations}
        fileOperationsError={chatRuntime.fileOperationsError}
        chatMessages={chatRuntime.chatMessages}
        onToggleCollapsed={() =>
          setIsExecutionConsoleCollapsed((current) => !current)
        }
      />
    </div>
  );
}
