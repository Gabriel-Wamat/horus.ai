import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type {
  ChatMessage,
  ChatSession,
  FrontendProject,
  HorusChatStreamEvent,
  HorusChatOutcome,
  PreviewDeviceName,
  PreviewEvent,
  PreviewSession,
  VisualInstructionMode,
} from "@u-build/shared";
import { horusChatApi } from "../api/horusChatApi.js";
import { previewApi } from "../api/previewApi.js";
import { emitProjectFilesChanged } from "../features/project-files/utils/projectFilesEvents.js";
import { usePreviewEvents } from "../hooks/usePreviewEvents.js";
import { PreviewCanvas } from "./PreviewCanvas.js";
import {
  PreviewConversationPanel,
  type PreviewChatMessage,
  type PreviewWorkflowActivity,
} from "./PreviewConversationPanel.js";
import { PreviewToolbar } from "./PreviewToolbar.js";

function mergeEvents(current: PreviewEvent[], incoming: PreviewEvent[]): PreviewEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) {
    byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function upsertChatMessage(
  current: PreviewChatMessage[],
  message: PreviewChatMessage
): PreviewChatMessage[] {
  const existingIndex = current.findIndex((item) => item.id === message.id);
  if (existingIndex === -1) return [...current, message];

  return current.map((item) => (item.id === message.id ? message : item));
}

function replaceChatMessage(
  current: PreviewChatMessage[],
  previousId: string,
  message: PreviewChatMessage
): PreviewChatMessage[] {
  const next = [...current];
  const previousIndex = next.findIndex((item) => item.id === previousId);
  const duplicateIndex = next.findIndex((item) => item.id === message.id);

  if (previousIndex >= 0) {
    next[previousIndex] = message;
    if (duplicateIndex >= 0 && duplicateIndex !== previousIndex) {
      next.splice(duplicateIndex, 1);
    }
    return next;
  }

  if (duplicateIndex >= 0) {
    next[duplicateIndex] = message;
    return next;
  }

  return [...next, message];
}

function appendAssistantDelta(
  current: PreviewChatMessage[],
  messageId: string,
  delta: string
): PreviewChatMessage[] {
  return current.map((message) =>
    message.id === messageId
      ? {
          ...message,
          body: `${message.isPending ? "" : message.body}${delta}`,
          isPending: false,
          isStreaming: true,
        }
      : message
  );
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
    ...(message.contextSnapshot.workflowThreadId
      ? { workflowThreadId: message.contextSnapshot.workflowThreadId }
      : {}),
    ...(message.contextSnapshot.previewSessionId
      ? { previewSessionId: message.contextSnapshot.previewSessionId }
      : {}),
  };
}

function isLegacyWorkflowProgressMessage(message: ChatMessage): boolean {
  if (!message.contextSnapshot.workflowThreadId || message.role !== "agent") return false;
  return [
    "modo executor",
    "Thread ",
    "concluiu a etapa do modo executor",
    "Validação runtime:",
    "Validação passou:",
    "Validação encontrou problema:",
    "Preparei uma alteração concreta",
    "Apliquei o patch no projeto",
    "A revisão pediu ajuste.",
    "Corrida concluída.",
    "Comecei a corrida.",
    "preparou alterações no projeto",
    "aplicou alterações no projeto",
    "A execução dos agentes falhou:",
  ].some((snippet) => message.body.includes(snippet));
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

function createLocalChatMessage(input: {
  body: string;
  role: PreviewChatMessage["role"];
  createdAt?: string;
  isPending?: boolean;
  isStreaming?: boolean;
}): PreviewChatMessage {
  return {
    id: `local-${input.role}-${crypto.randomUUID()}`,
    role: input.role,
    body: input.body,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.isPending ? { isPending: true } : {}),
    ...(input.isStreaming ? { isStreaming: true } : {}),
  };
}

