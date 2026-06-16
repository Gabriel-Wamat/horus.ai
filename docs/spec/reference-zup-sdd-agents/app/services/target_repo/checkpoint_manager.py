"""Checkpoint management — Git tags, rollback, and change commits."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.services.target_repo.git_executor import GitCommandExecutor


@dataclass(slots=True)
class CheckpointManager:
    """Creates and restores named checkpoints in a Git workspace."""

    executor: GitCommandExecutor

    async def create_checkpoint(self, workspace_path: str | Path, tag: str) -> str:
        workspace = Path(workspace_path).resolve()
        result = await self.executor.run_git(workspace, "rev-parse", "HEAD")
        current_sha = result.stdout.strip()
        await self.executor.run_git(workspace, "tag", "-f", tag, current_sha)
        return current_sha

    async def rollback_to_checkpoint(self, workspace_path: str | Path, tag: str) -> None:
        workspace = Path(workspace_path).resolve()
        await self.executor.run_git(workspace, "rev-parse", "--verify", tag)
        await self.executor.run_git(workspace, "reset", "--hard", tag)
        await self.executor.run_git(workspace, "clean", "-fd")

    async def commit_changes(self, workspace_path: str | Path, message: str) -> str:
        workspace = Path(workspace_path).resolve()
        await self.executor.run_git(workspace, "add", "-A")

        status_result = await self.executor.run_git(workspace, "status", "--porcelain")
        if not status_result.stdout.strip():
            result = await self.executor.run_git(workspace, "rev-parse", "HEAD")
            return result.stdout.strip()

        await self.executor.ensure_local_commit_identity(workspace)
        await self.executor.run_git(workspace, "commit", "-m", message)
        result = await self.executor.run_git(workspace, "rev-parse", "HEAD")
        return result.stdout.strip()


__all__ = ["CheckpointManager"]
