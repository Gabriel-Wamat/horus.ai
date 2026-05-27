import { useEffect, useState } from "react";

export function useFolderExpansionState({
  selectedWorkspaceFolderId,
  hasLoadedFolder,
  onLoadFolder,
}: {
  selectedWorkspaceFolderId: string;
  hasLoadedFolder: (folderId: string) => boolean;
  onLoadFolder?: ((folderId: string) => void) | undefined;
}): {
  expandedFolderIds: string[];
  isFolderExpanded: (folderId: string) => boolean;
  toggleFolder: (folderId: string) => void;
  selectFolder: (folderId: string, onSelectFolder: (folderId: string) => void) => void;
} {
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>(
    selectedWorkspaceFolderId ? [selectedWorkspaceFolderId] : []
  );

  useEffect(() => {
    if (!selectedWorkspaceFolderId) {
      setExpandedFolderIds([]);
      return;
    }

    setExpandedFolderIds((current) =>
      current.includes(selectedWorkspaceFolderId)
        ? current
        : [...current, selectedWorkspaceFolderId]
    );
  }, [selectedWorkspaceFolderId]);

  const ensureLoaded = (folderId: string): void => {
    if (!hasLoadedFolder(folderId)) {
      onLoadFolder?.(folderId);
    }
  };

  const toggleFolder = (folderId: string): void => {
    const willExpand = !expandedFolderIds.includes(folderId);
    setExpandedFolderIds((current) =>
      current.includes(folderId)
        ? current.filter((item) => item !== folderId)
        : [...current, folderId]
    );

    if (willExpand) ensureLoaded(folderId);
  };

  const selectFolder = (
    folderId: string,
    onSelectFolder: (folderId: string) => void
  ): void => {
    setExpandedFolderIds((current) =>
      current.includes(folderId) ? current : [...current, folderId]
    );
    ensureLoaded(folderId);
    onSelectFolder(folderId);
  };

  return {
    expandedFolderIds,
    isFolderExpanded: (folderId) => expandedFolderIds.includes(folderId),
    toggleFolder,
    selectFolder,
  };
}
