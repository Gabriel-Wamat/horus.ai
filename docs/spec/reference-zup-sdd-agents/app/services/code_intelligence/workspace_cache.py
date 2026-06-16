"""Cached workspace discovery with git-aware invalidation."""
from __future__ import annotations

import hashlib
import os
import subprocess
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from time import time

from app.core.logging import get_logger

logger = get_logger(__name__)

_DEFAULT_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs"}
_DEFAULT_IGNORE_DIRS = {
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


@dataclass(frozen=True)
class WorkspaceSnapshot:
    """Cached snapshot of source files discovered in a workspace."""

    workspace_root: str
    content_hash: str
    discovered_files: list[str]
    cache_timestamp: float
    git_head: str | None


class WorkspaceCacheService:
    """Cache source-file discovery with bounded memory and safe invalidation."""

    def __init__(
        self,
        ttl_seconds: float = 300.0,
        *,
        max_workspaces: int = 64,
        extensions: set[str] | None = None,
        ignore_dirs: set[str] | None = None,
    ) -> None:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be > 0")
        if max_workspaces < 1:
            raise ValueError("max_workspaces must be >= 1")
        self._cache: OrderedDict[str, WorkspaceSnapshot] = OrderedDict()
        self._recent_hashes: dict[str, tuple[float, str]] = {}
        self._ttl_seconds = ttl_seconds
        self._max_workspaces = max_workspaces
        self._extensions = extensions or _DEFAULT_EXTENSIONS
        self._ignore_dirs = ignore_dirs or _DEFAULT_IGNORE_DIRS

    def get_files(self, workspace_root: Path) -> list[str] | None:
        """Return cached files when the workspace snapshot is still valid."""
        workspace = workspace_root.resolve()
        key = str(workspace)
        cached = self._cache.get(key)
        if cached is None:
            logger.debug("workspace_cache_miss workspace=%s", key)
            return None

        age = time() - cached.cache_timestamp
        if age > self._ttl_seconds:
            logger.debug("workspace_cache_expired workspace=%s age=%.1fs", key, age)
            self._cache.pop(key, None)
            return None

        current_hash = self._compute_content_hash(workspace)
        self._recent_hashes[key] = (time(), current_hash)
        if current_hash != cached.content_hash:
            logger.debug("workspace_cache_invalidated workspace=%s reason=content_changed", key)
            self._cache.pop(key, None)
            return None

        self._cache.move_to_end(key)
        logger.debug("workspace_cache_hit workspace=%s files=%d", key, len(cached.discovered_files))
        return list(cached.discovered_files)

    def put_files(self, workspace_root: Path, files: list[str]) -> None:
        """Cache discovered files using the current workspace fingerprint."""
        workspace = workspace_root.resolve()
        key = str(workspace)
        self._cache[key] = WorkspaceSnapshot(
            workspace_root=key,
            content_hash=self._compute_content_hash(workspace),
            discovered_files=list(files),
            cache_timestamp=time(),
            git_head=self._get_git_head(workspace),
        )
        self._recent_hashes[key] = (time(), self._cache[key].content_hash)
        self._cache.move_to_end(key)
        while len(self._cache) > self._max_workspaces:
            evicted_key, _ = self._cache.popitem(last=False)
            logger.debug("workspace_cache_evicted workspace=%s", evicted_key)
        logger.debug("workspace_cache_stored workspace=%s files=%d", key, len(files))

    def content_hash(self, workspace_root: Path, *, max_age_seconds: float = 1.0) -> str:
        """Return the current workspace fingerprint used for cache invalidation."""
        workspace = workspace_root.resolve()
        key = str(workspace)
        now = time()
        cached = self._recent_hashes.get(key)
        if cached is not None and now - cached[0] <= max_age_seconds:
            return cached[1]
        value = self._compute_content_hash(workspace)
        self._recent_hashes[key] = (now, value)
        return value

    def invalidate(self, workspace_root: Path | None = None) -> None:
        """Invalidate one workspace or clear every cached snapshot."""
        if workspace_root is None:
            self._cache.clear()
            self._recent_hashes.clear()
            logger.debug("workspace_cache_cleared_all")
            return
        key = str(workspace_root.resolve())
        if self._cache.pop(key, None) is not None:
            logger.debug("workspace_cache_cleared workspace=%s", key)
        self._recent_hashes.pop(key, None)

    def _compute_content_hash(self, workspace: Path) -> str:
        """Hash the source-visible workspace state without reading file contents."""
        components: list[str] = []
        git_head = self._get_git_head(workspace)
        if git_head:
            components.append(f"git:{git_head}")
            status_hash = self._get_git_status_fingerprint(workspace)
            if status_hash:
                components.append(f"status:{status_hash}")
        else:
            components.append("nogit")
            components.extend(self._iter_file_fingerprints(workspace))

        payload = "\n".join(components)
        return hashlib.sha256(payload.encode("utf-8", errors="ignore")).hexdigest()[:16]

    def _get_git_head(self, workspace: Path) -> str | None:
        """Return git HEAD hash when workspace belongs to a git repository."""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=workspace,
                capture_output=True,
                text=True,
                timeout=2.0,
                check=False,
            )
        except Exception:
            return None
        if result.returncode != 0:
            return None
        return result.stdout.strip() or None

    def _get_git_status_fingerprint(self, workspace: Path) -> str | None:
        """Return a fingerprint for modified/untracked git files."""
        try:
            result = subprocess.run(
                ["git", "status", "--porcelain=v1", "-z"],
                cwd=workspace,
                capture_output=True,
                text=False,
                timeout=2.0,
                check=False,
            )
        except Exception:
            return None
        if result.returncode != 0 or not result.stdout:
            return None

        parts: list[str] = [result.stdout.decode("utf-8", errors="ignore")]
        for record in result.stdout.decode("utf-8", errors="ignore").split("\0"):
            if not record.strip() or len(record) < 4:
                continue
            candidate = record[3:].strip()
            if " -> " in candidate:
                candidate = candidate.rsplit(" -> ", 1)[-1]
            path = workspace / candidate
            if path.exists() and path.is_file():
                try:
                    stat = path.stat()
                except OSError:
                    continue
                parts.append(f"{candidate}:{stat.st_mtime_ns}:{stat.st_size}")
        return hashlib.sha256("\n".join(parts).encode("utf-8", errors="ignore")).hexdigest()[:12]

    def _iter_file_fingerprints(self, workspace: Path) -> list[str]:
        """Return sorted metadata fingerprints for supported files in non-git workspaces."""
        fingerprints: list[str] = []
        for dirpath, dirnames, filenames in os.walk(workspace):
            dirnames[:] = [name for name in dirnames if name not in self._ignore_dirs]
            base = Path(dirpath)
            for filename in filenames:
                path = base / filename
                if path.suffix.lower() not in self._extensions:
                    continue
                try:
                    relative = path.relative_to(workspace).as_posix()
                    stat = path.stat()
                except OSError:
                    continue
                fingerprints.append(f"{relative}:{stat.st_mtime_ns}:{stat.st_size}")
        return sorted(fingerprints)
