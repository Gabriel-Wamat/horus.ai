"""Mandatory validation gate for specialist execution."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable, Literal

from pydantic import BaseModel, Field

from app.agent_runtime.tools.syntax_validation import _fallback_lint_diagnostics
from app.core.config import Settings, settings
from app.core.logging import get_logger
from app.schemas.target_repo import CommandRequest, SddTargetConfig
from app.services.failure_analysis_service import FailureAnalysis, FailureAnalysisService
from app.services.target_repo.execution_service import (
    CommandExecutionResult,
    TargetRepoExecutionError,
    TargetRepoExecutionService,
)
from app.services.test_runner_service import (
    CoverageLevel,
    TestRunnerService,
    ValidationCheckResult,
    ValidationDiagnostic,
)

logger = get_logger(__name__)

QualityGateStatus = Literal["passed", "failed", "skipped"]


class QualityGateResult(BaseModel):
    """Serializable quality gate result persisted with assignment evidence."""

    status: QualityGateStatus
    coverage_level: CoverageLevel
    checks: list[ValidationCheckResult] = Field(default_factory=list)
    failed_checks: list[ValidationCheckResult] = Field(default_factory=list)
    duration_ms: int = 0
    summary: str
    warnings: list[str] = Field(default_factory=list)
    failure_analysis: FailureAnalysis | None = None


@dataclass(slots=True)
class QualityGateRun:
    """Runtime-only quality gate output, including command result objects."""

    result: QualityGateResult
    command_results: list[CommandExecutionResult]


class QualityGateService:
    """Run the mandatory validation protocol for changed assignments."""

    def __init__(
        self,
        *,
        settings: Settings = settings,
        target_repo_execution_service: TargetRepoExecutionService | None = None,
        test_runner_service: TestRunnerService | None = None,
        failure_analysis_service: FailureAnalysisService | None = None,
    ):
        self.settings = settings
        self.target_repo_execution_service = target_repo_execution_service or TargetRepoExecutionService(settings=settings)
        self.test_runner_service = test_runner_service or TestRunnerService()
        self.failure_analysis_service = failure_analysis_service or FailureAnalysisService()

    async def run(
        self,
        *,
        role_name: str,
        workspace_root: str | Path,
        config: SddTargetConfig,
        changed_files: list[str],
        command_requests: list[CommandRequest],
        validation_commands: list[str],
        mode: str,
        command_started_callback: Callable[[str, str], Awaitable[None]] | None = None,
        command_output_callback: Callable[[str, str], Awaitable[None]] | None = None,
    ) -> QualityGateRun:
        """Execute quality checks and return structured evidence."""
        start = datetime.now(timezone.utc)
        workspace = Path(workspace_root).resolve()

        if not getattr(self.settings, "QUALITY_GATE_ENABLED", True):
            return self._skipped(start, "Quality gate disabled by settings")

        if mode == "shadow":
            return self._skipped(start, "Shadow mode does not execute validation")

        max_commands = max(1, int(getattr(self.settings, "QUALITY_GATE_MAX_COMMANDS", 5)))
        selected_validation_ids = self.test_runner_service.select_validation_command_ids(
            role_name=role_name,
            config=config,
            changed_files=changed_files,
            explicit_validation_commands=validation_commands,
            max_commands=max_commands,
        )

        if mode == "apply" and not selected_validation_ids and not command_requests:
            return await self._run_syntax_fallback(start=start, workspace_root=workspace)

        if mode != "apply" and not changed_files and not command_requests and role_name != "qa_specialist":
            return self._skipped(start, "No changed files; validation not required")

        if selected_validation_ids or command_requests:
            return await self._run_catalog_commands(
                start=start,
                role_name=role_name,
                workspace_root=workspace,
                config=config,
                command_requests=command_requests,
                validation_commands=selected_validation_ids,
                command_started_callback=command_started_callback,
                command_output_callback=command_output_callback,
            )

        return await self._run_syntax_fallback(start=start, workspace_root=workspace)

    async def _run_catalog_commands(
        self,
        *,
        start: datetime,
        role_name: str,
        workspace_root: Path,
        config: SddTargetConfig,
        command_requests: list[CommandRequest],
        validation_commands: list[str],
        command_started_callback: Callable[[str, str], Awaitable[None]] | None,
        command_output_callback: Callable[[str, str], Awaitable[None]] | None,
    ) -> QualityGateRun:
        try:
            command_results = await self.target_repo_execution_service.execute_command_requests(
                role_name=role_name,
                workspace_root=workspace_root,
                config=config,
                command_requests=command_requests,
                validation_commands=validation_commands,
                command_started_callback=command_started_callback,
                command_output_callback=command_output_callback,
            )
        except TargetRepoExecutionError as exc:
            candidate_command_ids = validation_commands or [request.command_id for request in command_requests]
            analysis = self.failure_analysis_service.classify(
                command_id=candidate_command_ids[0] if candidate_command_ids else None,
                kind="command",
                output=str(exc),
                exit_code=126,
            )
            failed_check = ValidationCheckResult(
                kind="command",
                command_id=analysis.command_id,
                exit_code=126,
                passed=False,
                diagnostics=[
                    ValidationDiagnostic(
                        message=str(exc),
                        severity="error",
                    )
                ],
                summary=str(exc),
                stderr_tail=str(exc),
            )
            result = QualityGateResult(
                status="failed",
                coverage_level="none",
                checks=[failed_check],
                failed_checks=[failed_check],
                duration_ms=self._elapsed_ms(start),
                summary=f"Quality gate failed before command execution: {exc}",
                warnings=["Validation command was blocked or rejected before execution"],
                failure_analysis=analysis,
            )
            return QualityGateRun(result=result, command_results=[])
        checks = [
            self.test_runner_service.parse_command_result(result, workspace_root)
            for result in command_results
        ]
        failed_checks = [check for check in checks if not check.passed]
        status: QualityGateStatus = "failed" if failed_checks else "passed"
        coverage_level = self.test_runner_service.build_coverage_level(checks)
        warnings = []
        if coverage_level in {"partial", "none"}:
            warnings.append(f"Validation coverage is {coverage_level}")

        result = QualityGateResult(
            status=status,
            coverage_level=coverage_level,
            checks=checks,
            failed_checks=failed_checks,
            duration_ms=self._elapsed_ms(start),
            summary=self._summary(status=status, checks=checks, coverage_level=coverage_level),
            warnings=warnings,
        )
        if status == "failed":
            result.failure_analysis = self.failure_analysis_service.analyze_quality_gate(result.model_dump())
        return QualityGateRun(result=result, command_results=command_results)

    async def _run_syntax_fallback(self, *, start: datetime, workspace_root: Path) -> QualityGateRun:
        fallback = await _fallback_lint_diagnostics(workspace_root, workspace_root)
        diagnostics = [
            ValidationDiagnostic(
                file=item.get("file"),
                line=item.get("line"),
                column=item.get("column"),
                message=str(item.get("message") or ""),
                severity=str(item.get("severity") or "error"),
            )
            for item in fallback.get("diagnostics", [])
        ]
        failed = any(item.severity == "error" for item in diagnostics)
        check = ValidationCheckResult(
            kind="syntax",
            command_id=None,
            exit_code=1 if failed else 0,
            passed=not failed,
            diagnostics=diagnostics[:50],
            summary=(
                f"syntax fallback: {len(diagnostics)} diagnostic(s)"
                if diagnostics
                else "syntax fallback: no diagnostics found"
            ),
        )
        result = QualityGateResult(
            status="failed" if failed else "passed",
            coverage_level="syntax_only",
            checks=[check],
            failed_checks=[] if check.passed else [check],
            duration_ms=self._elapsed_ms(start),
            summary=check.summary,
            warnings=["No validation commands found; used syntax-only fallback"],
        )
        if failed:
            result.failure_analysis = self.failure_analysis_service.analyze_quality_gate(result.model_dump())
        return QualityGateRun(result=result, command_results=[])

    def _skipped(self, start: datetime, reason: str) -> QualityGateRun:
        result = QualityGateResult(
            status="skipped",
            coverage_level="none",
            duration_ms=self._elapsed_ms(start),
            summary=reason,
        )
        return QualityGateRun(result=result, command_results=[])

    @staticmethod
    def _summary(*, status: QualityGateStatus, checks: list[ValidationCheckResult], coverage_level: CoverageLevel) -> str:
        passed = sum(1 for check in checks if check.passed)
        failed = len(checks) - passed
        return f"Quality gate {status}: {passed} passed, {failed} failed ({coverage_level})"

    @staticmethod
    def _elapsed_ms(start: datetime) -> int:
        return max(0, int((datetime.now(timezone.utc) - start).total_seconds() * 1000))


def create_quality_gate_service(
    *,
    settings: Settings = settings,
    target_repo_execution_service: TargetRepoExecutionService | None = None,
) -> QualityGateService:
    """Factory function."""
    return QualityGateService(
        settings=settings,
        target_repo_execution_service=target_repo_execution_service,
    )
