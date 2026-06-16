from __future__ import annotations

import asyncio
import base64
import binascii
import os
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable

from app.core.config import Settings
from app.core.container_sandbox import ContainerSandboxConfig
from app.core.secrets import redact_sensitive_text
from app.tools.bash_tool import BashTool, DestructiveCommandError
from app.schemas.target_repo import (
    CommandRequest,
    SddTargetConfig,
    SpecialistExecutionPlan,
    WorkspaceContextSnapshot,
    WorkspaceFileSnapshot,
)


class TargetRepoExecutionError(ValueError):
    pass


@dataclass(slots=True)
class CommandExecutionResult:
    command_id: str
    command: str
    cwd: str
    exit_code: int
    stdout_tail: str
    stderr_tail: str
    """Tail of stderr output.

    **PTY mode** (ODIN_ENABLE_TTY_COMMAND_STREAMING=True, non-Windows):
        stdout and stderr are merged into a single PTY stream. All output is
        captured in ``stdout_tail``; ``stderr_tail`` is always an empty string
        for normal exits. On timeout it contains the timeout notice.
        Callers that need to detect errors must inspect ``stdout_tail``.

    **Pipes mode** (ODIN_ENABLE_TTY_COMMAND_STREAMING=False, or Windows):
        stdout and stderr are captured separately as expected.
    """
    started_at: datetime
    finished_at: datetime
    containerized: bool = False
    container_image: str | None = None
    sandbox_profile: str | None = None


CommandOutputCallback = Callable[[str], Awaitable[None]] | None
CommandStartedCallback = Callable[[str, str], Awaitable[None]] | None


