import { useCallback, useEffect, useMemo, useState } from "react";

export interface OpenProjectFileTab {
  readonly path: string;
  readonly name: string;
  readonly language?: string | undefined;
}

export interface ProjectFilesState {
  readonly selectedProjectId: string;
  readonly search: string;
  readonly openTabs: OpenProjectFileTab[];
  readonly activePath: string | null;
  readonly setSelectedProjectId: (projectId: string) => void;
  readonly setSearch: (search: string) => void;
  readonly openFile: (tab: OpenProjectFileTab) => void;
  readonly closeFile: (path: string) => void;
  readonly setActivePath: (path: string) => void;
}

export function useProjectFilesState(projectIds: readonly string[]): ProjectFilesState {
  const [selectedProjectId, setSelectedProjectIdState] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("projectId") ?? "";
  });
  const [search, setSearch] = useState("");
  const [openTabs, setOpenTabs] = useState<OpenProjectFileTab[]>([]);
  const [activePath, setActivePathState] = useState<string | null>(() => {
    const file = new URLSearchParams(window.location.search).get("file");
    return file || null;
  });

  useEffect(() => {
    if (!projectIds.length) {
      setSelectedProjectIdState("");
      return;
    }
    setSelectedProjectIdState((current) =>
      current && projectIds.includes(current) ? current : projectIds[0] ?? ""
    );
  }, [projectIds]);

  useEffect(() => {
    if (!activePath) return;
    setOpenTabs((current) =>
      current.some((tab) => tab.path === activePath)
        ? current
        : [...current, { path: activePath, name: activePath.split("/").at(-1) ?? activePath }]
    );
  }, [activePath]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "files");
    if (selectedProjectId) url.searchParams.set("projectId", selectedProjectId);
    else url.searchParams.delete("projectId");
    url.searchParams.delete("view");
    if (activePath) url.searchParams.set("file", activePath);
    else url.searchParams.delete("file");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [activePath, selectedProjectId]);

  const setSelectedProjectId = useCallback((projectId: string): void => {
    setSelectedProjectIdState(projectId);
    setSearch("");
    setOpenTabs([]);
    setActivePathState(null);
  }, []);

  const openFile = useCallback((tab: OpenProjectFileTab): void => {
    setOpenTabs((current) =>
      current.some((item) => item.path === tab.path) ? current : [...current, tab]
    );
    setActivePathState(tab.path);
  }, []);

  const closeFile = useCallback((path: string): void => {
    setOpenTabs((current) => {
      const index = current.findIndex((tab) => tab.path === path);
      const next = current.filter((tab) => tab.path !== path);
      setActivePathState((active) => {
        if (active !== path) return active;
        return next[Math.max(0, index - 1)]?.path ?? next[0]?.path ?? null;
      });
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      selectedProjectId,
      search,
      openTabs,
      activePath,
      setSelectedProjectId,
      setSearch,
      openFile,
      closeFile,
      setActivePath: setActivePathState,
    }),
    [
      activePath,
      closeFile,
      openFile,
      openTabs,
      search,
      selectedProjectId,
      setSelectedProjectId,
    ]
  );
}
