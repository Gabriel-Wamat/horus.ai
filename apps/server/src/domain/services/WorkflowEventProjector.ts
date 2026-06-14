import type {
  AppendChatMessageInput,
  AgentName,
  ChatMessage,
  ChatMessageEventType,
  ChatMessageVisibility,
  IEventStream,
  IStorageProvider,
  WorkflowEvent,
} from "@u-build/shared";

interface ChatProgressSink {
  appendMessage(
    sessionId: string,
    input: AppendChatMessageInput & { role: "agent" }
  ): Promise<unknown>;
  listMessages?(
    sessionId: string,
    filter?: { afterSequence?: number }
  ): Promise<ChatMessage[]>;
}

interface ExecutionRunReader {
  getRunByThreadId(threadId: string): Promise<{ id: string; threadId: string } | null>;
}

interface WorkflowMemorySink {
  recordWorkflowEvent(event: WorkflowEvent): Promise<unknown>;
}

interface WorkflowChatProjection {
  body: string;
  compactBody?: string;
  eventType: ChatMessageEventType;
  visibility: ChatMessageVisibility;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
}

export class WorkflowEventProjector {
  constructor(
    private readonly storage: IStorageProvider,
    private readonly events: IEventStream,
    private readonly chatProgress?: ChatProgressSink,
    private readonly executionLedger?: ExecutionRunReader,
    private readonly memorySink?: WorkflowMemorySink
  ) {}

  emit(event: WorkflowEvent): void {
    this.events.emit(event);
    void this.persistWorkflowChatEvent(event);
    void this.memorySink?.recordWorkflowEvent(event).catch((err) => {
      console.warn(
        "[WorkflowEventProjector] Failed to persist workflow memory event:",
        toErrorMessage(err)
      );
    });
  }

  private async persistWorkflowChatEvent(event: WorkflowEvent): Promise<void> {
    if (!this.chatProgress) return;

    const projection = projectWorkflowEventToChatMessage(event);
    if (!projection) return;

    try {
      const stored = await this.storage.load(event.threadId);
      const sessionId = stored?.sourceChatSessionId;
      if (!sessionId) return;

      if (await this.hasPersistedWorkflowChatEvent(sessionId, projection.dedupeKey)) {
        return;
      }

      const run = await this.executionLedger
        ?.getRunByThreadId(event.threadId)
        .catch(() => null);
      const metadata: Record<string, unknown> = {
        workflowProgressKey: projection.dedupeKey,
        workflowEventType: event.type,
        workflowEventTimestamp: event.timestamp,
        ...projection.metadata,
      };
      const input: AppendChatMessageInput & { role: "agent" } = {
        role: "agent",
        body: projection.body,
        eventType: projection.eventType,
        visibility: projection.visibility,
        deliveryStatus: "persisted",
        workflowThreadId: event.threadId,
        metadata,
        ...(projection.compactBody ? { compactBody: projection.compactBody } : {}),
        ...(run?.id ? { runId: run.id } : {}),
      };

      await this.chatProgress.appendMessage(sessionId, input);
    } catch (err) {
      console.warn(
        "[WorkflowEventProjector] Failed to persist workflow chat event:",
        toErrorMessage(err)
      );
    }
  }

  private async hasPersistedWorkflowChatEvent(
    sessionId: string,
    dedupeKey: string
  ): Promise<boolean> {
    if (!this.chatProgress?.listMessages) return false;
    const messages = await this.chatProgress.listMessages(sessionId);
    return messages.some(
      (message) => message.metadata["workflowProgressKey"] === dedupeKey
    );
  }
}

