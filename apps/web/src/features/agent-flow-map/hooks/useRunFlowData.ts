import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WorkflowEvent, WorkflowState } from "@u-build/shared";
import type { HorusRunLocator, HorusRunSnapshot } from "../types/api.types.js";
import { agentFlowApi } from "../utils/agentFlowApi.js";
import { deriveHorusRunSnapshot } from "../utils/deriveHorusRunSnapshot.js";

interface UseRunFlowDataOptions {
  workflowState: WorkflowState | null;
  events: WorkflowEvent[];
}

const WORKING_STATUSES = new Set(["running", "awaiting_human"]);
const RUN_LIST_LIMIT = 12;

export function useRunFlowData({ workflowState, events }: UseRunFlowDataOptions) {
  const localRun = useMemo(
    () => deriveHorusRunSnapshot(workflowState, events),
    [events, workflowState]
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(localRun?.threadId ?? null);
  const selectedProjectId = useMemo(() => readSelectedProjectId(), []);

  const runsQuery = useQuery({
    queryKey: ["agent-flow-runs", selectedProjectId, RUN_LIST_LIMIT],
    queryFn: () =>
      agentFlowApi.listRunsWithProjectFallback({
        projectId: selectedProjectId,
        limit: RUN_LIST_LIMIT,
      }),
    refetchInterval: 6000,
  });

  useEffect(() => {
    if (activeRunId) return;
    setActiveRunId(localRun?.threadId ?? runsQuery.data?.[0]?.threadId ?? null);
  }, [activeRunId, localRun?.threadId, runsQuery.data]);

  const runQuery = useQuery({
    queryKey: ["agent-flow-run", activeRunId],
    queryFn: () => agentFlowApi.getRun(activeRunId!),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const status = (query.state.data as HorusRunSnapshot | undefined)?.status;
      return status && WORKING_STATUSES.has(status) ? 2500 : 8000;
    },
  });

  const backendRun = runQuery.data ?? null;
  const run = backendRun ?? (localRun?.threadId === activeRunId || !activeRunId ? localRun : null);
  const runOptions = useMemo(() => {
    const seen = new Set<string>();
    const options = [...(runsQuery.data ?? [])];
    if (localRun && !seen.has(localRun.threadId)) {
      options.unshift({
        threadId: localRun.threadId,
        workspaceFolderId: localRun.workspaceFolderId,
        frontendProjectId: localRun.sourceState.frontendProjectId,
        workflowMode: localRun.workflowMode,
        status: localRun.status,
        title: localRun.currentUserStoryTitle ?? localRun.threadId,
        startedAt: localRun.startedAt,
        completedAt: localRun.completedAt,
        currentNode: localRun.currentNode,
      });
    }
    const uniqueOptions = options.filter((option) => {
      if (seen.has(option.threadId)) return false;
      seen.add(option.threadId);
      return true;
    });
    if (!selectedProjectId) return uniqueOptions;
    const projectOptions = uniqueOptions.filter((option) =>
      runBelongsToSelectedProject(option, selectedProjectId)
    );
    return projectOptions.length > 0 ? projectOptions : uniqueOptions;
  }, [localRun, runsQuery.data, selectedProjectId]);

  useEffect(() => {
    if (!activeRunId || runOptions.length === 0) return;
    if (runOptions.some((option) => option.threadId === activeRunId)) return;
    setActiveRunId(runOptions[0]?.threadId ?? null);
  }, [activeRunId, runOptions]);

  return {
    activeRunId,
    setActiveRunId,
    run,
    runOptions,
    isLoading: runsQuery.isLoading || runQuery.isLoading,
    error: runsQuery.error ?? runQuery.error,
  };
}

function readSelectedProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("projectId");
}

function runBelongsToSelectedProject(
  run: HorusRunLocator,
  projectId: string
): boolean {
  return run.frontendProjectId === projectId || run.workspaceFolderId === projectId;
}
