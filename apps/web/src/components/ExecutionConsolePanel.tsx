import { useCallback, useMemo, useState, type JSX } from "react";
import type { AgentFileOperationTelemetry, FrontendProject } from "@u-build/shared";
import type { PreviewChatMessage } from "./PreviewConversationPanel.js";
import {
  executionTaskStatusLabel,
  useExecutionTaskRows,
  useExecutionTaskOutputs,
  type TerminalRow,
} from "./execution-console/useExecutionTaskOutputs.js";
import {
  ExecutionConsoleHeader,
  ExecutionContextSection,
  ExecutionConsoleMetrics,
  ExecutionDiffSection,
  ExecutionFilesSection,
  ExecutionTerminalSection,
  ExecutionTimelineSection,
  ExecutionValidationSection,
} from "./execution-console/ExecutionConsoleSections.js";
import {
  hasDiffEvidence,
  selectContextReceiptRows,
  selectLatestFileOperations,
  selectOperationalTraceRows,
  selectTerminalRows,
  selectTimelineRows,
  selectValidationChains,
  shortId,
} from "./execution-console/projections.js";
import type { WorkflowProgressEvent } from "../features/visual-preview/workflowProgress.js";

interface ExecutionTaskRouteTask {
  taskId: string;
  status: string;
  startedAt?: string;
}

