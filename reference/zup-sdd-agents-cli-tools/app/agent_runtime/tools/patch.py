"""Patch application tool for efficient file modifications.

Provides patch-based file editing to minimize token usage
when making small changes to large files.
"""
from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from langchain.tools import tool

from app.agent_runtime.agent_runtime import AgentRuntimeContext
from app.agent_runtime.tools.base import (
    ensure_write_allowed_for_context,
    ToolExecutionError,
    ToolExecutionResult,
    log_tool_execution,
    resolve_tool_context,
    resolve_workspace,
    validate_workspace_path,
)
from app.tools.bash_tool import BashTool


@dataclass
class PatchResult:
    """Result of patch application."""
    
    success: bool
    file_path: str
    lines_added: int
    lines_removed: int
    hunks_applied: int
    error_message: str | None = None


async def _apply_unified_patch(file_path: Path, patch_content: str) -> PatchResult:
    """Apply unified diff patch to a file.
    
    Args:
        file_path: Path to file to patch
        patch_content: Unified diff format patch
        
    Returns:
        PatchResult with application status
        
    Raises:
        ToolExecutionError: If patch application fails
    """
    if not file_path.exists():
        return PatchResult(
            success=False,
            file_path=str(file_path),
            lines_added=0,
            lines_removed=0,
            hunks_applied=0,
            error_message=f"File does not exist: {file_path}"
        )
    
    # Create temporary patch file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.patch', delete=False) as f:
        f.write(patch_content)
        patch_file = Path(f.name)
    
    try:
        command = " ".join(
            [
                "patch",
                "-u",
                "-i",
                BashTool.quote_arg(str(patch_file)),
                BashTool.quote_arg(str(file_path)),
            ]
        )
        result = await BashTool(
            default_timeout_ms=10_000,
            sandbox_enabled=True,
            allowed_paths=[file_path.parent],
        ).execute(command, cwd=file_path.parent, timeout_ms=10_000)

        if result.timed_out:
            from app.core.exceptions import ToolTimeoutError
            raise ToolTimeoutError(
                "Patch application timed out after 10s",
                context={"file_path": str(file_path)},
            )

        if result.exit_code == 0:
            # Count changes from patch
            lines_added = patch_content.count('\n+') - patch_content.count('\n+++')
            lines_removed = patch_content.count('\n-') - patch_content.count('\n---')
            hunks_applied = patch_content.count('\n@@')
            
            return PatchResult(
                success=True,
                file_path=str(file_path),
                lines_added=lines_added,
                lines_removed=lines_removed,
                hunks_applied=hunks_applied,
            )
        else:
            # Patch failed
            error_source = result.stderr or result.stdout
            error_lines = error_source.strip().split('\n')[:3]  # First 3 lines
            error_msg = '\n'.join(error_lines)
            
            return PatchResult(
                success=False,
                file_path=str(file_path),
                lines_added=0,
                lines_removed=0,
                hunks_applied=0,
                error_message=f"Patch failed: {error_msg}"
            )
    
    except Exception as e:
        from app.core.exceptions import ToolExecutionError as CoreToolExecutionError
        if isinstance(e, CoreToolExecutionError):
            raise
        raise CoreToolExecutionError(
            f"Failed to apply patch: {e}",
            context={
                "file_path": str(file_path),
                "error_type": type(e).__name__
            }
        ) from e
    finally:
        # Cleanup temp file
        if patch_file.exists():
            patch_file.unlink()


@tool
async def apply_patch(
    file_path: str,
    patch_content: str,
    context: AgentRuntimeContext | None = None,
) -> dict[str, Any]:
    """Apply unified diff patch to a file.
    
    More efficient than rewriting entire file for small changes.
    Patch format is standard unified diff (output of diff -u).
    
    Args:
        file_path: Path to file relative to workspace
        patch_content: Unified diff format patch starting with @@ line
        context: Agent runtime context
        
    Returns:
        Dict with:
            - success: bool
            - file_path: str
            - lines_added: int
            - lines_removed: int
            - hunks_applied: int
            - error_message: str | None
            
    Example patch_content:
        @@ -10,6 +10,7 @@
         def existing_function():
             pass
         
        +def new_function():
        +    return "new feature"
        +
         def another_function():
             pass
    
    Raises:
        ToolExecutionError: If patch application fails
    """
    context = resolve_tool_context(context)
    workspace = resolve_workspace(context)
    target = validate_workspace_path(file_path, workspace)
    ensure_write_allowed_for_context(target_path=target, workspace=workspace, context=context)
    
    try:
        patch_result = await _apply_unified_patch(target, patch_content)
        
        output_data = {
            "success": patch_result.success,
            "file_path": file_path,
            "lines_added": patch_result.lines_added,
            "lines_removed": patch_result.lines_removed,
            "hunks_applied": patch_result.hunks_applied,
            "error_message": patch_result.error_message,
        }
        
        result = ToolExecutionResult(
            success=patch_result.success,
            output=output_data,
            error=patch_result.error_message,
            metadata={
                "tool": "apply_patch",
                "workspace": str(workspace),
                "target_file": str(target),
            }
        )
        
        log_tool_execution("apply_patch", context, {"file_path": file_path}, result)
        
        if not patch_result.success:
            from app.core.exceptions import ToolExecutionError as CoreToolExecutionError
            raise CoreToolExecutionError(
                f"Patch failed: {patch_result.error_message}",
                context={
                    "file_path": file_path,
                    "workspace": str(workspace),
                }
            )

        return output_data
    except ToolExecutionError:
        raise
    except Exception as e:
        from app.core.exceptions import ToolExecutionError as CoreToolExecutionError
        if isinstance(e, CoreToolExecutionError):
            raise
        raise CoreToolExecutionError(
            f"Unexpected error applying patch: {e}",
            context={
                "file_path": file_path,
                "workspace": str(workspace),
                "error_type": type(e).__name__,
            }
        ) from e
