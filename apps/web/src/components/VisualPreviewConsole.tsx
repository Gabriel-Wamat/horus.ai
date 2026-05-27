import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type {
  ChatMessage,
  ChatSession,
  FrontendProject,
  HorusChatOutcome,
  PreviewDeviceName,
  PreviewEvent,
  PreviewSession,
  VisualInstructionMode,
} from "@u-build/shared";
import { horusChatApi } from "../api/horusChatApi.js";
import { previewApi } from "../api/previewApi.js";
import { usePreviewEvents } from "../hooks/usePreviewEvents.js";
import { PreviewCanvas } from "./PreviewCanvas.js";
import {
  PreviewConversationPanel,
  type PreviewChatMessage,
} from "./PreviewConversationPanel.js";
import { PreviewToolbar } from "./PreviewToolbar.js";

function mergeEvents(current: PreviewEvent[], incoming: PreviewEvent[]): PreviewEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) {
    byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function mapChatMessage(
  message: ChatMessage,
  outcome?: HorusChatOutcome
): PreviewChatMessage {
  return {
    id: message.id,
    role: message.role,
    body: message.body,
    createdAt: message.createdAt,
    ...(message.role === "agent" && outcome?.evidenceSources
      ? { evidenceSources: outcome.evidenceSources }
      : {}),
    ...(message.role === "agent" && outcome?.groundingStatus
      ? { groundingStatus: outcome.groundingStatus }
      : {}),
    ...(message.contextSnapshot.projectId
      ? { projectId: message.contextSnapshot.projectId }
      : {}),
    ...(message.contextSnapshot.previewSessionId
      ? { previewSessionId: message.contextSnapshot.previewSessionId }
      : {}),
  };
}

function mergeChatMessages(
  current: PreviewChatMessage[],
  incoming: PreviewChatMessage[]
): PreviewChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
}

function selectDefaultProject(
  projects: FrontendProject[],
  currentProjectId: string
): FrontendProject | null {
  const currentProject = projects.find((project) => project.id === currentProjectId);
  if (currentProject) return currentProject;

  return [...projects].sort((a, b) => {
    const byCreatedAt =
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (byCreatedAt !== 0) return byCreatedAt;
    return a.name.localeCompare(b.name);
  })[0] ?? null;
}

function selectNewestProject(projects: FrontendProject[]): FrontendProject | null {
  return [...projects].sort((a, b) => {
    const byCreatedAt =
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (byCreatedAt !== 0) return byCreatedAt;
    return a.name.localeCompare(b.name);
  })[0] ?? null;
}

