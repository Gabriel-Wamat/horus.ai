"""Facade for target-repository workspace operations.

All 13 public methods keep their original signatures.
Implementation is delegated to focused sub-classes.
"""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from dataclasses import dataclass

from app.core.config import Settings
from app.domain.models.enums import WorkspaceStatus
from app.schemas.target_repo import DiffStatsSnapshot
from app.services.target_repo.checkpoint_manager import CheckpointManager
from app.services.target_repo.diff_analyzer import DiffAnalyzer, FileChangeStatus
from app.services.target_repo.git_executor import GitCommandExecutor, TargetRepoWorkspaceError
from app.services.target_repo.repo_state_manager import DirtyWorktreeSnapshot, RepositoryStateManager
from app.services.target_repo.workspace_synchronizer import WorkspaceSyncResult, WorkspaceSynchronizer

# Re-export for backward compatibility.
__all__ = [
    "DirtyWorktreeSnapshot",
    "FileChangeStatus",
    "TargetRepoWorkspaceError",
    "TargetRepoWorkspaceService",
    "WorkspaceHandle",
    "WorkspaceSyncResult",
]


@dataclass(slots=True)
class WorkspaceHandle:
    path: Path
    branch: str
    base_ref: str
    status: WorkspaceStatus
    created: bool


class TargetRepoWorkspaceService:
    """Facade — composes GitCommandExecutor, DiffAnalyzer, RepositoryStateManager,
    CheckpointManager, and WorkspaceSynchronizer."""

    def __init__(self, *, settings: Settings, project_root: Path | None = None):
        self._settings = settings
        self._project_root = project_root or Path(__file__).resolve().parents[3]
        executor = GitCommandExecutor(settings)
        self._executor = executor
        self._diff_analyzer = DiffAnalyzer(executor)
        self._repo_state = RepositoryStateManager(executor)
        self._checkpoint_mgr = CheckpointManager(executor)
        self._synchronizer = WorkspaceSynchronizer(executor, settings)

    # ── Pre-execution validation ───────────────────────────────────────────

    async def preflight(
        self,
        repo_root: str | Path,
        *,
        base_ref: str,
        allow_dirty_outside_write_roots: bool = False,
        write_roots: list[str] | None = None,
    ) -> None:
        root = Path(repo_root).expanduser().resolve()
        if not root.exists() or not root.is_dir():
            raise TargetRepoWorkspaceError(f"Target repository path not found: {root}")

        await self._executor.run_git(root, "rev-parse", "--is-inside-work-tree")
        await self._executor.run_git(root, "rev-parse", "--verify", base_ref)

        status = await self._executor.run_git(root, "status", "--porcelain")
        if status.stdout.strip():
            if not allow_dirty_outside_write_roots:
                raise TargetRepoWorkspaceError(
                    f"Target repository must be clean before execution: {root}"
                )
            dirty_paths = await self._repo_state.collect_dirty_paths(root)
            conflicting_paths = RepositoryStateManager.filter_paths_within_write_roots(
                dirty_paths,
                write_roots=write_roots or [],
            )
            if conflicting_paths:
                preview = ", ".join(conflicting_paths[:8])
                if len(conflicting_paths) > 8:
                    preview = f"{preview}, ..."
                raise TargetRepoWorkspaceError(
                    "Target repository has local changes inside write_roots and cannot run safely. "
                    f"Repository: {root}. Conflicting paths: {preview}"
                )

    # ── Repository state ───────────────────────────────────────────────────

    async def collect_dirty_paths(self, repo_root: str | Path) -> list[str]:
        return await self._repo_state.collect_dirty_paths(repo_root)

    async def checkpoint_dirty_worktree(
        self,
        repo_root: str | Path,
        *,
        message: str,
    ) -> DirtyWorktreeSnapshot | None:
        return await self._repo_state.checkpoint_dirty_worktree(repo_root, message=message)

    # ── Workspace lifecycle ────────────────────────────────────────────────

    async def prepare_workspace(
        self,
        *,
        run_id: uuid.UUID,
        repo_root: str | Path,
        base_ref: str,
    ) -> WorkspaceHandle:
        root = Path(repo_root).expanduser().resolve()
        workspace_root = self.resolve_workspace_root(root)
        workspace_root.mkdir(parents=True, exist_ok=True)
        workspace_path = (workspace_root / str(run_id)).resolve()

        from datetime import UTC, datetime
        timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S-%f")
        branch_name = f"sdd-run-{timestamp}-{str(run_id).replace('-', '')[:8]}"

        git_dir_marker = workspace_path / ".git"
        if workspace_path.exists() and git_dir_marker.exists():
            branch_result = await self._executor.run_git(
                workspace_path, "rev-parse", "--abbrev-ref", "HEAD"
            )
            existing_branch = branch_result.stdout.strip() or branch_name
            return WorkspaceHandle(
                path=workspace_path,
                branch=existing_branch,
                base_ref=base_ref,
                status=WorkspaceStatus.READY,
                created=False,
            )

        if workspace_path.exists() and any(workspace_path.iterdir()):
            raise TargetRepoWorkspaceError(f"Workspace path is not empty: {workspace_path}")

        await self._executor.run_git(
            root, "worktree", "add", "-b", branch_name, str(workspace_path), base_ref
        )
        return WorkspaceHandle(
            path=workspace_path,
            branch=branch_name,
            base_ref=base_ref,
            status=WorkspaceStatus.READY,
            created=True,
        )

    def resolve_workspace_root(self, target_repo_root: Path) -> Path:
        configured_root = Path(self._settings.ODIN_WORKSPACE_ROOT)
        if configured_root.is_absolute():
            candidate = configured_root
        else:
            candidate = (self._project_root / configured_root).resolve()

        if self._is_within(candidate, target_repo_root):
            relocated = (target_repo_root.parent / f".{target_repo_root.name}-sdd-workspaces").resolve()
            relocated.mkdir(parents=True, exist_ok=True)
            return relocated
        candidate.mkdir(parents=True, exist_ok=True)
        return candidate

    async def cleanup_workspace(self, workspace_path: str | Path) -> None:
        workspace = Path(workspace_path).resolve()
        if not workspace.exists():
            return
        try:
            try:
                await self._executor.run_git(workspace, "fsmonitor--daemon", "stop")
            except TargetRepoWorkspaceError:
                pass
            parent_repo = await self._resolve_parent_repo_for_workspace(workspace)
            if parent_repo is not None:
                await self._executor.run_git(
                    parent_repo, "worktree", "remove", "--force", str(workspace)
                )
            else:
                shutil.rmtree(workspace, ignore_errors=True)
        except TargetRepoWorkspaceError:
            if workspace.exists():
                shutil.rmtree(workspace, ignore_errors=True)

    # ── Diff / change inspection ───────────────────────────────────────────

    async def read_diff(self, workspace_path: str | Path) -> str:
        return await self._diff_analyzer.read_diff(workspace_path)

    async def list_changed_files(self, workspace_path: str | Path) -> list[str]:
        return await self._diff_analyzer.list_changed_files(workspace_path)

    async def read_diff_stats(self, workspace_path: str | Path) -> DiffStatsSnapshot:
        return await self._diff_analyzer.read_diff_stats(workspace_path)

    # ── Checkpoint / commit ────────────────────────────────────────────────

    async def create_checkpoint(self, workspace_path: str | Path, tag: str) -> str:
        return await self._checkpoint_mgr.create_checkpoint(workspace_path, tag)

    async def rollback_to_checkpoint(self, workspace_path: str | Path, tag: str) -> None:
        await self._checkpoint_mgr.rollback_to_checkpoint(workspace_path, tag)

    async def commit_changes(self, workspace_path: str | Path, message: str) -> str:
        return await self._checkpoint_mgr.commit_changes(workspace_path, message)

    # ── Sync ──────────────────────────────────────────────────────────────

    async def sync_workspace_to_repo(
        self,
        *,
        workspace_path: str | Path,
        repo_root: str | Path,
        base_ref: str,
    ) -> WorkspaceSyncResult:
        return await self._synchronizer.sync(
            workspace_path=workspace_path,
            repo_root=repo_root,
            base_ref=base_ref,
        )

    # ── Private helpers ────────────────────────────────────────────────────

    async def _resolve_parent_repo_for_workspace(self, workspace: Path) -> Path | None:
        try:
            result = await self._executor.run_git(workspace, "rev-parse", "--git-common-dir")
            raw_common_dir = result.stdout.strip()
            if raw_common_dir:
                common_dir = Path(raw_common_dir)
                if not common_dir.is_absolute():
                    common_dir = (workspace / common_dir).resolve()
                repo_root = common_dir.parent if common_dir.name == ".git" else common_dir
                if (repo_root / ".git").exists():
                    return repo_root
        except TargetRepoWorkspaceError:
            pass

        parent_repo = workspace.parent
        while parent_repo.exists() and not (parent_repo / ".git").exists():
            next_parent = parent_repo.parent
            if next_parent == parent_repo:
                return None
            parent_repo = next_parent
        if (parent_repo / ".git").exists():
            return parent_repo
        return None

    @staticmethod
    def _is_within(candidate: Path, target_repo_root: Path) -> bool:
        try:
            candidate.relative_to(target_repo_root)
            return True
        except ValueError:
            return False
