"""Unified code intelligence service for specialist planning."""
from __future__ import annotations

import os
import re
from pathlib import Path

from pydantic import BaseModel

from app.services.code_intelligence.ast_parser_service import ASTParserService, Symbol, SymbolLocation
from app.services.code_intelligence.dependency_graph_service import DependencyGraph, DependencyGraphService
from app.services.code_intelligence.impact_analyzer import ImpactAnalysis, ImpactAnalyzer
from app.services.code_intelligence.lru_cache import LRUCache
from app.services.code_intelligence.workspace_cache import WorkspaceCacheService


class CodeIntelligence(BaseModel):
    """Complete code intelligence snapshot for a workspace."""

    workspace_root: str
    total_files: int
    impact: ImpactAnalysis | None = None


class CodeReference(BaseModel):
    """A textual reference to a symbol."""

    symbol_name: str
    location: SymbolLocation
    line_text: str


class CodeIntelligenceService:
    """Facade for structural codebase analysis."""

    def __init__(self) -> None:
        self.ast_parser = ASTParserService()
        self.dependency_service = DependencyGraphService(ast_parser=self.ast_parser)
        self.impact_analyzer = ImpactAnalyzer(dependency_service=self.dependency_service)
        self._workspace_cache = WorkspaceCacheService()
        self._analysis_cache: LRUCache[str, CodeIntelligence] = LRUCache(maxsize=256)
        self._graph_cache: LRUCache[str, DependencyGraph] = LRUCache(maxsize=64)

    def analyze_changes(self, workspace_root: str | Path, changed_files: list[str]) -> CodeIntelligence:
        """Analyze the likely impact of changed files in a workspace."""
        workspace = Path(workspace_root).resolve()
        cache_key = self._analysis_cache_key(workspace, changed_files)
        cached = self._analysis_cache.get(cache_key)
        if cached is not None:
            return cached

        all_files = self._discover_files(workspace)
        graph = self._get_dependency_graph(workspace, all_files)
        impact = self.impact_analyzer.analyze(
            workspace_root=workspace,
            changed_files=changed_files,
            all_files=all_files,
            graph=graph,
        )
        result = CodeIntelligence(
            workspace_root=str(workspace),
            total_files=len(all_files),
            impact=impact,
        )
        self._analysis_cache.put(cache_key, result)
        return result

    def find_definition(self, workspace_root: str | Path, symbol_name: str) -> list[Symbol]:
        """Find parsed definitions for a symbol by exact name."""
        workspace = Path(workspace_root).resolve()
        definitions: list[Symbol] = []
        for relative in self._discover_files(workspace):
            parsed = self.ast_parser.parse_file(workspace / relative)
            definitions.extend(
                symbol
                for symbol in parsed.symbols
                if symbol.name == symbol_name and symbol.kind in {"class", "function", "variable", "export"}
            )
        return sorted(definitions, key=lambda item: (item.location.file, item.location.line, item.location.column))

    def find_references(self, workspace_root: str | Path, symbol_name: str) -> list[CodeReference]:
        """Find textual references to a symbol across supported source files."""
        workspace = Path(workspace_root).resolve()
        pattern = re.compile(rf"\b{re.escape(symbol_name)}\b")
        references: list[CodeReference] = []
        for relative in self._discover_files(workspace):
            path = workspace / relative
            try:
                lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
            except OSError:
                continue
            for line_number, line in enumerate(lines, start=1):
                for match in pattern.finditer(line):
                    references.append(
                        CodeReference(
                            symbol_name=symbol_name,
                            location=SymbolLocation(
                                file=str(path.resolve()),
                                line=line_number,
                                column=match.start(),
                                end_line=line_number,
                                end_column=match.end(),
                            ),
                            line_text=line.strip(),
                        )
                    )
        return references

    def analyze_dependencies(self, workspace_root: str | Path, file_path: str) -> dict[str, list[str]]:
        """Return direct/transitive dependencies and dependents for one file."""
        workspace = Path(workspace_root).resolve()
        all_files = self._discover_files(workspace)
        graph = self.dependency_service.build_graph(workspace, all_files)
        file_abs = str((workspace / file_path).resolve())

        def _rel(paths: set[str]) -> list[str]:
            return sorted(str(Path(item).resolve().relative_to(workspace)) for item in paths)

        return {
            "dependencies": _rel(graph.get_dependencies(file_abs)),
            "transitive_dependencies": _rel(graph.get_dependencies(file_abs, transitive=True)),
            "dependents": _rel(graph.get_dependents(file_abs)),
            "transitive_dependents": _rel(graph.get_dependents(file_abs, transitive=True)),
        }

    def detect_patterns(self, workspace_root: str | Path) -> list[str]:
        """Detect coarse project conventions from the file tree."""
        workspace = Path(workspace_root).resolve()
        files = set(self._discover_files(workspace))
        patterns: list[str] = []
        if any(path.startswith("app/") for path in files):
            patterns.append("python_app_package")
        if any(path.startswith("src/") for path in files):
            patterns.append("src_layout")
        if any("/tests/" in f"/{path}" or path.startswith("test_") for path in files):
            patterns.append("tests_present")
        if any(path.endswith(".tsx") for path in files):
            patterns.append("react_or_tsx_frontend")
        return patterns

    def invalidate_cache(self) -> None:
        """Invalidate workspace discovery and parser caches."""
        self._workspace_cache.invalidate()
        self.ast_parser.invalidate_cache()
        self._analysis_cache.invalidate()
        self._graph_cache.invalidate()

    def _analysis_cache_key(self, workspace: Path, changed_files: list[str]) -> str:
        normalized_files = ",".join(sorted(dict.fromkeys(changed_files)))
        changed_fingerprints = ",".join(
            self._file_fingerprint(workspace / item) for item in sorted(dict.fromkeys(changed_files))
        )
        return f"{workspace}:{self._workspace_cache.content_hash(workspace)}:{normalized_files}:{changed_fingerprints}"

    def _graph_cache_key(self, workspace: Path, all_files: list[str]) -> str:
        return f"{workspace}:{self._workspace_cache.content_hash(workspace)}:{len(all_files)}"

    def _get_dependency_graph(self, workspace: Path, all_files: list[str]) -> DependencyGraph:
        key = self._graph_cache_key(workspace, all_files)
        cached = self._graph_cache.get(key)
        if cached is not None:
            return cached
        graph = self.dependency_service.build_graph(workspace, all_files)
        self._graph_cache.put(key, graph)
        return graph

    def _file_fingerprint(self, path: Path) -> str:
        try:
            stat = path.resolve().stat()
        except OSError:
            return "missing"
        return f"{path.as_posix()}:{stat.st_mtime_ns}:{stat.st_size}"

    def _discover_files(self, workspace: Path) -> list[str]:
        """Discover supported source files under workspace with cache."""
        cached = self._workspace_cache.get_files(workspace)
        if cached is not None:
            return cached
        files = self._discover_files_uncached(workspace)
        self._workspace_cache.put_files(workspace, files)
        return files

    def _discover_files_uncached(self, workspace: Path) -> list[str]:
        """Discover supported source files under workspace."""
        extensions = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs"}
        ignore_dirs = {
            ".git",
            ".mypy_cache",
            ".pytest_cache",
            ".tox",
            ".venv",
            "__pycache__",
            "build",
            "dist",
            "node_modules",
            "venv",
        }
        files: list[str] = []
        for dirpath, dirnames, filenames in os.walk(workspace):
            dirnames[:] = [name for name in dirnames if name not in ignore_dirs]
            base = Path(dirpath)
            for filename in filenames:
                path = base / filename
                if path.suffix.lower() not in extensions:
                    continue
                try:
                    files.append(path.relative_to(workspace).as_posix())
                except ValueError:
                    continue
        return sorted(files)
