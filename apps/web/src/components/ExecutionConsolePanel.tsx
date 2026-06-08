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
  ExecutionConsoleMetrics,
  ExecutionDiffSection,
  ExecutionFilesSection,
  ExecutionTerminalSection,
  ExecutionTimelineSection,
  ExecutionValidationSection,
} from "./execution-console/ExecutionConsoleSections.js";
import {
  hasDiffEvidence,
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
  selectedProject,
  workflowThreadId,
  workflowEvents,
  fileOperations,
  chatMessages,
}: {
  readonly selectedProject: FrontendProject | null;
  readonly workflowThreadId: string | null;
  readonly workflowEvents: WorkflowProgressEvent[];
  readonly fileOperations: AgentFileOperationTelemetry[];
  readonly chatMessages: PreviewChatMessage[];
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
  const [retriedTasks, setRetriedTasks] = useState<
    Map<string, ExecutionTaskRouteTask>
  >(() => new Map());
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
        await killExecutionTask(projectId, taskId);
      } catch (err) {
        console.warn("execution_task_kill_failed", err);
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
        const task = await retryExecutionTaskRequest(projectId, taskId);
        setRetriedTasks((current) => new Map(current).set(row.id, task));
      } catch (err) {
        console.warn("execution_task_retry_failed", err);
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
        const task = await approveExecutionTaskRequest(projectId, taskId);
        setRetriedTasks((current) => new Map(current).set(row.id, task));
      } catch (err) {
        console.warn("execution_task_approval_failed", err);
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

  return (
    <aside className="execution-console-panel" aria-label="Execution Console">
      <ExecutionConsoleHeader
        projectName={selectedProject?.name ?? "Sem projeto"}
        runLabel={runLabel}
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
        <ExecutionFilesSection files={latestFiles} />
        <ExecutionTerminalSection
          rows={canonicalTerminalRows}
          commandCount={canonicalTerminalRows.length}
          followedTasks={followedTasks}
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
    throw new Error(`Execution task kill failed: ${taskId}`);
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
    throw new Error(`Execution task retry failed: ${taskId}`);
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
    throw new Error(`Execution task approval failed: ${taskId}`);
  }
  return response.json() as Promise<ExecutionTaskRouteTask>;
}
