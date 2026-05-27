import { useEffect, useRef, type JSX } from "react";
import type {
  FrontendProject,
  HorusChatEvidenceSource,
  PreviewSession,
  VisualInstructionMode,
} from "@u-build/shared";
import { PreviewIcon } from "./PreviewIcons.js";
import { VisualInstructionComposer } from "./VisualInstructionComposer.js";

export interface PreviewChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  body: string;
  createdAt: string;
  projectId?: string;
  previewSessionId?: string;
  evidenceSources?: HorusChatEvidenceSource[];
  groundingStatus?: "grounded" | "partial" | "ungrounded";
}

function getStatusLabel(session: PreviewSession | null): string {
  if (!session) return "Aguardando";

  const labels: Record<PreviewSession["status"], string> = {
    waiting: "Aguardando",
    stopped: "Parado",
    starting: "Iniciando",
    running: "Rodando",
    inspecting: "Inspecionando",
    applying: "Aplicando",
    error: "Erro",
  };

  return labels[session.status];
}

function formatMessageTime(createdAt: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

const groundingLabels: Record<
  NonNullable<PreviewChatMessage["groundingStatus"]>,
  string
> = {
  grounded: "Com fontes",
  partial: "Parcial",
  ungrounded: "Sem fonte",
};

function formatSourceLocation(source: HorusChatEvidenceSource): string {
  if (!source.path) return source.label;
  if (source.startLine && source.endLine) {
    return `${source.path}:${source.startLine}-${source.endLine}`;
  }
  if (source.startLine) return `${source.path}:${source.startLine}`;
  return source.path;
}

function ChatEvidence({
  message,
}: {
  readonly message: PreviewChatMessage;
}): JSX.Element | null {
  if (!message.groundingStatus && !message.evidenceSources?.length) return null;

  const evidenceSources = message.evidenceSources ?? [];

  return (
    <div className="preview-chat-evidence">
      <div className="preview-chat-evidence-head">
        <strong>Fontes consultadas</strong>
        {message.groundingStatus ? (
          <span className={`preview-chat-grounding ${message.groundingStatus}`}>
            {groundingLabels[message.groundingStatus]}
          </span>
        ) : null}
      </div>
      {evidenceSources.length === 0 ? (
        <p className="preview-chat-evidence-empty">
          Horus não encontrou um trecho de código confiável para sustentar esta
          resposta.
        </p>
      ) : (
        <div className="preview-chat-evidence-list">
          {evidenceSources.map((source, index) => (
            <details
              className="preview-chat-evidence-item"
              key={`${source.type}:${source.path ?? source.label}:${
                source.startLine ?? index
              }`}
            >
              <summary>
                <span>
                  <strong>{source.label}</strong>
                  <small>{formatSourceLocation(source)}</small>
                </span>
                <em>{source.confidence}</em>
              </summary>
              {source.excerpt ? (
                <pre aria-label={`Trecho de ${source.label}`}>
                  <code>{source.excerpt}</code>
                </pre>
              ) : null}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

export function PreviewConversationPanel({
  projects,
  selectedProjectId,
  selectedProject,
  session,
  chatMessages,
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
  onSubmitInstruction,
}: {
  readonly projects: FrontendProject[];
  readonly selectedProjectId: string;
  readonly selectedProject: FrontendProject | null;
  readonly session: PreviewSession | null;
  readonly chatMessages: PreviewChatMessage[];
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
  readonly onSubmitInstruction: () => void;
}): JSX.Element {
  const historyRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

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

  return (
    <aside className="preview-conversation-panel" aria-label="Chat visual do preview">
      <section className="preview-conversation-head">
        <div className="preview-project-identity">
          <span className="preview-project-icon" aria-hidden="true">
            <PreviewIcon name="bolt" />
          </span>
          <div>
            <h2>{selectedProject?.name ?? "user_stories"}</h2>
            <p>Live Preview {session?.status === "running" ? "rodando" : "aguardando"}</p>
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
        <div className="preview-section-head compact">
          <div>
            <p className="panel-kicker">Chat</p>
            <h2 className="panel-title">Histórico</h2>
          </div>
          <span className="preview-count-pill">{chatMessages.length}</span>
        </div>
        <div className="preview-chat-history" aria-label="Histórico do chat">
          {chatMessages.length === 0 ? (
            <div className="preview-chat-empty">
              <span>
                {chatDisabledReason ?? "Envie uma mensagem para Horus."}
              </span>
              <small>
                As mensagens ficam preservadas no contexto isolado desta user story.
              </small>
            </div>
          ) : (
            <div
              className="preview-chat-message-list"
              ref={historyRef}
              onScroll={handleHistoryScroll}
            >
              {chatMessages.map((message) => (
                <article
                  className={`preview-chat-message ${message.role}`}
                  key={message.id}
                >
                  <span>
                    {message.role === "user" ? "Você" : "Horus"}
                    <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                  </span>
                  <p>{message.body}</p>
                  {message.role === "agent" ? <ChatEvidence message={message} /> : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <VisualInstructionComposer
        message={instructionMessage}
        mode={instructionMode}
        disabled={!isChatReady}
        isSubmitting={isSubmittingInstruction}
        placeholder={
          chatDisabledReason ?? "Ask Horus... ex: rode o projeto"
        }
        submitLabel="Enviar"
        onChangeMessage={onChangeInstructionMessage}
        onChangeMode={onChangeInstructionMode}
        onSubmit={onSubmitInstruction}
      />
    </aside>
  );
}
