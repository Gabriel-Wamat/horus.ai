"""Execution tools for running commands and tests."""

from __future__ import annotations

import asyncio
import os
import re
import shlex
import signal
import subprocess
import sys
from contextlib import suppress
from typing import Any

from langchain.tools import tool

from app.agent_runtime.agent_runtime import AgentRuntimeContext
from app.agent_runtime.tools.base import (
    resolve_allowed_shell_command,
    ToolExecutionError,
    ToolExecutionResult,
    ToolPermissionError,
    log_tool_execution,
    resolve_tool_context,
    resolve_workspace,
    validate_workspace_path,
)
from app.core.config import settings
from app.core.container_sandbox import ContainerSandboxConfig
from app.core.exceptions import ToolTimeoutError as CoreToolTimeoutError
from app.tools.bash_tool import BashTool, DestructiveCommandError

_DEFAULT_COMMAND_MAX_TIMEOUT_SECONDS = 600

# Pre-compiled forbidden patterns for exec_command (ReAct tool mode).
# Uses \b word boundaries to avoid false positives on substrings, e.g.:
#   - "format" would block clang-format / black --format / terraform fmt
#   - "nc " (with space) would not block bare `nc` or `nc\t`
#   - "curl" would block "scurl" or "recurly-cli"
# Keep in sync with TargetRepoExecutionService.FORBIDDEN_COMMAND_PATTERNS
# which guards the plan-execution (non-ReAct) path.
_EXEC_COMMAND_FORBIDDEN_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\brm\s+-rf\s+/(?:\s|$)", re.IGNORECASE), "destructive root wipe"),
    (re.compile(r"\brm\s+-rf\s+~(?:/|\s|$)", re.IGNORECASE), "destructive home wipe"),
    (re.compile(r":\(\)\s*\{\s*:\|:&\s*\};:", re.IGNORECASE), "fork bomb"),
    (re.compile(r"\bdd\s+if=/dev/zero\s+of=/dev/", re.IGNORECASE), "raw disk overwrite"),
    (re.compile(r"\bdd\s+if=", re.IGNORECASE), "dd read from device"),
    (re.compile(r"\bmkfs(?:\.[a-z0-9]+)?\b", re.IGNORECASE), "filesystem formatting"),
    (re.compile(r"\b(shutdown|reboot|poweroff|halt)\b", re.IGNORECASE), "host shutdown/reboot"),
    (re.compile(r">\s*/dev/", re.IGNORECASE), "write to device node"),
    (re.compile(r"\b(curl|wget|nc|netcat)\b", re.IGNORECASE), "network transfer"),
)


def _normalize_shell_command(command: str, *, prefer_current_python: bool = True) -> str:
    """Normalize portable shell commands before execution.

    In environments using python shims (asdf/pyenv), plain `python ...` may fail
    if no local version is pinned inside ephemeral workspaces. Replacing with the
    current interpreter keeps execution deterministic.
    """
    if not prefer_current_python:
        return command
    python_executable = _quote_shell_arg(sys.executable)
    pattern = re.compile(r"(?:(?<=^)|(?<=[\s;|&()]))python(?=(?:\s|$))")
    return pattern.sub(lambda _match: python_executable, command)


def _quote_shell_arg(value: str) -> str:
    if os.name == "nt":
        return subprocess.list2cmdline([value])
    return shlex.quote(value)


def _clamp_timeout(timeout: int | str | None, *, max_seconds: int = _DEFAULT_COMMAND_MAX_TIMEOUT_SECONDS) -> int:
    try:
        parsed = int(timeout) if timeout is not None else max_seconds
    except (TypeError, ValueError):
        parsed = max_seconds
    return min(max(1, parsed), max(1, max_seconds))


def _configured_max_timeout() -> int:
    try:
        from app.core.config import settings

        return int(getattr(settings, "ODIN_TOOL_COMMAND_MAX_TIMEOUT_SECONDS", _DEFAULT_COMMAND_MAX_TIMEOUT_SECONDS))
    except Exception:
        return _DEFAULT_COMMAND_MAX_TIMEOUT_SECONDS


