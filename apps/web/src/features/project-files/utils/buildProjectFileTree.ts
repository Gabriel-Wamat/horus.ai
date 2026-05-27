import type { ProjectFileEntry } from "@u-build/shared";

export interface ProjectFileTreeNode {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly kind: "dir" | "file";
  entry?: ProjectFileEntry;
  readonly children: ProjectFileTreeNode[];
}

function compareNodes(a: ProjectFileTreeNode, b: ProjectFileTreeNode): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
}

export function getFileName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.at(-1) ?? path;
}

export function buildProjectFileTree(
  entries: readonly ProjectFileEntry[]
): ProjectFileTreeNode[] {
  const roots = new Map<string, ProjectFileTreeNode>();
  const directories = new Map<string, ProjectFileTreeNode>();

  const ensureDirectory = (path: string): ProjectFileTreeNode => {
    const existing = directories.get(path);
    if (existing) return existing;

    const name = getFileName(path);
    const node: ProjectFileTreeNode = {
      id: `dir:${path}`,
      name,
      path,
      kind: "dir",
      children: [],
    };
    directories.set(path, node);

    const parentPath = path.split("/").slice(0, -1).join("/");
    if (parentPath) {
      ensureDirectory(parentPath).children.push(node);
    } else {
      roots.set(node.id, node);
    }
    return node;
  };

  for (const entry of entries) {
    const normalizedPath = entry.path.replace(/^\/+/, "");
    if (!normalizedPath) continue;

    if (entry.kind === "dir") {
      const node = ensureDirectory(normalizedPath);
      node.entry = entry;
      continue;
    }

    const parentPath = normalizedPath.split("/").slice(0, -1).join("/");
    const node: ProjectFileTreeNode = {
      id: `file:${normalizedPath}`,
      name: getFileName(normalizedPath),
      path: normalizedPath,
      kind: "file",
      entry,
      children: [],
    };

    if (parentPath) {
      ensureDirectory(parentPath).children.push(node);
    } else {
      roots.set(node.id, node);
    }
  }

  const sortRecursive = (nodes: ProjectFileTreeNode[]): ProjectFileTreeNode[] =>
    nodes
      .sort(compareNodes)
      .map((node) => ({ ...node, children: sortRecursive([...node.children]) }));

  return sortRecursive([...roots.values()]);
}

export function collectExpandablePaths(
  nodes: readonly ProjectFileTreeNode[]
): string[] {
  const paths: string[] = [];
  const visit = (node: ProjectFileTreeNode): void => {
    if (node.kind === "dir") paths.push(node.path);
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return paths;
}
