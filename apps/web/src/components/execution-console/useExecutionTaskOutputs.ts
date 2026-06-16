import { useEffect, useState } from "react";

export interface TerminalRow {
  id: string;
  label: string;
  status: string;
  timestamp: string;
  agent: string;
  tool: string;
  output: string;
  stream: "stdout" | "stderr" | "mixed";
  taskId: string | null;
  traceId: string | null;
  toolCallId: string | null;
  projectId: string | null;
  approvalRequired: boolean;
  risk: "low" | "medium" | "high";
  policyReason: string | null;
}

export interface FollowedTaskOutput {
  output: string;
  status: string;
}

export interface ExecutionTaskRowsState {
  rows: TerminalRow[];
  error: string | null;
}

export interface ExecutionTaskOutputsState {
  outputs: Map<string, FollowedTaskOutput>;
  error: string | null;
}

interface ExecutionTaskSnapshot {
  taskId: string;
  commandId: string;
  status: string;
  startedAt: string;
  traceId?: string | null;
  toolCallId?: string | null;
  projectId?: string | null;
  agentId?: string | null;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutTail?: string;
  stderrTail?: string;
  interactivePromptDetected?: boolean;
  interactivePromptText?: string | null;
  approvalRequired?: boolean;
  risk?: "low" | "medium" | "high";
  policyReason?: string | null;
}

export function useExecutionTaskRows(
  selectedProjectId: string | null,
  rows: readonly TerminalRow[]
): ExecutionTaskRowsState {
  const [tasks, setTasks] = useState<ExecutionTaskSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProjectId) {
      setTasks([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let timer: number | undefined;

    const poll = async () => {
      try {
        const nextTasks = await fetchTaskList(selectedProjectId, controller.signal);
        if (controller.signal.aborted) return;
        setTasks(nextTasks);
        setError(null);
        if (nextTasks.some((task) => isTaskActive(task.status))) {
          timer = window.setTimeout(poll, 1_200);
        } else {
          timer = window.setTimeout(poll, 3_000);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(errorMessage(err, "Falha ao atualizar execution tasks."));
          timer = window.setTimeout(poll, 3_000);
        }
      }
    };

    void poll();

    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [selectedProjectId]);

  return {
    rows: mergeTaskRows(rows, tasks, selectedProjectId),
    error,
  };
}

export function useExecutionTaskOutputs(
  selectedProjectId: string | null,
  rows: readonly TerminalRow[]
): ExecutionTaskOutputsState {
  const [outputs, setOutputs] = useState<Map<string, FollowedTaskOutput>>(
    () => new Map()
  );
  const [error, setError] = useState<string | null>(null);
  const taskRowsSignature = rows
    .map(
      (row) =>
        `${row.id}:${row.projectId ?? ""}:${row.taskId ?? ""}:${row.timestamp}`
    )
    .join("|");

  useEffect(() => {
    if (!selectedProjectId) {
      setOutputs((current) => (current.size === 0 ? current : new Map()));
      setError(null);
      return;
    }

    const rowsWithTasks = uniqueTaskRows(rows).slice(0, 6);
    if (rowsWithTasks.length === 0) {
      setOutputs((current) => (current.size === 0 ? current : new Map()));
      setError(null);
      return;
    }

    const controller = new AbortController();
    let timer: number | undefined;

    const poll = async () => {
      try {
        const entries = (
          await Promise.all(
            rowsWithTasks.map(async (row) => {
              const projectId = selectedProjectId;
              const taskId = row.taskId!;
              const task = await fetchTaskSnapshot(
                projectId,
                taskId,
                controller.signal
              );
              if (!task) return null;
              const [stdout, stderr] = await Promise.all([
                fetchTaskOutputTail({
                  projectId,
                  taskId,
                  stream: "stdout",
                  byteCount: task.stdoutBytes,
                  signal: controller.signal,
                }),
                fetchTaskOutputTail({
                  projectId,
                  taskId,
                  stream: "stderr",
                  byteCount: task.stderrBytes,
                  signal: controller.signal,
                }),
              ]);
              const fallbackOutput = [task.stdoutTail, task.stderrTail]
                .filter(Boolean)
                .join("\n");
              const output =
                [stdout, stderr].filter(Boolean).join("\n") || fallbackOutput;
              const promptOutput =
                task.interactivePromptDetected && task.interactivePromptText
                  ? `${output}${output ? "\n" : ""}[prompt interativo] ${task.interactivePromptText}`
                  : output;
              return [
                row.id,
                {
                  output: promptOutput,
                  status: task.interactivePromptDetected
                    ? "aguardando input"
                    : executionTaskStatusLabel(task.status),
                },
                isTaskActive(task.status),
              ] as const;
            })
          )
        ).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
        if (controller.signal.aborted) return;
        const next = new Map<string, FollowedTaskOutput>();
        for (const [id, value] of entries) {
          if (value.output.length > 0 || value.status) next.set(id, value);
        }
        setOutputs(next);
        setError(null);
        if (entries.some(([, , active]) => active)) {
          timer = window.setTimeout(poll, 1_200);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(errorMessage(err, "Falha ao ler output de execution task."));
          timer = window.setTimeout(poll, 2_000);
        }
      }
    };

    void poll();

    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [taskRowsSignature, selectedProjectId]);

  return { outputs, error };
}

function uniqueTaskRows(rows: readonly TerminalRow[]): TerminalRow[] {
  const byTask = new Map<string, TerminalRow>();
  for (const row of rows) {
    if (!row.taskId) continue;
    const projectId = row.projectId ?? "";
    byTask.set(`${projectId}:${row.taskId}`, row);
  }
  return [...byTask.values()];
}

function mergeTaskRows(
  rows: readonly TerminalRow[],
  tasks: readonly ExecutionTaskSnapshot[],
  selectedProjectId: string | null
): TerminalRow[] {
  const byTaskId = new Set(
    rows
      .map((row) => row.taskId)
      .filter((taskId): taskId is string => Boolean(taskId))
  );
  const discoveredRows = tasks
    .filter((task) => !byTaskId.has(task.taskId))
    .map((task): TerminalRow => ({
      id: `task:${task.taskId}`,
      label: task.commandId,
      status: executionTaskStatusLabel(task.status),
      timestamp: task.startedAt,
      agent: task.agentId ?? "runtime",
      tool: "execution_task",
      output: "",
      stream: "mixed",
      taskId: task.taskId,
      traceId: task.traceId ?? null,
      toolCallId: task.toolCallId ?? null,
      projectId: task.projectId ?? selectedProjectId,
      approvalRequired: task.approvalRequired ?? false,
      risk: task.risk ?? "low",
      policyReason: task.policyReason ?? null,
    }));
  return [...rows, ...discoveredRows].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp)
  );
}

