"""Syntax validation tools for code generation.

Provides post-generation syntax validation for multiple languages
to catch basic errors before committing code.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from langchain.tools import tool

from app.agent_runtime.agent_runtime import AgentRuntimeContext
from app.agent_runtime.tools.base import (
    ToolExecutionError,
    ToolExecutionResult,
    log_tool_execution,
    resolve_tool_context,
    resolve_workspace,
    validate_workspace_path,
)
from app.agent_runtime.tools.execution import exec_command, truncate_output
from app.tools.bash_tool import BashTool


@dataclass
class SyntaxValidationResult:
    """Result of syntax validation."""
    
    language: str
    valid: bool
    errors: list[dict[str, Any]]
    warnings: list[dict[str, Any]]
    validator_used: str


_LINT_COMMAND_KEYWORDS = (
    "lint",
    "check",
    "ruff",
    "flake8",
    "pyflakes",
    "mypy",
    "pyright",
    "eslint",
    "tsc",
    "biome",
)
_LINTABLE_EXTENSIONS = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
}
_MAX_FALLBACK_FILES = 50


async def _validate_python(file_path: Path) -> SyntaxValidationResult:
    """Validate Python syntax using ast and pyflakes."""
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    
    # First: Check basic Python syntax with ast
    try:
        import ast
        with open(file_path, "r", encoding="utf-8") as f:
            code = f.read()
        ast.parse(code, filename=str(file_path))
    except SyntaxError as e:
        errors.append({
            "line": e.lineno,
            "column": e.offset,
            "message": e.msg,
            "type": "SyntaxError",
        })
        return SyntaxValidationResult(
            language="python",
            valid=False,
            errors=errors,
            warnings=warnings,
            validator_used="ast",
        )
    
    # Second: Run pyflakes if available
    try:
        result = await BashTool(
            default_timeout_ms=10_000,
            sandbox_enabled=True,
            allowed_paths=[file_path.parent],
        ).execute(
            f"pyflakes {BashTool.quote_arg(str(file_path))}",
            cwd=file_path.parent,
            timeout_ms=10_000,
        )
        if result.exit_code == 127 or result.timed_out:
            return SyntaxValidationResult(
                language="python",
                valid=True,
                errors=errors,
                warnings=warnings,
                validator_used="ast",
            )
        if result.exit_code != 0 and result.stdout:
            for line in result.stdout.splitlines():
                # Parse pyflakes output: file.py:line:col: message
                parts = line.split(":", 3)
                if len(parts) >= 3:
                    warnings.append({
                        "line": int(parts[1]) if parts[1].isdigit() else None,
                        "message": parts[-1].strip(),
                        "type": "Warning",
                    })
    except Exception:
        pass  # pyflakes not available, skip additional checks
    
    return SyntaxValidationResult(
        language="python",
        valid=True,
        errors=errors,
        warnings=warnings,
        validator_used="ast+pyflakes",
    )


async def _validate_typescript(file_path: Path) -> SyntaxValidationResult:
    """Validate TypeScript/JavaScript syntax using tsc or eslint."""
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    
    # Try using tsc --noEmit for type checking
    try:
        result = await BashTool(
            default_timeout_ms=30_000,
            sandbox_enabled=True,
            allowed_paths=[file_path.parent],
        ).execute(
            f"tsc --noEmit --skipLibCheck {BashTool.quote_arg(str(file_path))}",
            cwd=file_path.parent,
            timeout_ms=30_000,
        )
        if result.exit_code == 127 or result.timed_out:
            raise RuntimeError("TypeScript compiler not available")
        if result.exit_code != 0 and result.stdout:
            # Parse tsc output
            for line in result.stdout.splitlines():
                if "error TS" in line:
                    errors.append({"message": line.strip(), "type": "TypeError"})
        
        return SyntaxValidationResult(
            language="typescript",
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            validator_used="tsc",
        )
    except Exception:
        # tsc not available, return basic validation
        return SyntaxValidationResult(
            language="typescript",
            valid=True,  # Assume valid if no validator available
            errors=[],
            warnings=[{"message": "TypeScript compiler not available for validation", "type": "Info"}],
            validator_used="none",
        )


async def _validate_javascript(file_path: Path) -> SyntaxValidationResult:
    """Validate JavaScript syntax using Node.js."""
    errors = []
    
    try:
        # Use Node.js to check syntax
        result = await BashTool(
            default_timeout_ms=10_000,
            sandbox_enabled=True,
            allowed_paths=[file_path.parent],
        ).execute(
            f"node --check {BashTool.quote_arg(str(file_path))}",
            cwd=file_path.parent,
            timeout_ms=10_000,
        )
        if result.exit_code == 127 or result.timed_out:
            raise RuntimeError("Node.js not available")
        if result.exit_code != 0:
            errors.append({
                "message": result.stderr.strip(),
                "type": "SyntaxError",
            })
        
        return SyntaxValidationResult(
            language="javascript",
            valid=len(errors) == 0,
            errors=errors,
            warnings=[],
            validator_used="node",
        )
    except Exception:
        return SyntaxValidationResult(
            language="javascript",
            valid=True,
            errors=[],
            warnings=[{"message": "Node.js not available for validation", "type": "Info"}],
            validator_used="none",
        )


def _is_lint_command(command_id: str, command: str) -> bool:
    """Return whether a configured command appears to report lint/type errors."""
    searchable = f"{command_id} {command}".lower()
    return any(keyword in searchable for keyword in _LINT_COMMAND_KEYWORDS)


def _select_lint_command_ids(
    context: AgentRuntimeContext,
    explicit_command_id: str | None,
) -> list[str]:
    """Select allowed command ids that can surface linter diagnostics."""
    catalog = context.command_catalog or {}
    allowed_ids = set(context.allowed_command_ids or catalog.keys())

    if explicit_command_id:
        if explicit_command_id not in catalog:
            raise ToolExecutionError(f"Unknown lint command id: {explicit_command_id}")
        if allowed_ids and explicit_command_id not in allowed_ids:
            raise ToolExecutionError(f"Lint command id is not allowed: {explicit_command_id}")
        return [explicit_command_id]

    selected = [
        command_id
        for command_id, command in catalog.items()
        if (not allowed_ids or command_id in allowed_ids) and _is_lint_command(command_id, command)
    ]

    # Keep tool calls bounded. Prefer direct lint commands first, then broader checks.
    selected.sort(
        key=lambda item: (
            0 if "lint" in item.lower() else 1,
            0 if item.lower().startswith(("lint", "check")) else 1,
            item,
        )
    )
    return selected[:3]


def _parse_lint_diagnostics(text: str) -> list[dict[str, Any]]:
    """Parse common linter/compiler output formats into compact diagnostics."""
    diagnostics: list[dict[str, Any]] = []
    seen: set[tuple[str | None, int | None, int | None, str]] = set()
    patterns = (
        # path:line:column: CODE message
        re.compile(
            r"^(?P<file>[^:\n]+):(?P<line>\d+):(?P<column>\d+):\s*(?P<message>.+)$"
        ),
        # path:line: CODE message
        re.compile(r"^(?P<file>[^:\n]+):(?P<line>\d+):\s*(?P<message>.+)$"),
        # path(line,column): error TS1234: message
        re.compile(
            r"^(?P<file>.+?)\((?P<line>\d+),(?P<column>\d+)\):\s*(?P<message>.+)$"
        ),
    )

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        for pattern in patterns:
            match = pattern.match(line)
            if not match:
                continue
            data = match.groupdict()
            message = data.get("message", "").strip()
            if not message:
                continue
            file_path = data.get("file")
            line_number = int(data["line"]) if data.get("line") else None
            column_number = int(data["column"]) if data.get("column") else None
            key = (file_path, line_number, column_number, message)
            if key in seen:
                break
            seen.add(key)
            diagnostics.append(
                {
                    "file": file_path,
                    "line": line_number,
                    "column": column_number,
                    "message": message,
                    "severity": _infer_diagnostic_severity(message),
                }
            )
            break
    return diagnostics


def _infer_diagnostic_severity(message: str) -> str:
    """Infer diagnostic severity from a linter output line."""
    lowered = message.lower()
    if "error" in lowered or lowered.startswith(("e", "f")):
        return "error"
    if "warning" in lowered or lowered.startswith("w"):
        return "warning"
    return "info"


def _lintable_files(target: Path) -> list[Path]:
    """Return a bounded list of source files that local validators can inspect."""
    if target.is_file():
        return [target] if target.suffix.lower() in _LINTABLE_EXTENSIONS else []

    ignored_dirs = {".git", ".venv", "venv", "node_modules", "dist", "build", "__pycache__"}
    files: list[Path] = []
    for path in sorted(target.rglob("*")):
        if any(part in ignored_dirs for part in path.parts):
            continue
        if path.is_file() and path.suffix.lower() in _LINTABLE_EXTENSIONS:
            files.append(path)
        if len(files) >= _MAX_FALLBACK_FILES:
            break
    return files


async def _fallback_lint_diagnostics(target: Path, workspace: Path) -> dict[str, Any]:
    """Collect syntax/lint diagnostics without a configured lint command."""
    diagnostics: list[dict[str, Any]] = []
    files = _lintable_files(target)

    for file_path in files:
        language = _LINTABLE_EXTENSIONS.get(file_path.suffix.lower(), "unknown")
        if language == "python":
            result = await _validate_python(file_path)
        elif language == "typescript":
            result = await _validate_typescript(file_path)
        elif language == "javascript":
            result = await _validate_javascript(file_path)
        else:
            continue

        relative_path = file_path.resolve().relative_to(workspace.resolve()).as_posix()
        for error in result.errors:
            diagnostics.append(
                {
                    "file": relative_path,
                    "line": error.get("line"),
                    "column": error.get("column"),
                    "message": error.get("message"),
                    "severity": "error",
                    "type": error.get("type"),
                    "validator": result.validator_used,
                }
            )
        for warning in result.warnings:
            diagnostics.append(
                {
                    "file": relative_path,
                    "line": warning.get("line"),
                    "column": warning.get("column"),
                    "message": warning.get("message"),
                    "severity": "warning",
                    "type": warning.get("type"),
                    "validator": result.validator_used,
                }
            )

    return {
        "files_checked": [
            path.resolve().relative_to(workspace.resolve()).as_posix()
            for path in files
        ],
        "files_checked_count": len(files),
        "diagnostics": diagnostics,
        "truncated": len(files) >= _MAX_FALLBACK_FILES,
    }


@tool
async def read_lints(
    path: str = ".",
    command_id: str | None = None,
    max_diagnostics: int = 50,
    timeout: int = 120,
    context: AgentRuntimeContext | None = None,
) -> dict[str, Any]:
    """Read linter, type-checker, and validation diagnostics for the workspace.

    Args:
        path: File or directory to inspect when falling back to local validators.
        command_id: Optional command id from command_catalog to run. If omitted,
            the tool picks allowed lint/check commands automatically.
        max_diagnostics: Maximum parsed diagnostics to return.
        timeout: Timeout in seconds for each lint command.
        context: Agent runtime context.

    Returns:
        Dict with command results, parsed diagnostics, and fallback validation output.
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    target = validate_workspace_path(path, workspace)
    max_diagnostics = max(1, min(int(max_diagnostics or 50), 200))
    timeout = max(1, min(int(timeout or 120), 300))

    command_ids = _select_lint_command_ids(context, command_id)
    command_results: list[dict[str, Any]] = []
    diagnostics: list[dict[str, Any]] = []
    fallback: dict[str, Any] | None = None

    try:
        for selected_command_id in command_ids:
            exec_result = await exec_command.ainvoke(
                {"command": selected_command_id, "timeout": timeout, "context": context}
            )
            combined_output = "\n".join(
                part
                for part in (exec_result.get("stdout", ""), exec_result.get("stderr", ""))
                if part
            )
            parsed = _parse_lint_diagnostics(combined_output)
            diagnostics.extend({**item, "command_id": selected_command_id} for item in parsed)
            stdout_tail, stdout_truncated = truncate_output(
                exec_result.get("stdout", ""),
                max_lines=80,
                max_chars=12_000,
            )
            stderr_tail, stderr_truncated = truncate_output(
                exec_result.get("stderr", ""),
                max_lines=80,
                max_chars=12_000,
            )
            command_results.append(
                {
                    "command_id": selected_command_id,
                    "command": exec_result.get("command"),
                    "exit_code": exec_result.get("exit_code"),
                    "success": exec_result.get("success"),
                    "stdout_tail": stdout_tail,
                    "stderr_tail": stderr_tail,
                    "output_truncated": bool(
                        exec_result.get("output_truncated")
                        or stdout_truncated
                        or stderr_truncated
                    ),
                    "diagnostic_count": len(parsed),
                }
            )

        if not command_ids:
            fallback = await _fallback_lint_diagnostics(target, workspace)
            diagnostics.extend(fallback["diagnostics"])

        diagnostics = diagnostics[:max_diagnostics]
        output_data: dict[str, Any] = {
            "path": path,
            "used_command_catalog": bool(command_ids),
            "commands_run": command_results,
            "fallback_used": fallback is not None,
            "fallback": fallback,
            "diagnostics": diagnostics,
            "diagnostic_count": len(diagnostics),
            "success": all(result["success"] for result in command_results) and not diagnostics,
            "summary": (
                f"Found {len(diagnostics)} lint diagnostic(s)"
                if diagnostics
                else "No lint diagnostics found"
            ),
        }
        result = ToolExecutionResult(
            success=bool(output_data["success"]),
            output=output_data,
            metadata={"commands": command_ids, "path": path},
        )
        log_tool_execution(
            "read_lints",
            context,
            {"path": path, "command_id": command_id, "max_diagnostics": max_diagnostics},
            result,
        )
        return cast(dict[str, Any], json.loads(json.dumps(output_data, default=str)))

    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution(
            "read_lints",
            context,
            {"path": path, "command_id": command_id, "max_diagnostics": max_diagnostics},
            result,
        )
        raise


