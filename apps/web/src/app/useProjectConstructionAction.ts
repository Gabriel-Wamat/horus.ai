import { useEffect, useRef, useState } from "react";
import type { Spec, UserStory, WorkspaceFolder } from "@u-build/shared";
import { workflowApi } from "../api/workflowApi.js";
import { emitProjectFilesChanged } from "../features/project-files/utils/projectFilesEvents.js";
import type { ActiveProjectConstruction } from "./activeProjectConstruction.js";

export interface ProjectConstructionNotification {
  kind: "progress" | "success" | "error";
  title: string;
  body: string;
}

export function useProjectConstructionAction({
  selectedWorkspaceFolderId,
  workspaceFolders,
  submittedStories,
  persistedSpecsByStoryId,
  setWorkspaceFolderError,
  onConstructionStarted,
}: {
  selectedWorkspaceFolderId: string;
  workspaceFolders: WorkspaceFolder[];
  submittedStories: UserStory[];
  persistedSpecsByStoryId: Record<string, Spec>;
  setWorkspaceFolderError: (error: string | null) => void;
  onConstructionStarted?: (construction: ActiveProjectConstruction) => void;
}): {
  projectConstructionNotification: ProjectConstructionNotification | null;
  startProjectConstruction: () => Promise<void>;
  dismissProjectConstructionNotification: () => void;
} {
  const [projectConstructionNotification, setProjectConstructionNotification] =
    useState<ProjectConstructionNotification | null>(null);
  const statusPollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => stopStatusPolling(statusPollRef.current);
  }, []);

  const startProjectConstruction = async (): Promise<void> => {
    if (!selectedWorkspaceFolderId || submittedStories.length === 0) return;
    const specIds = submittedStories
      .map((story) => persistedSpecsByStoryId[story.id]?.id)
      .filter((id): id is string => Boolean(id));
    if (specIds.length !== submittedStories.length) {
      setWorkspaceFolderError("Gere todas as specs da pasta antes de iniciar o projeto.");
      setProjectConstructionNotification({
        kind: "error",
        title: "Specs pendentes",
        body: "Gere todas as specs antes de construir.",
      });
      return;
    }

    stopStatusPolling(statusPollRef.current);
    statusPollRef.current = null;
    setProjectConstructionNotification(null);
    try {
      const result = await workflowApi.startProjectConstruction({
        workspaceFolderId: selectedWorkspaceFolderId,
        projectName:
          workspaceFolders.find((folder) => folder.id === selectedWorkspaceFolderId)?.name ??
          "horus-generated-project",
        userStoryIds: submittedStories.map((story) => story.id),
        specIds,
      });
      const activeConstruction: ActiveProjectConstruction = {
        projectWorkspaceId: result.projectWorkspace.id,
        constructionRunId: result.constructionRun.id,
        workflowThreadId: result.constructionRun.workflowRunId,
        frontendProjectId: result.frontendProject?.id ?? null,
        frontendProject: result.frontendProject,
        projectName: result.projectWorkspace.name,
        startedAt: result.constructionRun.startedAt,
      };
      onConstructionStarted?.(activeConstruction);
      emitProjectFilesChanged({
        projectId: result.projectWorkspace.id,
        runId: result.constructionRun.id,
        ...(result.constructionRun.workflowRunId
          ? { workflowThreadId: result.constructionRun.workflowRunId }
          : {}),
        source: "project-construction",
        selectProject: true,
        timestamp: new Date().toISOString(),
      });
      setProjectConstructionNotification({
        kind: "progress",
        title: result.reusedProjectWorkspace
          ? "Construção retomada"
          : "Construção iniciada",
        body: "Os agentes estão preparando o software.",
      });
      if (result.constructionRun.workflowRunId) {
        statusPollRef.current = window.setInterval(() => {
          void workflowApi
            .getStatus(result.constructionRun.workflowRunId!)
            .then((state) => {
              if (!state) return;
              if (state.status === "completed") {
                stopStatusPolling(statusPollRef.current);
                statusPollRef.current = null;
                setProjectConstructionNotification({
                  kind: "success",
                  title: "Software pronto",
                  body: "A entrega foi validada e está pronta para preview.",
                });
              }
              if (state.status === "error" || state.status === "cancelled") {
                stopStatusPolling(statusPollRef.current);
                statusPollRef.current = null;
                setProjectConstructionNotification({
                  kind: "error",
                  title: "Construção interrompida",
                  body: "A entrega não foi validada. Veja o fluxo dos agentes.",
                });
              }
            })
            .catch(() => {
              // Keep the lightweight notification stable while the workflow endpoint catches up.
            });
        }, 2200);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao iniciar construção do projeto.";
      setProjectConstructionNotification({
        kind: "error",
        title: "Construção não iniciada",
        body:
          message.includes("frontend_projects_slug_key") ||
          message.includes("duplicate key value")
            ? "Este projeto já existe. Use o preview atual ou reexecute após atualizar as specs."
            : "Não foi possível iniciar os agentes agora.",
      });
    }
  };

  return {
    projectConstructionNotification,
    startProjectConstruction,
    dismissProjectConstructionNotification: () =>
      setProjectConstructionNotification(null),
  };
}

function stopStatusPolling(intervalId: number | null): void {
  if (intervalId !== null) window.clearInterval(intervalId);
}
