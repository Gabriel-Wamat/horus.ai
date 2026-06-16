"""Diff analysis — reads diffs, changed files, and file-change statistics."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.core.secrets import redact_sensitive_text
from app.schemas.target_repo import DiffStatsSnapshot, FileChangeSnapshot
from app.services.target_repo.git_executor import GitCommandExecutor

FileChangeStatus = Literal["created", "modified", "deleted", "renamed", "binary", "unknown"]


@dataclass(slots=True)
class DiffAnalyzer:
    """Reads diff output and change statistics from a Git workspace."""

    executor: GitCommandExecutor

    async def read_diff(self, workspace_path: str | Path) -> str:
        result = await self.executor.run_git(
            Path(workspace_path).resolve(),
            "diff", "--no-ext-diff", "--relative", "HEAD",
        )
        return result.stdout

    async def list_changed_files(self, workspace_path: str | Path) -> list[str]:
        workspace = Path(workspace_path).resolve()
        result = await self.executor.run_git(workspace, "diff", "--name-only", "--relative", "HEAD")
        changed = [line for line in result.stdout.splitlines() if line.strip()]
        untracked = await self._list_untracked_files(workspace)
        return sorted(set(changed + untracked))

    async def read_diff_stats(self, workspace_path: str | Path) -> DiffStatsSnapshot:
        workspace = Path(workspace_path).resolve()
        result = await self.executor.run_git(workspace, "diff", "--numstat", "--relative", "HEAD")
        status_result = await self.executor.run_git(
            workspace, "diff", "--name-status", "--relative", "HEAD"
        )
        status_by_path = {
            **await self._read_porcelain_status(workspace),
            **self._parse_name_status(status_result.stdout),
        }
        changed_paths: list[str] = []
        insertions = 0
        deletions = 0
        file_changes: list[FileChangeSnapshot] = []

        for line in result.stdout.splitlines():
            if not line.strip():
                continue
            parts = line.split("\t", maxsplit=2)
            if len(parts) != 3:
                continue
            raw_insertions, raw_deletions, path = parts
            changed_paths.append(path)
            path_insertions = int(raw_insertions) if raw_insertions.isdigit() else 0
            path_deletions = int(raw_deletions) if raw_deletions.isdigit() else 0
            if raw_insertions.isdigit():
                insertions += path_insertions
            if raw_deletions.isdigit():
                deletions += path_deletions
            file_status: FileChangeStatus = status_by_path.get(
                path,
                "binary" if raw_insertions == "-" or raw_deletions == "-" else "modified",
            )
            file_changes.append(FileChangeSnapshot(
                path=path,
                status=file_status,
                insertions=path_insertions,
                deletions=path_deletions,
                preview=await self._read_file_diff_preview(workspace, path),
                language=self._infer_language(path),
            ))

        untracked_paths = [
            path
            for path, status in status_by_path.items()
            if status == "created" and path not in set(changed_paths)
        ]
        for path in sorted(untracked_paths):
            file_insertions, preview = self._read_untracked_file_preview(workspace, path)
            changed_paths.append(path)
            insertions += file_insertions
            file_changes.append(FileChangeSnapshot(
                path=path,
                status="created",
                insertions=file_insertions,
                deletions=0,
                preview=preview,
                language=self._infer_language(path),
            ))

        return DiffStatsSnapshot(
            files_changed=len(changed_paths),
            insertions=insertions,
            deletions=deletions,
            changed_paths=changed_paths,
            file_changes=file_changes,
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _list_untracked_files(self, workspace: Path) -> list[str]:
        status_by_path = await self._read_porcelain_status(workspace)
        return [path for path, status in status_by_path.items() if status == "created"]

    async def _read_porcelain_status(self, workspace: Path) -> dict[str, FileChangeStatus]:
        result = await self.executor.run_git(
            workspace, "status", "--porcelain", "--untracked-files=all"
        )
        status_by_path: dict[str, FileChangeStatus] = {}
        for line in result.stdout.splitlines():
            if len(line) < 4:
                continue
            status_code = line[:2]
            raw_path = line[3:].strip()
            if not raw_path:
                continue
            path = raw_path.split(" -> ")[-1].strip()
            status_by_path[path] = self._normalize_porcelain_status(status_code)
        return status_by_path

    @staticmethod
    def _parse_name_status(raw_status: str) -> dict[str, FileChangeStatus]:
        status_by_path: dict[str, FileChangeStatus] = {}
        for line in raw_status.splitlines():
            if not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            status_code = parts[0].strip()
            path = parts[-1].strip()
            status_by_path[path] = DiffAnalyzer._normalize_git_status(status_code)
        return status_by_path

    @staticmethod
    def _normalize_git_status(status_code: str) -> FileChangeStatus:
        if status_code.startswith("A"):
            return "created"
        if status_code.startswith("D"):
            return "deleted"
        if status_code.startswith("R"):
            return "renamed"
        if status_code.startswith("M"):
            return "modified"
        return "unknown"

    @staticmethod
    def _normalize_porcelain_status(status_code: str) -> FileChangeStatus:
        if status_code == "??":
            return "created"
        if "D" in status_code:
            return "deleted"
        if "A" in status_code:
            return "created"
        if "R" in status_code:
            return "renamed"
        if "M" in status_code:
            return "modified"
        return "unknown"

    async def _read_file_diff_preview(self, workspace: Path, path: str) -> str | None:
        result = await self.executor.run_git(
            workspace, "diff", "--no-ext-diff", "--unified=3", "--relative", "HEAD", "--", path
        )
        preview_lines = [
            line
            for line in result.stdout.splitlines()
            if not line.startswith("diff --git ") and not line.startswith("index ")
        ]
        if not preview_lines:
            return None
        preview = "\n".join(preview_lines[:120]).strip()
        if len(preview) > 8000:
            preview = f"{preview[:8000].rstrip()}\n..."
        return redact_sensitive_text(preview) or None

    @staticmethod
    def _read_untracked_file_preview(workspace: Path, path: str) -> tuple[int, str | None]:
        file_path = (workspace / path).resolve()
        try:
            file_path.relative_to(workspace)
        except ValueError:
            return 0, None
        if not file_path.exists() or not file_path.is_file():
            return 0, None
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return 0, None
        lines = content.splitlines()
        insertions = len(lines)
        preview_lines = [
            "new file mode 100644",
            "--- /dev/null",
            f"+++ b/{path}",
            f"@@ -0,0 +1,{insertions} @@",
            *[f"+{line}" for line in lines[:116]],
        ]
        if len(lines) > 116:
            preview_lines.append("+...")
        preview = "\n".join(preview_lines)
        if len(preview) > 8000:
            preview = f"{preview[:8000].rstrip()}\n..."
        return insertions, redact_sensitive_text(preview)

    @staticmethod
    def _infer_language(path: str) -> str | None:
        suffix = Path(path).suffix.lower().lstrip(".")
        if not suffix:
            return None
        aliases = {
            "py": "python", "ts": "typescript", "tsx": "tsx",
            "js": "javascript", "jsx": "jsx", "json": "json",
            "md": "markdown", "mmd": "mermaid",
            "yml": "yaml", "yaml": "yaml", "toml": "toml",
            "css": "css", "html": "html",
        }
        return aliases.get(suffix, suffix)


__all__ = ["DiffAnalyzer", "FileChangeStatus"]