export function ExecutionConsolePanel({
  isCollapsed,
  selectedProject,
  workflowThreadId,
  workflowEvents,
  fileOperations,
  fileOperationsError,
  chatMessages,
  onToggleCollapsed,
}: {
  readonly isCollapsed: boolean;
  readonly selectedProject: FrontendProject | null;
  readonly workflowThreadId: string | null;
  readonly workflowEvents: WorkflowProgressEvent[];
  readonly fileOperations: AgentFileOperationTelemetry[];
  readonly fileOperationsError: string | null;
  readonly chatMessages: PreviewChatMessage[];
  readonly onToggleCollapsed: () => void;
}): JSX.Element {
  const latestFiles = useMemo(
    () => selectLatestFileOperations(fileOperations, chatMessages),
    [chatMessages, fileOperations]
  );
  const terminalRows = useMemo(
    () => selectTerminalRows(workflowEvents, fileOperations, chatMessages),
    [chatMessages, fileOperations, workflowEvents]
  );
  const validationChains = useMemo(
    () => selectValidationChains(workflowEvents),
    [workflowEvents]
  );
  const operationalTraceRows = useMemo(
    () => selectOperationalTraceRows(workflowEvents, fileOperations),
    [fileOperations, workflowEvents]
  );
  const contextRows = useMemo(
    () => selectContextReceiptRows(workflowEvents),
    [workflowEvents]
  );
  const [retriedTasks, setRetriedTasks] = useState<
    Map<string, ExecutionTaskRouteTask>
  >(() => new Map());
  const [executionTaskActionError, setExecutionTaskActionError] = useState<
    string | null
  >(null);
  const executionProjectId = selectedProject?.projectWorkspaceId ?? null;
  const effectiveTerminalRows = useMemo(
    () =>
      terminalRows.map((row) => {
        const retriedTask = retriedTasks.get(row.id);
        if (!retriedTask) return row;
        return {
          ...row,
          taskId: retriedTask.taskId,
          status: executionTaskStatusLabel(retriedTask.status),
          timestamp: retriedTask.startedAt ?? row.timestamp,
          output: "",
        };
      }),
    [retriedTasks, terminalRows]
  );
  const canonicalTerminalRows = useExecutionTaskRows(
    executionProjectId,
    effectiveTerminalRows
  );
  const followedTasks = useExecutionTaskOutputs(
    executionProjectId,
    canonicalTerminalRows
  );
  const [killingTaskIds, setKillingTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const stopExecutionTask = useCallback(
    async (row: TerminalRow) => {
      if (!row.taskId || !executionProjectId) return;
      const projectId = executionProjectId;
      const taskId = row.taskId;
      setKillingTaskIds((current) => new Set(current).add(taskId));
      try {
        setExecutionTaskActionError(null);
        await killExecutionTask(projectId, taskId);
      } catch (err) {
        setExecutionTaskActionError(
          err instanceof Error ? err.message : "Falha ao parar execution task."
        );
      } finally {
        setKillingTaskIds((current) => {
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
      }
    },
    [executionProjectId]
  );
  const [retryingTaskIds, setRetryingTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const [approvingTaskIds, setApprovingTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const retryExecutionTask = useCallback(
    async (row: TerminalRow) => {
      if (!row.taskId || !executionProjectId) return;
      const projectId = executionProjectId;
      const taskId = row.taskId;
      setRetryingTaskIds((current) => new Set(current).add(taskId));
      try {
        setExecutionTaskActionError(null);
        const task = await retryExecutionTaskRequest(projectId, taskId);
        setRetriedTasks((current) => new Map(current).set(row.id, task));
      } catch (err) {
        setExecutionTaskActionError(
          err instanceof Error ? err.message : "Falha ao reexecutar execution task."
        );
      } finally {
        setRetryingTaskIds((current) => {
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
      }
    },
    [executionProjectId]
  );
  const approveExecutionTask = useCallback(
    async (row: TerminalRow) => {
      if (!row.taskId || !executionProjectId) return;
      const projectId = executionProjectId;
      const taskId = row.taskId;
      setApprovingTaskIds((current) => new Set(current).add(taskId));
      try {
        setExecutionTaskActionError(null);
        const task = await approveExecutionTaskRequest(projectId, taskId);
        setRetriedTasks((current) => new Map(current).set(row.id, task));
      } catch (err) {
        setExecutionTaskActionError(
          err instanceof Error ? err.message : "Falha ao aprovar execution task."
        );
      } finally {
        setApprovingTaskIds((current) => {
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
      }
    },
    [executionProjectId]
  );
  const diffRows = useMemo(
    () => latestFiles.filter(hasDiffEvidence).slice(0, 4),
    [latestFiles]
  );
  const visibleEvents = useMemo(
    () => selectTimelineRows(workflowEvents, chatMessages),
    [chatMessages, workflowEvents]
  );
  const eventCount = Math.max(workflowEvents.length, visibleEvents.length);
  const runLabel = workflowThreadId
    ? shortId(workflowThreadId)
    : chatMessages.some((message) => message.isStreaming)
      ? "chat live"
      : "idle";
  const summaryCount = eventCount + latestFiles.length + terminalRows.length;

  if (isCollapsed) {
    return (
      <aside
        className="execution-console-panel is-collapsed"
        aria-label="Execution Console recolhido"
      >
        <button
          className="execution-console-collapse-rail"
          type="button"
          aria-label="Expandir Execution Console"
          title="Expandir console"
          onClick={onToggleCollapsed}
        >
          <span className="execution-console-rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="4" y="5" width="16" height="14" rx="2" />
              <path d="M15 5v14M14 8l-4 4 4 4" />
            </svg>
          </span>
          <span className="execution-console-rail-label">Console</span>
          <strong>{summaryCount}</strong>
        </button>
      </aside>
    );
  }

  return (
    <aside className="execution-console-panel" aria-label="Execution Console">
      <ExecutionConsoleHeader
        projectName={selectedProject?.name ?? "Sem projeto"}
        runLabel={runLabel}
        onToggleCollapsed={onToggleCollapsed}
      />
      <ExecutionConsoleMetrics
        eventCount={eventCount}
        fileCount={latestFiles.length}
        commandCount={terminalRows.length}
      />
      <div className="execution-console-body">
        <ExecutionTimelineSection
          traces={operationalTraceRows}
          events={visibleEvents}
        />
        <ExecutionContextSection rows={contextRows} />
        <ExecutionFilesSection
          files={latestFiles}
          error={fileOperationsError}
        />
        <ExecutionTerminalSection
          rows={canonicalTerminalRows}
          commandCount={canonicalTerminalRows.length}
          followedTasks={followedTasks}
          actionError={executionTaskActionError}
          selectedProjectId={executionProjectId}
          killingTaskIds={killingTaskIds}
          retryingTaskIds={retryingTaskIds}
          approvingTaskIds={approvingTaskIds}
          onStopTask={(row) => {
            void stopExecutionTask(row);
          }}
          onRetryTask={(row) => {
            void retryExecutionTask(row);
          }}
          onApproveTask={(row) => {
            void approveExecutionTask(row);
          }}
        />
        <ExecutionValidationSection chains={validationChains} />
        <ExecutionDiffSection rows={diffRows} />
      </div>
    </aside>
  );
}

async function killExecutionTask(projectId: string, taskId: string): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/execution-tasks/${encodeURIComponent(
      taskId
    )}/kill`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw new Error(await readExecutionTaskRouteError(response, "Parar execution task"));
  }
}

async function retryExecutionTaskRequest(
  projectId: string,
  taskId: string
): Promise<ExecutionTaskRouteTask> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/execution-tasks/${encodeURIComponent(
      taskId
    )}/retry`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw new Error(
      await readExecutionTaskRouteError(response, "Reexecutar execution task")
    );
  }
  return response.json() as Promise<ExecutionTaskRouteTask>;
}

async function approveExecutionTaskRequest(
  projectId: string,
  taskId: string
): Promise<ExecutionTaskRouteTask> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/execution-tasks/${encodeURIComponent(
      taskId
    )}/approve`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        approvedBy: "operator:execution-console",
        approvalReason: "Aprovado no Execution Console.",
      }),
    }
  );
  if (!response.ok) {
    throw new Error(
      await readExecutionTaskRouteError(response, "Aprovar execution task")
    );
  }
  return response.json() as Promise<ExecutionTaskRouteTask>;
}

async function readExecutionTaskRouteError(
  response: Response,
  action: string
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;
    const detail = body?.message ?? body?.error ?? response.statusText;
    return `${action} falhou (${response.status}): ${detail}`;
  }
  const body = await response.text().catch(() => "");
  return `${action} falhou (${response.status}): ${
    body.trim() || response.statusText || "sem detalhe retornado"
  }`;
}