function projectWorkflowEventToChatMessage(
  event: WorkflowEvent
): WorkflowChatProjection | null {
  switch (event.type) {
    case "status_changed":
      return projectStatusChangedEvent(event);
    case "node_started":
      return {
        body: `${formatAgentName(event.agentName)} iniciou a etapa.`,
        eventType: "trace",
        visibility: "developer",
        dedupeKey: `node_started:${event.threadId}:${event.agentName}:${event.timestamp}`,
      };
    case "node_completed":
      return {
        body: `${formatAgentName(event.agentName)} concluiu a etapa.`,
        eventType: "trace",
        visibility: "developer",
        dedupeKey: `node_completed:${event.threadId}:${event.agentName}:${event.userStoryId}:${event.timestamp}`,
        metadata: {
          agentName: event.agentName,
          nodeStatus: event.status,
          userStoryId: event.userStoryId,
        },
      };
    case "patch_proposed": {
      const fileCount = event.filePaths.length;
      return {
        body: `Alteração preparada em ${formatCount(fileCount, "arquivo")}. Vou validar antes de aplicar.`,
        compactBody: "Alteração preparada.",
        eventType: "progress",
        visibility: "user",
        dedupeKey: `patch_proposed:${event.changeSetId}`,
        metadata: {
          userStoryId: event.userStoryId,
          changeSetId: event.changeSetId,
          filePaths: event.filePaths,
        },
      };
    }
    case "patch_applied": {
      const fileCount = event.filePaths.length;
      return {
        body: `Alteração aplicada em ${formatCount(fileCount, "arquivo")}.`,
        compactBody: "Alteração aplicada.",
        eventType: "progress",
        visibility: "user",
        dedupeKey: `patch_applied:${event.changeSetId}`,
        metadata: {
          userStoryId: event.userStoryId,
          changeSetId: event.changeSetId,
          filePaths: event.filePaths,
        },
      };
    }
    case "validation_evidence":
      return projectValidationEvidenceEvent(event);
    case "tool_call_started":
      return {
        body: `${formatAgentName(event.agentName)} iniciou ${formatToolName(event.toolName)}.`,
        compactBody: "Tool iniciada.",
        eventType: "trace",
        visibility: "developer",
        dedupeKey: `tool_started:${event.threadId}:${event.agentName}:${event.toolName}:${event.timestamp}`,
        metadata: {
          userStoryId: event.userStoryId,
          agentName: event.agentName,
          agentProfileId: event.agentProfileId,
          toolName: event.toolName,
          operationalSessionId: event.operationalSessionId,
        },
      };
    case "tool_call_finished": {
      const changed = event.filePaths?.length ?? 0;
      const succeeded = event.status === "succeeded";
      return {
        body: succeeded
          ? `${formatToolName(event.toolName)} concluída${changed > 0 ? ` em ${formatCount(changed, "arquivo")}` : ""}.`
          : `${formatToolName(event.toolName)} falhou: ${event.errorMessage ?? "erro não especificado"}`,
        compactBody: succeeded ? "Tool concluída." : "Tool falhou.",
        eventType: succeeded ? "progress" : "error",
        visibility: succeeded && changed > 0 ? "user" : "developer",
        dedupeKey: `tool_finished:${event.threadId}:${event.agentName}:${event.toolName}:${event.timestamp}`,
        metadata: {
          userStoryId: event.userStoryId,
          agentName: event.agentName,
          agentProfileId: event.agentProfileId,
          toolName: event.toolName,
          status: event.status,
          operationalSessionId: event.operationalSessionId,
          filePaths: event.filePaths ?? [],
        },
      };
    }
    case "tool_call_blocked":
      return {
        body: `${formatToolName(event.toolName)} foi bloqueada: ${event.errorMessage}`,
        compactBody: "Tool bloqueada.",
        eventType: "error",
        visibility: "user",
        dedupeKey: `tool_blocked:${event.threadId}:${event.agentName}:${event.toolName}:${event.timestamp}`,
        metadata: {
          userStoryId: event.userStoryId,
          agentName: event.agentName,
          agentProfileId: event.agentProfileId,
          toolName: event.toolName,
          operationalSessionId: event.operationalSessionId,
        },
      };
    case "command_output":
      return null;
    case "command_approval_requested":
      return {
        body:
          event.policyReason ??
          event.approvalReason ??
          `Comando ${event.commandId} aguarda aprovação.`,
        compactBody: "Comando aguardando aprovação.",
        eventType: "action_state",
        visibility: "user",
        dedupeKey: `command_approval:${event.threadId}:${event.taskId}`,
        metadata: {
          userStoryId: event.userStoryId,
          agentName: event.agentName,
          agentProfileId: event.agentProfileId,
          toolName: event.toolName,
          commandId: event.commandId,
          taskId: event.taskId,
          risk: event.risk,
          policyReason: event.policyReason,
          approvalReason: event.approvalReason,
          operationalSessionId: event.operationalSessionId,
        },
      };
    case "awaiting_approval":
      return {
        body: "Spec pronta para revisão.",
        eventType: "action_state",
        visibility: "user",
        dedupeKey: `awaiting_approval:${event.threadId}:${event.userStoryId}`,
        metadata: { userStoryId: event.userStoryId, specId: event.spec.id },
      };
    case "retry_started":
      return {
        body: `Ajustando a entrega após revisão. Tentativa ${event.retryCount}.`,
        compactBody: "Ajustando entrega.",
        eventType: "progress",
        visibility: "user",
        dedupeKey: `retry_started:${event.threadId}:${event.userStoryId}:${event.retryCount}`,
        metadata: {
          userStoryId: event.userStoryId,
          retryCount: event.retryCount,
          fixTarget: event.fixTarget,
          score: event.score,
        },
      };
    case "awaiting_retry_approval":
      return {
        body: "Preciso de decisão para continuar a correção.",
        eventType: "action_state",
        visibility: "user",
        dedupeKey: `awaiting_retry_approval:${event.threadId}:${event.userStoryId}:${event.retryCount}`,
        metadata: {
          userStoryId: event.userStoryId,
          retryCount: event.retryCount,
          score: event.score,
          missingItems: event.missingItems,
        },
      };
    case "awaiting_curator_review":
      return {
        body: "Aguardando revisão do curador.",
        eventType: "action_state",
        visibility: "user",
        dedupeKey: `awaiting_curator_review:${event.threadId}:${event.userStoryId}`,
        metadata: {
          userStoryId: event.userStoryId,
          score: event.score,
          previewSessionId: event.previewSessionId,
        },
      };
    case "recovery_decision":
      return {
        body: event.decision.operatorMessage,
        compactBody: "Decisão de recuperação registrada.",
        eventType: event.decision.retryable ? "progress" : "warning",
        visibility: event.decision.requiresHumanApproval ? "user" : "developer",
        dedupeKey: `recovery_decision:${event.threadId}:${event.gateId}:${event.timestamp}`,
        metadata: {
          userStoryId: event.userStoryId,
          candidateId: event.candidateId,
          gateId: event.gateId,
          gateType: event.gateType,
          evidenceStatus: event.evidenceStatus,
          errorCode: event.decision.errorCode,
          failureClass: event.decision.failureClass,
          recoveryAction: event.decision.recoveryAction,
          fixTarget: event.decision.fixTarget,
        },
      };
    case "fallback_executed":
      return {
        body: event.message,
        compactBody: "Fallback executado.",
        eventType: event.status === "failed" ? "error" : "progress",
        visibility: "user",
        dedupeKey: `fallback_executed:${event.threadId}:${event.action}:${event.timestamp}`,
        metadata: {
          userStoryId: event.userStoryId,
          recoveryAction: event.action,
          fallbackStatus: event.status,
        },
      };
    case "error":
      return {
        body: `Não consegui concluir esta etapa: ${event.message}`,
        compactBody: "Execução interrompida.",
        eventType: "error",
        visibility: "user",
        dedupeKey: `error:${event.threadId}:${event.timestamp}`,
      };
  }
}

