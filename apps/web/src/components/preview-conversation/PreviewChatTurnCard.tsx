import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type {
  FrontendProject,
  HorusChatCodingEvidence,
  HorusChatEvidenceSource,
  HorusChatOutcomeAction,
  HorusChatRetrievalStatus,
  HorusChatToolStep,
  HorusChatTurnLifecycleStatus,
  PreviewSession,
} from "@u-build/shared";
import { PreviewIcon } from "../PreviewIcons.js";
import type {
  PreviewChatMessage,
  PreviewWorkflowActivity,
} from "../PreviewConversationPanel.js";

export function getStatusLabel(session: PreviewSession | null): string {
  if (!session) return "Sem preview";

  const labels: Record<PreviewSession["status"], string> = {
    waiting: "Em espera",
    stopped: "Parado",
    starting: "Iniciando",
    running: "Rodando",
    inspecting: "Inspecionando",
    applying: "Aplicando",
    error: "Erro",
  };

  return labels[session.status];
}

export function getPreviewConversationSubtitle({
  selectedProject,
  session,
}: {
  readonly selectedProject: FrontendProject | null;
  readonly session: PreviewSession | null;
}): string {
  if (!selectedProject) return "Nenhum projeto selecionado";
  if (!session) return selectedProject.name;
  return `${selectedProject.name} · ${getStatusLabel(session)}`;
}

const projectHealthReasonLabels: Record<string, string> = {
  root_missing: "pasta ausente",
  manifest_missing: "sem manifesto",
  preview_command_missing: "sem comando",
  preview_url_missing: "sem URL",
  preview_url_collision: "URL duplicada",
  wrong_owner_port: "porta ocupada",
  scaffold_only: "scaffold",
  duplicate_app_hash: "front duplicado",
  superseded_by_canonical: "substituído",
  stale_running_run: "execução antiga",
  legacy_static: "legado",
  seed_project: "seed",
};

export function projectHealthLabel(project: FrontendProject): string {
  if (project.healthStatus === "healthy") return "ok";
  const reason = project.healthReasons[0];
  if (reason) return projectHealthReasonLabels[reason] ?? reason;
  return project.healthStatus;
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
  grounded: "Com código citado",
  partial: "Contexto parcial",
  ungrounded: "Sem código citado",
};

const retrievalLabels: Record<HorusChatRetrievalStatus, string> = {
  matched: "Contexto encontrado",
  partial: "Contexto parcial",
  no_match: "Sem trecho relevante",
  blocked: "Busca bloqueada",
};

const turnStatusLabels: Record<HorusChatTurnLifecycleStatus, string> = {
  pending: "Lendo contexto",
  streaming: "Respondendo",
  completed: "Respondido",
  accepted: "Em execução",
  blocked: "Bloqueado",
  failed: "Falhou",
  cancelled: "Cancelado",
};

function getMessageStatus(message: PreviewChatMessage): HorusChatTurnLifecycleStatus | null {
  if (message.turnStatus) return message.turnStatus;
  if (message.isPending) return "pending";
  if (message.isStreaming) return "streaming";
  return null;
}

function extractReferencedFiles(body: string): string[] {
  const refs: string[] = [];
  for (const token of collectReferenceTokens(body)) {
    const candidate = trimReferenceToken(token);
    if (!isKnownFileReference(candidate)) continue;
    if (!refs.includes(candidate)) refs.push(candidate);
    if (refs.length >= 4) break;
  }
  return refs;
}

function parseMessageBlocks(
  body: string
): Array<
  | { type: "text"; text: string }
  | { type: "code"; language: string | null; code: string }
