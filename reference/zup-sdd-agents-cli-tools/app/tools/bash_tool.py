"""BashTool validado e seguro.

Baseado em: Odin_Tools_CLI/BashTool/
Recursos:
- Validação de comandos destrutivos
- Parsing de comandos
- Timeout robusto
- Sandbox opcional por diretórios permitidos
- Detecção de comandos perigosos
"""

from __future__ import annotations

import asyncio
import os
import re
import shlex
import signal
import subprocess
import time
from contextlib import suppress
from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Awaitable, Callable, Optional

from app.core.container_sandbox import (
    ContainerExecutionResult,
    ContainerSandboxConfig,
    ContainerSandboxExecutor,
    ContainerSandboxUnavailable,
)
from app.core.sandbox import Sandbox, SandboxConfig

logger = logging.getLogger(__name__)


@dataclass
class BashToolResult:
    """Resultado da execução de comando bash."""

    stdout: str
    stderr: str
    exit_code: int
    command: str
    duration_ms: int
    cwd: Path
    timed_out: bool = False
    was_destructive: bool = False
    containerized: bool = False
    container_image: str | None = None
    sandbox_profile: str | None = None


class DestructiveCommandError(Exception):
    """Levantado quando comando destrutivo é detectado."""


class BashTool:
    """Tool para execução segura de comandos bash.

    Validações implementadas:
    1. Detecção de comandos destrutivos
    2. Timeout configurável
    3. Working directory restrito
    4. Logging completo
    5. Parsing de comandos perigosos
    """

    DESTRUCTIVE_PATTERNS = [
        r"\brm\s+-rf\s+/",
        r"\brm\s+-rf\s+\*",
        r"\brm\s+-rf\s+~(?:/|\s|$)",
        r"\bgit\s+reset\s+--hard\b",
        r"\bgit\s+push\s+--force\b",
        r"\bgit\s+push\s+-f\b",
        r"\bDROP\s+TABLE\b",
        r"\bDELETE\s+FROM\b(?!.*\bWHERE\b)",
        r">\s*/dev/sd[a-z]",
        r"\bmkfs(?:\.[a-z0-9]+)?\b",
        r"\bdd\s+if=/dev/zero\s+of=/dev/",
        r":\(\)\s*\{\s*:\|:&\s*\};:",
        r"\b(shutdown|reboot|poweroff|halt)\b",
    ]

    DANGEROUS_SHELL_PATTERNS = [
        (re.compile(r"\$\(", re.IGNORECASE), "command substitution"),
        (re.compile(r"`[^`]+`", re.IGNORECASE), "backtick command substitution"),
        (re.compile(r"<\(|>\(", re.IGNORECASE), "process substitution"),
        (re.compile(r"(?:^|[\s;&|])=[a-zA-Z_]", re.IGNORECASE), "zsh equals expansion"),
        (re.compile(r"\bzmodload\b|\bemulate\s+-c\b|\bztcp\b", re.IGNORECASE), "dangerous zsh primitive"),
    ]

    def __init__(
        self,
        *,
        default_timeout_ms: int = 30000,
        allow_destructive: bool = False,
        sandbox_enabled: bool = False,
        allowed_paths: Optional[list[Path]] = None,
        sandbox: Sandbox | None = None,
        container_enabled: bool = False,
        container_config: ContainerSandboxConfig | None = None,
        container_executor: ContainerSandboxExecutor | None = None,
    ):
        """Inicializa BashTool.

        Args:
            default_timeout_ms: Timeout padrão em ms
            allow_destructive: Se True, permite comandos destrutivos
            sandbox_enabled: Se True, habilita sandbox por path
            allowed_paths: Paths permitidos quando sandbox_enabled=True
            sandbox: Sandbox robusto opcional
            container_enabled: Se True, executa comandos via Docker
            container_config: Configuracao opcional do sandbox Docker
            container_executor: Executor Docker opcional (util para testes)
        """
        self.default_timeout_ms = default_timeout_ms
        self.allow_destructive = allow_destructive
        self.sandbox_enabled = sandbox_enabled
        self.allowed_paths = [path.expanduser().resolve() for path in (allowed_paths or [])]
        self.sandbox = sandbox
        self.container_enabled = container_enabled
        self.container_config = container_config or ContainerSandboxConfig(enabled=container_enabled)
        if self.container_enabled and not self.container_config.enabled:
            self.container_config = ContainerSandboxConfig(
                enabled=True,
                docker_binary=self.container_config.docker_binary,
                image=self.container_config.image,
                network=self.container_config.network,
                cpus=self.container_config.cpus,
                memory=self.container_config.memory,
                memory_swap=self.container_config.memory_swap,
                pids_limit=self.container_config.pids_limit,
                tmpfs_size_mb=self.container_config.tmpfs_size_mb,
                disk_size_mb=self.container_config.disk_size_mb,
                read_only_rootfs=self.container_config.read_only_rootfs,
                clean_environment=self.container_config.clean_environment,
                user=self.container_config.user,
                pull_policy=self.container_config.pull_policy,
                image_cache_enabled=self.container_config.image_cache_enabled,
                workdir=self.container_config.workdir,
            )
        self.container_executor = container_executor or (
            ContainerSandboxExecutor(self.container_config) if self.container_enabled else None
        )
        if self.sandbox is None and sandbox_enabled and self.allowed_paths:
            self.sandbox = Sandbox(
                SandboxConfig(
                    enabled=True,
                    allowed_read_paths=list(self.allowed_paths),
                    allowed_write_paths=list(self.allowed_paths),
                    max_process_time_seconds=max(1, default_timeout_ms // 1000),
                    deny_destructive_commands=not allow_destructive,
                )
            )

    def _is_destructive_command(self, command: str) -> bool:
        """Verifica se comando é destrutivo.

        Args:
            command: Comando a validar

        Returns:
            True se destrutivo
        """
        for pattern in self.DESTRUCTIVE_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                logger.warning("Destructive command detected: %s", command)
                return True
        return False

    def _validate_command(self, command: str, cwd: Path) -> None:
        """Valida comando antes de executar.

        Args:
            command: Comando a validar
            cwd: Working directory

        Raises:
            DestructiveCommandError: Se comando destrutivo e não permitido
            ValueError: Se validação falhar
        """
        if not command.strip():
            raise ValueError("Empty command")
        if not cwd.exists() or not cwd.is_dir():
            raise ValueError(f"Invalid working directory: {cwd}")
        if "\x00" in command:
            raise ValueError("Command contains NUL byte")

        if self.sandbox_enabled:
            self._validate_cwd_allowed(cwd)
        if self.sandbox is not None:
            self.sandbox.validate_command(command, cwd=cwd)

        for pattern, reason in self.DANGEROUS_SHELL_PATTERNS:
            if pattern.search(command):
                raise ValueError(f"Unsafe shell pattern blocked ({reason})")

        if self._is_destructive_command(command) and not self.allow_destructive:
            raise DestructiveCommandError(
                f"Destructive command blocked: {command}\n"
                "Set allow_destructive=True to override."
            )

    def _validate_cwd_allowed(self, cwd: Path) -> None:
        """Garante que cwd está dentro de um allowed_path configurado."""
        if not self.allowed_paths:
            raise ValueError("Sandbox enabled without allowed_paths")
        resolved_cwd = cwd.expanduser().resolve()
        for allowed_path in self.allowed_paths:
            with suppress(ValueError):
                resolved_cwd.relative_to(allowed_path)
                return
        raise ValueError(f"Working directory outside sandbox: {cwd}")

    async def execute(
        self,
        command: str,
        *,
        timeout_ms: Optional[int] = None,
        cwd: Optional[Path] = None,
    ) -> BashToolResult:
        """Executa comando bash com validações.

        Args:
            command: Comando a executar
            timeout_ms: Timeout em ms (usa default se None)
            cwd: Working directory (usa contexto se None)

        Returns:
            Resultado da execução
        """
        start_time = time.time()
        if cwd is None:
            cwd = self._context_working_directory() or Path.cwd()
        cwd = cwd.expanduser().resolve()

        self._validate_command(command, cwd)
        is_destructive = self._is_destructive_command(command)
        timeout_seconds = max(1, (timeout_ms or self.default_timeout_ms) / 1000)

        if self.container_enabled:
            return await self._execute_in_container(
                command,
                cwd=cwd,
                timeout_seconds=timeout_seconds,
                is_destructive=is_destructive,
            )

        process: asyncio.subprocess.Process | None = None
        try:
            shell_args = self._resolve_shell_exec_args(command)
            if os.name == "nt":
                process = await asyncio.create_subprocess_exec(
                    *shell_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(cwd),
                    creationflags=self._windows_process_group_flag(),
                )
            else:
                process = await asyncio.create_subprocess_exec(
                    *shell_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(cwd),
                    start_new_session=True,
                )

            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout_seconds,
            )
            duration_ms = int((time.time() - start_time) * 1000)
            result = BashToolResult(
                stdout=stdout_bytes.decode("utf-8", errors="replace"),
                stderr=stderr_bytes.decode("utf-8", errors="replace"),
                exit_code=process.returncode or 0,
                command=command,
                duration_ms=duration_ms,
                cwd=cwd,
                timed_out=False,
                was_destructive=is_destructive,
            )
            logger.info(
                "Bash command executed: %s (exit=%s, duration=%sms)",
                command[:80],
                result.exit_code,
                duration_ms,
            )
            return result

        except asyncio.TimeoutError:
            if process is not None:
                await self._terminate_process_tree(process)
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error("Bash command timed out after %ss: %s", timeout_seconds, command[:80])
            return BashToolResult(
                stdout="",
                stderr=f"Command timed out after {timeout_seconds}s",
                exit_code=124,
                command=command,
                duration_ms=duration_ms,
                cwd=cwd,
                timed_out=True,
                was_destructive=is_destructive,
            )

    async def execute_streaming(
        self,
        command: str,
        *,
        timeout_ms: Optional[int] = None,
        cwd: Optional[Path] = None,
        tail_chars: int = 4000,
        output_callback: Callable[[str], Awaitable[None]] | None = None,
    ) -> BashToolResult:
        """Executa comando bash validado emitindo chunks parciais.

        Args:
            command: Comando a executar
            timeout_ms: Timeout em ms (usa default se None)
            cwd: Working directory (usa contexto se None)
            tail_chars: Número máximo de caracteres mantidos por stream
            output_callback: Callback opcional para cada chunk de stdout/stderr

        Returns:
            Resultado com tails de stdout/stderr
        """
        import codecs

        start_time = time.time()
        if cwd is None:
            cwd = self._context_working_directory() or Path.cwd()
        cwd = cwd.expanduser().resolve()

        self._validate_command(command, cwd)
        is_destructive = self._is_destructive_command(command)
        timeout_seconds = max(1, (timeout_ms or self.default_timeout_ms) / 1000)

        if self.container_enabled:
            return await self._execute_in_container(
                command,
                cwd=cwd,
                timeout_seconds=timeout_seconds,
                is_destructive=is_destructive,
                tail_chars=tail_chars,
                output_callback=output_callback,
            )

        process: asyncio.subprocess.Process | None = None
        stdout_tail = ""
        stderr_tail = ""

        async def _pump(stream: asyncio.StreamReader | None, *, is_stderr: bool) -> None:
            nonlocal stdout_tail, stderr_tail
            if stream is None:
                return
            decoder = codecs.getincrementaldecoder("utf-8")("ignore")
            while True:
                chunk = await stream.read(4096)
                if not chunk:
                    break
                text = decoder.decode(chunk)
                if not text:
                    continue
                if is_stderr:
                    stderr_tail = self._append_tail(stderr_tail, text, tail_chars)
                else:
                    stdout_tail = self._append_tail(stdout_tail, text, tail_chars)
                if output_callback is not None:
                    await output_callback(text)
            final_text = decoder.decode(b"", final=True)
            if final_text:
                if is_stderr:
                    stderr_tail = self._append_tail(stderr_tail, final_text, tail_chars)
                else:
                    stdout_tail = self._append_tail(stdout_tail, final_text, tail_chars)
                if output_callback is not None:
                    await output_callback(final_text)

        try:
            shell_args = self._resolve_shell_exec_args(command)
            if os.name == "nt":
                process = await asyncio.create_subprocess_exec(
                    *shell_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(cwd),
                    creationflags=self._windows_process_group_flag(),
                )
            else:
                process = await asyncio.create_subprocess_exec(
                    *shell_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(cwd),
                    start_new_session=True,
                )
            stdout_task = asyncio.create_task(_pump(process.stdout, is_stderr=False))
            stderr_task = asyncio.create_task(_pump(process.stderr, is_stderr=True))

            timed_out = False
            try:
                await asyncio.wait_for(process.wait(), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                timed_out = True
                await self._terminate_process_tree(process)

            await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
            duration_ms = int((time.time() - start_time) * 1000)
            if timed_out:
                timeout_note = f"Command timed out after {timeout_seconds}s"
                stderr_tail = self._append_tail(stderr_tail, timeout_note, tail_chars)
                if output_callback is not None:
                    await output_callback(f"{timeout_note}\n")
                return BashToolResult(
                    stdout=stdout_tail,
                    stderr=stderr_tail,
                    exit_code=124,
                    command=command,
                    duration_ms=duration_ms,
                    cwd=cwd,
                    timed_out=True,
                    was_destructive=is_destructive,
                )

            return BashToolResult(
                stdout=stdout_tail,
                stderr=stderr_tail,
                exit_code=process.returncode or 0,
                command=command,
                duration_ms=duration_ms,
                cwd=cwd,
                timed_out=False,
                was_destructive=is_destructive,
            )
        except asyncio.TimeoutError:
            if process is not None:
                await self._terminate_process_tree(process)
            raise

    async def _execute_in_container(
        self,
        command: str,
        *,
        cwd: Path,
        timeout_seconds: float,
        is_destructive: bool,
        tail_chars: int | None = None,
        output_callback: Callable[[str], Awaitable[None]] | None = None,
    ) -> BashToolResult:
        """Executa comando no Docker mantendo o contrato do BashTool."""
        start_time = time.time()
        if self.container_executor is None:
            return BashToolResult(
                stdout="",
                stderr="Container sandbox is enabled but no executor was configured",
                exit_code=125,
                command=command,
                duration_ms=int((time.time() - start_time) * 1000),
                cwd=cwd,
                timed_out=False,
                was_destructive=is_destructive,
                containerized=True,
                container_image=self.container_config.image,
                sandbox_profile=self._container_sandbox_profile(),
            )

        try:
            result = await self.container_executor.execute(
                command,
                cwd=cwd,
                timeout_seconds=timeout_seconds,
                tail_chars=tail_chars,
                output_callback=output_callback,
            )
        except ContainerSandboxUnavailable as exc:
            logger.error("Container sandbox unavailable: %s", exc)
            return BashToolResult(
                stdout="",
                stderr=str(exc),
                exit_code=125,
                command=command,
                duration_ms=int((time.time() - start_time) * 1000),
                cwd=cwd,
                timed_out=False,
                was_destructive=is_destructive,
                containerized=True,
                container_image=self.container_config.image,
                sandbox_profile=self._container_sandbox_profile(),
            )

        return self._container_result_to_bash_result(
            result,
            command=command,
            cwd=cwd,
            is_destructive=is_destructive,
        )

    def _container_result_to_bash_result(
        self,
        result: ContainerExecutionResult,
        *,
        command: str,
        cwd: Path,
        is_destructive: bool,
    ) -> BashToolResult:
        return BashToolResult(
            stdout=result.stdout,
            stderr=result.stderr,
            exit_code=result.exit_code,
            command=command,
            duration_ms=result.duration_ms,
            cwd=cwd,
            timed_out=result.timed_out,
            was_destructive=is_destructive,
            containerized=True,
            container_image=result.image,
            sandbox_profile=self._container_sandbox_profile(),
        )

    def _container_sandbox_profile(self) -> str:
        return (
            f"docker:image={self.container_config.image};"
            f"network={self.container_config.network};"
            f"cpus={self.container_config.cpus};"
            f"memory={self.container_config.memory};"
            f"pids={self.container_config.pids_limit}"
        )

    @staticmethod
    def quote_arg(value: str) -> str:
        """Escapa um argumento shell de forma portável."""
        if os.name == "nt":
            return subprocess.list2cmdline([value])
        return shlex.quote(value)

    @staticmethod
    def _windows_process_group_flag() -> int:
        """Retorna flag de novo process group sem depender de stubs Windows."""
        return int(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))

    @staticmethod
    def _resolve_shell_exec_args(shell_command: str) -> tuple[str, ...]:
        """Resolve o shell real usado para executar comandos compostos."""
        if os.name == "nt":
            return ("cmd", "/d", "/s", "/c", shell_command)
        if Path("/bin/zsh").exists():
            return ("/bin/zsh", "-lc", shell_command)
        if Path("/bin/bash").exists():
            return ("/bin/bash", "-lc", shell_command)
        return ("/bin/sh", "-c", shell_command)

    @staticmethod
    def _append_tail(current: str, chunk: str, tail_chars: int) -> str:
        """Mantém apenas o tail configurado de uma stream textual."""
        if not chunk:
            return current
        if tail_chars <= 0:
            return ""
        merged = current + chunk
        if len(merged) > tail_chars:
            return merged[-tail_chars:]
        return merged

    @staticmethod
    def _context_working_directory() -> Path | None:
        """Resolve cwd do AgentContext sem acoplar import em tempo de módulo."""
        try:
            from app.core.agent_context import get_working_directory, get_workspace_path
        except Exception:
            return None
        return get_working_directory() or get_workspace_path()

    @staticmethod
    async def _terminate_process_tree(process: asyncio.subprocess.Process) -> None:
        """Encerra processo e filhos no mesmo grupo quando possível."""
        if process.returncode is not None:
            return
        if os.name == "nt":
            with suppress(ProcessLookupError):
                process.terminate()
            with suppress(asyncio.TimeoutError, ProcessLookupError):
                await asyncio.wait_for(process.wait(), timeout=2)
            if process.returncode is None:
                with suppress(ProcessLookupError):
                    process.kill()
                with suppress(asyncio.TimeoutError, ProcessLookupError):
                    await asyncio.wait_for(process.wait(), timeout=2)
            return

        with suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGTERM)
        with suppress(asyncio.TimeoutError, ProcessLookupError):
            await asyncio.wait_for(process.wait(), timeout=2)
        if process.returncode is None:
            with suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
            with suppress(asyncio.TimeoutError, ProcessLookupError):
                await asyncio.wait_for(process.wait(), timeout=2)
