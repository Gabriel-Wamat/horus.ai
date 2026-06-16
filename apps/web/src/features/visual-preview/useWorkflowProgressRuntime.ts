import { useCallback, useEffect, useRef, useState } from "react";
import type { FrontendProject } from "@u-build/shared";
import { emitProjectFilesChanged } from "../project-files/utils/projectFilesEvents.js";
import type { PreviewWorkflowActivity } from "../../components/PreviewConversationPanel.js";
import {
  WORKFLOW_PROGRESS_EVENT_TYPES,
  isTerminalWorkflowEvent,
  listWorkflowProgressEvents,
  parseWorkflowProgressEventPayload,
  selectWorkflowReplayEvents,
  workflowActivityFromEvent,
  type WorkflowProgressEvent,
} from "./workflowProgress.js";

export interface WorkflowProgressRuntime {
  readonly workflowActivity: PreviewWorkflowActivity | null;
  readonly workflowEvents: WorkflowProgressEvent[];
  readonly setWorkflowActivity: (activity: PreviewWorkflowActivity) => void;
  readonly scheduleWorkflowActivityClear: (delayMs: number) => void;
  readonly streamWorkflowProgress: (
    threadId: string,
    options?: { replayCompleted?: boolean }
  ) => void;
  readonly resetWorkflowProgress: () => void;
}