function isRecentWorkflowMessage(message: PreviewChatMessage): boolean {
  const createdAt = new Date(message.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt < 2 * 60 * 1000;
}

const WORKFLOW_PROGRESS_EVENT_TYPES = [
  "status_changed",
  "node_started",
  "node_completed",
  "patch_proposed",
  "patch_applied",
  "validation_evidence",
  "tool_call_started",
  "tool_call_finished",
  "tool_call_blocked",
  "awaiting_approval",
  "retry_started",
  "awaiting_retry_approval",
  "error",
] as const;

interface WorkflowProgressEvent {
  id: string;
  threadId: string;
  sequence: number;
  type: string;
  eventType?: string;
  phase?: string;
  actorName?: string;
  nodeId?: string;
  agentName?: string;
  status?: string;
  attempt?: number;
  title?: string;
  summary?: string;
  errorMessage?: string;
  timestamp?: string;
  filePaths?: string[];
  commandIds?: string[];
  evidence?: {
    status: string;
    commands: Array<{ commandId: string; exitCode: number }>;
    preview: { status: string };
  };
}

async function listWorkflowProgressEvents(
  threadId: string
): Promise<WorkflowProgressEvent[]> {
  const response = await fetch(`/api/agent-runs/${threadId}/events`, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  return response.json() as Promise<WorkflowProgressEvent[]>;
}

function eventDetail(event: WorkflowProgressEvent): string {
  return event.errorMessage ?? event.summary ?? event.title ?? "Evento registrado.";
}

function formatList(items: string[] | undefined, label: string): string {
  if (!items?.length) return "";
  const visible = items.slice(0, 3).join(", ");
  const remaining = items.length > 3 ? ` e mais ${items.length - 3}` : "";
  return `\n${label}: ${visible}${remaining}`;
}

function validationNarrative(event: WorkflowProgressEvent): string {
  const evidence = event.evidence;
  if (!evidence) return `Validação registrada. ${eventDetail(event)}`;
  const failedCommands = evidence.commands.filter((command) => command.exitCode !== 0).length;
  const commandSummary =
    evidence.commands.length === 0
      ? "sem comandos locais"
      : `${evidence.commands.length} comando(s), ${failedCommands} falha(s)`;
  const passed =
    evidence.status === "passed" &&
    evidence.preview.status === "passed" &&
    failedCommands === 0;
  if (passed) {
    return `Validação passou: preview OK e ${commandSummary}. Vou seguir para revisão/aplicação.`;
  }
  return `Validação encontrou problema: status ${evidence.status}, preview ${evidence.preview.status}, ${commandSummary}. Vou manter isso visível antes de qualquer finalização.`;
}

function formatWorkflowProgressEvent(event: WorkflowProgressEvent): string | null {
  const detail = eventDetail(event);
  const suffix =
    formatList(event.filePaths, "Arquivos") ||
    formatList(event.commandIds, "Comandos");

  switch (event.type) {
    case "status_changed":
      if (event.status === "running") {
        return "Comecei a corrida. Vou mostrar aqui só os marcos importantes.";
      }
      if (event.status === "completed") {
        return "Corrida concluída. O que passou pelo fluxo já pode ser conferido na preview.";
      }
      if (event.status === "cancelled") {
        return "Corrida cancelada. Parei sem aplicar novas alterações.";
      }
      if (event.status === "error") {
        return `A corrida parou com erro. ${detail}`;
      }
      return null;
    case "node_started":
      return null;
    case "node_completed":
      return null;
    case "patch_proposed":
      return `Preparei uma alteração concreta para o front. Agora vou validar antes de aplicar.${suffix}`;
    case "patch_applied":
      return `Apliquei o patch no projeto. Esses arquivos já foram escritos na pasta real.${suffix}`;
    case "validation_evidence":
      return `${validationNarrative(event)}${suffix}`;
    case "tool_call_started":
      return null;
    case "tool_call_finished":
      return null;
    case "tool_call_blocked":
      return `Uma ação foi bloqueada antes de seguir. ${detail}${suffix}`;
    case "awaiting_approval":
      return `Pausei para aprovação humana antes de continuar. ${detail}${suffix}`;
    case "retry_started":
      return `A revisão pediu ajuste. Vou corrigir o que faltou antes de tentar aplicar de novo.${suffix}`;
    case "awaiting_retry_approval":
      return `Pausei porque o limite de tentativas foi atingido. ${detail}${suffix}`;
    case "error":
      return `A corrida falhou antes de concluir. Motivo: ${detail}${suffix}`;
    default:
      return null;
  }
}

function isTerminalWorkflowEvent(event: WorkflowProgressEvent): boolean {
  return (
    event.type === "status_changed" &&
    (event.status === "completed" ||
      event.status === "cancelled" ||
      event.status === "error")
  );
}

function selectWorkflowReplayEvents(
  events: WorkflowProgressEvent[]
): WorkflowProgressEvent[] {
  const started = events.find(
    (event) => event.type === "status_changed" && event.status === "running"
  );
  const milestones = events.filter((event) => {
    if (event.type === "patch_proposed") return true;
    if (event.type === "validation_evidence") return true;
    if (event.type === "patch_applied") return true;
    return isTerminalWorkflowEvent(event);
  });
  return [...(started ? [started] : []), ...milestones].slice(-5);
}

function workflowActivityFromEvent(
  event: WorkflowProgressEvent
): PreviewWorkflowActivity | null {
  const updatedAt = event.timestamp ?? new Date().toISOString();
  switch (event.type) {
    case "patch_proposed":
      return {
        phase: "validating",
        label: "Validando",
        detail: "Patch preparado; checks reais em andamento antes da revisão.",
        active: true,
        updatedAt,
      };
    case "validation_evidence": {
      const failedCommands =
        event.evidence?.commands.filter((command) => command.exitCode !== 0)
          .length ?? 0;
      const failed =
        event.evidence?.status === "failed" ||
        event.evidence?.preview.status === "failed" ||
        failedCommands > 0;
      return failed
        ? {
            phase: "retrying",
            label: "Ajustando",
            detail: "A validação encontrou erro; o fluxo vai corrigir antes de aplicar.",
            active: true,
            updatedAt,
          }
        : {
            phase: "reviewing",
            label: "Revisando",
            detail: "Validação passou; conferindo antes de aplicar.",
            active: true,
            updatedAt,
          };
    }
    case "patch_applied":
      return {
        phase: "applying",
        label: "Aplicando",
        detail: "Patch aprovado; aplicando no projeto.",
        active: true,
        updatedAt,
      };
    case "retry_started":
      return {
        phase: "retrying",
        label: "Corrigindo",
        detail: "A revisão pediu ajuste; nova tentativa em andamento.",
        active: true,
        updatedAt,
      };
    case "status_changed":
      if (event.status === "completed") {
        return {
          phase: "completed",
          label: "Concluído",
          detail: "A corrida terminou e a preview pode ser conferida.",
          active: false,
          updatedAt,
        };
      }
      if (event.status === "cancelled" || event.status === "error") {
        return {
          phase: "failed",
          label: event.status === "cancelled" ? "Cancelado" : "Interrompido",
          detail: "A corrida parou sem nova entrega aplicada.",
          active: false,
          updatedAt,
        };
      }
      return null;
    case "error":
      return {
        phase: "failed",
        label: "Falha bloqueada",
        detail: "A entrega foi interrompida para não aplicar um resultado quebrado.",
        active: false,
        updatedAt,
      };
    default:
      return null;
  }
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
  const [workflowActivity, setWorkflowActivity] =
    useState<PreviewWorkflowActivity | null>(null);
  const hasUserSelectedProjectRef = useRef(false);
  const workflowProgressSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const workflowProgressEventIdsRef = useRef<Set<string>>(new Set());
  const workflowProgressThreadsRef = useRef<Set<string>>(new Set());
  const workflowProgressLinesRef = useRef<Map<string, string[]>>(new Map());
  const workflowProgressQueuesRef = useRef<Map<string, string[]>>(new Map());
  const workflowProgressTimersRef = useRef<Map<string, number>>(new Map());
  const workflowActivityTimerRef = useRef<number | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const { events: previewEvents, latestEvent, isConnected } = usePreviewEvents(
    session?.id ?? null
  );

  const scheduleWorkflowActivityClear = (delayMs: number): void => {
    if (workflowActivityTimerRef.current) {
      window.clearTimeout(workflowActivityTimerRef.current);
    }
    workflowActivityTimerRef.current = window.setTimeout(() => {
      setWorkflowActivity(null);
      workflowActivityTimerRef.current = null;
    }, delayMs);
  };

  const notifyProjectFilesChanged = (event: WorkflowProgressEvent): void => {
    if (!selectedProject || event.type !== "patch_applied") return;
    emitProjectFilesChanged({
      projectId: selectedProject.id,
      paths: event.filePaths ?? [],
      workflowThreadId: event.threadId,
      source: "preview-workflow",
      timestamp: event.timestamp ?? new Date().toISOString(),
    });
  };

  const updateWorkflowActivity = (event: WorkflowProgressEvent): void => {
    notifyProjectFilesChanged(event);
    const activity = workflowActivityFromEvent(event);
    if (!activity) return;
    setWorkflowActivity(activity);
    if (!activity.active) {
      scheduleWorkflowActivityClear(4200);
      return;
    }
    if (event.type === "patch_applied") {
      scheduleWorkflowActivityClear(2600);
      return;
    }
    if (workflowActivityTimerRef.current) {
      window.clearTimeout(workflowActivityTimerRef.current);
      workflowActivityTimerRef.current = null;
    }
  };

  const queueWorkflowProgressLine = (threadId: string, line: string): void => {
    const queue = workflowProgressQueuesRef.current.get(threadId) ?? [];
    const existingLines = workflowProgressLinesRef.current.get(threadId) ?? [];
    if (existingLines.includes(line) || queue.includes(line)) return;
    queue.push(line);
    workflowProgressQueuesRef.current.set(threadId, queue);
    if (workflowProgressTimersRef.current.has(threadId)) return;

    const drain = (): void => {
      const nextQueue = workflowProgressQueuesRef.current.get(threadId) ?? [];
      const nextLine = nextQueue.shift();
      if (!nextLine) {
        workflowProgressQueuesRef.current.delete(threadId);
        workflowProgressTimersRef.current.delete(threadId);
        return;
      }

      workflowProgressQueuesRef.current.set(threadId, nextQueue);
      const previousLines = workflowProgressLinesRef.current.get(threadId) ?? [];
      const nextLines = [...previousLines, nextLine].slice(-5);
      workflowProgressLinesRef.current.set(threadId, nextLines);
      setChatMessages((current) =>
        upsertChatMessage(current, {
          id: `workflow-progress-${threadId}`,
          role: "agent",
          body: nextLines.join("\n\n"),
          createdAt: new Date().toISOString(),
          workflowThreadId: threadId,
          isStreaming: true,
        })
      );

      if (nextQueue.length > 0) {
        workflowProgressTimersRef.current.set(
          threadId,
          window.setTimeout(drain, 900)
        );
      } else {
        workflowProgressTimersRef.current.delete(threadId);
      }
    };

    workflowProgressTimersRef.current.set(threadId, window.setTimeout(drain, 120));
  };

  const appendWorkflowProgressEvent = (event: WorkflowProgressEvent): void => {
    if (workflowProgressEventIdsRef.current.has(event.id)) return;
    workflowProgressEventIdsRef.current.add(event.id);
    updateWorkflowActivity(event);
    const line = formatWorkflowProgressEvent(event);
    if (!line) return;
    queueWorkflowProgressLine(event.threadId, line);
  };

  const streamWorkflowProgress = (
    threadId: string,
    options: { replayCompleted?: boolean } = {}
  ): void => {
    if (workflowProgressThreadsRef.current.has(threadId)) return;
    workflowProgressThreadsRef.current.add(threadId);

    void listWorkflowProgressEvents(threadId)
      .then((events) => {
        const terminal = events.some(isTerminalWorkflowEvent);
        if (terminal && !options.replayCompleted) return;
        selectWorkflowReplayEvents(events).forEach(appendWorkflowProgressEvent);
        if (terminal) return;

        const since = events.reduce(
          (max, event) => Math.max(max, event.sequence),
          0
        );
        const source = new EventSource(
          `/api/agent-runs/${threadId}/events/stream?since_sequence=${since}`
        );
        const handleEvent = (event: MessageEvent<string>): void => {
          appendWorkflowProgressEvent(JSON.parse(event.data) as WorkflowProgressEvent);
        };
        WORKFLOW_PROGRESS_EVENT_TYPES.forEach((type) => {
          source.addEventListener(type, handleEvent as EventListener);
        });
        workflowProgressSourcesRef.current.set(threadId, source);
      })
      .catch(() => {
        workflowProgressThreadsRef.current.delete(threadId);
      });
  };

  useEffect(() => {
    return () => {
      workflowProgressSourcesRef.current.forEach((source) => source.close());
      workflowProgressSourcesRef.current.clear();
      workflowProgressTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      workflowProgressTimersRef.current.clear();
      if (workflowActivityTimerRef.current) {
        window.clearTimeout(workflowActivityTimerRef.current);
        workflowActivityTimerRef.current = null;
      }
    };
  }, []);

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
    workflowProgressSourcesRef.current.forEach((source) => source.close());
    workflowProgressSourcesRef.current.clear();
    workflowProgressEventIdsRef.current.clear();
    workflowProgressThreadsRef.current.clear();
    workflowProgressLinesRef.current.clear();
    workflowProgressQueuesRef.current.clear();
    workflowProgressTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    workflowProgressTimersRef.current.clear();
    if (workflowActivityTimerRef.current) {
      window.clearTimeout(workflowActivityTimerRef.current);
      workflowActivityTimerRef.current = null;
    }
    setWorkflowActivity(null);

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
        setChatMessages(
          messages
            .filter((message) => !isLegacyWorkflowProgressMessage(message))
            .map((message) => mapChatMessage(message))
        );
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
    const latestWorkflowMessage = [...chatMessages]
      .reverse()
      .find(
        (message) =>
          message.workflowThreadId &&
          (message.isPending || message.isStreaming || isRecentWorkflowMessage(message))
      );
    if (latestWorkflowMessage?.workflowThreadId) {
      streamWorkflowProgress(latestWorkflowMessage.workflowThreadId);
    }
  }, [chatMessages]);

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
    const submittedAt = Date.now();
    const pendingUserMessage = createLocalChatMessage({
      role: "user",
      body: message,
      createdAt: new Date(submittedAt).toISOString(),
    });
    const pendingAgentMessage = createLocalChatMessage({
      role: "agent",
      body: "Horus está pensando...",
      createdAt: new Date(submittedAt + 1).toISOString(),
      isPending: true,
    });

    setChatMessages((current) =>
      mergeChatMessages(current, [pendingUserMessage, pendingAgentMessage])
    );
    setInstructionMessage("");
    setIsSubmittingInstruction(true);
    setError(null);
    const streamInput = {
      chatSessionId: chatSession.id,
      message,
      projectId: selectedProject.id,
      workspaceFolderId,
      userStoryId,
      ...(session ? { previewSessionId: session.id } : {}),
    };
    let activeAssistantMessageId = pendingAgentMessage.id;
    const handleStreamEvent = (event: HorusChatStreamEvent): void => {
      switch (event.type) {
        case "turn_started":
        case "intent_classified":
          return;
        case "user_message_persisted":
          setChatMessages((current) =>
            replaceChatMessage(current, pendingUserMessage.id, mapChatMessage(event.message))
          );
          return;
        case "assistant_message_started":
          activeAssistantMessageId = event.messageId;
          setChatMessages((current) =>
            replaceChatMessage(current, pendingAgentMessage.id, {
              id: event.messageId,
              role: "agent",
              body: "",
              createdAt: event.createdAt,
              isPending: true,
              isStreaming: true,
            })
          );
          return;
        case "assistant_text_delta":
          setChatMessages((current) =>
            appendAssistantDelta(current, event.messageId, event.delta)
          );
          return;
        case "evidence_sources":
          setChatMessages((current) =>
            current.map((item) =>
              item.id === event.messageId
                ? {
                    ...item,
                    evidenceSources: event.evidenceSources,
                    groundingStatus: event.groundingStatus,
                  }
                : item
            )
          );
          return;
        case "action_started":
          if (event.workflowThreadId) {
            streamWorkflowProgress(event.workflowThreadId, { replayCompleted: true });
            setWorkflowActivity({
              phase: "validating",
              label: "Preparando",
              detail: "Horus recebeu o pedido e está abrindo a corrida real.",
              active: true,
              updatedAt: new Date().toISOString(),
            });
            scheduleWorkflowActivityClear(8000);
          }
          setChatMessages((current) =>
            upsertChatMessage(current, {
              id: activeAssistantMessageId,
              role: "agent",
              body: event.label,
              createdAt: new Date().toISOString(),
              ...(event.workflowThreadId ? { workflowThreadId: event.workflowThreadId } : {}),
              ...(event.previewSessionId ? { previewSessionId: event.previewSessionId } : {}),
              isPending: false,
              isStreaming: true,
            })
          );
          return;
        case "action_updated":
          if (event.workflowThreadId) {
            streamWorkflowProgress(event.workflowThreadId, { replayCompleted: true });
          }
          setChatMessages((current) =>
            upsertChatMessage(current, {
              id: activeAssistantMessageId,
              role: "agent",
              body: event.summary ?? "Ação atualizada.",
              createdAt: new Date().toISOString(),
              ...(event.workflowThreadId ? { workflowThreadId: event.workflowThreadId } : {}),
              ...(event.previewSessionId ? { previewSessionId: event.previewSessionId } : {}),
              isPending: false,
              isStreaming: true,
            })
          );
          if (event.previewSessionId) {
            void previewApi
              .getSession(event.previewSessionId)
              .then(async (nextSession) => {
                setSession(nextSession);
                const events = await previewApi.listTimeline(nextSession.id);
                setTimeline((current) => mergeEvents(current, events));
              })
              .catch(() => undefined);
          }
          return;
        case "assistant_message_completed":
          if (event.outcome.workflowThreadId) {
            streamWorkflowProgress(event.outcome.workflowThreadId, {
              replayCompleted: true,
            });
          }
          setChatMessages((current) =>
            replaceChatMessage(
              current,
              activeAssistantMessageId,
              mapChatMessage(event.message, event.outcome)
            )
          );
          return;
        case "turn_completed":
          if (event.response.outcome.workflowThreadId) {
            streamWorkflowProgress(event.response.outcome.workflowThreadId, {
              replayCompleted: true,
            });
          }
          if (event.response.outcome.previewSessionId) {
            void previewApi
              .getSession(event.response.outcome.previewSessionId)
              .then(async (nextSession) => {
                setSession(nextSession);
                const events = await previewApi.listTimeline(nextSession.id);
                setTimeline((current) => mergeEvents(current, events));
              })
              .catch(() => undefined);
          }
          return;
        case "turn_failed":
          setChatMessages((current) =>
            replaceChatMessage(current, activeAssistantMessageId, {
              id: activeAssistantMessageId,
              role: "agent",
              body: event.message,
              createdAt: new Date().toISOString(),
              isPending: false,
              isStreaming: false,
            })
          );
          return;
      }
    };

    void horusChatApi
      .submitTurnStream(streamInput, handleStreamEvent)
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Falha ao enviar mensagem para Horus.";
        setError(message);
        setChatMessages((current) =>
          replaceChatMessage(current, activeAssistantMessageId, {
            id: activeAssistantMessageId,
            role: "agent",
            body: message,
            createdAt: new Date().toISOString(),
            isPending: false,
            isStreaming: false,
          })
        );
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
        workflowActivity={workflowActivity}
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
