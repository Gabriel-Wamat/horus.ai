import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentFileOperationTelemetry,
  ChatSession,
  FrontendProject,
  HorusChatTurnInput,
  PreviewEvent,
  PreviewSession,
  VisualInstructionMode,
} from "@u-build/shared";
import { horusChatApi } from "../../api/horusChatApi.js";
import { previewApi } from "../../api/previewApi.js";
import { emitProjectFilesChanged } from "../project-files/utils/projectFilesEvents.js";
import type {
  PreviewChatMessage,
  PreviewWorkflowActivity,
} from "../../components/PreviewConversationPanel.js";
import { createChatTurnStreamController } from "./chatTurnStream.js";
import {
  createLocalChatMessage,
  mapVisibleProjectChatMessages,
  mergeChatMessages,
} from "./previewChatMessages.js";
import { useProjectChatScope } from "./useProjectChatScope.js";
import { useWorkflowFileOperations } from "./useWorkflowFileOperations.js";
import { useWorkflowProgressRuntime } from "./useWorkflowProgressRuntime.js";
import type { WorkflowProgressEvent } from "./workflowProgress.js";

export interface PreviewChatRuntimeState {
  readonly chatSession: ChatSession | null;
  readonly chatMessages: PreviewChatMessage[];
  readonly workflowActivity: PreviewWorkflowActivity | null;
  readonly workflowEvents: WorkflowProgressEvent[];
  readonly fileOperations: AgentFileOperationTelemetry[];
  readonly fileOperationsError: string | null;
  readonly previewRefreshToken: string | null;
  readonly activeWorkflowThreadId: string | null;
  readonly instructionMode: VisualInstructionMode;
  readonly instructionMessage: string;
  readonly isSubmittingInstruction: boolean;
  readonly isLoadingProjectChatScope: boolean;
  readonly isLoadingChatSession: boolean;
  readonly chatWorkspaceFolderId: string | null;
  readonly chatUserStoryId: string | null;
  readonly chatDisabledReason: string | undefined;
  readonly setInstructionMode: (mode: VisualInstructionMode) => void;
  readonly setInstructionMessage: (message: string) => void;
  readonly submitInstruction: () => void;
  readonly retryInstruction: (message: string) => void;
  readonly cancelInstruction: () => void;
}

