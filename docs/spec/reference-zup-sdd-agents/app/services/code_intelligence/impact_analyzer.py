"""Impact analysis based on dependency graph and test naming conventions."""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from app.services.code_intelligence.dependency_graph_service import DependencyGraph, DependencyGraphService


class ImpactAnalysis(BaseModel):
    """Result of impact analysis for a set of changed files."""

    changed_files: list[str]
    affected_files: list[str]
    related_tests: list[str]
    breaking_change_risk: Literal["low", "medium", "high"]
    reasoning: str


class ImpactAnalyzer:
    """Analyze which files and tests are impacted by code changes."""

    def __init__(self, dependency_service: DependencyGraphService | None = None) -> None:
        self.dependency_service = dependency_service or DependencyGraphService()

    def analyze(
        self,
        workspace_root: str | Path,
        changed_files: list[str],
        all_files: list[str],
        *,
        graph: DependencyGraph | None = None,
    ) -> ImpactAnalysis:
        """Analyze affected source files and related tests for changed files."""
        workspace = Path(workspace_root).resolve()
        normalized_changed = _dedupe_existing_relative_files(workspace, changed_files)
        graph = graph or self.dependency_service.build_graph(workspace, all_files)
        changed_abs = {str((workspace / item).resolve()) for item in normalized_changed}

        affected: set[str] = set()
        for changed in normalized_changed:
            changed_path = str((workspace / changed).resolve())
            affected.update(graph.get_dependents(changed_path, transitive=True))
            # Include transitive dependencies as relevant context too. Dependents
            # are the strict breaking-change surface; dependencies are the files
            # the specialist often needs to inspect to plan a safe edit.
            affected.update(graph.get_dependencies(changed_path, transitive=True))

        affected_files = sorted(
            str(Path(file_path).resolve().relative_to(workspace))
            for file_path in affected
            if file_path not in changed_abs
        )
        related_tests = self._find_related_tests(
            workspace=workspace,
            changed_files=normalized_changed,
            affected_files=affected_files,
            all_files=all_files,
            graph=graph,
        )
        risk = self._assess_risk(changed_count=len(normalized_changed), affected_count=len(affected_files))
        return ImpactAnalysis(
            changed_files=normalized_changed,
            affected_files=affected_files,
            related_tests=related_tests,
            breaking_change_risk=risk,
            reasoning=(
                f"{len(affected_files)} arquivo(s) relacionados aos "
                f"{len(normalized_changed)} arquivo(s) alterado(s); "
                f"{len(related_tests)} teste(s) relacionado(s) detectado(s)."
            ),
        )

    def _find_related_tests(
        self,
        *,
        workspace: Path,
        changed_files: list[str],
        affected_files: list[str],
        all_files: list[str],
        graph: DependencyGraph,
    ) -> list[str]:
        related: list[str] = []
        all_changed = set(changed_files + affected_files)
        for test_file in all_files:
            if not self._is_test_file(test_file):
                continue
            if any(self._test_covers_file(test_file, changed) for changed in all_changed):
                related.append(test_file)
                continue
            test_abs = str((workspace / test_file).resolve())
            dependencies = {
                str(Path(item).resolve().relative_to(workspace))
                for item in graph.get_dependencies(test_abs, transitive=True)
                if _is_relative_to(Path(item), workspace)
            }
            if dependencies.intersection(all_changed):
                related.append(test_file)
        return list(dict.fromkeys(sorted(related)))

    def _is_test_file(self, file_path: str) -> bool:
        """Return whether a path looks like a test file."""
        normalized = file_path.replace("\\", "/").lower()
        name = Path(normalized).name
        return (
            "/test/" in normalized
            or "/tests/" in normalized
            or "/__tests__/" in normalized
            or name.startswith("test_")
            or ".test." in name
            or ".spec." in name
        )

    def _test_covers_file(self, test_file: str, source_file: str) -> bool:
        """Heuristic mapping from test names to source file names."""
        test_stem = Path(test_file).stem
        for token in ("test_", ".test", ".spec", "_test"):
            test_stem = test_stem.replace(token, "")
        source_stem = Path(source_file).stem
        return test_stem == source_stem or source_stem in test_file

    def _assess_risk(self, changed_count: int, affected_count: int) -> Literal["low", "medium", "high"]:
        """Assess breaking-change risk from fan-out."""
        ratio = affected_count / max(1, changed_count)
        if ratio < 2:
            return "low"
        if ratio < 5:
            return "medium"
        return "high"


def _dedupe_existing_relative_files(workspace: Path, files: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in files:
        try:
            relative = str((workspace / item).resolve().relative_to(workspace))
        except ValueError:
            continue
        if relative in seen:
            continue
        seen.add(relative)
        result.append(relative)
    return result


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False