@tool
async def validate_syntax(
    file_path: str,
    language: str | None,
    context: AgentRuntimeContext | None = None,
) -> dict[str, Any]:
    """Validate syntax of generated code file.
    
    Args:
        file_path: Path to file relative to workspace
        language: Programming language hint (python, typescript, javascript)
                  If None, inferred from file extension
        context: Agent runtime context
        
    Returns:
        Dict with validation results including errors and warnings
        
    Raises:
        ToolExecutionError: If validation process fails
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    target = workspace / file_path
    
    if not target.exists():
        result = ToolExecutionResult(
            success=False,
            output=None,
            error=f"File not found: {file_path}",
        )
        log_tool_execution(
            "validate_syntax", context, {"file_path": file_path, "language": language}, result
        )
        from app.core.exceptions import ToolValidationError
        raise ToolValidationError(
            f"Cannot validate non-existent file: {file_path}",
            context={"file_path": file_path, "workspace": str(workspace)}
        )
    
    # Infer language from extension if not provided
    if language is None:
        ext = target.suffix.lower()
        language_map = {
            ".py": "python",
            ".ts": "typescript",
            ".tsx": "typescript",
            ".js": "javascript",
            ".jsx": "javascript",
        }
        language = language_map.get(ext, "unknown")
    
    try:
        if language == "python":
            validation_result = await _validate_python(target)
        elif language == "typescript":
            validation_result = await _validate_typescript(target)
        elif language == "javascript":
            validation_result = await _validate_javascript(target)
        else:
            validation_result = SyntaxValidationResult(
                language=language,
                valid=True,
                errors=[],
                warnings=[{"message": f"No validator available for language: {language}", "type": "Info"}],
                validator_used="none",
            )
        
        output_data = {
            "file_path": file_path,
            "language": validation_result.language,
            "valid": validation_result.valid,
            "errors": validation_result.errors,
            "warnings": validation_result.warnings,
            "validator_used": validation_result.validator_used,
            "error_count": len(validation_result.errors),
            "warning_count": len(validation_result.warnings),
        }
        
        result = ToolExecutionResult(
            success=validation_result.valid,
            output=output_data,
            metadata={"validator": validation_result.validator_used},
        )
        log_tool_execution(
            "validate_syntax", context, {"file_path": file_path, "language": language}, result
        )
        
        return output_data
        
    except Exception as e:
        result = ToolExecutionResult(success=False, output=None, error=str(e))
        log_tool_execution(
            "validate_syntax", context, {"file_path": file_path, "language": language}, result
        )
        from app.core.exceptions import ToolExecutionError as CoreToolExecutionError
        raise CoreToolExecutionError(
            f"Syntax validation failed: {e}",
            context={
                "file_path": file_path,
                "language": language,
                "error_type": type(e).__name__,
            }
        ) from e
