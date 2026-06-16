"""Low-level Git command execution for target-repo operations."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings


class TargetRepoWorkspaceError(ValueError):
    pass


@dataclass(slots=True)
class _CompletedProcess:
    stdout: str
    stderr: str
    returncode: int


@dataclass(slots=True)
class GitCommandExecutor:
    """Executes git commands in a given directory and raises on non-zero exit."""

    settings: Settings

    async def run_git(self, repo_root: Path, *args: str) -> _CompletedProcess:
        process = await asyncio.create_subprocess_exec(
            "git",
            "-C",
            str(repo_root),
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise TargetRepoWorkspaceError(
                f"git {' '.join(args)} failed in {repo_root}: "
                f"{stderr.decode('utf-8', errors='ignore').strip()}"
            )
        return _CompletedProcess(
            stdout=stdout.decode("utf-8", errors="ignore"),
            stderr=stderr.decode("utf-8", errors="ignore"),
            returncode=process.returncode,
        )

    async def ensure_local_commit_identity(self, workspace: Path) -> None:
        name = await self._read_local_git_config(workspace, "user.name")
        email = await self._read_local_git_config(workspace, "user.email")
        if not name:
            await self.run_git(
                workspace,
                "config",
                "user.name",
                str(getattr(self.settings, "ODIN_BOOTSTRAP_GIT_USER_NAME", "SDD Bootstrap")),
            )
        if not email:
            await self.run_git(
                workspace,
                "config",
                "user.email",
                str(getattr(self.settings, "ODIN_BOOTSTRAP_GIT_USER_EMAIL", "sdd-bootstrap@example.com")),
            )

    async def _read_local_git_config(self, workspace: Path, key: str) -> str | None:
        try:
            result = await self.run_git(workspace, "config", "--local", "--get", key)
        except TargetRepoWorkspaceError:
            return None
        return result.stdout.strip() or None


__all__ = ["GitCommandExecutor", "TargetRepoWorkspaceError", "_CompletedProcess"]
