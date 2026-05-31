import {
  AgentRunbookEntrySchema,
  type AgentOperationEvent,
  type AgentOperationProjection,
  type AgentRunbookAction,
  type AgentRunbookEntry,
  type AgentRunbookStatus,
  type AgentToolName,
  type HorusRunEventSnapshot,
} from "@u-build/shared";

export class AgentRunbookService {
  buildFromOperationalProjection(
    projection: AgentOperationProjection,
    events: readonly AgentOperationEvent[]
  ): AgentRunbookEntry[] {
    const ordered = [...events].sort((left, right) => {
      if (left.sequence !== right.sequence) return left.sequence - right.sequence;
      return left.createdAt.localeCompare(right.createdAt);
    });
    const entries: AgentRunbookEntry[] = [];
    const runningToolEvents = new Map<AgentToolName, AgentOperationEvent[]>();

    for (const event of ordered) {
      if (event.type === "tool_started" && event.toolName) {
        const current = runningToolEvents.get(event.toolName) ?? [];
        runningToolEvents.set(event.toolName, [...current, event]);
        continue;
      }

      if (
        (event.type === "tool_succeeded" ||
          event.type === "tool_failed" ||
          event.type === "tool_blocked") &&
        event.toolName
      ) {
        const current = runningToolEvents.get(event.toolName) ?? [];
        runningToolEvents.set(event.toolName, current.slice(1));
      }

      const entry = this.entryFromOperationEvent(projection, event);
      if (entry) entries.push(entry);
    }

    for (const pending of [...runningToolEvents.values()].flat()) {
      entries.push(
        this.parseEntry(projection, pending, {
          action: actionForTool(pending.toolName),
          status: "running",
          title: runningToolTitle(pending.toolName, pending.filePaths[0]),
          summary: pending.summary ?? undefined,
          target: pending.filePaths[0] ?? pending.commandIds[0] ?? undefined,
          metadata: { source: "operational_session", eventType: pending.type },
        })
      );
    }

    return sortRunbookEntries(entries);
  }

  buildFromWorkflowEvents(
    events: readonly HorusRunEventSnapshot[]
  ): AgentRunbookEntry[] {
    return sortRunbookEntries(
      events.flatMap((event) => {
        const entry = this.entryFromWorkflowEvent(event);
        return entry ? [entry] : [];
      })
    );
  }

  merge(entries: readonly AgentRunbookEntry[]): AgentRunbookEntry[] {
    const operationalSessionIds = new Set(
      entries
        .filter((entry) => entry.metadata["source"] === "operational_session")
        .map((entry) => entry.sessionId)
        .filter((sessionId): sessionId is string => Boolean(sessionId))
    );
    const byId = new Map<string, AgentRunbookEntry>();
    for (const entry of sortRunbookEntries(entries)) {
      if (
        entry.metadata["source"] === "workflow" &&
        entry.action === "tool" &&
        entry.sessionId &&
        operationalSessionIds.has(entry.sessionId)
      ) {
        continue;
      }
      byId.set(entry.id, entry);
    }
    return [...byId.values()];
  }