> {
  const blocks: Array<
    | { type: "text"; text: string }
    | { type: "code"; language: string | null; code: string }
  > = [];
  const lines = body.split("\n");
  let textLines: string[] = [];
  let index = 0;

  const pushText = () => {
    if (textLines.length > 0) {
      blocks.push({ type: "text", text: textLines.join("\n") });
      textLines = [];
    }
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.startsWith("```")) {
      textLines.push(line);
      index += 1;
      continue;
    }

    pushText();
    const language = readFenceLanguage(line);
    const codeLines: string[] = [];
    index += 1;
    let closed = false;

    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.startsWith("```")) {
        closed = true;
        index += 1;
        break;
      }
      codeLines.push(current);
      index += 1;
    }

    if (closed) {
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
    } else {
      textLines.push(line, ...codeLines);
    }
  }

  pushText();
  return blocks.length > 0 ? blocks : [{ type: "text", text: body }];
}

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
  if (
    !message.groundingStatus &&
    !message.evidenceSources?.length &&
    !message.retrievalNotes?.length
  ) {
    return null;
  }

  const evidenceSources = message.evidenceSources ?? [];

  return (
    <div className="preview-chat-evidence">
      <div className="preview-chat-evidence-head">
        <strong>Fontes consultadas</strong>
        {message.groundingStatus ? (
          <span className={`preview-chat-grounding ${message.groundingStatus}`}>
            {message.retrievalStatus
              ? retrievalLabels[message.retrievalStatus]
              : groundingLabels[message.groundingStatus]}
          </span>
        ) : null}
      </div>
      {message.retrievalNotes?.length ? (
        <div className="preview-chat-retrieval-notes">
          {message.retrievalNotes.slice(0, 2).map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      ) : null}
      {evidenceSources.length === 0 ? (
        <p className="preview-chat-evidence-empty">
          Não encontrei um trecho de código confiável para citar nesta resposta.
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

function ChatCodingEvidence({
  evidence,
}: {
  readonly evidence: HorusChatCodingEvidence | undefined;
}): JSX.Element | null {
  if (!evidence) return null;
  const validation = evidence.validation;

  return (
    <div className="preview-chat-coding-evidence" aria-label="Evidência da edição no código">
      <div className="preview-chat-coding-evidence-head">
        <strong>Edição no código</strong>
        <span>{evidence.state}</span>
      </div>
      {evidence.changedFiles.length > 0 ? (
        <div className="preview-chat-coding-files" aria-label="Arquivos alterados">
          {evidence.changedFiles.slice(0, 4).map((file) => (
            <span key={file}>{file}</span>
          ))}
        </div>
      ) : null}
      <div className="preview-chat-coding-grid">
        <span>
          Patch{" "}
          <strong>
            {evidence.diffStats
              ? `+${evidence.diffStats.addedLines}/-${evidence.diffStats.removedLines}`
              : "sem diff"}
          </strong>
        </span>
        <span>
          Validação <strong>{validation?.status ?? "pendente"}</strong>
        </span>
        <span>
          Aplicação <strong>{evidence.apply?.status ?? "pendente"}</strong>
        </span>
      </div>
      {validation?.commands.length ? (
        <div className="preview-chat-coding-commands">
          {validation.commands.slice(0, 3).map((command) => (
            <span key={`${command.kind}:${command.command}`}>
              {command.kind}: {command.status}
            </span>
          ))}
        </div>
      ) : validation?.skippedReason ? (
        <p className="preview-chat-coding-note">{validation.skippedReason}</p>
      ) : null}
    </div>
  );
}

function StreamingMessageBody({
  message,
}: {
  readonly message: PreviewChatMessage;
}): JSX.Element {
  const shouldStream = message.role === "agent" && message.isStreaming && !message.isPending;
  const [visibleLength, setVisibleLength] = useState(
    shouldStream ? 0 : message.body.length
  );
  const previousBodyRef = useRef("");

  useEffect(() => {
    if (!shouldStream) {
      setVisibleLength(message.body.length);
      previousBodyRef.current = message.body;
      return undefined;
    }

    const previousBody = previousBodyRef.current;
    const startLength = message.body.startsWith(previousBody)
      ? Math.min(previousBody.length, message.body.length)
      : 0;
    previousBodyRef.current = message.body;
    setVisibleLength(startLength);
    const stepSize = Math.max(1, Math.ceil(message.body.length / 140));
    const interval = window.setInterval(() => {
      setVisibleLength((current) => {
        const next = Math.min(message.body.length, current + stepSize);
        if (next >= message.body.length) {
          window.clearInterval(interval);
        }
        return next;
      });
    }, 16);

    return () => window.clearInterval(interval);
  }, [message.body, shouldStream]);

  const visibleBody = useMemo(
    () => message.body.slice(0, visibleLength),
    [message.body, visibleLength]
  );
  const isStreaming = Boolean(shouldStream && visibleLength < message.body.length);

  if (message.isPending) {
    if (message.toolSteps && message.toolSteps.length > 0) {
      return <></>;
    }
    return (
      <p className="preview-chat-thinking" aria-live="polite" aria-label="Pensando">
        <i aria-hidden="true" />
      </p>
    );
  }

  return (
    <MessageContent
      body={visibleBody}
      isStreaming={isStreaming}
    />
  );
}

function MessageContent({
  body,
  isStreaming,
}: {
  readonly body: string;
  readonly isStreaming: boolean;
}): JSX.Element {
  const blocks = useMemo(() => parseMessageBlocks(body), [body]);
  const referencedFiles = useMemo(() => extractReferencedFiles(body), [body]);

  return (
    <div className={`preview-chat-message-content${isStreaming ? " is-streaming" : ""}`}>
      {blocks.map((block, index) =>
        block.type === "code" ? (
          <div className="preview-chat-code-block" key={`code:${index}`}>
            {block.language ? <span>{block.language}</span> : null}
            <pre
              className={
                block.language === "diff" ||
                block.code.split("\n").some((line) => line.startsWith("+") || line.startsWith("-"))
                  ? "is-diff"
                  : undefined
              }
            >
              <code>{block.code}</code>
            </pre>
          </div>
        ) : (
          splitParagraphs(block.text).map((paragraph, paragraphIndex) => (
            <p key={`text:${index}:${paragraphIndex}`}>{paragraph}</p>
          ))
        )
      )}
      {referencedFiles.length > 0 ? (
        <div className="preview-chat-file-refs" aria-label="Arquivos citados">
          {referencedFiles.map((file) => (
            <span key={file}>{file}</span>
          ))}
        </div>
      ) : null}
      {isStreaming ? <span className="preview-chat-stream-caret" aria-hidden="true" /> : null}
    </div>
  );
}

function ChatToolSteps({
  steps,
}: {
  readonly steps: HorusChatToolStep[];
}): JSX.Element | null {
  if (steps.length === 0) return null;
  const activeStep = [...steps].reverse().find((step) => step.phase === "started");
  const latestStep = steps.at(-1);

  return (
    <details
      className="preview-chat-tool-details"
      open={Boolean(activeStep)}
    >
      <summary>
        <span className={activeStep ? "is-live" : undefined} aria-hidden="true" />
        <strong>{activeStep ? "Trabalhando" : "Atividade"}</strong>
        <small>{activeStep?.title ?? latestStep?.title}</small>
      </summary>
      <ul className="preview-chat-tool-steps" aria-label="Ações do agente">
        {steps.map((step, index) => (
          <li
            key={`${step.title}:${index}`}
            className={`preview-chat-tool-step phase-${step.phase}`}
            title={step.detail ?? step.title}
          >
            <span className="preview-chat-tool-step-icon" aria-hidden="true">
              {step.phase === "started" ? "•" : step.phase === "succeeded" ? "✓" : "✕"}
            </span>
            <span className="preview-chat-tool-step-title">{step.title}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ChatTechnicalDetails({
  message,
}: {
  readonly message: PreviewChatMessage;
}): JSX.Element | null {
  const shouldShowEvidence = !isCodeChangeAction(message.action);
  const hasEvidence = Boolean(
    shouldShowEvidence &&
      (message.groundingStatus ||
        message.evidenceSources?.length ||
        message.retrievalNotes?.length)
  );
  const hasDetails = hasEvidence || Boolean(message.codingEvidence) || Boolean(message.errorCode);

  if (!hasDetails || message.isPending) return null;

  return (
    <details className="preview-chat-technical-details">
      <summary>
        <span>Detalhes técnicos</span>
        {message.codingEvidence?.changedFiles.length ? (
          <small>{message.codingEvidence.changedFiles.length} arquivo(s)</small>
        ) : null}
      </summary>
      {message.errorCode ? (
        <div className="preview-chat-error-code">{message.errorCode}</div>
      ) : null}
      {hasEvidence && shouldShowEvidence ? <ChatEvidence message={message} /> : null}
      <ChatCodingEvidence evidence={message.codingEvidence} />
    </details>
  );
}

function isCodeChangeAction(action: HorusChatOutcomeAction | undefined): boolean {
  return action === "code_change_started" || action === "code_change_completed";
}

export function WorkflowLiveActivity({
  activity,
}: {
  readonly activity: PreviewWorkflowActivity | null;
}): JSX.Element | null {
  if (!activity) return null;

  return (
    <div
      className={`preview-workflow-activity phase-${activity.phase}${
        activity.active ? " is-active" : " is-settled"
      }`}
      aria-live="polite"
      aria-label={`Execução: ${activity.label}. ${activity.detail}`}
      title={activity.detail}
    >
      <span className="preview-workflow-activity-pulse" aria-hidden="true" />
      <div className="preview-workflow-activity-copy">
        <strong>{activity.label}</strong>
      </div>
      <div className="preview-workflow-activity-meter" aria-hidden="true">
        <i />
      </div>
    </div>
  );
}

export function ChatTurnCard({
  message,
  previousUserBody,
  copied,
  onRetryMessage,
  onCopyDetails,
}: {
  readonly message: PreviewChatMessage;
  readonly previousUserBody: string | null;
  readonly copied: boolean;
  readonly onRetryMessage: (message: string) => void;
  readonly onCopyDetails: (message: PreviewChatMessage) => void;
}): JSX.Element {
  const status = getMessageStatus(message);
  const canRetry =
    message.role === "agent" &&
    Boolean(message.retryable || status === "failed" || status === "cancelled") &&
    Boolean(previousUserBody);
  const canCopy = message.role === "agent" && status === "failed";
  const showErrorStatus =
    message.role === "agent" &&
    (status === "failed" || status === "cancelled" || status === "blocked");
  const roleLabel = message.role === "user" ? "Você" : "Horus";

  return (
    <article
      className={`preview-chat-message ${message.role}${
        message.isPending ? " is-pending" : ""
      }${status ? ` status-${status}` : ""}`}
    >
      <div className="preview-chat-message-head">
        <span>{roleLabel}</span>
        {showErrorStatus ? (
          <strong className={`preview-chat-turn-status status-${status}`}>
            {turnStatusLabels[status as HorusChatTurnLifecycleStatus]}
          </strong>
        ) : null}
        <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
      </div>
      {message.role === "agent" && message.toolSteps && message.toolSteps.length > 0 ? (
        <ChatToolSteps steps={message.toolSteps} />
      ) : null}
      <StreamingMessageBody message={message} />
      {message.role === "agent" ? (
        <ChatTechnicalDetails message={message} />
      ) : null}
      {canRetry || canCopy ? (
        <div className="preview-chat-message-actions">
          {canRetry && previousUserBody ? (
            <button
              className="preview-chat-action-button"
              type="button"
              onClick={() => onRetryMessage(previousUserBody)}
            >
              <PreviewIcon name="refresh" />
              <span>Tentar de novo</span>
            </button>
          ) : null}
          {canCopy ? (
            <button
              className="preview-chat-action-button"
              type="button"
              onClick={() => onCopyDetails(message)}
            >
              <PreviewIcon name="terminal" />
              <span>{copied ? "Copiado" : "Copiar erro"}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function collectReferenceTokens(body: string): string[] {
  const tokens: string[] = [];
  let token = "";
  const pushToken = () => {
    if (token) tokens.push(token);
    token = "";
  };

  for (const char of body) {
    if (isReferenceBoundary(char)) {
      pushToken();
      continue;
    }
    token += char;
  }
  pushToken();
  return tokens;
}

function trimReferenceToken(token: string): string {
  let end = token.length;
  while (end > 0 && isTrailingReferencePunctuation(token[end - 1] ?? "")) {
    end -= 1;
  }
  return token.slice(0, end);
}

function isKnownFileReference(candidate: string): boolean {
  const extensions = [".tsx", ".jsx", ".ts", ".js", ".css", ".json", ".md", ".html"];
  return extensions.some((extension) => {
    const index = candidate.indexOf(extension);
    if (index < 0) return false;
    const suffix = candidate.slice(index + extension.length);
    if (!suffix) return true;
    if (!suffix.startsWith(":")) return false;
    return suffix.slice(1).split("-").every(isPositiveIntegerText);
  });
}

function splitParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  const pushParagraph = () => {
    const paragraph = current.join("\n").trim();
    current = [];
    if (paragraph) paragraphs.push(paragraph);
  };

  for (const line of text.split("\n")) {
    if (line.trim().length === 0) {
      pushParagraph();
      continue;
    }
    current.push(line);
  }
  pushParagraph();
  return paragraphs;
}

function readFenceLanguage(line: string): string | null {
  const raw = line.slice(3).trim();
  if (!raw) return null;
  let language = "";
  for (const char of raw) {
    if (!isLanguageNameChar(char)) break;
    language += char;
  }
  return language || null;
}

function isReferenceBoundary(char: string): boolean {
  return (
    char === " " ||
    char === "\n" ||
    char === "\t" ||
    char === "\r" ||
    char === "(" ||
    char === ")" ||
    char === "[" ||
    char === "]" ||
    char === "{" ||
    char === "}" ||
    char === "<" ||
    char === ">" ||
    char === '"' ||
    char === "'"
  );
}

function isTrailingReferencePunctuation(char: string): boolean {
  return char === "." || char === "," || char === ";" || char === "!" || char === "?";
}

function isLanguageNameChar(char: string): boolean {
  return isAsciiLetter(char) || isDigit(char) || char === "_" || char === "-";
}

function isPositiveIntegerText(value: string): boolean {
  if (!value) return false;
  for (const char of value) {
    if (!isDigit(char)) return false;
  }
  return true;
}

function isAsciiLetter(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}
