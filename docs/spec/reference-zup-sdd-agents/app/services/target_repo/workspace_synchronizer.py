"""Workspace synchronizer — copies committed and working-tree changes to the target repo."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings
from app.services.target_repo.git_executor import GitCommandExecutor, TargetRepoWorkspaceError


@dataclass(slots=True)
class WorkspaceSyncResult:
    synced_files: int
    deleted_files: int
    changed_paths: list[str]


@dataclass(slots=True)
class WorkspaceSynchronizer:
    """Copies changed files from a Git worktree back to the origin repository."""

    executor: GitCommandExecutor
    settings: Settings

    async def sync(
        self,
        *,
        workspace_path: str | Path,
        repo_root: str | Path,
        base_ref: str,
    ) -> WorkspaceSyncResult:
        workspace = Path(workspace_path).resolve()
        repo = Path(repo_root).expanduser().resolve()
        if not workspace.exists() or not workspace.is_dir():
            raise TargetRepoWorkspaceError(f"Workspace path not found: {workspace}")
        if not repo.exists() or not repo.is_dir():
            raise TargetRepoWorkspaceError(f"Target repository path not found: {repo}")
        if workspace == repo:
            return WorkspaceSyncResult(synced_files=0, deleted_files=0, changed_paths=[])

        merge_base_result = await self.executor.run_git(workspace, "merge-base", "HEAD", base_ref)
        merge_base = merge_base_result.stdout.strip() or "HEAD"

        committed_changed = await self._collect_changed_paths(workspace, merge_base=merge_base)
        committed_deleted = await self._collect_deleted_paths(workspace, merge_base=merge_base)
        working_changed = await self._collect_working_changed_paths(workspace)
        working_deleted = await self._collect_working_deleted_paths(workspace)
        untracked = await self._collect_untracked_paths(workspace)

        paths_to_copy = set(committed_changed) | set(working_changed) | set(untracked)
        paths_to_delete = set(committed_deleted) | set(working_deleted)
        allow_deletions = bool(getattr(self.settings, "ODIN_SYNC_DELETE_MISSING_FILES", False))
        changed_paths: list[str] = []
        synced_files = 0
        deleted_files = 0

        for relative in sorted(paths_to_copy):
            source = (workspace / relative).resolve()
            if not self._is_within(source, workspace):
                raise TargetRepoWorkspaceError(f"Changed path escapes workspace boundary: {relative}")
            target = (repo / relative).resolve()
            if not self._is_within(target, repo):
                raise TargetRepoWorkspaceError(f"Changed path escapes target repo boundary: {relative}")
            if not source.exists() or source.is_dir():
                paths_to_delete.add(relative)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            synced_files += 1
            changed_paths.append(relative)

        if allow_deletions:
            for relative in sorted(paths_to_delete):
                source = (workspace / relative).resolve()
                if source.exists() and source.is_file():
                    continue
                target = (repo / relative).resolve()
                if not self._is_within(target, repo):
                    raise TargetRepoWorkspaceError(f"Delete path escapes target repo boundary: {relative}")
                if target.is_file() or target.is_symlink():
                    target.unlink()
                    deleted_files += 1
                    changed_paths.append(relative)

        return WorkspaceSyncResult(
            synced_files=synced_files,
            deleted_files=deleted_files,
            changed_paths=sorted(set(changed_paths)),
        )

    # ── Private path collection helpers ──────────────────────────────────────

    async def _collect_changed_paths(self, workspace: Path, *, merge_base: str) -> list[str]:
        result = await self.executor.run_git(workspace, "diff", "--name-only", "--relative", merge_base, "HEAD")
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]

    async def _collect_deleted_paths(self, workspace: Path, *, merge_base: str) -> list[str]:
        result = await self.executor.run_git(
            workspace, "diff", "--name-only", "--diff-filter=D", "--relative", merge_base, "HEAD"
        )
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]

    async def _collect_untracked_paths(self, workspace: Path) -> list[str]:
        result = await self.executor.run_git(workspace, "ls-files", "--others", "--exclude-standard")
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]

    async def _collect_working_changed_paths(self, workspace: Path) -> list[str]:
        result = await self.executor.run_git(workspace, "diff", "--name-only", "--relative", "HEAD")
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]

    async def _collect_working_deleted_paths(self, workspace: Path) -> list[str]:
        result = await self.executor.run_git(
            workspace, "diff", "--name-only", "--diff-filter=D", "--relative", "HEAD"
        )
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]

    @staticmethod
    def _is_within(candidate: Path, target_repo_root: Path) -> bool:
        try:
            candidate.relative_to(target_repo_root)
            return True
        except ValueError:
            return False


__all__ = ["WorkspaceSyncResult", "WorkspaceSynchronizer"]
