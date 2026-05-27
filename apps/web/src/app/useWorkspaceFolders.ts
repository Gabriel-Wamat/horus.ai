import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Spec, UserStory, WorkspaceFolder } from "@u-build/shared";
import { workflowApi, type WorkspaceStoryArtifactsResponse } from "../api/workflowApi.js";

export type StorySpecTab = "story" | "spec";
export type WorkspaceFolderArtifacts = WorkspaceStoryArtifactsResponse;

export function useWorkspaceFolders(): {
  workspaceFolders: WorkspaceFolder[];
  selectedWorkspaceFolderId: string;
  setSelectedWorkspaceFolderId: (folderId: string) => void;
  isLoadingWorkspaceFolders: boolean;
  workspaceFolderError: string | null;
  setWorkspaceFolderError: (error: string | null) => void;
  persistedStories: UserStory[];
  setPersistedStories: Dispatch<SetStateAction<UserStory[]>>;
  persistedSpecsByStoryId: Record<string, Spec>;
  setPersistedSpecsByStoryId: Dispatch<SetStateAction<Record<string, Spec>>>;
  workspaceFolderArtifactsById: Record<string, WorkspaceFolderArtifacts>;
  setWorkspaceFolderArtifactsById: Dispatch<
    SetStateAction<Record<string, WorkspaceFolderArtifacts>>
  >;
  loadingWorkspaceFolderIds: string[];
  isLoadingWorkspaceStories: boolean;
  selectedStoryId: string | null;
  setSelectedStoryId: (storyId: string | null) => void;
  storySpecTab: StorySpecTab;
  setStorySpecTab: (tab: StorySpecTab) => void;
  lastSubmittedStories: UserStory[];
  setLastSubmittedStories: Dispatch<SetStateAction<UserStory[]>>;
  loadWorkspaceFolders: () => Promise<void>;
  loadWorkspaceStoryArtifactsForFolder: (
    folderId: string,
    options?: { applySelection?: boolean; force?: boolean }
  ) => Promise<void>;
  handleCreateWorkspaceFolder: (name: string) => Promise<void>;
  handleUpdateWorkspaceStory: (
    story: UserStory,
    submittedStories: UserStory[]
  ) => Promise<void>;
  handleDeleteWorkspaceStory: (
    storyId: string,
    submittedStories: UserStory[]
  ) => Promise<void>;
  handleUpdateWorkspaceSpec: (storyId: string, spec: Spec) => Promise<Spec | null>;
} {
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([]);
  const [selectedWorkspaceFolderId, setSelectedWorkspaceFolderId] = useState("");
  const [isLoadingWorkspaceFolders, setIsLoadingWorkspaceFolders] = useState(false);
  const [workspaceFolderError, setWorkspaceFolderError] = useState<string | null>(null);
  const [persistedStories, setPersistedStories] = useState<UserStory[]>([]);
  const [persistedSpecsByStoryId, setPersistedSpecsByStoryId] = useState<Record<string, Spec>>({});
  const [workspaceFolderArtifactsById, setWorkspaceFolderArtifactsById] = useState<
    Record<string, WorkspaceFolderArtifacts>
  >({});
  const [loadingWorkspaceFolderIds, setLoadingWorkspaceFolderIds] = useState<string[]>([]);
  const [isLoadingWorkspaceStories, setIsLoadingWorkspaceStories] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [storySpecTab, setStorySpecTab] = useState<StorySpecTab>("story");
  const [lastSubmittedStories, setLastSubmittedStories] = useState<UserStory[]>([]);

  const loadWorkspaceFolders = async (): Promise<void> => {
    setIsLoadingWorkspaceFolders(true);
    setWorkspaceFolderError(null);
    await workflowApi
      .listWorkspaceFolders()
      .then((folders) => {
        setWorkspaceFolders(folders);
        setSelectedWorkspaceFolderId((current) => {
          if (current && folders.some((folder) => folder.id === current)) return current;
          const sorted = [...folders].sort((a, b) => b.storyCount - a.storyCount);
          return sorted[0]?.id ?? "";
        });
      })
      .catch((error) => {
        setWorkspaceFolderError(
          error instanceof Error ? error.message : "Falha ao carregar pastas."
        );
      })
      .finally(() => setIsLoadingWorkspaceFolders(false));
  };

  const loadWorkspaceStoryArtifactsForFolder = async (
    folderId: string,
    options: { applySelection?: boolean; force?: boolean } = {}
  ): Promise<void> => {
    if (!folderId) return;
    if (!options.force && workspaceFolderArtifactsById[folderId]) {
      if (options.applySelection) {
        const cached = workspaceFolderArtifactsById[folderId];
        setPersistedStories(cached.userStories);
        setPersistedSpecsByStoryId(cached.specsByStoryId);
        setLastSubmittedStories([]);
        setSelectedStoryId((current) => {
          if (current && cached.userStories.some((story) => story.id === current)) {
            return current;
          }
          return cached.userStories[0]?.id ?? null;
        });
      }
      return;
    }

    setLoadingWorkspaceFolderIds((current) =>
      current.includes(folderId) ? current : [...current, folderId]
    );
    if (options.applySelection) setIsLoadingWorkspaceStories(true);
    setWorkspaceFolderError(null);

    try {
      const artifacts = await workflowApi.listWorkspaceStoryArtifacts(folderId);
      setWorkspaceFolderArtifactsById((current) => ({ ...current, [folderId]: artifacts }));
      if (options.applySelection) {
        setPersistedStories(artifacts.userStories);
        setPersistedSpecsByStoryId(artifacts.specsByStoryId);
        setLastSubmittedStories([]);
        setSelectedStoryId((current) => {
          if (current && artifacts.userStories.some((story) => story.id === current)) {
            return current;
          }
          return artifacts.userStories[0]?.id ?? null;
        });
      }
    } catch (error) {
      setWorkspaceFolderError(
        error instanceof Error ? error.message : "Falha ao carregar user stories."
      );
    } finally {
      setLoadingWorkspaceFolderIds((current) => current.filter((id) => id !== folderId));
      if (options.applySelection) setIsLoadingWorkspaceStories(false);
    }
  };

  useEffect(() => {
    void loadWorkspaceFolders();
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceFolderId) {
      setPersistedStories([]);
      setPersistedSpecsByStoryId({});
      setIsLoadingWorkspaceStories(false);
      return;
    }

    void loadWorkspaceStoryArtifactsForFolder(selectedWorkspaceFolderId, {
      applySelection: true,
    });
  }, [selectedWorkspaceFolderId]);

  const handleCreateWorkspaceFolder = async (name: string): Promise<void> => {
    const folder = await workflowApi.createWorkspaceFolder(name);
    setWorkspaceFolders((current) => [...current, folder]);
    setWorkspaceFolderArtifactsById((current) => ({
      ...current,
      [folder.id]: { userStories: [], specsByStoryId: {} },
    }));
    setSelectedWorkspaceFolderId(folder.id);
    setWorkspaceFolderError(null);
  };

  const handleUpdateWorkspaceStory = async (
    story: UserStory,
    submittedStories: UserStory[]
  ): Promise<void> => {
    if (!selectedWorkspaceFolderId) return;
    const updated = await workflowApi.updateWorkspaceUserStory(selectedWorkspaceFolderId, story);
    setPersistedStories((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    );
    setWorkspaceFolderArtifactsById((current) => {
      const artifacts = current[selectedWorkspaceFolderId];
      if (!artifacts) return current;
      return {
        ...current,
        [selectedWorkspaceFolderId]: {
          ...artifacts,
          userStories: artifacts.userStories.map((item) =>
            item.id === updated.id ? updated : item
          ),
        },
      };
    });
    setLastSubmittedStories((current) =>
      current.length > 0
        ? current.map((item) => (item.id === updated.id ? updated : item))
        : submittedStories.map((item) => (item.id === updated.id ? updated : item))
    );
  };

  const handleDeleteWorkspaceStory = async (
    storyId: string,
    submittedStories: UserStory[]
  ): Promise<void> => {
    if (!selectedWorkspaceFolderId) return;
    await workflowApi.deleteWorkspaceUserStory(selectedWorkspaceFolderId, storyId);
    const nextStories = submittedStories.filter((story) => story.id !== storyId);
    setPersistedStories((current) => current.filter((story) => story.id !== storyId));
    setPersistedSpecsByStoryId((current) => {
      const next = { ...current };
      delete next[storyId];
      return next;
    });
    setWorkspaceFolderArtifactsById((current) => {
      const artifacts = current[selectedWorkspaceFolderId];
      if (!artifacts) return current;
      const nextSpecs = { ...artifacts.specsByStoryId };
      delete nextSpecs[storyId];
      return {
        ...current,
        [selectedWorkspaceFolderId]: {
          userStories: artifacts.userStories.filter((story) => story.id !== storyId),
          specsByStoryId: nextSpecs,
        },
      };
    });
    setLastSubmittedStories((current) => current.filter((story) => story.id !== storyId));
    setSelectedStoryId(nextStories[0]?.id ?? null);
    void loadWorkspaceFolders();
  };

  const handleUpdateWorkspaceSpec = async (
    storyId: string,
    spec: Spec
  ): Promise<Spec | null> => {
    if (!selectedWorkspaceFolderId) return null;
    const updated = await workflowApi.updateWorkspaceSpec(
      selectedWorkspaceFolderId,
      storyId,
      spec
    );
    setPersistedSpecsByStoryId((current) => ({ ...current, [storyId]: updated }));
    setWorkspaceFolderArtifactsById((current) => {
      const artifacts = current[selectedWorkspaceFolderId];
      if (!artifacts) return current;
      return {
        ...current,
        [selectedWorkspaceFolderId]: {
          ...artifacts,
          specsByStoryId: { ...artifacts.specsByStoryId, [storyId]: updated },
        },
      };
    });
    return updated;
  };

  return {
    workspaceFolders,
    selectedWorkspaceFolderId,
    setSelectedWorkspaceFolderId,
    isLoadingWorkspaceFolders,
    workspaceFolderError,
    setWorkspaceFolderError,
    persistedStories,
    setPersistedStories,
    persistedSpecsByStoryId,
    setPersistedSpecsByStoryId,
    workspaceFolderArtifactsById,
    setWorkspaceFolderArtifactsById,
    loadingWorkspaceFolderIds,
    isLoadingWorkspaceStories,
    selectedStoryId,
    setSelectedStoryId,
    storySpecTab,
    setStorySpecTab,
    lastSubmittedStories,
    setLastSubmittedStories,
    loadWorkspaceFolders,
    loadWorkspaceStoryArtifactsForFolder,
    handleCreateWorkspaceFolder,
    handleUpdateWorkspaceStory,
    handleDeleteWorkspaceStory,
    handleUpdateWorkspaceSpec,
  };
}
