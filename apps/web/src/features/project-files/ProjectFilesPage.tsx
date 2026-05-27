import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  ProjectFileBrowserProject,
  ProjectFileContentResponse,
  ProjectFileEntry,
  SaveProjectFileRequest,
} from "@u-build/shared";
import { projectFilesApi } from "../../api/projectFilesApi.js";
import { CodeViewer } from "./components/CodeViewer.js";
import { FileTabs } from "./components/FileTabs.js";
import { FileTree } from "./components/FileTree.js";
import { ProjectFilesToolbar } from "./components/ProjectFilesToolbar.js";
import { useProjectFilesState } from "./hooks/useProjectFilesState.js";
import {
  PROJECT_FILES_CHANGED_EVENT,
  isProjectFilesChangedEvent,
} from "./utils/projectFilesEvents.js";
import "./styles/project-files.css";

const projectFilesQueryClient = new QueryClient();

function getProjectRunId(project?: ProjectFileBrowserProject): string | null {
  return project?.latestRunId ?? null;
}

function fileQueryKey(
  projectId: string,
  runId: string | null,
  path: string | null
): readonly [string, string, string, string | null, string | null] {
  return ["project-files", "file", projectId, runId, path];
}

function ProjectFilesPageContent(): JSX.Element {
  const queryClient = useQueryClient();
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(() => new Set());
  const projectsQuery = useQuery({
    queryKey: ["project-files", "projects"],
    queryFn: () => projectFilesApi.listProjects(),
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const projects = projectsQuery.data?.projects ?? [];
  const state = useProjectFilesState(projects.map((project) => project.id));
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === state.selectedProjectId),
    [projects, state.selectedProjectId]
  );
  const runId = getProjectRunId(selectedProject);

  const treeQuery = useQuery({
    queryKey: ["project-files", "tree", state.selectedProjectId, runId],
    queryFn: () =>
      projectFilesApi.getTree(state.selectedProjectId, {
        runId,
        limit: 8_000,
        depth: 24,
      }),
    enabled: Boolean(state.selectedProjectId),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const fileQuery = useQuery({
    queryKey: fileQueryKey(state.selectedProjectId, runId, state.activePath),
    queryFn: () =>
      projectFilesApi.getFile(state.selectedProjectId, {
        path: state.activePath ?? "",
        runId,
        maxBytes: 1_000_000,
      }),
    enabled: Boolean(state.selectedProjectId && state.activePath),
    staleTime: 0,
    gcTime: 10 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const saveFileMutation = useMutation({
    mutationFn: (input: SaveProjectFileRequest) =>
      projectFilesApi.saveFile(state.selectedProjectId, input),
    onSuccess: async (savedFile) => {
      queryClient.setQueryData<ProjectFileContentResponse>(
        fileQueryKey(state.selectedProjectId, runId, savedFile.path),
        {
          projectId: savedFile.projectId,
          runId: savedFile.runId,
          path: savedFile.path,
          content: savedFile.content,
          encoding: savedFile.encoding,
          language: savedFile.language,
          sizeBytes: savedFile.sizeBytes,
          truncated: savedFile.truncated,
          binary: savedFile.binary,
          version: savedFile.version,
          generatedAt: savedFile.savedAt,
        }
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["project-files", "tree", state.selectedProjectId, runId],
        }),
        queryClient.invalidateQueries({
          queryKey: fileQueryKey(state.selectedProjectId, runId, savedFile.path),
        }),
      ]);
    },
  });

  const setPathDirty = useCallback((path: string | null, dirty: boolean): void => {
    if (!path) return;
    setDirtyPaths((current) => {
      const next = new Set(current);
      if (dirty) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const refreshChangedFiles = useCallback(
    async (paths?: readonly string[]): Promise<void> => {
      if (!state.selectedProjectId) return;
      const changedPaths = new Set(paths ?? []);
      const shouldRefreshPath = (path: string | null): path is string =>
        Boolean(path && (changedPaths.size === 0 || changedPaths.has(path)));

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", "projects"] }),
        queryClient.invalidateQueries({
          queryKey: ["project-files", "tree", state.selectedProjectId],
        }),
      ]);

      const pathsToRefresh = new Set(
        state.openTabs
          .map((tab) => tab.path)
          .filter((path) => shouldRefreshPath(path) && !dirtyPaths.has(path))
      );

      if (
        shouldRefreshPath(state.activePath) &&
        state.activePath &&
        !dirtyPaths.has(state.activePath)
      ) {
        pathsToRefresh.add(state.activePath);
      }

      await Promise.all(
        [...pathsToRefresh].map((path) =>
          queryClient.invalidateQueries({
            queryKey: fileQueryKey(state.selectedProjectId, runId, path),
          })
        )
      );
    },
    [
      dirtyPaths,
      queryClient,
      runId,
      state.activePath,
      state.openTabs,
      state.selectedProjectId,
    ]
  );

  useEffect(() => {
    const handleProjectFilesChanged = (event: Event): void => {
      if (!isProjectFilesChangedEvent(event)) return;
      if (event.detail.projectId !== state.selectedProjectId) return;
      void refreshChangedFiles(event.detail.paths);
    };

    window.addEventListener(PROJECT_FILES_CHANGED_EVENT, handleProjectFilesChanged);
    return () => {
      window.removeEventListener(PROJECT_FILES_CHANGED_EVENT, handleProjectFilesChanged);
    };
  }, [refreshChangedFiles, state.selectedProjectId]);

  const confirmDirtyNavigation = useCallback((path: string | null): boolean => {
    if (!path || !dirtyPaths.has(path)) return true;
    return window.confirm("Há alterações não salvas neste arquivo. Deseja trocar mesmo assim?");
  }, [dirtyPaths]);

  const selectProject = useCallback((projectId: string): void => {
    if (dirtyPaths.size > 0 && !window.confirm("Há arquivos com alterações não salvas. Deseja trocar de projeto mesmo assim?")) {
      return;
    }
    setDirtyPaths(new Set());
    state.setSelectedProjectId(projectId);
  }, [dirtyPaths.size, state]);

  const openFile = useCallback(
    (entry: ProjectFileEntry): void => {
      if (entry.path !== state.activePath && !confirmDirtyNavigation(state.activePath)) return;
      const tab = {
        path: entry.path,
        name: entry.path.split("/").at(-1) ?? entry.path,
        ...(entry.language ? { language: entry.language } : {}),
      };
      state.openFile(tab);
    },
    [confirmDirtyNavigation, state]
  );

  const prefetchFile = useCallback(
    (entry: ProjectFileEntry): void => {
      if (!state.selectedProjectId) return;
      void queryClient.prefetchQuery({
        queryKey: fileQueryKey(state.selectedProjectId, runId, entry.path),
        queryFn: () =>
          projectFilesApi.getFile(state.selectedProjectId, {
            path: entry.path,
            runId,
            maxBytes: 1_000_000,
          }),
        staleTime: 120_000,
        gcTime: 10 * 60_000,
      });
    },
    [queryClient, runId, state.selectedProjectId]
  );

  const selectTab = useCallback((path: string): void => {
    if (path !== state.activePath && !confirmDirtyNavigation(state.activePath)) return;
    state.setActivePath(path);
  }, [confirmDirtyNavigation, state]);

  const closeTab = useCallback((path: string): void => {
    if (!confirmDirtyNavigation(path)) return;
    setPathDirty(path, false);
    state.closeFile(path);
  }, [confirmDirtyNavigation, setPathDirty, state]);

  const downloadProject = useCallback((): void => {
    if (!state.selectedProjectId) return;
    if (
      dirtyPaths.size > 0 &&
      !window.confirm(
        "Há arquivos com alterações não salvas. Baixar agora pode gerar um ZIP sem essas mudanças. Deseja continuar?"
      )
    ) {
      return;
    }
    window.location.assign(
      projectFilesApi.getDownloadUrl(state.selectedProjectId, { runId })
    );
  }, [dirtyPaths.size, runId, state.selectedProjectId]);

  const projectError =
    projectsQuery.error instanceof Error ? projectsQuery.error : null;
  const treeError = treeQuery.error instanceof Error ? treeQuery.error : null;
  const fileError = fileQuery.error instanceof Error ? fileQuery.error : null;
  const treeEntries = treeQuery.data?.entries ?? [];

  return (
    <div className="project-files-page">
      <ProjectFilesToolbar
        projects={projects}
        selectedProjectId={state.selectedProjectId}
        selectedProject={selectedProject}
        tree={treeQuery.data}
        search={state.search}
        isRefreshing={
          projectsQuery.isFetching || treeQuery.isFetching
        }
        hasUnsavedFiles={dirtyPaths.size > 0}
        onSelectProject={selectProject}
        onChangeSearch={state.setSearch}
        onRefresh={() => {
          void projectsQuery.refetch();
          void treeQuery.refetch();
          if (state.activePath) void fileQuery.refetch();
        }}
        onDownloadProject={downloadProject}
      />

      {projectError ? (
        <section className="project-files-page-state is-error">
          <h2>Não foi possível carregar projetos</h2>
          <p>{projectError.message}</p>
        </section>
      ) : projectsQuery.isLoading ? (
        <section className="project-files-page-state">
          <span className="project-files-loading-dot" aria-hidden="true" />
          <h2>Carregando projetos</h2>
        </section>
      ) : projects.length === 0 ? (
        <section className="project-files-page-state">
          <h2>Nenhum projeto disponível</h2>
          <p>Inicie a construção de um projeto para navegar pelos arquivos gerados.</p>
        </section>
      ) : (
        <section className="project-files-workbench">
          <aside className="project-files-sidebar-panel">
            <div className="project-files-sidebar-head">
              <strong>Arquivos</strong>
              <span>{treeEntries.length} itens</span>
            </div>
            <FileTree
              entries={treeEntries}
              activePath={state.activePath}
              search={state.search}
              isLoading={treeQuery.isLoading}
              error={treeError}
              onOpenFile={openFile}
              onPreviewFile={prefetchFile}
            />
          </aside>

          <main className="project-files-main-panel">
            <FileTabs
              tabs={state.openTabs}
              activePath={state.activePath}
              dirtyPaths={dirtyPaths}
              onSelect={selectTab}
              onClose={closeTab}
            />
            <CodeViewer
              file={fileQuery.data}
              path={state.activePath}
              isLoading={fileQuery.isLoading}
              error={fileError}
              saveError={saveFileMutation.error instanceof Error ? saveFileMutation.error : null}
              isSaving={saveFileMutation.isPending}
              onDirtyChange={(dirty) => setPathDirty(state.activePath, dirty)}
              onSave={(input) =>
                saveFileMutation.mutateAsync({
                  ...input,
                  runId,
                  expectedEncoding: "utf-8",
                })
              }
            />
          </main>
        </section>
      )}
    </div>
  );
}

export function ProjectFilesPage(): JSX.Element {
  return (
    <QueryClientProvider client={projectFilesQueryClient}>
      <ProjectFilesPageContent />
    </QueryClientProvider>
  );
}