export function useWorkflowProgressRuntime({
  selectedProject,
  onProgressEvent,
}: {
  readonly selectedProject: FrontendProject | null;
  readonly onProgressEvent: () => void;
}): WorkflowProgressRuntime {
  const [workflowActivity, setWorkflowActivityState] =
    useState<PreviewWorkflowActivity | null>(null);
  const workflowProgressSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const workflowProgressEventIdsRef = useRef<Set<string>>(new Set());
  const workflowConsoleEventIdsRef = useRef<Set<string>>(new Set());
  const workflowProgressThreadsRef = useRef<Set<string>>(new Set());
  const workflowActivityTimerRef = useRef<number | null>(null);
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowProgressEvent[]>([]);

  const setWorkflowActivity = useCallback(
    (activity: PreviewWorkflowActivity): void => {
      setWorkflowActivityState(activity);
    },
    []
  );

  const scheduleWorkflowActivityClear = useCallback((delayMs: number): void => {
    if (workflowActivityTimerRef.current) {
      window.clearTimeout(workflowActivityTimerRef.current);
    }
    workflowActivityTimerRef.current = window.setTimeout(() => {
      setWorkflowActivityState(null);
      workflowActivityTimerRef.current = null;
    }, delayMs);
  }, []);

  const resetWorkflowProgress = useCallback((): void => {
    workflowProgressSourcesRef.current.forEach((source) => source.close());
    workflowProgressSourcesRef.current.clear();
    workflowProgressEventIdsRef.current.clear();
    workflowConsoleEventIdsRef.current.clear();
    workflowProgressThreadsRef.current.clear();
    if (workflowActivityTimerRef.current) {
      window.clearTimeout(workflowActivityTimerRef.current);
      workflowActivityTimerRef.current = null;
    }
    setWorkflowActivityState(null);
    setWorkflowEvents([]);
  }, []);

  const appendWorkflowConsoleEvents = useCallback(
    (events: WorkflowProgressEvent[]): void => {
      const freshEvents = events.filter((event) => {
        if (workflowConsoleEventIdsRef.current.has(event.id)) return false;
        workflowConsoleEventIdsRef.current.add(event.id);
        return true;
      });
      if (freshEvents.length === 0) return;
      setWorkflowEvents((current) =>
        [...current, ...freshEvents].sort(
          (left, right) =>
            left.sequence - right.sequence ||
            (left.timestamp ?? "").localeCompare(right.timestamp ?? "")
        )
      );
    },
    []
  );

  const notifyProjectFilesChanged = useCallback(
    (event: WorkflowProgressEvent): void => {
      if (!selectedProject) return;
      if (
        event.type !== "patch_applied" &&
        !(event.type === "tool_call_finished" && event.status === "succeeded")
      ) {
        return;
      }
      if (!event.filePaths?.length) return;
      const projectFileBrowserId =
        selectedProject.projectWorkspaceId ?? selectedProject.id;
      emitProjectFilesChanged({
        projectId: projectFileBrowserId,
        paths: event.filePaths ?? [],
        workflowThreadId: event.threadId,
        source: "preview-workflow",
        timestamp: event.timestamp ?? new Date().toISOString(),
      });
    },
    [selectedProject]
  );

  const updateWorkflowActivity = useCallback(
    (event: WorkflowProgressEvent): void => {
      notifyProjectFilesChanged(event);
      const activity = workflowActivityFromEvent(event);
      if (!activity) return;
      setWorkflowActivityState(activity);
      if (!activity.active) {
        scheduleWorkflowActivityClear(4200);
        return;
      }
      if (event.type === "patch_applied") {
        scheduleWorkflowActivityClear(2600);
        return;
      }
      if (workflowActivityTimerRef.current) {
        window.clearTimeout(workflowActivityTimerRef.current);
        workflowActivityTimerRef.current = null;
      }
    },
    [notifyProjectFilesChanged, scheduleWorkflowActivityClear]
  );

  const appendWorkflowProgressEvent = useCallback(
    (event: WorkflowProgressEvent): void => {
      if (workflowProgressEventIdsRef.current.has(event.id)) return;
      workflowProgressEventIdsRef.current.add(event.id);
      appendWorkflowConsoleEvents([event]);
      updateWorkflowActivity(event);
      onProgressEvent();
    },
    [appendWorkflowConsoleEvents, onProgressEvent, updateWorkflowActivity]
  );

  const streamWorkflowProgress = useCallback(
    (threadId: string, options: { replayCompleted?: boolean } = {}): void => {
      if (workflowProgressThreadsRef.current.has(threadId)) return;
      workflowProgressThreadsRef.current.add(threadId);

      void listWorkflowProgressEvents(threadId)
        .then((events) => {
          appendWorkflowConsoleEvents(events);
          const terminal = events.some(isTerminalWorkflowEvent);
          if (terminal && !options.replayCompleted) return;
          selectWorkflowReplayEvents(events).forEach(appendWorkflowProgressEvent);
          if (terminal) return;

          const since = events.reduce(
            (max, event) => Math.max(max, event.sequence),
            0
          );
          const source = new EventSource(
            `/api/agent-runs/${threadId}/events/stream?since_sequence=${since}`
          );
          const handleEvent = (event: MessageEvent<string>): void => {
            const parsed = parseWorkflowProgressEventPayload(event.data);
            if (parsed.kind === "event") {
              appendWorkflowProgressEvent(parsed.event);
              return;
            }
            if (parsed.kind === "error") {
              setWorkflowActivityState({
                phase: "failed",
                label: "Evento inválido",
                detail: parsed.message,
                active: false,
                updatedAt: new Date().toISOString(),
              });
            }
          };
          source.onerror = () => {
            setWorkflowActivityState({
              phase: "failed",
              label: "SSE offline",
              detail:
                "O stream de progresso caiu; o histórico persistido será usado ao recarregar.",
              active: false,
              updatedAt: new Date().toISOString(),
            });
            workflowProgressThreadsRef.current.delete(threadId);
            source.close();
          };
          WORKFLOW_PROGRESS_EVENT_TYPES.forEach((type) => {
            source.addEventListener(type, handleEvent as EventListener);
          });
          workflowProgressSourcesRef.current.set(threadId, source);
        })
        .catch((err) => {
          setWorkflowActivityState({
            phase: "failed",
            label: "Histórico indisponível",
            detail:
              err instanceof Error
                ? err.message
                : "Não foi possível carregar o histórico persistido do workflow.",
            active: false,
            updatedAt: new Date().toISOString(),
          });
          workflowProgressThreadsRef.current.delete(threadId);
        });
    },
    [appendWorkflowConsoleEvents, appendWorkflowProgressEvent]
  );

  useEffect(() => resetWorkflowProgress, [resetWorkflowProgress]);

  return {
    workflowActivity,
    workflowEvents,
    setWorkflowActivity,
    scheduleWorkflowActivityClear,
    streamWorkflowProgress,
    resetWorkflowProgress,
  };
}
