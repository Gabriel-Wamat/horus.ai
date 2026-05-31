import type {
  AgentFileOperationStatus,
  AgentFileOperationType,
} from "@u-build/shared";

export function terminalStatusTone(
  status: string
): "running" | "failed" | "success" | "muted" {
  if (
    status === "rodando" ||
    status === "started" ||
    status === "running" ||
    status === "aguardando input" ||
    status === "aguardando aprovação"
  ) {
    return "running";
  }
  if (
    status === "falhou" ||
    status === "failed" ||
    status === "bloqueado" ||
    status === "timeout" ||
    status === "abortado" ||
    status === "rejeitado" ||
    (status.startsWith("exit ") && !status.startsWith("exit 0"))
  ) {
    return "failed";
  }
  if (status === "concluído" || status === "succeeded" || status.startsWith("exit 0")) {
    return "success";
  }
  return "muted";
}

export function operationTypeLabel(type: AgentFileOperationType): string {
  const labels: Record<AgentFileOperationType, string> = {
    read: "leitura",
    create: "criação",
    update: "edição",
    delete: "remoção",
    validate: "validação",
    diff: "diff",
    apply: "apply",
    unknown: "operação",
  };
  return labels[type];
}

export function operationStatusLabel(status: AgentFileOperationStatus): string {
  const labels: Record<AgentFileOperationStatus, string> = {
    running: "rodando",
    read: "lido",
    changed: "alterado",
    proposed: "proposto",
    applied: "aplicado",
    validated: "validado",
    blocked: "bloqueado",
    failed: "falhou",
    skipped: "ignorado",
    unknown: "desconhecido",
  };
  return labels[status];
}

export function formatTime(value: string | undefined): string {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
