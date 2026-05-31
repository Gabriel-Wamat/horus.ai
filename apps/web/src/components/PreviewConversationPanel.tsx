import { useEffect, useRef, useState, type JSX } from "react";
import type {
  ChatMessageDeliveryStatus,
  ChatMessageEventType,
  ChatMessageVisibility,
  FrontendProject,
  HorusChatCodingEvidence,
  HorusChatEvidenceSource,
  HorusChatOutcomeAction,
  HorusChatRetrievalStatus,
  HorusChatToolStep,
  HorusChatTurnLifecycleStatus,
  PreviewSession,
  VisualInstructionMode,
} from "@u-build/shared";
import { PreviewIcon } from "./PreviewIcons.js";
import { VisualInstructionComposer } from "./VisualInstructionComposer.js";
import {
  ChatTurnCard,
  WorkflowLiveActivity,
  getPreviewConversationSubtitle,
  getStatusLabel,
  projectHealthLabel,
} from "./preview-conversation/PreviewChatTurnCard.js";

export interface PreviewChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  body: string;
  toolSteps?: HorusChatToolStep[];
  createdAt: string;
  sequence?: number;
  eventType?: ChatMessageEventType;
  visibility?: ChatMessageVisibility;
  deliveryStatus?: ChatMessageDeliveryStatus;
  projectId?: string;
  workflowThreadId?: string;
  previewSessionId?: string;
  evidenceSources?: HorusChatEvidenceSource[];
  groundingStatus?: "grounded" | "partial" | "ungrounded";
  retrievalStatus?: HorusChatRetrievalStatus;
  retrievalNotes?: string[];
  idempotencyKey?: string;
  turnStatus?: HorusChatTurnLifecycleStatus;
  retryable?: boolean;
  errorCode?: string;
  action?: HorusChatOutcomeAction;
  codingEvidence?: HorusChatCodingEvidence;
  isPending?: boolean;
  isStreaming?: boolean;
}

export interface PreviewWorkflowActivity {
  phase: "validating" | "reviewing" | "applying" | "retrying" | "completed" | "failed";
  label: string;
  detail: string;
  active: boolean;
  updatedAt: string;
}

export function PreviewConversationPanel({
  projects,
  selectedProjectId,
  selectedProject,
  session,
  chatMessages,
  workflowActivity,
  route,
  isLoading,
  error,
  instructionMessage,
  instructionMode,
  isSubmittingInstruction,
  isChatReady,
  chatDisabledReason,
  onSelectProject,
  onChangeRoute,
  onChangeInstructionMessage,
  onChangeInstructionMode,
  onCancelInstruction,
  onRetryMessage,
  onSubmitInstruction,
}: {
  readonly projects: FrontendProject[];
  readonly selectedProjectId: string;
  readonly selectedProject: FrontendProject | null;
  readonly session: PreviewSession | null;
  readonly chatMessages: PreviewChatMessage[];
  readonly workflowActivity: PreviewWorkflowActivity | null;
  readonly route: string;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly instructionMessage: string;
  readonly instructionMode: VisualInstructionMode;
  readonly isSubmittingInstruction: boolean;
  readonly isChatReady: boolean;
  readonly chatDisabledReason: string | undefined;
  readonly onSelectProject: (projectId: string) => void;
  readonly onChangeRoute: (route: string) => void;
  readonly onChangeInstructionMessage: (message: string) => void;
  readonly onChangeInstructionMode: (mode: VisualInstructionMode) => void;
  readonly onCancelInstruction: () => void;
  readonly onRetryMessage: (message: string) => void;
  readonly onSubmitInstruction: () => void;
}): JSX.Element {
  const historyRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  useEffect(() => {
    const element = historyRef.current;
    if (!element || !shouldStickToBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [chatMessages]);

  const handleHistoryScroll = (): void => {
    const element = historyRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  };

  const findPreviousUserBody = (index: number): string | null => {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const message = chatMessages[cursor];
      if (message?.role === "user") return message.body;
    }
    return null;
  };

  const handleCopyDetails = (message: PreviewChatMessage): void => {
    if (!navigator.clipboard) return;
    const detail = [
      `status=${message.turnStatus ?? "unknown"}`,
      message.errorCode ? `error=${message.errorCode}` : null,
      "",
      message.body,
    ]
      .filter((item): item is string => item !== null)
      .join("\n");
    void navigator.clipboard
      .writeText(detail)
      .then(() => {
        setCopiedMessageId(message.id);
        window.setTimeout(() => setCopiedMessageId(null), 1800);
      })
      .catch(() => undefined);
  };

  return (
    <aside className="preview-conversation-panel" aria-label="Chat visual do preview">
      <section className="preview-conversation-head">
        <div className="preview-project-identity">
          <span className="preview-project-icon" aria-hidden="true">
            <PreviewIcon name="bolt" />
          </span>
          <div>
            <h2>Horus</h2>
            <p>{getPreviewConversationSubtitle({ selectedProject, session })}</p>
          </div>
        </div>
        <span className={`preview-session-status status-${session?.status ?? "waiting"}`}>
          {getStatusLabel(session)}
        </span>
      </section>

      <section className="preview-conversation-config">
        <div className="preview-config-field preview-config-project">
          <label className="field-label" htmlFor="preview-project">
            Projeto
          </label>
          <select
            id="preview-project"
            className="select"
            value={selectedProjectId}
            disabled={isLoading || projects.length === 0}
            onChange={(event) => onSelectProject(event.target.value)}
          >
            {projects.length === 0 ? (
              <option value="">Nenhum projeto</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                  {project.visibility === "hidden" ||
                  project.healthStatus === "blocked" ||
                  project.lifecycleStatus === "superseded"
                    ? ` · ${projectHealthLabel(project)}`
                    : ""}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="preview-config-field preview-config-route">
          <label className="field-label" htmlFor="preview-route">
            Rota
          </label>
          <input
            id="preview-route"
            className="input"
            value={route}
            disabled={Boolean(session)}
            onChange={(event) => onChangeRoute(event.target.value)}
            placeholder="/"
          />
        </div>

        {error && <div className="form-error">{error}</div>}

      </section>

      <section className="preview-chat-thread-section">
        <div className="preview-chat-history" aria-label="Histórico do chat">
          {chatMessages.length === 0 ? (
            <div className="preview-chat-empty">
              <span>
                {chatDisabledReason ?? "Pronto para conversar sobre este projeto."}
              </span>
              <small>{selectedProject?.name ?? "Selecione um projeto."}</small>
            </div>
          ) : (
            <div
              className="preview-chat-message-list"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              ref={historyRef}
              onScroll={handleHistoryScroll}
            >
              {chatMessages.map((message, index) => (
                <ChatTurnCard
                  key={message.id}
                  message={message}
                  previousUserBody={findPreviousUserBody(index)}
                  copied={copiedMessageId === message.id}
                  onRetryMessage={onRetryMessage}
                  onCopyDetails={handleCopyDetails}
                />
              ))}
            </div>
          )}
        </div>
        <WorkflowLiveActivity activity={workflowActivity} />

        <VisualInstructionComposer
          message={instructionMessage}
          mode={instructionMode}
          disabled={!isChatReady}
          isSubmitting={isSubmittingInstruction}
          disabledReason={chatDisabledReason}
          placeholder={
            chatDisabledReason ?? "Pergunte ou peça uma mudança no projeto..."
          }
          submitLabel="Enviar"
          onChangeMessage={onChangeInstructionMessage}
          onChangeMode={onChangeInstructionMode}
          onCancel={onCancelInstruction}
          onSubmit={onSubmitInstruction}
        />
      </section>
    </aside>
  );
}