  private entryFromOperationEvent(
    projection: AgentOperationProjection,
    event: AgentOperationEvent
  ): AgentRunbookEntry | null {
    switch (event.type) {
      case "session_started":
        return this.parseEntry(projection, event, {
          action: "session",
          status: "running",
          title: `${agentLabel(projection.session.agentName)} iniciou execução`,
          summary: event.summary ?? undefined,
          metadata: { source: "operational_session", eventType: event.type },
        });
      case "tool_succeeded":
        if (!event.toolName || hasDedicatedEvidenceEvent(event.toolName)) return null;
        return this.parseEntry(projection, event, {
          action: actionForTool(event.toolName),
          status: "succeeded",
          title: succeededToolTitle(event.toolName, event.filePaths[0]),
          summary: event.summary ?? undefined,
          target: event.filePaths[0] ?? event.commandIds[0] ?? undefined,
          metadata: { source: "operational_session", eventType: event.type },
        });
      case "tool_failed":
      case "tool_blocked":
        return this.parseEntry(projection, event, {
          action: event.toolName ? actionForTool(event.toolName) : "tool",
          status: event.type === "tool_blocked" ? "blocked" : "failed",
          title:
            event.type === "tool_blocked"
              ? `${toolLabel(event.toolName)} bloqueado`
              : `${toolLabel(event.toolName)} falhou`,
          summary: event.summary ?? undefined,
          target: event.filePaths[0] ?? event.commandIds[0] ?? undefined,
          errorMessage: event.errorMessage ?? undefined,
          metadata: { source: "operational_session", eventType: event.type },
        });
      case "file_read": {
        const path = event.filePaths[0] ?? metadataPath(event, "evidence");
        return this.parseEntry(projection, event, {
          action: "read_file",
          status: "succeeded",
          title: path ? `Leu ${path}` : "Leu arquivo",
          summary: event.summary ?? undefined,
          target: path,
          metadata: { source: "operational_session", eventType: event.type },
        });
      }
      case "file_changed": {
        const path = event.filePaths[0] ?? metadataPath(event, "change");
        const changeType = metadataChangeType(event);
        return this.parseEntry(projection, event, {
          action: "change_file",
          status: "succeeded",
          title: fileChangeTitle(changeType, path),
          summary: event.summary ?? undefined,
          target: path,
          metadata: {
            source: "operational_session",
            eventType: event.type,
            changeType,
          },
        });
      }
      case "command_ran": {
        const commandId = event.commandIds[0] ?? metadataCommandId(event);
        const failed = commandFailed(event);
        return this.parseEntry(projection, event, {
          action: event.toolName === "run_validation_command" ? "validate" : "run_command",
          status: failed ? "failed" : "succeeded",
          title: commandId ? `Executou ${commandId}` : "Executou comando",
          summary: event.summary ?? undefined,
          target: commandId,
          errorMessage: failed ? event.errorMessage ?? "Comando terminou com falha." : undefined,
          metadata: { source: "operational_session", eventType: event.type },
        });
      }
      case "diff_recorded":
        return this.parseEntry(projection, event, {
          action: "inspect_diff",
          status: "succeeded",
          title: "Inspecionou diff",
          summary: event.summary ?? undefined,
          target: event.filePaths.length > 0 ? `${event.filePaths.length} arquivo(s)` : undefined,
          metadata: { source: "operational_session", eventType: event.type },
        });
      case "retry_recorded":
        return this.parseEntry(projection, event, {
          action: "retry",
          status: "running",
          title: "Registrou tentativa de correção",
          summary: event.summary ?? undefined,
          metadata: { source: "operational_session", eventType: event.type },
        });
      case "decision_recorded":
        return this.parseEntry(projection, event, {
          action: "inspect_project",
          status: "succeeded",
          title: "Inspecionou projeto",
          summary: event.summary ?? undefined,
          metadata: { source: "operational_session", eventType: event.type },
        });
      case "session_finished": {
        const terminalStatus = terminalStatusFromEvent(event);
        return this.parseEntry(projection, event, {
          action: "completed",
          status: terminalStatus,
          title: terminalTitle(terminalStatus),
          summary: event.summary ?? undefined,
          errorMessage: event.errorMessage ?? undefined,
          completedAt: event.createdAt,
          metadata: { source: "operational_session", eventType: event.type },
        });
      }
      default:
        return null;
    }
  }

  private parseEntry(
    projection: AgentOperationProjection,
    event: AgentOperationEvent,
    fields: {
      action: AgentRunbookAction;
      status: AgentRunbookStatus;
      title: string;
      summary?: string | undefined;
      target?: string | undefined;
      errorMessage?: string | undefined;
      completedAt?: string | undefined;
      metadata?: Record<string, unknown> | undefined;
    }
  ): AgentRunbookEntry {
    return AgentRunbookEntrySchema.parse({
      id: `operation:${projection.session.id}:${event.sequence}:${event.type}`,
      workflowThreadId: projection.session.workflowThreadId,
      sessionId: projection.session.id,
      sourceEventIds: [event.id],
      sequence: event.sequence,
      agentName: projection.session.agentName,
      agentProfileId: projection.session.agentProfileId,
      ...(event.toolName ? { toolName: event.toolName } : {}),
      action: fields.action,
      status: fields.status,
      title: fields.title,
      ...(fields.summary ? { summary: fields.summary } : {}),
      ...(fields.target ? { target: fields.target } : {}),
      filePaths: event.filePaths,
      commandIds: event.commandIds,
      ...(fields.errorMessage ? { errorMessage: fields.errorMessage } : {}),
      startedAt: event.createdAt,
      ...(fields.completedAt ? { completedAt: fields.completedAt } : {}),
      updatedAt: fields.completedAt ?? event.createdAt,
      metadata: fields.metadata ?? {},
    });
  }