class TargetRepoExecutionService:
    FORBIDDEN_COMMAND_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
        (re.compile(r"\brm\s+-rf\s+/(?:\s|$)", re.IGNORECASE), "destructive root wipe"),
        (re.compile(r"\brm\s+-rf\s+~(?:/|\s|$)", re.IGNORECASE), "destructive home wipe"),
        (re.compile(r"\bmkfs(?:\.[a-z0-9]+)?\b", re.IGNORECASE), "filesystem formatting"),
        (re.compile(r"\bdd\s+if=/dev/zero\s+of=/dev/", re.IGNORECASE), "raw disk overwrite"),
        (re.compile(r":\(\)\s*\{\s*:\|:&\s*\};:", re.IGNORECASE), "fork bomb"),
        (re.compile(r"\b(shutdown|reboot|poweroff|halt)\b", re.IGNORECASE), "host shutdown/reboot"),
        (re.compile(r"\b(curl|wget|nc|netcat|scp|sftp)\b", re.IGNORECASE), "network transfer"),
    )

    def __init__(self, *, settings: Settings):
        self._settings = settings

    def build_workspace_context(self, workspace_root: str | Path, config: SddTargetConfig) -> WorkspaceContextSnapshot:
        root = Path(workspace_root).resolve()
        tree: list[str] = []
        files: list[WorkspaceFileSnapshot] = []
        total_bytes = 0

        for write_root in config.write_roots:
            candidate_root = (root / write_root).resolve()
            if not candidate_root.exists():
                continue
            for file_path in sorted(path for path in candidate_root.rglob("*") if path.is_file()):
                relative_path = file_path.relative_to(root).as_posix()
                tree.append(relative_path)
                if len(files) >= self._settings.ODIN_MAX_WORKSPACE_CONTEXT_FILES:
                    continue
                try:
                    content = file_path.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue
                size_bytes = len(content.encode("utf-8"))
                if total_bytes + size_bytes > self._settings.ODIN_MAX_WORKSPACE_CONTEXT_BYTES:
                    continue
                files.append(
                    WorkspaceFileSnapshot(
                        path=relative_path,
                        content=content,
                        size_bytes=size_bytes,
                    )
                )
                total_bytes += size_bytes

        return WorkspaceContextSnapshot(
            root=str(root),
            tree=sorted(set(tree)),
            files=files,
            command_catalog={
                command_id: redact_sensitive_text(command)
                for command_id, command in config.command_catalog.items()
            },
            write_roots=list(config.write_roots),
        )

    def validate_plan(
        self,
        *,
        role_name: str,
        plan: SpecialistExecutionPlan,
        config: SddTargetConfig,
        workspace_root: str | Path,
    ) -> None:
        root = Path(workspace_root).resolve()
        role_profile = config.role_profiles.get(role_name)
        if role_profile is None:
            raise TargetRepoExecutionError(f"Missing role profile for {role_name}")

        for operation in plan.file_operations:
            target_path = self.resolve_target_path(root, operation.path)
            if self._is_git_metadata(target_path, root):
                raise TargetRepoExecutionError(f"Refusing to edit git metadata: {operation.path}")
            if not self._path_is_writable(target_path, root, config.write_roots):
                raise TargetRepoExecutionError(
                    f"File operation for {operation.path} is outside write_roots for {role_name}"
                )
            if operation.operation == "write":
                has_text = operation.content is not None
                has_binary = operation.content_base64 is not None
                if has_text and has_binary:
                    raise TargetRepoExecutionError(
                        f"Write operation must use either content or content_base64 (not both): {operation.path}"
                    )
                if not has_text and not has_binary:
                    raise TargetRepoExecutionError(f"Write operation requires content for {operation.path}")
            if operation.operation == "delete" and operation.content not in {None, ""}:
                raise TargetRepoExecutionError(f"Delete operation must not send content for {operation.path}")
            if operation.operation == "delete" and operation.content_base64 not in {None, ""}:
                raise TargetRepoExecutionError(f"Delete operation must not send content_base64 for {operation.path}")

        for request in plan.command_requests:
            self._ensure_command_allowed(role_name, request.command_id, config)

        for command_id in plan.validation_commands:
            self._ensure_command_allowed(role_name, command_id, config)

    async def apply_file_operations(
        self,
        *,
        workspace_root: str | Path,
        plan: SpecialistExecutionPlan,
        config: SddTargetConfig,
    ) -> list[str]:
        root = Path(workspace_root).resolve()
        changed_files: list[str] = []
        for operation in plan.file_operations:
            target_path = self.resolve_target_path(root, operation.path)
            if self._is_git_metadata(target_path, root):
                raise TargetRepoExecutionError(f"Refusing to edit git metadata: {operation.path}")
            if not self._path_is_writable(target_path, root, config.write_roots):
                raise TargetRepoExecutionError(f"Refusing to write outside write_roots: {operation.path}")
            relative = target_path.relative_to(root).as_posix()
            if operation.operation == "write":
                target_path.parent.mkdir(parents=True, exist_ok=True)
                if operation.content_base64 is not None:
                    try:
                        decoded_bytes = base64.b64decode(operation.content_base64, validate=True)
                    except (binascii.Error, ValueError) as exc:
                        raise TargetRepoExecutionError(
                            f"Invalid base64 payload for {operation.path}"
                        ) from exc
                    target_path.write_bytes(decoded_bytes)
                else:
                    target_path.write_text(operation.content or "", encoding="utf-8")
                await self._mark_path_for_diff(root, relative)
                changed_files.append(relative)
            elif operation.operation == "delete":
                if target_path.exists():
                    target_path.unlink()
                    changed_files.append(relative)
            else:  # pragma: no cover - schema already restricts this
                raise TargetRepoExecutionError(f"Unsupported file operation: {operation.operation}")
        return sorted(set(changed_files))

    async def execute_named_command(
        self,
        *,
        workspace_root: str | Path,
        config: SddTargetConfig,
        command_id: str,
        output_callback: CommandOutputCallback = None,
    ) -> CommandExecutionResult:
        command = config.command_catalog.get(command_id)
        if command is None:
            raise TargetRepoExecutionError(f"Unknown command_id: {command_id}")

        workspace_path = Path(workspace_root).resolve()
        cwd = str(workspace_path)
        container_config = ContainerSandboxConfig.from_settings(self._settings)
        shell_command = self._normalize_shell_command(
            command,
            prefer_current_python=not container_config.enabled,
        )
        self._validate_command_safety(command_id=command_id, shell_command=shell_command, cwd=workspace_path)
        started_at = datetime.now(timezone.utc)
        tail = self._settings.ODIN_COMMAND_OUTPUT_TAIL_CHARS
        timeout_seconds = max(1, int(getattr(self._settings, "ODIN_COMMAND_TIMEOUT_SECONDS", 600)))

        async def _safe_output_callback(chunk: str) -> None:
            await self._emit_stream_chunk(output_callback, chunk)

        bash_result = await BashTool(
            default_timeout_ms=timeout_seconds * 1000,
            sandbox_enabled=True,
            allowed_paths=[workspace_path],
            container_enabled=container_config.enabled,
            container_config=container_config,
        ).execute_streaming(
            shell_command,
            timeout_ms=timeout_seconds * 1000,
            cwd=workspace_path,
            tail_chars=tail,
            output_callback=_safe_output_callback,
        )
        stdout_tail = bash_result.stdout
        stderr_tail = bash_result.stderr
        exit_code = bash_result.exit_code

        stdout_tail = redact_sensitive_text(stdout_tail)
        stderr_tail = redact_sensitive_text(stderr_tail)
        finished_at = datetime.now(timezone.utc)
        return CommandExecutionResult(
            command_id=command_id,
            command=redact_sensitive_text(shell_command),
            cwd=cwd,
            exit_code=exit_code,
            stdout_tail=stdout_tail,
            stderr_tail=stderr_tail,
            started_at=started_at,
            finished_at=finished_at,
            containerized=bash_result.containerized,
            container_image=bash_result.container_image,
            sandbox_profile=bash_result.sandbox_profile,
        )

    async def execute_command_requests(
        self,
        *,
        role_name: str,
        workspace_root: str | Path,
        config: SddTargetConfig,
        command_requests: list[CommandRequest],
        validation_commands: list[str],
        command_started_callback: CommandStartedCallback = None,
        command_output_callback: Callable[[str, str], Awaitable[None]] | None = None,
    ) -> list[CommandExecutionResult]:
        resolved_ids: list[str] = []
        for request in command_requests:
            self._ensure_command_allowed(role_name, request.command_id, config)
            resolved_ids.append(request.command_id)
        for command_id in validation_commands:
            self._ensure_command_allowed(role_name, command_id, config)
            resolved_ids.append(command_id)

        results: list[CommandExecutionResult] = []
        seen: set[str] = set()
        repaired_test_commands: set[str] = set()

        async def _execute_with_callbacks(command_id: str) -> CommandExecutionResult:
            shell_command = config.command_catalog.get(command_id)
            if shell_command is None:
                raise TargetRepoExecutionError(f"Unknown command_id: {command_id}")
            if command_started_callback is not None:
                await command_started_callback(command_id, shell_command)
            result = await self.execute_named_command(
                workspace_root=workspace_root,
                config=config,
                command_id=command_id,
                output_callback=self._build_output_callback(
                    command_id=command_id,
                    callback=command_output_callback,
                ),
            )
            if command_output_callback is not None:
                finalize_callback = getattr(command_output_callback, "finalize", None)
                if callable(finalize_callback):
                    await finalize_callback(command_id)
            return result

        for command_id in resolved_ids:
            if command_id in seen:
                continue
            seen.add(command_id)
            result = await _execute_with_callbacks(command_id)
            results.append(result)
            if not self._should_attempt_dependency_repair(
                role_name=role_name,
                command_id=command_id,
                result=result,
                config=config,
                already_repaired=command_id in repaired_test_commands,
            ):
                continue

            repair_command_ids = self._resolve_dependency_repair_command_ids(
                role_name=role_name,
                failed_command_id=command_id,
                failed_command=result.command,
                config=config,
            )
            if not repair_command_ids:
                continue

            for repair_command_id in repair_command_ids:
                repair_result = await _execute_with_callbacks(repair_command_id)
                results.append(repair_result)
                if repair_result.exit_code != 0:
                    break
            else:
                retried_result = await _execute_with_callbacks(command_id)
                results.append(retried_result)
                repaired_test_commands.add(command_id)
        return results

    @staticmethod
    def resolve_target_path(workspace_root: str | Path, relative_path: str) -> Path:
        root = Path(workspace_root).resolve()
        candidate = (root / relative_path).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise TargetRepoExecutionError(f"Path escapes workspace boundary: {relative_path}") from exc
        return candidate

    @staticmethod
    def _path_is_writable(path: Path, workspace_root: Path, write_roots: list[str]) -> bool:
        relative_path = path.relative_to(workspace_root)

        for raw_root in write_roots:
            normalized = raw_root.strip().strip("/")
            if normalized in {"", "."}:
                return True

            root_path = Path(normalized)
            try:
                relative_path.relative_to(root_path)
                return True
            except ValueError:
                continue

        return False

    @staticmethod
    def _is_git_metadata(path: Path, workspace_root: Path) -> bool:
        relative = path.relative_to(workspace_root).as_posix()
        return relative == ".git" or relative.startswith(".git/")

    @staticmethod
    def _ensure_command_allowed(role_name: str, command_id: str, config: SddTargetConfig) -> None:
        role_profile = config.role_profiles.get(role_name)
        if role_profile is None:
            raise TargetRepoExecutionError(f"Missing role profile for {role_name}")
        if command_id not in role_profile.allowed_commands:
            raise TargetRepoExecutionError(f"Command {command_id} is not allowed for {role_name}")
        if command_id not in config.command_catalog:
            raise TargetRepoExecutionError(f"Unknown command id in catalog: {command_id}")

    @staticmethod
    def _is_test_command(command_id: str, config: SddTargetConfig) -> bool:
        if command_id in config.test_runner_ids:
            return True
        command = config.command_catalog.get(command_id, "")
        normalized = f"{command_id} {command}".casefold()
        return any(token in normalized for token in ("pytest", "npm test", "pnpm test", "yarn test", "vitest", "jest"))

    @staticmethod
    def _looks_like_dependency_failure(result: CommandExecutionResult) -> bool:
        output = f"{result.stdout_tail}\n{result.stderr_tail}".casefold()
        dependency_patterns = (
            "no module named",
            "modulenotfounderror",
            "cannot find module",
            "err_module_not_found",
            "command not found",
            "npm err! code eresolve",
            "unable to resolve dependency tree",
            "could not resolve dependency",
            "missing module",
            "pytest: command not found",
        )
        return any(pattern in output for pattern in dependency_patterns)

    def _should_attempt_dependency_repair(
        self,
        *,
        role_name: str,
        command_id: str,
        result: CommandExecutionResult,
        config: SddTargetConfig,
        already_repaired: bool,
    ) -> bool:
        if result.exit_code == 0:
            return False
        if role_name != "qa_specialist":
            return False
        if already_repaired:
            return False
        if not self._is_test_command(command_id, config):
            return False
        return self._looks_like_dependency_failure(result)

    def _resolve_dependency_repair_command_ids(
        self,
        *,
        role_name: str,
        failed_command_id: str,
        failed_command: str,
        config: SddTargetConfig,
    ) -> list[str]:
        role_profile = config.role_profiles.get(role_name)
        allowed_commands = set(role_profile.allowed_commands if role_profile is not None else [])
        if not allowed_commands:
            return []

        candidates: list[str] = []
        stem = failed_command_id
        for prefix in ("test_", "run_", "build_", "check_", "lint_", "smoke_"):
            if stem.startswith(prefix):
                stem = stem[len(prefix) :]
                break
        parts = [part for part in stem.split("_") if part]
        for end in range(len(parts), 0, -1):
            candidate_stem = "_".join(parts[:end])
            for command_id in (f"install_{candidate_stem}_dependencies", f"setup_{candidate_stem}"):
                if command_id in allowed_commands and command_id in config.command_catalog:
                    candidates.append(command_id)

        generic_candidates = [
            command_id
            for command_id in allowed_commands
            if command_id in config.command_catalog and re.search(r"(install|setup).*(dep|package|requirements)", command_id)
        ]
        candidates.extend(sorted(generic_candidates))

        unique: list[str] = []
        seen: set[str] = set()
        for command_id in candidates:
            if command_id in seen:
                continue
            seen.add(command_id)
            unique.append(command_id)
        return unique

    @staticmethod
    def _normalize_shell_command(command: str, *, prefer_current_python: bool = True) -> str:
        if not prefer_current_python:
            return command
        python_executable = TargetRepoExecutionService._quote_shell_arg(sys.executable)
        pattern = re.compile(r"(?:(?<=^)|(?<=[\s;|&()]))python(?=(?:\s|$))")
        return pattern.sub(lambda _match: python_executable, command)

    @staticmethod
    def _quote_shell_arg(value: str) -> str:
        if os.name == "nt":
            return subprocess.list2cmdline([value])
        return shlex.quote(value)

    @classmethod
    def _validate_command_safety(cls, *, command_id: str, shell_command: str, cwd: Path | None = None) -> None:
        for pattern, reason in cls.FORBIDDEN_COMMAND_PATTERNS:
            if pattern.search(shell_command):
                raise TargetRepoExecutionError(
                    f"Command {command_id} rejected by safety policy ({reason})"
                )
        if cwd is not None:
            try:
                BashTool(
                    sandbox_enabled=True,
                    allowed_paths=[cwd],
                )._validate_command(shell_command, cwd)
            except (DestructiveCommandError, ValueError) as exc:
                raise TargetRepoExecutionError(
                    f"Command {command_id} rejected by validated BashTool policy: {exc}"
                ) from exc

    @staticmethod
    async def _emit_stream_chunk(output_callback: CommandOutputCallback, chunk: str) -> None:
        if output_callback is None or not chunk:
            return
        await output_callback(redact_sensitive_text(chunk))

    @staticmethod
    def _build_output_callback(
        *,
        command_id: str,
        callback: Callable[[str, str], Awaitable[None]] | None,
    ) -> CommandOutputCallback:
        if callback is None:
            return None

        async def _wrapped(chunk: str) -> None:
            await callback(command_id, chunk)

        return _wrapped

    @staticmethod
    async def _mark_path_for_diff(workspace_root: Path, relative_path: str) -> None:
        """Register a new file in git index so it shows up in git diff.

        Uses asyncio.to_thread to avoid blocking the event loop — this is called
        once per written file inside apply_file_operations, which runs in an async
        context (ToolRuntime.execute_plan → _specialist_runner repair loop).
        """
        cmd = ["git", "-C", str(workspace_root), "add", "--intent-to-add", relative_path]
        result = await asyncio.to_thread(
            subprocess.run,
            cmd,
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip() or result.stdout.strip()
            raise TargetRepoExecutionError(
                f"Unable to make {relative_path} visible in git diff: {stderr}"
            )