def _container_sandbox_config() -> ContainerSandboxConfig:
    return ContainerSandboxConfig.from_settings(settings)


def _subprocess_kwargs() -> dict[str, Any]:
    if os.name == "nt":
        return {"creationflags": int(getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))}
    return {"start_new_session": True}


async def _terminate_process_tree(process: asyncio.subprocess.Process) -> None:
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


def _pick_allowed_test_command_id(candidate_ids: list[str]) -> str | None:
    if not candidate_ids:
        return None

    preferred_patterns = [
        re.compile(r"test", re.IGNORECASE),
        re.compile(r"validate|check|lint|unit|integration|e2e|qa", re.IGNORECASE),
    ]
    for pattern in preferred_patterns:
        for command_id in candidate_ids:
            if pattern.search(command_id):
                return command_id

    if len(candidate_ids) == 1:
        return candidate_ids[0]

    return None


def truncate_output(text: str, max_lines: int = 100, max_chars: int = 10000) -> tuple[str, bool]:
    """Truncate command output to prevent token explosion.
    
    Args:
        text: Output text to truncate
        max_lines: Maximum number of lines to keep
        max_chars: Maximum number of characters to keep
        
    Returns:
        Tuple of (truncated_text, was_truncated)
    """
    if not text:
        return text, False
    
    was_truncated = False
    
    # Truncate by characters first
    if len(text) > max_chars:
        text = text[:max_chars]
        was_truncated = True
    
    # Truncate by lines
    lines = text.splitlines()
    if len(lines) > max_lines:
        # Keep first 50 and last 50 lines
        head_lines = lines[:50]
        tail_lines = lines[-50:]
        truncated_count = len(lines) - 100
        text = "\n".join(head_lines) + f"\n\n... [{truncated_count} lines truncated] ...\n\n" + "\n".join(tail_lines)
        was_truncated = True
    
    return text, was_truncated


