import { useEffect, useMemo, useState } from "react";
import type { FrontendProject } from "@u-build/shared";
import { workflowApi } from "../../api/workflowApi.js";
import { findProjectWorkspaceFolder } from "./projectSelection.js";

export interface ProjectChatScopeState {
  readonly chatWorkspaceFolderId: string | null;
  readonly chatUserStoryId: string | null;
  readonly isLoadingProjectChatScope: boolean;
}

export function useProjectChatScope({
  selectedProject,
  workspaceFolderId,
  userStoryId,
  onError,
}: {
  readonly selectedProject: FrontendProject | null;
  readonly workspaceFolderId: string | undefined;
  readonly userStoryId: string | null;
  readonly onError: (message: string) => void;
}): ProjectChatScopeState {
  const [projectChatWorkspaceFolderId, setProjectChatWorkspaceFolderId] =
    useState<string | null>(null);
  const [projectChatStoryId, setProjectChatStoryId] = useState<string | null>(null);
  const [isLoadingProjectChatScope, setIsLoadingProjectChatScope] = useState(false);
  const projectWorkspaceFolderId = selectedProject?.projectWorkspaceId ?? null;

  useEffect(() => {
    let cancelled = false;
    setProjectChatWorkspaceFolderId(null);
    setProjectChatStoryId(null);

    if (!selectedProject) {
      setIsLoadingProjectChatScope(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingProjectChatScope(true);
    void (async () => {
      const candidateIds = new Set<string>();

      const folders = await workflowApi.listWorkspaceFolders();
      const matchingFolder = findProjectWorkspaceFolder(folders, selectedProject);
      const listedFolderIds = new Set(folders.map((folder) => folder.id));
      if (projectWorkspaceFolderId && listedFolderIds.has(projectWorkspaceFolderId)) {
        candidateIds.add(projectWorkspaceFolderId);
      }
      if (matchingFolder) candidateIds.add(matchingFolder.id);
      if (workspaceFolderId && listedFolderIds.has(workspaceFolderId)) {
        candidateIds.add(workspaceFolderId);
      }

      for (const folderId of candidateIds) {
        const artifacts = await workflowApi
          .listWorkspaceStoryArtifacts(folderId)
          .catch(() => null);
        const firstStory = artifacts?.userStories[0];
        if (!firstStory) continue;
        return {
          folderId,
          userStoryId: firstStory.id,
        };
      }

      return {
        folderId: matchingFolder?.id ?? projectWorkspaceFolderId ?? null,
        userStoryId: null,
      };
    })()
      .then((scope) => {
        if (cancelled) return;
        setProjectChatWorkspaceFolderId(scope.folderId);
        setProjectChatStoryId(scope.userStoryId);
      })
      .catch((err) => {
        if (!cancelled) {
          onError(
            err instanceof Error
              ? err.message
              : "Falha ao carregar o contexto do projeto selecionado."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProjectChatScope(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onError, projectWorkspaceFolderId, selectedProject, workspaceFolderId]);

  return useMemo(() => {
    const projectOwnsCurrentWorkspace =
      Boolean(projectChatWorkspaceFolderId) &&
      projectChatWorkspaceFolderId === workspaceFolderId;
    const chatWorkspaceFolderId = selectedProject
      ? projectChatWorkspaceFolderId
      : workspaceFolderId ?? null;
    const chatUserStoryId = selectedProject
      ? projectOwnsCurrentWorkspace
        ? userStoryId ?? projectChatStoryId
        : projectChatStoryId
      : userStoryId;

    return {
      chatWorkspaceFolderId,
      chatUserStoryId,
      isLoadingProjectChatScope,
    };
  }, [
    isLoadingProjectChatScope,
    projectChatStoryId,
    projectChatWorkspaceFolderId,
    selectedProject,
    userStoryId,
    workspaceFolderId,
  ]);
}
