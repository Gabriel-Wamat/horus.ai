from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
import re
import time
from typing import TYPE_CHECKING, Any

from langchain_core.tools import BaseTool

from app.agent_runtime.definitions import (
    AgentKind,
    AgentReasoningEventType,
    ToolCapability,
    ToolPolicy,
)
from app.agent_runtime.permission import PermissionPolicyEngine
from app.agent_runtime.tools import (
    apply_patch,
    diff_files,
    exec_command,
    file_tree,
    glob_files,
    list_directory,
    read_file,
    read_lints,
    run_tests,
    search_code,
    validate_syntax,
    write_file,
    edit_file,
)
from app.domain.models.assignment_command_log import AssignmentCommandLog
from app.domain.models.enums import AssignmentValidationStatus, ToolInvocationStatus
from app.schemas.target_repo import (
    DiffStatsSnapshot,
    SddTargetConfig,
    SpecialistExecutionPlan,
    WorkspaceContextSnapshot,
)
from app.services.realtime_event_service import EventType, get_realtime_event_service

if TYPE_CHECKING:
    from app.services.odin_workflow.runtime import OdinRuntime


@dataclass(slots=True)
class ToolExecutionContext:
    run_id: str
    assignment_id: str | None
    actor_name: str
    actor_kind: str
    conversation_id: str
    workspace_root: str
    config: SddTargetConfig
    tool_policy: ToolPolicy


@dataclass(slots=True)
class ToolExecutionEvidence:
    changed_files: list[str]
    command_logs: list[AssignmentCommandLog]
    diff_stats: DiffStatsSnapshot
    validation_status: AssignmentValidationStatus
    tool_summary: str
    execution_evidence: dict[str, Any]
    quality_gate: dict[str, Any] | None = None


