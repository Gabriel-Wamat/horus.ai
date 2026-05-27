import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { ProjectFileEntry } from "@u-build/shared";
import {
  ChevronRight,
  File,
  FileCode2,
  Folder,
  FolderOpen,
  SearchX,
} from "lucide-react";
import {
  buildProjectFileTree,
  collectExpandablePaths,
  type ProjectFileTreeNode,
} from "../utils/buildProjectFileTree.js";

interface FileTreeProps {
  readonly entries: readonly ProjectFileEntry[];
  readonly activePath: string | null;
  readonly search: string;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly onOpenFile: (entry: ProjectFileEntry) => void;
  readonly onPreviewFile?: ((entry: ProjectFileEntry) => void) | undefined;
}

function isMatch(node: ProjectFileTreeNode, search: string): boolean {
  if (!search) return true;
  return node.path.toLowerCase().includes(search.toLowerCase());
}

function filterTree(
  nodes: readonly ProjectFileTreeNode[],
  search: string
): ProjectFileTreeNode[] {
  if (!search.trim()) return [...nodes];
  return nodes
    .map((node) => {
      const children = filterTree(node.children, search);
      if (isMatch(node, search) || children.length > 0) {
        return { ...node, children };
      }
      return null;
    })
    .filter((node): node is ProjectFileTreeNode => Boolean(node));
}

function TreeRow({
  node,
  level,
  activePath,
  expanded,
  onToggle,
  onOpenFile,
  onPreviewFile,
}: {
  readonly node: ProjectFileTreeNode;
  readonly level: number;
  readonly activePath: string | null;
  readonly expanded: Set<string>;
  readonly onToggle: (path: string) => void;
  readonly onOpenFile: (entry: ProjectFileEntry) => void;
  readonly onPreviewFile?: ((entry: ProjectFileEntry) => void) | undefined;
}): JSX.Element {
  const isDirectory = node.kind === "dir";
  const isExpanded = expanded.has(node.path);
  const isActive = activePath === node.path;
  const Icon = isDirectory ? (isExpanded ? FolderOpen : Folder) : node.entry?.language ? FileCode2 : File;

  return (
    <li>
      <button
        type="button"
        className={`project-files-tree-row ${isActive ? "active" : ""}`}
        style={{ paddingLeft: 10 + level * 16 }}
        title={node.path}
        onClick={() => {
          if (isDirectory) {
            onToggle(node.path);
            return;
          }
          if (node.entry) onOpenFile(node.entry);
        }}
        onFocus={() => {
          if (!isDirectory && node.entry) onPreviewFile?.(node.entry);
        }}
        onMouseEnter={() => {
          if (!isDirectory && node.entry) onPreviewFile?.(node.entry);
        }}
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`project-files-tree-chevron ${
            isDirectory && isExpanded ? "expanded" : ""
          } ${isDirectory ? "" : "hidden"}`}
        />
        <Icon size={15} aria-hidden="true" />
        <span>{node.name}</span>
        {node.entry?.language ? (
          <small>{node.entry.language}</small>
        ) : null}
      </button>
      {isDirectory && isExpanded ? (
        <ul className="project-files-tree-children">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              level={level + 1}
              activePath={activePath}
              expanded={expanded}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              onPreviewFile={onPreviewFile}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FileTree({
  entries,
  activePath,
  search,
  isLoading,
  error,
  onOpenFile,
  onPreviewFile,
}: FileTreeProps): JSX.Element {
  const tree = useMemo(() => buildProjectFileTree(entries), [entries]);
  const visibleTree = useMemo(() => filterTree(tree, search), [search, tree]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const treeSignatureRef = useRef<string>("");

  useEffect(() => {
    const signature = entries.map((entry) => `${entry.kind}:${entry.path}`).join("\n");
    if (signature === treeSignatureRef.current) return;
    treeSignatureRef.current = signature;
    setExpanded((current) => {
      const initial = new Set(current);
      let addedRoot = false;
      for (const node of tree) {
        if (node.kind === "dir") {
          initial.add(node.path);
          addedRoot = true;
        }
      }
      return addedRoot ? initial : current;
    });
  }, [entries, tree]);

  useEffect(() => {
    if (!activePath) return;
    const parts = activePath.split("/");
    if (parts.length <= 1) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (let index = 1; index < parts.length; index += 1) {
        next.add(parts.slice(0, index).join("/"));
      }
      return next;
    });
  }, [activePath]);

  useEffect(() => {
    if (!search.trim()) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (const path of collectExpandablePaths(visibleTree)) {
        next.add(path);
      }
      return next;
    });
  }, [search, visibleTree]);

  if (isLoading) {
    return (
      <div className="project-files-tree-state">
        <span className="project-files-loading-dot" aria-hidden="true" />
        <p>Carregando arquivos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-files-tree-state is-error">
        <p>Não foi possível carregar a árvore.</p>
        <small>{error.message}</small>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="project-files-tree-state">
        <SearchX size={22} aria-hidden="true" />
        <p>Nenhum arquivo encontrado.</p>
      </div>
    );
  }

  if (visibleTree.length === 0) {
    return (
      <div className="project-files-tree-state">
        <SearchX size={22} aria-hidden="true" />
        <p>Nada corresponde à busca.</p>
      </div>
    );
  }

  return (
    <nav className="project-files-tree" aria-label="Árvore de arquivos">
      <ul>
        {visibleTree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            level={0}
            activePath={activePath}
            expanded={expanded}
            onToggle={(path) => {
              setExpanded((current) => {
                const next = new Set(current);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              });
            }}
            onOpenFile={onOpenFile}
            onPreviewFile={onPreviewFile}
          />
        ))}
      </ul>
    </nav>
  );
}
