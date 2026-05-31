import type { FrontendProject, WorkspaceFolder } from "@u-build/shared";

export function selectDefaultProject(
  projects: FrontendProject[],
  currentProjectId: string
): FrontendProject | null {
  const currentProject = projects.find((project) => project.id === currentProjectId);
  if (currentProject) return currentProject;

  return selectNewestProject(projects);
}

export function canShowInDefaultPreviewList(
  project: FrontendProject
): boolean {
  return (
    project.visibility === "visible" &&
    project.healthStatus !== "blocked" &&
    project.lifecycleStatus !== "superseded" &&
    project.lifecycleStatus !== "failed" &&
    project.lifecycleStatus !== "archived"
  );
}

export function selectNewestProject(
  projects: FrontendProject[]
): FrontendProject | null {
  return [...projects].sort((a, b) => {
    const byCreatedAt =
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (byCreatedAt !== 0) return byCreatedAt;
    return a.name.localeCompare(b.name);
  })[0] ?? null;
}

export function findProjectWorkspaceFolder(
  folders: WorkspaceFolder[],
  project: FrontendProject
): WorkspaceFolder | null {
  const projectName = normalizeWorkspaceName(project.name);
  const sameNameFolders = folders.filter(
    (folder) => normalizeWorkspaceName(folder.name) === projectName
  );
  return (
    sameNameFolders.find((folder) => folder.storyCount > 0) ??
    sameNameFolders[0] ??
    null
  );
}

function normalizeWorkspaceName(value: string): string {
  return value.trim().toLowerCase();
}
