import { useState } from "react";
import type { Spec, UserStory, WorkspaceFolder } from "@u-build/shared";
import { workflowApi } from "../api/workflowApi.js";

export function useProjectConstructionAction({
  selectedWorkspaceFolderId,
  workspaceFolders,
  submittedStories,
  persistedSpecsByStoryId,
  setWorkspaceFolderError,
}: {
  selectedWorkspaceFolderId: string;
  workspaceFolders: WorkspaceFolder[];
  submittedStories: UserStory[];
  persistedSpecsByStoryId: Record<string, Spec>;
  setWorkspaceFolderError: (error: string | null) => void;
}): {
  projectConstructionNotice: string | null;
  projectConstructionError: string | null;
  startProjectConstruction: () => Promise<void>;
} {
  const [projectConstructionNotice, setProjectConstructionNotice] = useState<string | null>(null);
  const [projectConstructionError, setProjectConstructionError] = useState<string | null>(null);

  const startProjectConstruction = async (): Promise<void> => {
    if (!selectedWorkspaceFolderId || submittedStories.length === 0) return;
    const specIds = submittedStories
      .map((story) => persistedSpecsByStoryId[story.id]?.id)
      .filter((id): id is string => Boolean(id));
    if (specIds.length !== submittedStories.length) {
      setWorkspaceFolderError("Gere todas as specs da pasta antes de iniciar o projeto.");
      setProjectConstructionError("Gere todas as specs da pasta antes de iniciar o projeto.");
      return;
    }

    setProjectConstructionError(null);
    setProjectConstructionNotice(null);
    try {
      const result = await workflowApi.startProjectConstruction({
        workspaceFolderId: selectedWorkspaceFolderId,
        projectName:
          workspaceFolders.find((folder) => folder.id === selectedWorkspaceFolderId)?.name ??
          "horus-generated-project",
        userStoryIds: submittedStories.map((story) => story.id),
        specIds,
      });
      setProjectConstructionNotice(
        result.reusedProjectWorkspace
          ? `Projeto já havia sido iniciado. Reexecutei a construção em ${result.projectWorkspace.rootPath}. Status: ${result.constructionRun.status}.`
          : `Projeto iniciado em ${result.projectWorkspace.rootPath}. Status: ${result.constructionRun.status}.`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao iniciar construção do projeto.";
      setProjectConstructionError(
        message.includes("frontend_projects_slug_key") ||
          message.includes("duplicate key value")
          ? "Este projeto já foi iniciado para esta pasta. Use o preview existente ou reexecute a construção após atualizar as specs."
          : message
      );
    }
  };

  return {
    projectConstructionNotice,
    projectConstructionError,
    startProjectConstruction,
  };
}