  private entryFromWorkflowEvent(
    event: HorusRunEventSnapshot
  ): AgentRunbookEntry | null {
    const base = {
      workflowThreadId: event.threadId,
      sequence: event.sequence,
      ...(event.agentName ? { agentName: event.agentName } : {}),
      ...(event.agentProfileId ? { agentProfileId: event.agentProfileId } : {}),
      filePaths: event.filePaths ?? [],
      commandIds: event.commandIds ?? [],
      startedAt: event.timestamp,
      updatedAt: event.timestamp,
      metadata: {
        source: "workflow",
        eventType: event.type,
        ...(workflowSessionId(event) ? { operationalSessionId: workflowSessionId(event) } : {}),
      },
    };

    if (event.type === "awaiting_approval") {
      return AgentRunbookEntrySchema.parse({
        ...base,
        id: `workflow:${event.id}:awaiting-approval`,
        action: "decision",
        status: "waiting_for_decision",
        title: "Aguardando aprovação da spec",
        summary: event.summary,
      });
    }
    if (event.type === "awaiting_retry_approval") {
      return AgentRunbookEntrySchema.parse({
        ...base,
        id: `workflow:${event.id}:awaiting-retry`,
        action: "decision",
        status: "waiting_for_decision",
        title: "Aguardando decisão de retry",
        summary: event.summary,
      });
    }
    if (event.type === "retry_started") {
      return AgentRunbookEntrySchema.parse({
        ...base,
        id: `workflow:${event.id}:retry`,
        action: "retry",
        status: "running",
        title: event.title,
        summary: event.summary,
      });
    }
    if (event.type === "fallback_executed") {
      const blocked = event.summary?.includes("block_delivery") ?? false;
      return AgentRunbookEntrySchema.parse({
        ...base,
        id: `workflow:${event.id}:fallback`,
        action: "decision",
        status: event.errorMessage || event.eventType === "failed"
          ? "failed"
          : blocked
            ? "blocked"
            : "succeeded",
        title: event.title,
        summary: event.summary,
        ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
      });
    }
    if (event.type === "tool_call_started" || event.type === "tool_call_finished" || event.type === "tool_call_blocked") {
      const sessionId = workflowSessionId(event);
      return AgentRunbookEntrySchema.parse({
        ...base,
        id: `workflow:${event.id}:tool`,
        ...(sessionId ? { sessionId } : {}),
        toolName: toolNameFromWorkflowEvent(event),
        action: "tool",
        status:
          event.type === "tool_call_started"
            ? "running"
            : event.type === "tool_call_blocked"
              ? "blocked"
              : event.eventType === "failed"
                ? "failed"
                : "succeeded",
        title: event.title,
        summary: event.summary,
        ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
      });
    }
    if (event.type === "error") {
      return AgentRunbookEntrySchema.parse({
        ...base,
        id: `workflow:${event.id}:error`,
        action: "completed",
        status: "failed",
        title: event.title,
        summary: event.summary,
        ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
      });
    }
    if (event.type === "status_changed" && event.eventType === "completed") {
      return AgentRunbookEntrySchema.parse({
        ...base,
        id: `workflow:${event.id}:completed`,
        action: "completed",
        status: "succeeded",
        title: "Workflow concluído",
        summary: event.summary,
        completedAt: event.timestamp,
      });
    }
    return null;
  }
}

function sortRunbookEntries(entries: readonly AgentRunbookEntry[]): AgentRunbookEntry[] {
  return [...entries].sort((left, right) => {
    const time = left.updatedAt.localeCompare(right.updatedAt);
    if (time !== 0) return time;
    return left.sequence - right.sequence || left.id.localeCompare(right.id);
  });
}

function hasDedicatedEvidenceEvent(toolName: AgentToolName): boolean {
  return (
    toolName === "inspect_project" ||
    toolName === "read_file" ||
    toolName === "edit_file" ||
    toolName === "write_file" ||
    toolName === "save_file" ||
    toolName === "delete_file" ||
    toolName === "apply_code_change_set" ||
    toolName === "run_validation_command" ||
    toolName === "run_command" ||
    toolName === "get_git_diff"
  );
}

function actionForTool(toolName: AgentToolName | null | undefined): AgentRunbookAction {
  if (toolName === "inspect_project") return "inspect_project";
  if (toolName === "read_file") return "read_file";
  if (
    toolName === "edit_file" ||
    toolName === "write_file" ||
    toolName === "save_file" ||
    toolName === "delete_file" ||
    toolName === "apply_code_change_set"
  ) {
    return "change_file";
  }
  if (toolName === "run_validation_command") return "validate";
  if (toolName === "run_command") return "run_command";
  if (toolName === "get_git_diff") return "inspect_diff";
  if (toolName === "propose_code_change_set") return "propose_change";
  return "tool";
}