export function VisualPreviewConsole({
  workspaceFolderId,
  userStoryId,
}: {
  readonly workspaceFolderId: string | undefined;
  readonly userStoryId: string | null;
}): JSX.Element {
  const [projects, setProjects] = useState<FrontendProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [route, setRoute] = useState("/");
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [timeline, setTimeline] = useState<PreviewEvent[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingChatSession, setIsLoadingChatSession] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructionMode, setInstructionMode] =
    useState<VisualInstructionMode>("build");
  const [instructionMessage, setInstructionMessage] = useState("");
  const [isSubmittingInstruction, setIsSubmittingInstruction] = useState(false);
  const [chatMessages, setChatMessages] = useState<PreviewChatMessage[]>([]);
  const hasUserSelectedProjectRef = useRef(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const { events: previewEvents, latestEvent, isConnected } = usePreviewEvents(
    session?.id ?? null
  );

  useEffect(() => {
    let cancelled = false;

    void previewApi
      .listProjects()
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
    setInstructionMessage("");
    setError(null);
  }, [selectedProject]);

  useEffect(() => {
    let cancelled = false;
    setChatSession(null);
    setChatMessages([]);
    setInstructionMessage("");

    if (!workspaceFolderId || !userStoryId) {
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingChatSession(true);
    setError(null);

    void horusChatApi
      .listSessions({ workspaceFolderId, userStoryId })
      .then(async (sessions) => {
        if (cancelled) return;
        const nextSession =
          sessions[0] ??
          (await horusChatApi.createSession({ workspaceFolderId, userStoryId }));
        if (cancelled) return;
        setChatSession(nextSession);
        const messages = await horusChatApi.listMessages(nextSession.id);
        if (cancelled) return;
        setChatMessages(messages.map((message) => mapChatMessage(message)));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Falha ao preparar o chat do Horus."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingChatSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceFolderId, userStoryId]);

  useEffect(() => {
    if (previewEvents.length === 0) return;
    setTimeline((current) => mergeEvents(current, previewEvents));
  }, [previewEvents]);

  useEffect(() => {
    if (session || !selectedProject) return;
    const latestPreviewMessage = [...chatMessages]
      .reverse()
      .find(
        (message) =>
          message.previewSessionId && message.projectId === selectedProject.id
      );
    if (!latestPreviewMessage?.previewSessionId) return;

    let cancelled = false;
    void previewApi
      .getSession(latestPreviewMessage.previewSessionId)
      .then(async (nextSession) => {
        if (cancelled || nextSession.projectId !== selectedProject.id) return;
        setSession(nextSession);
        const events = await previewApi.listTimeline(nextSession.id);
        if (!cancelled) {
          setTimeline((current) => mergeEvents(current, events));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [chatMessages, selectedProject, session]);

  useEffect(() => {
    if (!latestEvent || !session) return;
    void previewApi
      .getSession(session.id)
      .then(setSession)
      .catch(() => undefined);
  }, [latestEvent, session?.id]);

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

  const handleCreateDraft = (): void => {
    if (!chatSession || !workspaceFolderId || !userStoryId || !selectedProject) {
      setError("Selecione uma user story e um projeto antes de enviar para Horus.");
      return;
    }
    const message = instructionMessage.trim();
    if (!message) return;
    setIsSubmittingInstruction(true);
    setError(null);
    void horusChatApi
      .submitTurn({
        chatSessionId: chatSession.id,
        message,
        projectId: selectedProject.id,
        workspaceFolderId,
        userStoryId,
        ...(session ? { previewSessionId: session.id } : {}),
      })
      .then((result) => {
        const nextMessages = [
          mapChatMessage(result.userMessage),
          result.assistantMessage
            ? mapChatMessage(result.assistantMessage, result.outcome)
            : null,
        ].filter((item): item is PreviewChatMessage => Boolean(item));
        setChatMessages((current) =>
          mergeChatMessages(current, nextMessages)
        );
        if (result.outcome.previewSessionId) {
          void previewApi
            .getSession(result.outcome.previewSessionId)
            .then(async (nextSession) => {
              setSession(nextSession);
              const events = await previewApi.listTimeline(nextSession.id);
              setTimeline((current) => mergeEvents(current, events));
            })
            .catch(() => undefined);
        }
        setInstructionMessage("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Falha ao enviar mensagem para Horus.");
      })
      .finally(() => setIsSubmittingInstruction(false));
  };

  const chatDisabledReason = !workspaceFolderId || !userStoryId
    ? "Selecione uma user story para isolar o contexto do chat."
    : isLoadingChatSession
    ? "Preparando a memória isolada do chat."
    : !chatSession
    ? "Não foi possível preparar a sessão de chat."
    : !selectedProject
    ? "Selecione um projeto de frontend."
    : undefined;

  return (
    <div className="preview-console">
      <PreviewConversationPanel
        projects={projects}
        selectedProjectId={selectedProjectId}
        selectedProject={selectedProject}
        session={session}
        chatMessages={chatMessages}
        route={route}
        isLoading={isLoadingProjects}
        error={error}
        instructionMessage={instructionMessage}
        instructionMode={instructionMode}
        isSubmittingInstruction={isSubmittingInstruction}
        isChatReady={Boolean(!chatDisabledReason)}
        chatDisabledReason={chatDisabledReason}
        onSelectProject={handleSelectProject}
        onChangeRoute={setRoute}
        onChangeInstructionMessage={setInstructionMessage}
        onChangeInstructionMode={setInstructionMode}
        onSubmitInstruction={handleCreateDraft}
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
        <PreviewCanvas session={session} />
      </section>
    </div>
  );
}
