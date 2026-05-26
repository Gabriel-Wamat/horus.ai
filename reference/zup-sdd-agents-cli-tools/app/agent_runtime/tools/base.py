"""Base classes and utilities for agent tools."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from collections.abc import Iterator
from typing import Any

from app.agent_runtime.agent_runtime import AgentRuntimeContext
from app.core.logging import get_logger

logger = get_logger("agent_runtime.tools")

_ACTIVE_TOOL_CONTEXT: ContextVar[AgentRuntimeContext | None] = ContextVar(
    "active_tool_context",
    default=None,
)


@dataclass(slots=True)
class ToolExecutionResult:
    """Result of a tool execution."""

    success: bool
    output: Any
    error: str | None = None
    metadata: dict[str, Any] | None = None


class ToolPermissionError(Exception):
    """Raised when tool execution is denied by permissions."""

    pass


class ToolExecutionError(Exception):
    """Raised when tool execution fails."""

    pass


def resolve_tool_context(context: AgentRuntimeContext | None) -> AgentRuntimeContext:
    """Resolve tool context from explicit arg or active ReAct context."""
    if context is not None:
        return context
    active_context = _ACTIVE_TOOL_CONTEXT.get()
    if active_context is not None:
        return active_context
    raise ToolPermissionError("Tool context is required and was not provided")


@contextmanager
def activate_tool_context(context: AgentRuntimeContext) -> Iterator[None]:
    """Temporarily activate tool context for ReAct tool calls."""
    token: Token[AgentRuntimeContext | None] = _ACTIVE_TOOL_CONTEXT.set(context)
    try:
        yield
    finally:
        _ACTIVE_TOOL_CONTEXT.reset(token)


def validate_workspace_path(file_path: str | Path, workspace: Path) -> Path:
    """Validate that file_path is within workspace boundaries.

    Args:
        file_path: Path to validate
        workspace: Workspace root path

    Returns:
        Resolved absolute path

    Raises:
        ToolPermissionError: If path is outside workspace
    """
    candidate_path = Path(file_path).expanduser()
    resolved = candidate_path if candidate_path.is_absolute() else (workspace / candidate_path)
    try:
        resolved = resolved.resolve()
        workspace_resolved = workspace.resolve()

        try:
            resolved.relative_to(workspace_resolved)
        except ValueError:
            raise ToolPermissionError(f"Path outside workspace: {file_path}")

        return resolved
    except (ValueError, OSError) as e:
        raise ToolPermissionError(f"Invalid path: {file_path}") from e


def ensure_write_allowed_for_context(
    *,
    target_path: Path,
    workspace: Path,
    context: AgentRuntimeContext,
) -> None:
    """Enforce write_roots policy for write-like tools."""
    write_roots = context.write_roots
    if not write_roots:
        raise ToolPermissionError("Write operation denied: write_roots are not configured in tool context")

    workspace_root = workspace.resolve()
    try:
        relative_path = target_path.resolve().relative_to(workspace_root)
    except ValueError as exc:
        raise ToolPermissionError(f"Path outside workspace: {target_path}") from exc

    for raw_root in write_roots:
        normalized = raw_root.strip().strip("/")
        if normalized in {"", "."}:
            return
        root_path = Path(normalized)
        try:
            relative_path.relative_to(root_path)
            return
        except ValueError:
            continue

    raise ToolPermissionError(
        f"Write operation denied by write_roots policy: {relative_path.as_posix()}"
    )


def resolve_allowed_shell_command(command: str, context: AgentRuntimeContext) -> tuple[str, str | None]:
    """Resolve and authorize command execution for tool mode.

    Returns:
        Tuple of (resolved_shell_command, resolved_command_id_or_none)
    """
    catalog = context.command_catalog or {}
    allowed_ids = set(context.allowed_command_ids or ())

    if not catalog:
        raise ToolPermissionError(
            "Command denied by policy. command_catalog is required for exec_command in tool mode."
        )

    if command in catalog:
        command_id = command
        if allowed_ids and command_id not in allowed_ids:
            raise ToolPermissionError(f"Command id is not allowed for actor: {command_id}")
        return catalog[command_id], command_id

    # Backward compatibility: allow direct shell string only if it maps to an allowed catalog entry.
    for command_id, shell_command in catalog.items():
        if shell_command != command:
            continue
        if allowed_ids and command_id not in allowed_ids:
            raise ToolPermissionError(f"Command is mapped to disallowed command id: {command_id}")
        return shell_command, command_id

    raise ToolPermissionError(
        "Command denied by policy. Use a command id present in command_catalog and allowed for this role."
    )


def log_tool_execution(
    tool_name: str,
    context: AgentRuntimeContext,
    params: dict[str, Any],
    result: ToolExecutionResult,
) -> None:
    """Log tool execution for audit trail."""
    log_entry = {
        "timestamp": datetime.now(UTC).isoformat(),
        "tool_name": tool_name,
        "run_id": context.run_id,
        "assignment_id": context.assignment_id,
        "actor_name": context.current_actor_name,
        "params": params,
        "success": result.success,
        "error": result.error,
    }

    if result.success:
        logger.info(f"Tool executed: {tool_name}", extra=log_entry)
    else:
        logger.error(f"Tool failed: {tool_name}", extra=log_entry)


def resolve_workspace(context: AgentRuntimeContext) -> Path:
    """Resolve workspace path from context.
    
    Uses workspace_root from context if available (respecting isolation policy),
    otherwise falls back to creating a workspace directory.
    
    Args:
        context: Agent runtime context with workspace information
        
    Returns:
        Resolved workspace path
        
    Raises:
        ToolPermissionError: If workspace cannot be resolved
    """
    # Use workspace_root from context if available
    if context.workspace_root:
        workspace = Path(context.workspace_root).expanduser().resolve()
        if not workspace.exists():
            raise ToolPermissionError(
                f"Workspace does not exist: {context.workspace_root}"
            )
        return workspace
    
    # Fallback: Create workspace directory for non-worktree agents
    # (e.g., spec_sdd_agente in READ_ONLY mode)
    base = Path(__file__).resolve().parents[3] / ".odin_workspaces"
    workspace = (base / context.run_id).resolve()

    if not workspace.exists():
        workspace.mkdir(parents=True, exist_ok=True)

    return workspace
