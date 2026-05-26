"""Code analysis tools for diffs and search."""

from __future__ import annotations

import difflib
import re
import subprocess
from pathlib import Path
from typing import Any

from langchain.tools import tool

from app.agent_runtime.agent_runtime import AgentRuntimeContext
from app.agent_runtime.tools.base import (
    ToolExecutionError,
    ToolExecutionResult,
    ToolPermissionError,
    log_tool_execution,
    resolve_tool_context,
    resolve_workspace,
    validate_workspace_path,
)


@tool
def diff_files(
    file1: str,
    file2: str,
    context: AgentRuntimeContext | None = None,
) -> str:
    """Generate diff between files.

    Args:
        file1: Relative path to first file
        file2: Relative path to second file
        context: Agent runtime context for workspace resolution

    Returns:
        Unified diff as string

    Raises:
        ToolPermissionError: If files are outside workspace
        FileNotFoundError: If files do not exist
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    full_path1 = validate_workspace_path(file1, workspace)
    full_path2 = validate_workspace_path(file2, workspace)

    try:
        if not full_path1.exists():
            result = ToolExecutionResult(
                success=False, output=None, error=f"File not found: {file1}"
            )
            log_tool_execution(
                "diff_files", context, {"file1": file1, "file2": file2}, result
            )
            raise FileNotFoundError(f"File not found: {file1}")

        if not full_path2.exists():
            result = ToolExecutionResult(
                success=False, output=None, error=f"File not found: {file2}"
            )
            log_tool_execution(
                "diff_files", context, {"file1": file1, "file2": file2}, result
            )
            raise FileNotFoundError(f"File not found: {file2}")

        content1 = full_path1.read_text(encoding="utf-8").splitlines(keepends=True)
        content2 = full_path2.read_text(encoding="utf-8").splitlines(keepends=True)

        diff = difflib.unified_diff(
            content1,
            content2,
            fromfile=file1,
            tofile=file2,
            lineterm="",
        )

        diff_text = "\n".join(diff)

        result = ToolExecutionResult(
            success=True,
            output=diff_text,
            metadata={
                "file1": str(full_path1),
                "file2": str(full_path2),
                "lines_changed": diff_text.count("\n"),
            },
        )
        log_tool_execution(
            "diff_files", context, {"file1": file1, "file2": file2}, result
        )

        return diff_text

    except (ToolPermissionError, FileNotFoundError):
        raise
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution(
            "diff_files", context, {"file1": file1, "file2": file2}, result
        )
        raise


@tool
def search_code(
    pattern: str,
    path: str,
    context: AgentRuntimeContext | None = None,
) -> list[dict[str, Any]]:
    """Search code using regex/ripgrep.

    Args:
        pattern: Regular expression pattern to search
        path: Relative path to search within (file or directory)
        context: Agent runtime context for workspace resolution

    Returns:
        List of matches with file, line number, and content

    Raises:
        ToolPermissionError: If path is outside workspace
        ToolExecutionError: If search fails
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    full_path = validate_workspace_path(path, workspace)

    if not full_path.exists():
        result = ToolExecutionResult(
            success=False, output=None, error=f"Path not found: {path}"
        )
        log_tool_execution(
            "search_code", context, {"pattern": pattern, "path": path}, result
        )
        raise FileNotFoundError(f"Path not found: {path}")

    matches = []

    try:
        # Try using ripgrep first (much faster)
        try:
            rg_result = subprocess.run(
                [
                    "rg",
                    "--json",
                    "--line-number",
                    "--column",
                    "--no-heading",
                    pattern,
                    str(full_path),
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )

            if rg_result.returncode in [0, 1]:
                import json

                for line in rg_result.stdout.strip().split("\n"):
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        if data.get("type") == "match":
                            match_data = data.get("data", {})
                            matches.append(
                                {
                                    "file": str(
                                        Path(match_data["path"]["text"]).relative_to(
                                            workspace
                                        )
                                    ),
                                    "line": match_data["line_number"],
                                    "column": match_data.get("submatches", [{}])[
                                        0
                                    ].get("start", 0),
                                    "content": match_data["lines"]["text"].rstrip(),
                                }
                            )
                    except (json.JSONDecodeError, KeyError):
                        continue

        except (FileNotFoundError, subprocess.SubprocessError):
            # Fallback to Python regex
            if full_path.is_file():
                files = [full_path]
            else:
                files = list(full_path.rglob("*"))
                files = [f for f in files if f.is_file()]

            pattern_re = re.compile(pattern)

            for file_path in files:
                try:
                    content = file_path.read_text(encoding="utf-8")
                    for line_num, line in enumerate(content.splitlines(), start=1):
                        if pattern_re.search(line):
                            match = pattern_re.search(line)
                            matches.append(
                                {
                                    "file": str(file_path.relative_to(workspace)),
                                    "line": line_num,
                                    "column": match.start() if match else 0,
                                    "content": line.rstrip(),
                                }
                            )
                except (UnicodeDecodeError, PermissionError):
                    continue

        result = ToolExecutionResult(
            success=True,
            output=matches,
            metadata={
                "pattern": pattern,
                "path": str(full_path),
                "match_count": len(matches),
            },
        )
        log_tool_execution(
            "search_code", context, {"pattern": pattern, "path": path}, result
        )

        return matches

    except (ToolPermissionError, FileNotFoundError):
        raise
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution(
            "search_code", context, {"pattern": pattern, "path": path}, result
        )
        raise ToolExecutionError(f"Search failed: {e}") from e