@dataclass(slots=True)
class ToolRuntime:
    runtime: "OdinRuntime"
    policy_engine: PermissionPolicyEngine

    def get_langchain_tools(self, context: ToolExecutionContext) -> list[BaseTool]:
        """Get LangChain tools based on tool policy capabilities.

        Args:
            context: Tool execution context with policy

        Returns:
            List of LangChain tools available for this context
        """
        tools = []
        policy = context.tool_policy

        # Map capabilities to tools
        capability_tool_map = {
            ToolCapability.REPO_READ: [read_file, list_directory, file_tree],
            ToolCapability.REPO_WRITE: [write_file, edit_file],
            ToolCapability.REPO_PATCH: [apply_patch],
            ToolCapability.REPO_DIFF: [diff_files],
            ToolCapability.REPO_EXEC: [exec_command, run_tests],
            ToolCapability.REPO_TREE: [file_tree, list_directory, glob_files],
            ToolCapability.CODE_ANALYSIS: [diff_files, search_code],
            ToolCapability.CODE_VALIDATION: [validate_syntax, read_lints],
        }

        # Add tools based on allowed capabilities
        for capability in policy.capabilities:
            if capability in capability_tool_map:
                tools.extend(capability_tool_map[capability])

        # Remove duplicates
        seen_names = set()
        unique_tools = []
        for tool in tools:
            if tool.name not in seen_names:
                seen_names.add(tool.name)
                unique_tools.append(tool)

        return unique_tools

    def build_workspace_context(self, context: ToolExecutionContext) -> WorkspaceContextSnapshot:
        self.policy_engine.ensure_capability(context.tool_policy, ToolCapability.REPO_TREE)
        snapshot = self.runtime.target_repo_execution_service.build_workspace_context(
            context.workspace_root,
            context.config,
        )
        return snapshot

    def validate_execution_plan(self, context: ToolExecutionContext, plan: SpecialistExecutionPlan) -> None:
        if plan.file_operations:
            self.policy_engine.ensure_capability(context.tool_policy, ToolCapability.REPO_WRITE)
        if plan.command_requests or plan.validation_commands:
            self.policy_engine.ensure_capability(context.tool_policy, ToolCapability.REPO_EXEC)
        self.runtime.target_repo_execution_service.validate_plan(
            role_name=context.actor_name,
            plan=plan,
            config=context.config,
            workspace_root=context.workspace_root,
        )

    async def execute_plan(
        self,
        *,
        context: ToolExecutionContext,
        plan: SpecialistExecutionPlan,
        mode: str,
    ) -> ToolExecutionEvidence:
        workspace_root = Path(context.workspace_root).resolve()
        changed_files: list[str] = []
        command_logs: list[AssignmentCommandLog] = []
        validation_status = AssignmentValidationStatus.PENDING
        quality_gate: dict[str, Any] | None = None

        if mode == "shadow":
            changed_files = sorted({item.path for item in plan.file_operations})
            validation_status = AssignmentValidationStatus.SHADOW
            await self._emit_shadow_events(context=context, plan=plan)
        else:
            for operation in plan.file_operations:
                await self._emit_realtime_event(
                    context=context,
                    event_type=EventType.FILE_EDITING,
                    payload={"file_path": operation.path, "operation": operation.operation},
                    progress=35.0,
                )
            changed_files = await self.runtime.target_repo_execution_service.apply_file_operations(
                workspace_root=workspace_root,
                plan=plan,
                config=context.config,
            )
            for changed_file in changed_files:
                await self._record_tool_invocation(
                    context=context,
                    tool_name="repo.write",
                    capability=ToolCapability.REPO_WRITE,
                    status=ToolInvocationStatus.COMPLETED.value,
                    input_snapshot={"path": changed_file},
                    output_snapshot={"path": changed_file},
                )
                await self._emit_reasoning_event(
                    context=context,
                    event_type=AgentReasoningEventType.FILE_CHANGE,
                    title=f"Arquivo alterado por {context.actor_name}",
                    summary_md=f"`{changed_file}` entrou no diff do assignment atual.",
                    evidence_json={"path": changed_file},
                )
                await self._emit_realtime_event(
                    context=context,
                    event_type=EventType.FILE_EDIT_COMPLETE,
                    payload={"file_path": changed_file},
                    progress=45.0,
                )

            if getattr(self.runtime.settings, "QUALITY_GATE_ENABLED", True):
                await self._emit_realtime_event(
                    context=context,
                    event_type=EventType.VALIDATION_STARTED,
                    payload={
                        "changed_files": changed_files,
                        "validation_commands": list(plan.validation_commands),
                    },
                    progress=70.0,
                )
                quality_gate_run = await self.runtime.quality_gate_service.run(
                    role_name=context.actor_name,
                    workspace_root=workspace_root,
                    config=context.config,
                    changed_files=changed_files,
                    command_requests=plan.command_requests,
                    validation_commands=plan.validation_commands,
                    mode=mode,
                    command_started_callback=self._build_command_started_callback(context),
                    command_output_callback=self._build_command_output_callback(context),
                )
                command_results = quality_gate_run.command_results
                quality_gate = quality_gate_run.result.model_dump()
            else:
                await self._emit_realtime_event(
                    context=context,
                    event_type=EventType.VALIDATION_STARTED,
                    payload={"changed_files": changed_files, "quality_gate_enabled": False},
                    progress=70.0,
                )
                command_results = await self.runtime.target_repo_execution_service.execute_command_requests(
                    role_name=context.actor_name,
                    workspace_root=workspace_root,
                    config=context.config,
                    command_requests=plan.command_requests,
                    validation_commands=plan.validation_commands,
                    command_started_callback=self._build_command_started_callback(context),
                    command_output_callback=self._build_command_output_callback(context),
                )
                failed_results = [item for item in command_results if item.exit_code != 0]
                quality_gate = {
                    "status": "failed" if failed_results else "passed",
                    "coverage_level": "partial" if command_results else "none",
                    "checks": [],
                    "failed_checks": [],
                    "duration_ms": 0,
                    "summary": "Quality gate disabled; legacy command validation used",
                    "warnings": ["QUALITY_GATE_ENABLED is false"],
                }
            for result in command_results:
                log = await self.runtime.assignment_command_logs.create(
                    assignment_id=self._assignment_uuid(context.assignment_id),
                    command_id=result.command_id,
                    command=result.command,
                    cwd=result.cwd,
                    exit_code=result.exit_code,
                    stdout_tail=result.stdout_tail,
                    stderr_tail=result.stderr_tail,
                    started_at=result.started_at,
                    finished_at=result.finished_at,
                )
                command_logs.append(log)
                await self._record_tool_invocation(
                    context=context,
                    tool_name="repo.exec",
                    capability=ToolCapability.REPO_EXEC,
                    status=ToolInvocationStatus.COMPLETED.value if result.exit_code == 0 else ToolInvocationStatus.FAILED.value,
                    input_snapshot={"command_id": result.command_id, "command": result.command},
                    output_snapshot={
                        "exit_code": result.exit_code,
                        "stdout_tail": result.stdout_tail,
                        "stderr_tail": result.stderr_tail,
                    },
                    error_message=None if result.exit_code == 0 else result.stderr_tail,
                )
                await self._emit_reasoning_event(
                    context=context,
                    event_type=AgentReasoningEventType.TOOL_FINISHED,
                    title=f"Comando {result.command_id} executado",
                    summary_md=f"`{result.command_id}` terminou com exit code `{result.exit_code}`.",
                    evidence_json={"exit_code": result.exit_code, "command": result.command},
                )
                await self._emit_realtime_event(
                    context=context,
                    event_type=EventType.COMMAND_FINISHED,
                    payload={
                        "command_id": result.command_id,
                        "exit_code": result.exit_code,
                        "stdout_tail": result.stdout_tail,
                        "stderr_tail": result.stderr_tail,
                    },
                    progress=78.0,
                )
            latest_status_by_command_id: dict[str, int] = {}
            for item in command_results:
                latest_status_by_command_id[item.command_id] = item.exit_code
            gate_status = str(quality_gate.get("status") or "")
            if gate_status == "passed":
                validation_status = AssignmentValidationStatus.PASSED
                await self._emit_realtime_event(
                    context=context,
                    event_type=EventType.VALIDATION_PASSED,
                    payload={"coverage_level": quality_gate.get("coverage_level"), "summary": quality_gate.get("summary")},
                    progress=90.0,
                )
            elif gate_status == "skipped":
                validation_status = AssignmentValidationStatus.SKIPPED
            else:
                validation_status = AssignmentValidationStatus.FAILED
                failure_analysis = quality_gate.get("failure_analysis") if isinstance(quality_gate, dict) else None
                await self._emit_realtime_event(
                    context=context,
                    event_type=EventType.VALIDATION_FAILED,
                    payload={
                        "coverage_level": quality_gate.get("coverage_level"),
                        "summary": quality_gate.get("summary"),
                        "failure_category": (failure_analysis or {}).get("category") if isinstance(failure_analysis, dict) else None,
                        "failed_checks": quality_gate.get("failed_checks", []),
                    },
                    progress=90.0,
                )

        diff_stats = await self.runtime.target_repo_workspace_service.read_diff_stats(workspace_root)
        tool_summary = self._build_tool_summary(
            mode=mode,
            changed_files=changed_files,
            command_logs=command_logs,
            validation_status=validation_status,
        )
        evidence = {
            "mode": mode,
            "changed_files": changed_files,
            "commands": [log.command_id for log in command_logs],
            "validation_status": validation_status.value,
            "quality_gate": quality_gate,
            "diff_stats": diff_stats.model_dump(),
        }
        return ToolExecutionEvidence(
            changed_files=changed_files,
            command_logs=command_logs,
            diff_stats=diff_stats,
            validation_status=validation_status,
            tool_summary=tool_summary,
            execution_evidence=evidence,
            quality_gate=quality_gate,
        )

    async def _emit_shadow_events(self, *, context: ToolExecutionContext, plan: SpecialistExecutionPlan) -> None:
        for operation in plan.file_operations:
            await self._record_tool_invocation(
                context=context,
                tool_name="repo.write",
                capability=ToolCapability.REPO_WRITE,
                status=ToolInvocationStatus.SHADOW.value,
                input_snapshot={"path": operation.path, "operation": operation.operation},
                output_snapshot={"mode": "shadow"},
            )
        for command in plan.command_requests:
            await self._record_tool_invocation(
                context=context,
                tool_name="repo.exec",
                capability=ToolCapability.REPO_EXEC,
                status=ToolInvocationStatus.SHADOW.value,
                input_snapshot={"command_id": command.command_id},
                output_snapshot={"mode": "shadow"},
            )

    def _build_tool_summary(
        self,
        *,
        mode: str,
        changed_files: list[str],
        command_logs: list[AssignmentCommandLog],
        validation_status: AssignmentValidationStatus,
    ) -> str:
        commands = ", ".join(log.command_id for log in command_logs) or "no commands"
        return (
            f"Mode={mode}; changed_files={len(changed_files)}; commands={commands}; "
            f"validation_status={validation_status.value}"
        )

    async def _record_tool_invocation(
        self,
        *,
        context: ToolExecutionContext,
        tool_name: str,
        capability: ToolCapability,
        status: str,
        input_snapshot: dict[str, Any] | None,
        output_snapshot: dict[str, Any] | None,
        error_message: str | None = None,
    ) -> None:
        await self.runtime.tool_invocation_logs.create(
            run_id=self._run_uuid(context.run_id),
            assignment_id=self._assignment_uuid(context.assignment_id) if context.assignment_id else None,
            actor_name=context.actor_name,
            actor_kind=context.actor_kind,
            tool_name=tool_name,
            capability=capability.value,
            status=status,
            input_snapshot=input_snapshot,
            output_snapshot=output_snapshot,
            error_message=error_message,
        )

    async def _emit_reasoning_event(
        self,
        *,
        context: ToolExecutionContext,
        event_type: AgentReasoningEventType,
        title: str,
        summary_md: str,
        evidence_json: dict[str, Any] | None = None,
        is_streaming: bool = False,
    ) -> None:
        await self.runtime.agent_reasoning_events.create(
            run_id=self._run_uuid(context.run_id),
            assignment_id=self._assignment_uuid(context.assignment_id) if context.assignment_id else None,
            step_id=None,
            actor_name=context.actor_name,
            actor_kind=context.actor_kind,
            stage=AgentKind.EXECUTION.value,
            event_type=event_type.value,
            title=title,
            summary_md=summary_md,
            plan_json=None,
            evidence_json=evidence_json,
            visibility="trace",
            is_streaming=is_streaming,
        )

    async def _emit_realtime_event(
        self,
        *,
        context: ToolExecutionContext,
        event_type: EventType,
        payload: dict[str, Any] | None = None,
        progress: float | None = None,
        eta_seconds: float | None = None,
    ) -> None:
        if eta_seconds is None and progress is not None:
            calculator = getattr(self.runtime, "eta_calculator", None)
            if calculator is not None:
                eta_seconds = calculator.update_progress(context.run_id, progress=progress).eta_seconds
        service = getattr(self.runtime, "realtime_events", None) or get_realtime_event_service()
        await service.emit(
            event_type,
            context.run_id,
            conversation_id=context.conversation_id,
            assignment_id=context.assignment_id,
            agent_name=context.actor_name,
            payload=payload,
            progress=progress,
            eta_seconds=eta_seconds,
        )

    def _build_command_started_callback(
        self,
        context: ToolExecutionContext,
    ) -> Callable[[str, str], Awaitable[None]]:
        async def _callback(command_id: str, shell_command: str) -> None:
            await self._emit_reasoning_event(
                context=context,
                event_type=AgentReasoningEventType.TOOL_STARTED,
                title=f"Comando {command_id} iniciado",
                summary_md=(
                    f"Comando `{command_id}` iniciado. "
                    "O comando completo fica restrito aos detalhes operacionais."
                ),
                evidence_json={"command_id": command_id, "command": shell_command},
                is_streaming=True,
            )
            await self._emit_realtime_event(
                context=context,
                event_type=EventType.COMMAND_STARTED,
                payload={"command_id": command_id},
                progress=72.0,
            )

        return _callback

    def _build_command_output_callback(
        self,
        context: ToolExecutionContext,
    ) -> Callable[[str, str], Awaitable[None]]:
        buffers: dict[str, str] = {}
        last_emit_by_command: dict[str, float] = {}
        runtime_settings = getattr(self.runtime, "settings", None)
        max_chars = max(200, int(getattr(runtime_settings, "ODIN_COMMAND_STREAM_EVENT_CHARS", 800)))
        min_interval = max(
            0.1,
            float(getattr(runtime_settings, "ODIN_COMMAND_STREAM_EVENT_MIN_INTERVAL_SECONDS", 0.75)),
        )

        async def _flush(command_id: str, *, force: bool = False) -> None:
            chunk = buffers.get(command_id, "")
            if not chunk:
                return
            now = time.monotonic()
            last_emit = last_emit_by_command.get(command_id, 0.0)
            if not force and len(chunk) < max_chars and (now - last_emit) < min_interval:
                return

            buffers[command_id] = ""
            last_emit_by_command[command_id] = now
            preview = chunk[-max_chars:].strip()
            if not preview:
                return
            await self._emit_reasoning_event(
                context=context,
                event_type=AgentReasoningEventType.WORKFLOW_UPDATE,
                title=f"Saída parcial: {command_id}",
                summary_md=f"```text\n{preview}\n```",
                evidence_json={"command_id": command_id, "stream_preview": preview},
                is_streaming=True,
            )
            await self._emit_realtime_event(
                context=context,
                event_type=EventType.COMMAND_OUTPUT,
                payload={"command_id": command_id, "stream_preview": preview},
                progress=75.0,
            )

        async def _callback(command_id: str, raw_chunk: str) -> None:
            normalized_chunk = self._normalize_command_stream_chunk(raw_chunk)
            if not normalized_chunk:
                return
            current = buffers.get(command_id, "")
            merged = current + normalized_chunk
            if len(merged) > (max_chars * 3):
                merged = merged[-(max_chars * 3) :]
            buffers[command_id] = merged
            await _flush(command_id)

        async def _finalize(command_id: str) -> None:
            await _flush(command_id, force=True)

        # Wrap callback to support final flush when command ends:
        async def _wrapped(command_id: str, raw_chunk: str) -> None:
            await _callback(command_id, raw_chunk)
            if raw_chunk.endswith("\n"):
                await _flush(command_id)

        # attach helper used by execute_plan after command execution
        _wrapped.finalize = _finalize  # type: ignore[attr-defined]
        return _wrapped

    @staticmethod
    def _normalize_command_stream_chunk(raw_chunk: str) -> str:
        if not raw_chunk:
            return ""
        # Strip ANSI escape sequences from interactive terminals for clean transcript rendering.
        without_ansi = re.sub(r"\x1b\[[0-9;?]*[ -/]*[@-~]", "", raw_chunk)
        normalized = without_ansi.replace("\r\n", "\n").replace("\r", "\n")
        normalized = "".join(char for char in normalized if char == "\n" or ord(char) >= 32)
        return normalized

    @staticmethod
    def _run_uuid(value: str) -> uuid.UUID:
        return uuid.UUID(str(value))

    @staticmethod
    def _assignment_uuid(value: str | None) -> uuid.UUID:
        if value is None:
            raise ValueError("assignment_id is required for command logging")
        return uuid.UUID(str(value))