@tool
async def exec_command(
    command: str,
    timeout: int,
    context: AgentRuntimeContext | None = None,
) -> dict[str, Any]:
    """Execute shell command in workspace.

    Args:
        command: Shell command to execute
        timeout: Timeout in seconds
        context: Agent runtime context for workspace resolution

    Returns:
        Dict with stdout, stderr, exit_code, and execution metadata

    Raises:
        ToolPermissionError: If command is forbidden
        ToolExecutionError: If execution fails
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    resolved_command, resolved_command_id = resolve_allowed_shell_command(command, context)
    container_config = _container_sandbox_config()
    normalized_command = _normalize_shell_command(
        resolved_command,
        prefer_current_python=not container_config.enabled,
    )
    timeout = _clamp_timeout(timeout, max_seconds=_configured_max_timeout())

    # Security: Block dangerous commands using pre-compiled regex patterns with
    # word boundaries.  The old inline substring check had two problems:
    #   1. "format" blocked legitimate formatters (clang-format, black --format)
    #   2. "nc " (with space) didn't block bare `nc` without arguments
    for _pattern, _reason in _EXEC_COMMAND_FORBIDDEN_PATTERNS:
        if _pattern.search(normalized_command):
            result = ToolExecutionResult(
                success=False,
                output=None,
                error=f"Forbidden command pattern ({_reason}): {normalized_command}",
            )
            log_tool_execution(
                "exec_command",
                context,
                {
                    "command": command,
                    "resolved_command": resolved_command,
                    "normalized_command": normalized_command,
                    "command_id": resolved_command_id,
                    "timeout": timeout,
                },
                result,
            )
            raise ToolPermissionError(f"Forbidden command pattern ({_reason})")

    try:
        bash_tool = BashTool(
            default_timeout_ms=timeout * 1000,
            sandbox_enabled=True,
            allowed_paths=[workspace],
            container_enabled=container_config.enabled,
            container_config=container_config,
        )
        try:
            bash_result = await bash_tool.execute(
                normalized_command,
                timeout_ms=timeout * 1000,
                cwd=workspace,
            )
        except (DestructiveCommandError, ValueError) as permission_exc:
            result = ToolExecutionResult(
                success=False,
                output=None,
                error=str(permission_exc),
            )
            log_tool_execution(
                "exec_command",
                context,
                {
                    "command": command,
                    "resolved_command": resolved_command,
                    "normalized_command": normalized_command,
                    "command_id": resolved_command_id,
                    "timeout": timeout,
                },
                result,
            )
            raise ToolPermissionError(str(permission_exc)) from permission_exc

        if bash_result.timed_out:
            result = ToolExecutionResult(
                success=False,
                output=None,
                error=f"Command timed out after {timeout}s",
            )
            log_tool_execution(
                "exec_command",
                context,
                {
                    "command": command,
                    "resolved_command": resolved_command,
                    "normalized_command": normalized_command,
                    "command_id": resolved_command_id,
                    "timeout": timeout,
                },
                result,
            )
            raise CoreToolTimeoutError(
                f"Command execution timed out after {timeout}s: {normalized_command}",
                context={
                    "command": normalized_command,
                    "command_id": resolved_command_id,
                    "timeout": timeout,
                    "workspace": str(workspace),
                }
            )

        stdout = bash_result.stdout
        stderr = bash_result.stderr
        exit_code = bash_result.exit_code

        # Truncate outputs to prevent token explosion
        stdout_truncated, stdout_was_truncated = truncate_output(stdout)
        stderr_truncated, stderr_was_truncated = truncate_output(stderr)

        output_data = {
            "stdout": stdout_truncated,
            "stderr": stderr_truncated,
            "exit_code": exit_code,
            "command": normalized_command,
            "command_id": resolved_command_id,
            "success": exit_code == 0,
            "duration_ms": bash_result.duration_ms,
            "containerized": bash_result.containerized,
            "container_image": bash_result.container_image,
            "sandbox_profile": bash_result.sandbox_profile,
            "output_truncated": stdout_was_truncated or stderr_was_truncated,
            "stdout_original_size": len(stdout),
            "stderr_original_size": len(stderr),
        }

        result = ToolExecutionResult(
            success=exit_code == 0,
            output=output_data,
            metadata={"workspace": str(workspace)},
        )
        log_tool_execution(
            "exec_command",
            context,
            {
                "command": command,
                "resolved_command": resolved_command,
                "normalized_command": normalized_command,
                "command_id": resolved_command_id,
                "timeout": timeout,
            },
            result,
        )

        return output_data

    except (ToolPermissionError, ToolExecutionError):
        raise
    except CoreToolTimeoutError:
        raise
    except OSError as os_err:
        result = ToolExecutionResult(success=False, output=None, error=f"OS error: {os_err}")
        log_tool_execution(
            "exec_command",
            context,
            {
                "command": command,
                "resolved_command": resolved_command,
                "normalized_command": normalized_command,
                "command_id": resolved_command_id,
                "timeout": timeout,
            },
            result,
        )
        from app.core.exceptions import ToolExecutionError as CoreToolExecutionError
        raise CoreToolExecutionError(
            f"OS error during command execution: {os_err}",
            context={
                "command": normalized_command,
                "command_id": resolved_command_id,
                "workspace": str(workspace),
                "error_type": "OSError",
            }
        ) from os_err
    except UnicodeDecodeError as decode_err:
        result = ToolExecutionResult(success=False, output=None, error=f"Decode error: {decode_err}")
        log_tool_execution(
            "exec_command",
            context,
            {
                "command": command,
                "resolved_command": resolved_command,
                "normalized_command": normalized_command,
                "command_id": resolved_command_id,
                "timeout": timeout,
            },
            result,
        )
        from app.core.exceptions import ToolExecutionError as CoreToolExecutionError
        raise CoreToolExecutionError(
            f"Failed to decode command output: {decode_err}",
            context={
                "command": normalized_command,
                "command_id": resolved_command_id,
                "workspace": str(workspace),
                "error_type": "UnicodeDecodeError",
            }
        ) from decode_err
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution(
            "exec_command",
            context,
            {
                "command": command,
                "resolved_command": resolved_command,
                "normalized_command": normalized_command,
                "command_id": resolved_command_id,
                "timeout": timeout,
            },
            result,
        )
        from app.core.exceptions import ToolExecutionError as CoreToolExecutionError
        raise CoreToolExecutionError(
            f"Unexpected error during command execution: {e}",
            context={
                "command": normalized_command,
                "command_id": resolved_command_id,
                "workspace": str(workspace),
                "error_type": type(e).__name__,
            }
        ) from e


@tool
async def run_tests(
    test_path: str,
    context: AgentRuntimeContext | None = None,
) -> dict[str, Any]:
    """Execute tests and return results.

    Args:
        test_path: Relative path to test file or directory
        context: Agent runtime context for workspace resolution

    Returns:
        Dict with test results, counts, and failures

    Raises:
        ToolPermissionError: If path is outside workspace
        ToolExecutionError: If test execution fails
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    full_path = validate_workspace_path(test_path, workspace)

    if not full_path.exists():
        result = ToolExecutionResult(
            success=False, output=None, error=f"Test path not found: {test_path}"
        )
        log_tool_execution("run_tests", context, {"test_path": test_path}, result)
        raise FileNotFoundError(f"Test path not found: {test_path}")

    command = ""
    if context.command_catalog:
        candidate_ids = list(context.test_runner_ids or ())
        if not candidate_ids:
            candidate_ids = list(context.allowed_command_ids or ())
        if not candidate_ids:
            candidate_ids = list(context.command_catalog.keys())
        selected = _pick_allowed_test_command_id(candidate_ids)
        if not selected:
            raise ToolPermissionError(
                "run_tests requires at least one allowed command id related to testing/validation in command_catalog"
            )
        # Execute the safest allowed validation command id configured by the target contract.
        command = selected
    else:
        # Detect test framework based on workspace
        pytest_marker = workspace / "pytest.ini"
        unittest_marker = workspace / "setup.py"

        if pytest_marker.exists() or (workspace / "pyproject.toml").exists():
            command = f"python -m pytest {test_path} -v --tb=short --json-report --json-report-file=.test_results.json"
        elif unittest_marker.exists():
            command = f"python -m unittest discover -s {test_path} -v"
        else:
            command = f"python -m pytest {test_path} -v --tb=short"

    try:
        exec_result = await exec_command.ainvoke(
            {"command": command, "timeout": 300, "context": context}
        )

        # Truncate test output
        stdout_truncated, _ = truncate_output(exec_result["stdout"], max_lines=200)
        stderr_truncated, _ = truncate_output(exec_result["stderr"], max_lines=50)

        # Parse test results
        test_results = {
            "all_passed": exec_result["exit_code"] == 0,
            "exit_code": exec_result["exit_code"],
            "stdout": stdout_truncated,
            "stderr": stderr_truncated,
            "test_path": test_path,
            "output_truncated": exec_result.get("output_truncated", False),
        }

        # Try to parse structured results if available
        json_report_path = workspace / ".test_results.json"
        if json_report_path.exists():
            import json

            with open(json_report_path) as f:
                report_data = json.load(f)
                test_results["total"] = report_data.get("summary", {}).get("total", 0)
                test_results["passed"] = report_data.get("summary", {}).get("passed", 0)
                test_results["failed"] = report_data.get("summary", {}).get("failed", 0)
                test_results["skipped"] = report_data.get("summary", {}).get(
                    "skipped", 0
                )
                test_results["tests"] = report_data.get("tests", [])

        result = ToolExecutionResult(
            success=test_results["all_passed"],
            output=test_results,
            metadata={"command": command},
        )
        log_tool_execution("run_tests", context, {"test_path": test_path}, result)

        return test_results

    except (ToolPermissionError, ToolExecutionError, FileNotFoundError):
        raise
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution("run_tests", context, {"test_path": test_path}, result)
        raise ToolExecutionError(f"Test execution failed: {e}") from e
