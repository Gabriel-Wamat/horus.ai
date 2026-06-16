"""Repository state management — dirty path collection and pre-execution checkpointing."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.services.target_repo.git_executor import GitCommandExecutor


@dataclass(slots=True)
class DirtyWorktreeSnapshot:
    paths: list[str]
    commit_sha: str
    message: str


@dataclass(slots=True)
class RepositoryStateManager:
    """Collects dirty repo state and creates stash-style commits before execution."""

    executor: GitCommandExecutor

    async def collect_dirty_paths(self, repo_root: str | Path) -> list[str]:
        root = Path(repo_root).expanduser().resolve()
        return await self._collect_repo_dirty_paths(root)

    async def checkpoint_dirty_worktree(
        self,
        repo_root: str | Path,
        *,
        message: str,
    ) -> DirtyWorktreeSnapshot | None:
        root = Path(repo_root).expanduser().resolve()
        dirty_paths = await self._collect_repo_dirty_paths(root)
        if not dirty_paths:
            return None

        await self.executor.ensure_local_commit_identity(root)
        await self.executor.run_git(root, "add", "-A", "--", *dirty_paths)

        status_result = await self.executor.run_git(root, "status", "--porcelain")
        if not status_result.stdout.strip():
            current = await self.executor.run_git(root, "rev-parse", "HEAD")
            return DirtyWorktreeSnapshot(
                paths=dirty_paths, commit_sha=current.stdout.strip(), message=message
            )

        await self.executor.run_git(root, "commit", "-m", message)
        result = await self.executor.run_git(root, "rev-parse", "HEAD")
        return DirtyWorktreeSnapshot(
            paths=dirty_paths, commit_sha=result.stdout.strip(), message=message
        )

    async def _collect_repo_dirty_paths(self, repo_root: Path) -> list[str]:
        staged = await self.executor.run_git(repo_root, "diff", "--cached", "--name-only", "--relative")
        unstaged = await self.executor.run_git(repo_root, "diff", "--name-only", "--relative")
        untracked = await self.executor.run_git(repo_root, "ls-files", "--others", "--exclude-standard")
        paths = {
            line.strip()
            for source in (staged.stdout, unstaged.stdout, untracked.stdout)
            for line in source.splitlines()
            if line.strip()
        }
        return sorted(paths)

    @staticmethod
    def filter_paths_within_write_roots(paths: list[str], *, write_roots: list[str]) -> list[str]:
        if not paths or not write_roots:
            return []
        conflicting: list[str] = []
        normalized_roots: list[Path] = []
        for raw_root in write_roots:
            normalized = raw_root.strip().strip("/")
            if normalized in {"", "."}:
                return sorted(set(paths))
            normalized_roots.append(Path(normalized))

        for raw_path in paths:
            relative_path = Path(raw_path)
            for root in normalized_roots:
                try:
                    relative_path.relative_to(root)
                    conflicting.append(raw_path)
                    break
                except ValueError:
                    continue
        return sorted(set(conflicting))


__all__ = ["DirtyWorktreeSnapshot", "RepositoryStateManager"]