function runningToolTitle(
  toolName: AgentToolName | null | undefined,
  target?: string
): string {
  if (toolName === "read_file") return target ? `Lendo ${target}` : "Lendo arquivo";
  if (toolName === "edit_file" || toolName === "save_file") {
    return target ? `Editando ${target}` : "Editando arquivo";
  }
  if (toolName === "write_file") return target ? `Criando ${target}` : "Criando arquivo";
  if (toolName === "delete_file") return target ? `Removendo ${target}` : "Removendo arquivo";
  if (toolName === "run_validation_command") return "Validando projeto";
  return `${toolLabel(toolName)} em execução`;
}

function succeededToolTitle(
  toolName: AgentToolName | null | undefined,
  target?: string
): string {
  if (toolName === "propose_code_change_set") return "Registrou proposta de alteração";
  if (target) return `${toolLabel(toolName)} concluiu ${target}`;
  return `${toolLabel(toolName)} concluiu`;
}

function toolLabel(toolName: AgentToolName | null | undefined): string {
  if (!toolName) return "Tool";
  const labels: Partial<Record<AgentToolName, string>> = {
    inspect_project: "Inspeção do projeto",
    read_file: "Leitura",
    edit_file: "Edição",
    save_file: "Salvamento",
    write_file: "Criação",
    delete_file: "Remoção",
    apply_code_change_set: "Aplicação do patch",
    get_git_diff: "Diff",
    propose_code_change_set: "Proposta",
    run_validation_command: "Validação",
    run_command: "Comando",
  };
  return labels[toolName] ?? toolName;
}

function agentLabel(agentName: string): string {
  if (agentName === "front") return "Front Agent";
  if (agentName === "qa") return "QA Agent";
  if (agentName === "curator") return "Curator Agent";
  if (agentName === "odin") return "Odin";
  if (agentName === "spec") return "Spec Agent";
  return agentName;
}

function metadataPath(
  event: AgentOperationEvent,
  field: "evidence" | "change"
): string | undefined {
  const record = asRecord(event.metadata[field]);
  return stringValue(record["path"]);
}

function metadataChangeType(event: AgentOperationEvent): string {
  const change = asRecord(event.metadata["change"]);
  return stringValue(change["changeType"]) ?? "unknown";
}

function metadataCommandId(event: AgentOperationEvent): string | undefined {
  const command = asRecord(event.metadata["command"]);
  return stringValue(command["commandId"]);
}

function commandFailed(event: AgentOperationEvent): boolean {
  if (event.errorMessage) return true;
  const command = asRecord(event.metadata["command"]);
  const status = stringValue(command["status"]);
  const exitCode = command["exitCode"];
  return (
    status === "failed" ||
    status === "timed_out" ||
    status === "aborted" ||
    status === "rejected" ||
    (typeof exitCode === "number" && exitCode !== 0)
  );
}

function terminalStatusFromEvent(event: AgentOperationEvent): AgentRunbookStatus {
  const terminalStatus = stringValue(asRecord(event.metadata)["terminalStatus"]);
  if (terminalStatus === "completed") return "succeeded";
  if (terminalStatus === "blocked") return "blocked";
  if (terminalStatus === "cancelled" || terminalStatus === "failed") return "failed";
  return event.errorMessage ? "failed" : "succeeded";
}

function terminalTitle(status: AgentRunbookStatus): string {
  if (status === "succeeded") return "Sessão concluída";
  if (status === "blocked") return "Sessão bloqueada";
  return "Sessão falhou";
}

function fileChangeTitle(changeType: string, path?: string): string {
  const target = path ?? "arquivo";
  if (changeType === "create") return `Criou ${target}`;
  if (changeType === "delete") return `Removeu ${target}`;
  return `Editou ${target}`;
}

function workflowSessionId(event: HorusRunEventSnapshot): string | undefined {
  const value = event.metadata?.["operationalSessionId"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toolNameFromWorkflowEvent(
  event: HorusRunEventSnapshot
): AgentToolName | undefined {
  const value = event.metadata?.["toolName"] ?? event.metadata?.["tool"];
  return typeof value === "string" ? (value as AgentToolName) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
