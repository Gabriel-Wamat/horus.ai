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
  WorkflowState,
  AgentResult,
} from "@u-build/shared";
import { getLatestSuccessfulAgentResult } from "@u-build/shared";
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

interface WorkflowFile {
  path: string;
  content: string;
  storyTitle: string;
}

function extractWorkflowFiles(state: WorkflowState): WorkflowFile[] {
  const files: WorkflowFile[] = [];
  for (const story of state.userStories) {
    const results: AgentResult[] = state.agentResults[story.id] ?? [];
    const frontResult = getLatestSuccessfulAgentResult(results, "front");
    if (frontResult?.status !== "success") continue;
    const changeSet = frontResult.output["codeChangeSet"] as {
      operations: Array<{
        targetPath: string;
        afterContent: string | null;
        changeType: string;
      }>;
    } | null | undefined;
    if (!changeSet?.operations) continue;
    for (const op of changeSet.operations) {
      if (op.changeType !== "delete" && op.afterContent) {
        files.push({
          path: op.targetPath,
          content: op.afterContent,
          storyTitle: story.title,
        });
      }
    }
  }
  return files;
}

function WorkflowFilesViewer({
  files,
  threadId,
}: {
  readonly files: WorkflowFile[];
  readonly threadId?: string;
}): JSX.Element {
  const [activePath, setActivePath] = useState<string>(files[0]?.path ?? "");
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  return (
    <section className="project-files-workbench">
      <aside className="project-files-sidebar-panel">
        <div className="project-files-sidebar-head">
          <strong>Arquivos gerados</strong>
          <span>{files.length}</span>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {files.map((f) => {
            const name = f.path.split("/").pop() ?? f.path;
            const isActive = activePath === f.path;
            return (
              <button
                key={f.path}
                type="button"
                title={f.path}
                onClick={() => setActivePath(f.path)}
                style={{
                  display: "flex",
                  width: "100%",
                  padding: "6px 12px",
                  textAlign: "left",
                  background: isActive
                    ? "var(--project-files-bd-active, rgba(20,199,123,0.12))"
                    : "transparent",
                  border: "none",
                  borderLeft: isActive
                    ? "2px solid var(--project-files-p, #14c77b)"
                    : "2px solid transparent",
                  cursor: "pointer",
                  gap: 8,
                  alignItems: "center",
                  color: isActive
                    ? "var(--project-files-t, #f1f4f2)"
                    : "var(--project-files-t2, #a4adb3)",
                  fontSize: 13,
                }}
              >
                <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {name}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="project-files-main-panel">
        {activeFile ? (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 16px",
                borderBottom: "1px solid var(--project-files-bd, #262c30)",
                background: "var(--project-files-s2, #181d1f)",
                flexShrink: 0,
                minHeight: 36,
              }}
            >
              <code
                style={{
                  fontSize: 11,
                  color: "var(--project-files-t2, #a4adb3)",
                  fontFamily: "monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeFile.path}
              </code>
              {threadId && (
                <a
                  href={`/api/workflow/download/${threadId}`}
                  download
                  style={{
                    marginLeft: "auto",
                    fontSize: 12,
                    color: "var(--project-files-p, #14c77b)",
                    textDecoration: "none",
                    flexShrink: 0,
                  }}
                >
                  Baixar ZIP
                </a>
              )}
            </div>
            <pre
              style={{
                flex: 1,
                overflow: "auto",
                margin: 0,
                padding: "16px",
                fontFamily: "monospace",
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--project-files-t, #f1f4f2)",
                background: "var(--project-files-bg, #0b0e0c)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {activeFile.content}
            </pre>
          </div>
        ) : null}
      </main>
    </section>
  );
}

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

function ProjectFilesPageContent({
  workflowState,
}: {
  readonly workflowState?: WorkflowState;
}): JSX.Element {
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
      void queryClient.invalidateQueries({
        queryKey: ["project-files", "projects"],
      });
      if (event.detail.projectId !== state.selectedProjectId) {
        if (event.detail.selectProject && dirtyPaths.size === 0) {
          state.setSelectedProjectId(event.detail.projectId);
        }
        return;
      }
      void refreshChangedFiles(event.detail.paths);
    };

    window.addEventListener(PROJECT_FILES_CHANGED_EVENT, handleProjectFilesChanged);
    return () => {
      window.removeEventListener(PROJECT_FILES_CHANGED_EVENT, handleProjectFilesChanged);
    };
  }, [
    dirtyPaths.size,
    queryClient,
    refreshChangedFiles,
    state,
    state.selectedProjectId,
  ]);

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

  const workflowFiles = useMemo(
    () => (workflowState ? extractWorkflowFiles(workflowState) : []),
    [workflowState]
  );

  const showWorkflowFiles = !projectsQuery.isLoading && projects.length === 0 && workflowFiles.length > 0;

  return (
    <div className="project-files-page">
      {!showWorkflowFiles && (
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
      )}

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
      ) : showWorkflowFiles ? (
        <WorkflowFilesViewer
          files={workflowFiles}
          {...(workflowState?.threadId ? { threadId: workflowState.threadId } : {})}
        />
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

export function ProjectFilesPage({
  workflowState,
}: {
  readonly workflowState?: WorkflowState;
} = {}): JSX.Element {
  return (
    <QueryClientProvider client={projectFilesQueryClient}>
      <ProjectFilesPageContent
        {...(workflowState ? { workflowState } : {})}
      />
    </QueryClientProvider>
  );
}