export function usePreviewChatRuntime({
  selectedProject,
  workspaceFolderId,
  userStoryId,
  previewSession,
  workflowThreadId,
  onPreviewSessionResolved,
  onError,
}: {
  readonly selectedProject: FrontendProject | null;
  readonly workspaceFolderId: string | undefined;
  readonly userStoryId: string | null;
  readonly previewSession: PreviewSession | null;
  readonly workflowThreadId: string | null;
  readonly onPreviewSessionResolved: (
    session: PreviewSession,
    events: PreviewEvent[]
  ) => void;
  readonly onError: (message: string | null) => void;
}): PreviewChatRuntimeState {
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [chatMessages, setChatMessages] = useState<PreviewChatMessage[]>([]);
  const [instructionMode, setInstructionMode] =
    useState<VisualInstructionMode>("build");
  const [instructionMessage, setInstructionMessage] = useState("");
  const [isSubmittingInstruction, setIsSubmittingInstruction] = useState(false);
  const [isLoadingChatSession, setIsLoadingChatSession] = useState(false);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const chatMaxSequenceRef = useRef(0);

  const { chatWorkspaceFolderId, chatUserStoryId, isLoadingProjectChatScope } =
    useProjectChatScope({
      selectedProject,
      workspaceFolderId,
      userStoryId,
      onError,
    });

  const hydratePreviewSession = useCallback(
    (previewSessionId: string): void => {
      void previewApi
        .getSession(previewSessionId)
        .then(async (nextSession) => {
          const events = await previewApi.listTimeline(nextSession.id);
          onPreviewSessionResolved(nextSession, events);
        })
        .catch((err) => {
          onError(
            err instanceof Error
              ? err.message
              : "Falha ao atualizar sessão de preview."
          );
        });
    },
    [onError, onPreviewSessionResolved]
  );

  const syncChatMessagesFromServer = useCallback(
    async (options: { incremental?: boolean } = {}): Promise<void> => {
      if (!chatSession) return;
      const afterSequence =
        options.incremental === false ? 0 : chatMaxSequenceRef.current;
      const messages = await horusChatApi.listMessages(
        chatSession.id,
        afterSequence > 0 ? { afterSequence } : undefined
      );
      setChatMessages((current) =>
        mergeChatMessages(
          current,
          mapVisibleProjectChatMessages(messages, selectedProject?.id ?? null)
        )
      );
    },
    [chatSession, selectedProject?.id]
  );

  const handleWorkflowProgressEvent = useCallback((): void => {
    void syncChatMessagesFromServer();
  }, [syncChatMessagesFromServer]);

  const {
    workflowActivity,
    workflowEvents,
    setWorkflowActivity,
    scheduleWorkflowActivityClear,
    streamWorkflowProgress,
    resetWorkflowProgress,
  } = useWorkflowProgressRuntime({
    selectedProject,
    onProgressEvent: handleWorkflowProgressEvent,
  });

  const latestChatWorkflowThreadId =
    [...chatMessages].reverse().find((message) => message.workflowThreadId)
      ?.workflowThreadId ?? null;
  const activeWorkflowThreadId = workflowThreadId ?? latestChatWorkflowThreadId;
  const { fileOperations, fileOperationsError } =
    useWorkflowFileOperations(activeWorkflowThreadId);
  const chatTouchedFiles = useMemo(
    () => selectChatTouchedFiles(chatMessages),
    [chatMessages]
  );
  const chatTouchedFilesSignature = chatTouchedFiles.join("|");
  const workflowTouchedFilesSignature = useMemo(
    () =>
      fileOperations
        .filter((operation) =>
          ["changed", "applied", "failed"].includes(operation.status)
        )
        .map((operation) => `${operation.sequence}:${operation.path}:${operation.status}`)
        .join("|"),
    [fileOperations]
  );
  const previewRefreshToken =
    workflowTouchedFilesSignature || chatTouchedFilesSignature || null;

  useEffect(() => {
    return () => {
      resetWorkflowProgress();
      chatAbortControllerRef.current?.abort();
      chatAbortControllerRef.current = null;
    };
  }, [resetWorkflowProgress]);

  useEffect(() => {
    chatMaxSequenceRef.current = chatMessages.reduce(
      (max, message) => Math.max(max, message.sequence ?? 0),
      0
    );
  }, [chatMessages]);

  useEffect(() => {
    setInstructionMessage("");
  }, [selectedProject?.id]);

  useEffect(() => {
    let cancelled = false;
    setChatSession(null);
    setChatMessages([]);
    setInstructionMessage("");
    resetWorkflowProgress();
    chatAbortControllerRef.current?.abort();
    chatAbortControllerRef.current = null;
    chatMaxSequenceRef.current = 0;

    if (!chatWorkspaceFolderId || !chatUserStoryId) {
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingChatSession(true);
    onError(null);

    void horusChatApi
      .listSessions({
        workspaceFolderId: chatWorkspaceFolderId,
        userStoryId: chatUserStoryId,
      })
      .then(async (sessions) => {
        if (cancelled) return;
        const nextSession =
          sessions[0] ??
          (await horusChatApi.createSession({
            workspaceFolderId: chatWorkspaceFolderId,
            userStoryId: chatUserStoryId,
          }));
        if (cancelled) return;
        setChatSession(nextSession);
        const messages = await horusChatApi.listMessages(nextSession.id);
        if (cancelled) return;
        setChatMessages(
          mapVisibleProjectChatMessages(messages, selectedProject?.id ?? null)
        );
      })
      .catch((err) => {
        if (!cancelled) {
          onError(
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
  }, [
    chatUserStoryId,
    chatWorkspaceFolderId,
    onError,
    resetWorkflowProgress,
    selectedProject?.id,
  ]);

  useEffect(() => {
    if (!chatSession || isSubmittingInstruction) return;
    let cancelled = false;

    const syncChatMessages = async (): Promise<void> => {
      try {
        if (cancelled) return;
        await syncChatMessagesFromServer();
      } catch {
        // The preview remains usable even if one background sync is missed.
      }
    };

    const timer = window.setInterval(() => {
      void syncChatMessages();
    }, 4000);

    void syncChatMessages();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chatSession, isSubmittingInstruction, syncChatMessagesFromServer]);

  useEffect(() => {
    if (activeWorkflowThreadId) {
      streamWorkflowProgress(activeWorkflowThreadId);
    }
  }, [activeWorkflowThreadId, streamWorkflowProgress]);

  useEffect(() => {
    if (!selectedProject || !chatTouchedFilesSignature) return;
    if (chatTouchedFiles.length === 0) return;
    emitProjectFilesChanged({
      projectId: selectedProject.projectWorkspaceId ?? selectedProject.id,
      paths: chatTouchedFiles,
      source: "preview-workflow",
      timestamp: new Date().toISOString(),
    });
  }, [chatTouchedFiles, chatTouchedFilesSignature, selectedProject]);

  useEffect(() => {
    if (previewSession || !selectedProject) return;
    const latestPreviewMessage = [...chatMessages]
      .reverse()
      .find(
        (message) =>
          message.previewSessionId && message.projectId === selectedProject.id
      );
    if (!latestPreviewMessage?.previewSessionId) return;
    hydratePreviewSession(latestPreviewMessage.previewSessionId);
  }, [chatMessages, hydratePreviewSession, previewSession, selectedProject]);

  const startChatTurn = useCallback((rawMessage: string): void => {
    if (!chatSession || !chatWorkspaceFolderId || !chatUserStoryId || !selectedProject) {
      onError("Selecione uma user story e um projeto antes de enviar para Horus.");
      return;
    }
    const message = rawMessage.trim();
    if (!message) return;
    const submittedAt = Date.now();
    const idempotencyKey = `chat:${chatSession.id}:${crypto.randomUUID()}`;
    const abortController = new AbortController();
    chatAbortControllerRef.current?.abort();
    chatAbortControllerRef.current = abortController;
    const pendingUserMessage = createLocalChatMessage({
      role: "user",
      body: message,
      createdAt: new Date(submittedAt).toISOString(),
    });
    const pendingAgentMessage = createLocalChatMessage({
      role: "agent",
      body: "Estou lendo o contexto...",
      createdAt: new Date(submittedAt + 1).toISOString(),
      turnStatus: "pending",
      isPending: true,
    });

    setChatMessages((current) =>
      mergeChatMessages(current, [pendingUserMessage, pendingAgentMessage])
    );
    setInstructionMessage("");
    setIsSubmittingInstruction(true);
    onError(null);
    const streamInput: HorusChatTurnInput = {
      chatSessionId: chatSession.id,
      message,
      projectId: selectedProject.id,
      workspaceFolderId: chatWorkspaceFolderId,
      userStoryId: chatUserStoryId,
      idempotencyKey,
      ...(previewSession ? { previewSessionId: previewSession.id } : {}),
    };
    const streamController = createChatTurnStreamController({
      pendingUserMessage,
      pendingAgentMessage,
      setChatMessages,
      streamWorkflowProgress,
      setWorkflowActivity,
      scheduleWorkflowActivityClear,
      hydratePreviewSession,
    });

    void horusChatApi
      .submitTurnStream(
        streamInput,
        streamController.handleEvent,
        abortController.signal
      )
      .catch((err) => {
        if (abortController.signal.aborted) {
          streamController.cancelLocally(
            "Cancelado. Deixei sua mensagem aqui para você reenviar."
          );
          return;
        }
        const errorMessage =
          err instanceof Error ? err.message : "Não consegui enviar a mensagem para Horus.";
        onError(errorMessage);
        streamController.fail(errorMessage);
      })
      .finally(() => {
        if (chatAbortControllerRef.current === abortController) {
          chatAbortControllerRef.current = null;
        }
        setIsSubmittingInstruction(false);
      });
  }, [
    chatSession,
    chatUserStoryId,
    chatWorkspaceFolderId,
    hydratePreviewSession,
    onError,
    previewSession,
    scheduleWorkflowActivityClear,
    selectedProject,
    streamWorkflowProgress,
  ]);

  const submitInstruction = useCallback((): void => {
    startChatTurn(instructionMessage);
  }, [instructionMessage, startChatTurn]);

  const retryInstruction = useCallback((message: string): void => {
    if (isSubmittingInstruction) return;
    startChatTurn(message);
  }, [isSubmittingInstruction, startChatTurn]);

  const cancelInstruction = useCallback((): void => {
    chatAbortControllerRef.current?.abort();
  }, []);

  const chatDisabledReason = !selectedProject
    ? "Escolha um projeto."
    : isLoadingProjectChatScope
      ? "Carregando contexto do projeto."
      : !chatWorkspaceFolderId || !chatUserStoryId
        ? "Este projeto ainda não está ligado a uma user story."
        : isLoadingChatSession
          ? "Abrindo o histórico deste chat."
          : !chatSession
            ? "Não consegui abrir o chat deste projeto."
            : undefined;

  return {
    chatSession,
    chatMessages,
    workflowActivity,
    workflowEvents,
    fileOperations,
    fileOperationsError,
    previewRefreshToken,
    activeWorkflowThreadId,
    instructionMode,
    instructionMessage,
    isSubmittingInstruction,
    isLoadingProjectChatScope,
    isLoadingChatSession,
    chatWorkspaceFolderId,
    chatUserStoryId,
    chatDisabledReason,
    setInstructionMode,
    setInstructionMessage,
    submitInstruction,
    retryInstruction,
    cancelInstruction,
  };
}

function selectChatTouchedFiles(messages: readonly PreviewChatMessage[]): string[] {
  const paths = new Set<string>();
  for (const message of messages) {
    for (const step of message.toolSteps ?? []) {
      const changedOperations = (step.fileOperations ?? []).filter((operation) =>
        ["changed", "applied", "failed"].includes(operation.status)
      );
      for (const operation of changedOperations) paths.add(operation.path);
      if (changedOperations.length === 0 && step.phase !== "started") {
        for (const path of step.filePaths ?? []) paths.add(path);
        const legacyPath = legacyPathFromToolStep(step.tool, step.title);
        if (legacyPath) paths.add(legacyPath);
      }
    }
    for (const path of message.codingEvidence?.changedFiles ?? []) paths.add(path);
  }
  return [...paths].sort();
}

function legacyPathFromToolStep(toolName: string, title: string): string | null {
  if (!legacyFileToolNames.has(toolName)) return null;
  const marker = ": ";
  const markerIndex = title.indexOf(marker);
  if (markerIndex < 0) return null;
  const suffix = title.slice(markerIndex + marker.length).trim();
  return suffix.length > 0 ? suffix : null;
}

const legacyFileToolNames = new Set([
  "read_file",
  "write_file",
  "edit_file",
  "replace_file_range",
  "delete_file",
  "get_git_diff",
]);
