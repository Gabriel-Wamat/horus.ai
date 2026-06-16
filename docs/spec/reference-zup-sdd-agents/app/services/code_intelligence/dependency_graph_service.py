"""Dependency graph construction for source files."""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path

from app.services.code_intelligence.ast_parser_service import ASTParserService, ParsedFile


@dataclass(frozen=True)
class DependencyEdge:
    """One dependency relationship between files."""

    from_file: str
    to_file: str
    import_name: str


class DependencyGraph:
    """Directed file dependency graph."""

    def __init__(self) -> None:
        self.edges: list[DependencyEdge] = []
        self._forward: dict[str, set[str]] = defaultdict(set)
        self._reverse: dict[str, set[str]] = defaultdict(set)

    def add_edge(self, from_file: str, to_file: str, import_name: str) -> None:
        """Add a directed dependency edge from importer to imported file."""
        edge = DependencyEdge(from_file=from_file, to_file=to_file, import_name=import_name)
        self.edges.append(edge)
        self._forward[from_file].add(to_file)
        self._reverse[to_file].add(from_file)

    def get_dependencies(self, file_path: str, *, transitive: bool = False) -> set[str]:
        """Return direct or transitive files imported by file_path."""
        if not transitive:
            return set(self._forward.get(file_path, set()))
        return self._walk(self._forward, file_path)

    def get_dependents(self, file_path: str, *, transitive: bool = False) -> set[str]:
        """Return direct or transitive files that import file_path."""
        if not transitive:
            return set(self._reverse.get(file_path, set()))
        return self._walk(self._reverse, file_path)

    def detect_cycles(self) -> list[list[str]]:
        """Detect dependency cycles using depth-first search."""
        nodes = set(self._forward) | set(self._reverse)
        visiting: set[str] = set()
        visited: set[str] = set()
        stack: list[str] = []
        cycles: list[list[str]] = []
        seen_cycles: set[tuple[str, ...]] = set()

        def visit(node: str) -> None:
            if node in visiting:
                start = stack.index(node)
                cycle = stack[start:] + [node]
                normalized = _normalize_cycle(cycle)
                if normalized not in seen_cycles:
                    seen_cycles.add(normalized)
                    cycles.append(cycle)
                return
            if node in visited:
                return
            visiting.add(node)
            stack.append(node)
            for dependency in sorted(self._forward.get(node, set())):
                visit(dependency)
            stack.pop()
            visiting.remove(node)
            visited.add(node)

        for node in sorted(nodes):
            visit(node)
        return cycles

    @staticmethod
    def _walk(edges: dict[str, set[str]], start: str) -> set[str]:
        visited: set[str] = set()
        queue = deque(sorted(edges.get(start, set())))
        while queue:
            current = queue.popleft()
            if current in visited or current == start:
                continue
            visited.add(current)
            queue.extend(sorted(edges.get(current, set()) - visited))
        return visited


class DependencyGraphService:
    """Build and query dependency graphs."""

    def __init__(self, ast_parser: ASTParserService | None = None) -> None:
        self.ast_parser = ast_parser or ASTParserService()

    def build_graph(self, workspace_root: str | Path, files: list[str]) -> DependencyGraph:
        """Build a dependency graph for the provided relative source files."""
        workspace = Path(workspace_root).resolve()
        graph = DependencyGraph()
        parsed_files: dict[str, ParsedFile] = {}
        known_files: set[str] = set()

        for file_rel in files:
            file_abs = (workspace / file_rel).resolve()
            if not file_abs.exists() or not file_abs.is_file():
                continue
            parsed = self.ast_parser.parse_file(file_abs)
            parsed_files[str(file_abs)] = parsed
            known_files.add(str(file_abs))

        for file_abs_str, parsed in parsed_files.items():
            for import_name in parsed.imports:
                resolved = self._resolve_import(
                    from_file=Path(file_abs_str),
                    import_name=import_name,
                    workspace=workspace,
                    language=parsed.language,
                )
                if resolved and str(resolved) in known_files:
                    graph.add_edge(from_file=file_abs_str, to_file=str(resolved), import_name=import_name)
        return graph

    def _resolve_import(
        self,
        *,
        from_file: Path,
        import_name: str,
        workspace: Path,
        language: str,
    ) -> Path | None:
        """Resolve an import string to an absolute source file when possible."""
        if language == "python":
            return self._resolve_python_import(from_file=from_file, import_name=import_name, workspace=workspace)
        if language in {"typescript", "javascript"}:
            return self._resolve_js_import(from_file=from_file, import_name=import_name, workspace=workspace)
        return None

    def _resolve_python_import(self, *, from_file: Path, import_name: str, workspace: Path) -> Path | None:
        if import_name.startswith("."):
            dot_count = len(import_name) - len(import_name.lstrip("."))
            module = import_name.lstrip(".")
            base = from_file.parent
            for _ in range(max(0, dot_count - 1)):
                base = base.parent
            module_path = module.replace(".", "/") if module else ""
            candidates = _python_candidates(base / module_path)
        else:
            candidates = _python_candidates(workspace / import_name.replace(".", "/"))
            parts = import_name.split(".")
            if len(parts) > 1:
                candidates.extend(_python_candidates(workspace / parts[0]))

        for candidate in candidates:
            if candidate.exists() and _is_within(candidate, workspace):
                return candidate.resolve()
        return None

    def _resolve_js_import(self, *, from_file: Path, import_name: str, workspace: Path) -> Path | None:
        if import_name.startswith("."):
            base = (from_file.parent / import_name).resolve()
        elif import_name.startswith("@/"):
            src_dir = workspace / "src" if (workspace / "src").exists() else workspace
            base = (src_dir / import_name[2:]).resolve()
        else:
            return None

        for candidate in _js_candidates(base):
            if candidate.exists() and _is_within(candidate, workspace):
                return candidate.resolve()
        return None


def _python_candidates(base: Path) -> list[Path]:
    return [base.with_suffix(".py"), base / "__init__.py"]


def _js_candidates(base: Path) -> list[Path]:
    candidates = [base]
    for ext in (".ts", ".tsx", ".js", ".jsx", ".mjs"):
        candidates.append(base.with_suffix(ext))
    for ext in (".ts", ".tsx", ".js", ".jsx"):
        candidates.append(base / f"index{ext}")
    return candidates


def _is_within(candidate: Path, workspace: Path) -> bool:
    try:
        candidate.resolve().relative_to(workspace.resolve())
        return True
    except ValueError:
        return False


def _normalize_cycle(cycle: list[str]) -> tuple[str, ...]:
    if not cycle:
        return ()
    body = cycle[:-1] if cycle[0] == cycle[-1] else cycle
    if not body:
        return tuple(cycle)
    rotations = [tuple(body[index:] + body[:index]) for index in range(len(body))]
    normalized = min(rotations)
    return normalized + (normalized[0],)