async function fetchTaskList(
  projectId: string,
  signal: AbortSignal
): Promise<ExecutionTaskSnapshot[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/execution-tasks?limit=20`,
    { cache: "no-store", signal }
  );
  await requireExecutionTaskOk(response, "Listar execution tasks");
  const body = (await response.json()) as { tasks?: ExecutionTaskSnapshot[] };
  return body.tasks ?? [];
}

async function fetchTaskSnapshot(
  projectId: string,
  taskId: string,
  signal: AbortSignal
): Promise<ExecutionTaskSnapshot | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/execution-tasks/${encodeURIComponent(
      taskId
    )}`,
    { cache: "no-store", signal }
  );
  if (response.status === 404) return null;
  await requireExecutionTaskOk(response, "Consultar execution task");
  return response.json() as Promise<ExecutionTaskSnapshot>;
}

async function fetchTaskOutputTail(input: {
  projectId: string;
  taskId: string;
  stream: "stdout" | "stderr";
  byteCount: number;
  signal: AbortSignal;
}): Promise<string> {
  if (input.byteCount <= 0) return "";
  const limit = 12_000;
  const offset = Math.max(0, input.byteCount - limit);
  const response = await fetch(
    `/api/projects/${encodeURIComponent(input.projectId)}/execution-tasks/${encodeURIComponent(
      input.taskId
    )}/output?stream=${input.stream}&offset=${offset}&limit=${limit}`,
    { cache: "no-store", signal: input.signal }
  );
  await requireExecutionTaskOk(response, "Ler output da execution task");
  const body = (await response.json()) as { chunk?: string };
  return body.chunk ?? "";
}

async function requireExecutionTaskOk(
  response: Response,
  action: string
): Promise<void> {
  if (response.ok) return;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;
    const detail = body?.message ?? body?.error ?? response.statusText;
    throw new Error(`${action} falhou (${response.status}): ${detail}`);
  }
  const body = await response.text().catch(() => "");
  throw new Error(
    `${action} falhou (${response.status}): ${
      body.trim() || response.statusText || "sem detalhe retornado"
    }`
  );
}

function isTaskActive(status: string): boolean {
  return status === "queued" || status === "running";
}

export function executionTaskStatusLabel(status: string): string {
  if (status === "awaiting_approval") return "aguardando aprovação";
  if (status === "queued") return "na fila";
  if (status === "running") return "rodando";
  if (status === "completed") return "concluído";
  if (status === "failed") return "falhou";
  if (status === "timed_out") return "timeout";
  if (status === "aborted") return "abortado";
  if (status === "rejected") return "rejeitado";
  return status;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