function formatToolName(toolName: string): string {
  switch (toolName) {
    case "edit_file":
      return "Edição de arquivo";
    case "write_file":
      return "Criação de arquivo";
    case "delete_file":
      return "Remoção de arquivo";
    case "save_file":
      return "Salvamento de arquivo";
    case "propose_code_change_set":
      return "Registro da proposta";
    case "get_git_diff":
      return "Inspeção do diff";
    case "run_validation_command":
      return "Validação";
    case "run_command":
      return "Comando governado";
    default:
      return toolName;
  }
}

function projectStatusChangedEvent(
  event: Extract<WorkflowEvent, { type: "status_changed" }>
): WorkflowChatProjection | null {
  if (event.status === "running") {
    return {
      body: "Execução iniciada.",
      eventType: "trace",
      visibility: "developer",
      dedupeKey: `status:${event.threadId}:running:${event.timestamp}`,
      metadata: { status: event.status },
    };
  }
  if (event.status === "completed" || event.status === "completed_unverified") {
    return {
      body: "Execução concluída. A preview pode ser conferida.",
      compactBody: "Execução concluída.",
      eventType: "progress",
      visibility: "user",
      dedupeKey: `status:${event.threadId}:completed`,
      metadata: { status: event.status },
    };
  }
  if (event.status === "cancelled") {
    return {
      body: "Execução cancelada sem aplicar nova entrega.",
      compactBody: "Execução cancelada.",
      eventType: "warning",
      visibility: "user",
      dedupeKey: `status:${event.threadId}:cancelled`,
      metadata: { status: event.status },
    };
  }
  if (event.status === "error") {
    return {
      body: "Execução interrompida antes da entrega.",
      compactBody: "Execução interrompida.",
      eventType: "error",
      visibility: "user",
      dedupeKey: `status:${event.threadId}:error`,
      metadata: { status: event.status },
    };
  }
  return null;
}

function projectValidationEvidenceEvent(
  event: Extract<WorkflowEvent, { type: "validation_evidence" }>
): WorkflowChatProjection {
  const failedCommands = event.evidence.commands.filter(
    (command) => command.exitCode !== 0
  ).length;
  const passed =
    event.evidence.status === "passed" &&
    event.evidence.preview.status === "passed" &&
    failedCommands === 0;
  const skipped =
    event.evidence.status === "skipped" ||
    event.evidence.preview.status === "skipped";

  return {
    body: passed
      ? "Validação passou. Vou seguir para revisão final."
      : skipped
        ? "Validação registrada; alguns checks automáticos foram pulados."
        : "Validação encontrou erro. Vou corrigir antes de entregar.",
    compactBody: passed
      ? "Validação passou."
      : skipped
        ? "Validação registrada."
        : "Validação encontrou erro.",
    eventType: passed ? "evidence" : skipped ? "warning" : "error",
    visibility: "user",
    dedupeKey: `validation:${event.evidence.id}`,
    metadata: {
      userStoryId: event.userStoryId,
      validationStatus: event.evidence.status,
      previewStatus: event.evidence.preview.status,
      commandCount: event.evidence.commands.length,
      failedCommandCount: failedCommands,
    },
  };
}

function formatAgentName(agentName: AgentName): string {
  const labels: Record<AgentName, string> = {
    spec: "Spec Agent",
    odin: "Odin",
    front: "Front Agent",
    qa: "QA Agent",
    curator: "Curator",
  };
  return labels[agentName];
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown workflow error";
  }
}
