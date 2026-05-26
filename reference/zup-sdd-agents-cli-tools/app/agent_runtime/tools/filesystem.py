"""Filesystem tools for agent runtime."""

from __future__ import annotations

import base64
import binascii
from pathlib import Path
from typing import Any, cast

from langchain.tools import tool

from app.agent_runtime.agent_runtime import AgentRuntimeContext
from app.agent_runtime.tools.base import (
    ensure_write_allowed_for_context,
    ToolExecutionError,
    ToolExecutionResult,
    ToolPermissionError,
    log_tool_execution,
    resolve_tool_context,
    resolve_workspace,
    validate_workspace_path,
)


@tool
def read_file(file_path: str, context: AgentRuntimeContext | None = None) -> str:
    """Read file from workspace with permission checks.

    Args:
        file_path: Relative path to file within workspace
        context: Agent runtime context for workspace resolution

    Returns:
        File contents as string

    Raises:
        ToolPermissionError: If file is outside workspace
        FileNotFoundError: If file does not exist
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    full_path = validate_workspace_path(file_path, workspace)

    try:
        if not full_path.exists():
            result = ToolExecutionResult(
                success=False, output=None, error=f"File not found: {file_path}"
            )
            log_tool_execution("read_file", context, {"file_path": file_path}, result)
            raise FileNotFoundError(f"File not found: {file_path}")

        if not full_path.is_file():
            result = ToolExecutionResult(
                success=False, output=None, error=f"Not a file: {file_path}"
            )
            log_tool_execution("read_file", context, {"file_path": file_path}, result)
            raise ValueError(f"Not a file: {file_path}")

        content = full_path.read_text(encoding="utf-8")

        result = ToolExecutionResult(
            success=True,
            output=content,
            metadata={"size_bytes": len(content), "path": str(full_path)},
        )
        log_tool_execution("read_file", context, {"file_path": file_path}, result)

        return content

    except (ToolPermissionError, FileNotFoundError, ValueError):
        raise
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution("read_file", context, {"file_path": file_path}, result)
        raise


@tool
def write_file(
    file_path: str,
    content: str | None = None,
    content_base64: str | None = None,
    context: AgentRuntimeContext | None = None,
) -> dict[str, Any]:
    """Write file to workspace.

    Args:
        file_path: Relative path to file within workspace
        content: UTF-8 text content to write
        content_base64: Optional base64 payload for binary files
        context: Agent runtime context for workspace resolution

    Returns:
        Dict with success status and metadata

    Raises:
        ToolPermissionError: If file is outside workspace
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    full_path = validate_workspace_path(file_path, workspace)
    ensure_write_allowed_for_context(target_path=full_path, workspace=workspace, context=context)

    try:
        if content is not None and content_base64 is not None:
            raise ValueError("Use either content or content_base64, not both")
        if content is None and content_base64 is None:
            raise ValueError("write_file requires content or content_base64")

        file_already_exists = full_path.exists()
        # Create parent directories if needed
        full_path.parent.mkdir(parents=True, exist_ok=True)

        size_bytes = 0
        if content_base64 is not None:
            try:
                payload = base64.b64decode(content_base64, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise ValueError("Invalid content_base64 payload") from exc
            full_path.write_bytes(payload)
            size_bytes = len(payload)
        else:
            text = content or ""
            full_path.write_text(text, encoding="utf-8")
            size_bytes = len(text.encode("utf-8"))

        result = ToolExecutionResult(
            success=True,
            output={"path": str(full_path), "size_bytes": size_bytes},
            metadata={
                "created": not file_already_exists,
                "encoding": "base64" if content_base64 is not None else "utf-8",
            },
        )
        log_tool_execution(
            "write_file",
            context,
            {
                "file_path": file_path,
                "content_length": len(content or ""),
                "has_content_base64": content_base64 is not None,
            },
            result,
        )

        return cast(dict[str, Any], result.output)

    except ToolPermissionError:
        raise
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution("write_file", context, {"file_path": file_path}, result)
        raise


@tool
def edit_file(
    file_path: str,
    old_content: str,
    new_content: str,
    context: AgentRuntimeContext | None = None,
) -> dict[str, Any]:
    """Edit file by replacing exact old content with new content.

    This tool performs a safe find-and-replace operation. The old_content must
    match EXACTLY (including whitespace) for the replacement to occur.

    Args:
        file_path: Relative path to file within workspace
        old_content: Exact content to find and replace (must match precisely)
        new_content: New content to replace with
        context: Agent runtime context for workspace resolution

    Returns:
        Dict with success status, metadata about the edit

    Raises:
        ToolPermissionError: If file is outside workspace
        FileNotFoundError: If file does not exist
        ValueError: If old_content not found in file or multiple matches

    Examples:
        # Replace a function
        edit_file(
            "src/utils.py",
            "def old_func():\\n    pass",
            "def old_func():\\n    return 42"
        )

        # Fix a bug
        edit_file(
            "main.py",
            "if x = 5:",  # old (wrong)
            "if x == 5:"  # new (fixed)
        )
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    full_path = validate_workspace_path(file_path, workspace)
    ensure_write_allowed_for_context(target_path=full_path, workspace=workspace, context=context)

    try:
        if not full_path.exists():
            result = ToolExecutionResult(
                success=False, output=None, error=f"File not found: {file_path}"
            )
            log_tool_execution(
                "edit_file",
                context,
                {"file_path": file_path, "old_length": len(old_content), "new_length": len(new_content)},
                result,
            )
            raise FileNotFoundError(f"File not found: {file_path}")

        if not full_path.is_file():
            result = ToolExecutionResult(
                success=False, output=None, error=f"Not a file: {file_path}"
            )
            log_tool_execution(
                "edit_file",
                context,
                {"file_path": file_path},
                result,
            )
            raise ValueError(f"Not a file: {file_path}")

        # Read current content
        current_content = full_path.read_text(encoding="utf-8")

        # Check if old_content exists
        if old_content not in current_content:
            result = ToolExecutionResult(
                success=False,
                output=None,
                error="Content to replace not found in file. Make sure old_content matches EXACTLY.",
            )
            log_tool_execution(
                "edit_file",
                context,
                {"file_path": file_path, "error": "content_not_found"},
                result,
            )
            raise ValueError(
                f"Content to replace not found in {file_path}. "
                "The old_content must match exactly (including whitespace)."
            )

        # Check for multiple matches
        match_count = current_content.count(old_content)
        if match_count > 1:
            result = ToolExecutionResult(
                success=False,
                output=None,
                error=f"Found {match_count} matches of old_content. Use more specific content to match exactly once.",
            )
            log_tool_execution(
                "edit_file",
                context,
                {"file_path": file_path, "error": "multiple_matches", "match_count": match_count},
                result,
            )
            raise ValueError(
                f"Found {match_count} matches in {file_path}. "
                "Provide more context in old_content to uniquely identify the section to edit."
            )

        # Perform replacement
        new_file_content = current_content.replace(old_content, new_content, 1)

        # Write back
        full_path.write_text(new_file_content, encoding="utf-8")

        result = ToolExecutionResult(
            success=True,
            output={
                "path": str(full_path),
                "old_size": len(current_content),
                "new_size": len(new_file_content),
                "diff_chars": len(new_file_content) - len(current_content),
            },
            metadata={
                "old_content_length": len(old_content),
                "new_content_length": len(new_content),
                "file_changed": old_content != new_content,
            },
        )
        log_tool_execution(
            "edit_file",
            context,
            {"file_path": file_path, "old_length": len(old_content), "new_length": len(new_content)},
            result,
        )

        return cast(dict[str, Any], result.output)

    except (ToolPermissionError, FileNotFoundError, ValueError):
        raise
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution(
            "edit_file",
            context,
            {"file_path": file_path},
            result,
        )
        raise ToolExecutionError(f"Edit operation failed: {e}") from e


@tool
def list_directory(dir_path: str, context: AgentRuntimeContext | None = None) -> list[str]:
    """List directory contents.

    Args:
        dir_path: Relative path to directory within workspace
        context: Agent runtime context for workspace resolution

    Returns:
        List of filenames in directory

    Raises:
        ToolPermissionError: If directory is outside workspace
        NotADirectoryError: If path is not a directory
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    full_path = validate_workspace_path(dir_path, workspace)

    try:
        if not full_path.exists():
            result = ToolExecutionResult(
                success=False, output=None, error=f"Directory not found: {dir_path}"
            )
            log_tool_execution("list_directory", context, {"dir_path": dir_path}, result)
            raise FileNotFoundError(f"Directory not found: {dir_path}")

        if not full_path.is_dir():
            result = ToolExecutionResult(
                success=False, output=None, error=f"Not a directory: {dir_path}"
            )
            log_tool_execution("list_directory", context, {"dir_path": dir_path}, result)
            raise NotADirectoryError(f"Not a directory: {dir_path}")

        entries = sorted([entry.name for entry in full_path.iterdir()])

        result = ToolExecutionResult(
            success=True,
            output=entries,
            metadata={"count": len(entries), "path": str(full_path)},
        )
        log_tool_execution("list_directory", context, {"dir_path": dir_path}, result)

        return entries

    except (ToolPermissionError, FileNotFoundError, NotADirectoryError):
        raise
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution("list_directory", context, {"dir_path": dir_path}, result)
        raise


@tool
def file_tree(
    root_path: str,
    max_depth: int,
    context: AgentRuntimeContext | None = None,
) -> dict[str, Any]:
    """Generate file tree structure.

    Args:
        root_path: Relative path to root directory within workspace
        max_depth: Maximum depth to traverse
        context: Agent runtime context for workspace resolution

    Returns:
        Dict representing tree structure

    Raises:
        ToolPermissionError: If path is outside workspace
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    full_path = validate_workspace_path(root_path, workspace)

    def build_tree(path: Path, current_depth: int) -> dict[str, Any]:
        """Recursively build tree structure."""
        if current_depth > max_depth:
            return {"name": path.name, "type": "directory", "truncated": True}

        if path.is_file():
            return {
                "name": path.name,
                "type": "file",
                "size": path.stat().st_size,
            }

        if path.is_dir():
            try:
                children = [
                    build_tree(child, current_depth + 1)
                    for child in sorted(path.iterdir())
                ]
                return {
                    "name": path.name,
                    "type": "directory",
                    "children": children,
                }
            except PermissionError:
                return {
                    "name": path.name,
                    "type": "directory",
                    "error": "Permission denied",
                }

        return {"name": path.name, "type": "unknown"}

    try:
        if not full_path.exists():
            result = ToolExecutionResult(
                success=False, output=None, error=f"Path not found: {root_path}"
            )
            log_tool_execution(
                "file_tree", context, {"root_path": root_path, "max_depth": max_depth}, result
            )
            raise FileNotFoundError(f"Path not found: {root_path}")

        tree = build_tree(full_path, 0)

        result = ToolExecutionResult(
            success=True, output=tree, metadata={"root": str(full_path)}
        )
        log_tool_execution(
            "file_tree", context, {"root_path": root_path, "max_depth": max_depth}, result
        )

        return tree

    except (ToolPermissionError, FileNotFoundError):
        raise
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution("file_tree", context, {"root_path": root_path}, result)
        raise


@tool
def glob_files(
    pattern: str,
    root_path: str,
    context: AgentRuntimeContext | None = None,
) -> list[str]:
    """Search files by glob pattern.

    Args:
        pattern: Glob pattern (e.g., '**/*.py', 'src/**/test_*.ts')
        root_path: Root directory for search (relative to workspace, default ".")
        context: Agent runtime context for workspace resolution

    Returns:
        List of matched file paths (relative to workspace), sorted by modification time

    Raises:
        ToolPermissionError: If path is outside workspace
        FileNotFoundError: If root_path does not exist

    Examples:
        glob_files('**/*.py', '.')  # All Python files in workspace
        glob_files('src/**/test_*.py', 'backend/')  # Tests in backend/src
        glob_files('*.json', 'config/')  # JSONs in config/
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    search_root = validate_workspace_path(root_path, workspace)

    if not search_root.exists():
        result = ToolExecutionResult(
            success=False, output=None, error=f"Root path not found: {root_path}"
        )
        log_tool_execution(
            "glob_files", context, {"pattern": pattern, "root_path": root_path}, result
        )
        raise FileNotFoundError(f"Root path not found: {root_path}")

    try:
        # Use pathlib glob (fast, no external dependencies)
        matches = list(search_root.glob(pattern))

        # Filter out directories, keep only files
        file_matches = [m for m in matches if m.is_file()]

        # Sort by modification time (most recent first)
        file_matches.sort(key=lambda p: p.stat().st_mtime, reverse=True)

        # Convert to relative paths
        relative_paths = [str(m.relative_to(workspace)) for m in file_matches]

        # Limit to 500 files to prevent token explosion
        max_results = 500
        truncated = len(relative_paths) > max_results
        output = relative_paths[:max_results]

        result = ToolExecutionResult(
            success=True,
            output=output,
            metadata={
                "pattern": pattern,
                "root_path": root_path,
                "total_matches": len(relative_paths),
                "shown": len(output),
                "truncated": truncated,
            },
        )
        log_tool_execution(
            "glob_files", context, {"pattern": pattern, "root_path": root_path}, result
        )

        return output

    except (ToolPermissionError, FileNotFoundError):
        raise
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution(
            "glob_files", context, {"pattern": pattern, "root_path": root_path}, result
        )
        raise ToolExecutionError(f"Glob search failed: {e}") from e
