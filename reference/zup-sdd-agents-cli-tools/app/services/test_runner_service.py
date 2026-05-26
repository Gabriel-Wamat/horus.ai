"""Structured validation command selection and parsing."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.target_repo import SddTargetConfig
from app.services.target_repo.execution_service import CommandExecutionResult


ValidationKind = Literal["lint", "check", "test", "build", "smoke", "syntax", "command"]
CoverageLevel = Literal["full", "partial", "syntax_only", "none"]


class ValidationDiagnostic(BaseModel):
    """Normalized linter/compiler/test diagnostic."""

    file: str | None = None
    line: int | None = None
    column: int | None = None
    message: str
    severity: str = "error"


class ValidationCheckResult(BaseModel):
    """One command or fallback check executed by the quality gate."""

    kind: ValidationKind
    command_id: str | None = None
    command: str | None = None
    exit_code: int | None = None
    passed: bool
    diagnostics: list[ValidationDiagnostic] = Field(default_factory=list)
    stdout_tail: str = ""
    stderr_tail: str = ""
    summary: str = ""
    coverage: float | None = None
    framework: str | None = None


class TestRunnerService:
    """Select validation commands and parse their output into structured reports."""

    _VALIDATION_PREFIXES = ("lint_", "check_", "test_", "build_", "smoke_")
    _SOURCE_EXTENSIONS = {
        ".py",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".go",
        ".rs",
        ".java",
        ".kt",
        ".swift",
    }

    def select_validation_command_ids(
        self,
        *,
        role_name: str,
        config: SddTargetConfig,
        changed_files: list[str],
        explicit_validation_commands: list[str],
        max_commands: int,
    ) -> list[str]:
        """Choose bounded validation commands from the target contract."""
        role_profile = config.role_profiles.get(role_name)
        allowed = set(role_profile.allowed_commands if role_profile else config.command_catalog.keys())
        defaults = [
            command_id
            for command_id in (role_profile.default_validation_commands if role_profile else [])
            if command_id in allowed and command_id in config.command_catalog
        ]
        explicit = [
            command_id
            for command_id in explicit_validation_commands
            if command_id in allowed and command_id in config.command_catalog
        ]
        candidates = list(dict.fromkeys(explicit + defaults))

        if not candidates:
            candidates = [
                command_id
                for command_id in config.command_catalog
                if command_id in allowed and command_id.startswith(self._VALIDATION_PREFIXES)
            ]

        if role_name == "qa_specialist":
            candidates = list(
                dict.fromkeys(
                    candidates
                    + [
                        command_id
                        for command_id in config.test_runner_ids
                        if command_id in allowed and command_id in config.command_catalog
                    ]
                )
            )

        grouped: dict[ValidationKind, list[str]] = {
            "lint": [],
            "check": [],
            "test": [],
            "build": [],
            "smoke": [],
            "command": [],
            "syntax": [],
        }
        for command_id in candidates:
            kind = self.classify_command(command_id, config.command_catalog.get(command_id, ""))
            grouped.setdefault(kind, []).append(command_id)

        selected: list[str] = []
        if grouped["lint"]:
            selected.append(grouped["lint"][0])
        if grouped["check"]:
            selected.append(grouped["check"][0])

        test_ids = grouped["test"]
        if role_name == "qa_specialist":
            selected.extend(test_ids)
        elif test_ids:
            selected.append(test_ids[0])

        if self._touches_production_code(changed_files) and grouped["build"]:
            selected.append(grouped["build"][0])
        if grouped["smoke"]:
            selected.append(grouped["smoke"][0])

        if not selected:
            selected = candidates

        return list(dict.fromkeys(selected))[: max(1, max_commands)]

    def parse_command_result(self, result: CommandExecutionResult, workspace_root: str | Path) -> ValidationCheckResult:
        """Parse one executed command into a structured check result."""
        command_text = result.command or ""
        combined_output = "\n".join(part for part in (result.stdout_tail, result.stderr_tail) if part)
        kind = self.classify_command(result.command_id, command_text)
        diagnostics = self.parse_diagnostics(combined_output)
        framework = self.detect_framework(result.command_id, command_text, combined_output)
        coverage = self.parse_coverage(workspace_root=workspace_root, output=combined_output)
        summary = self.parse_summary(kind=kind, output=combined_output, exit_code=result.exit_code)

        return ValidationCheckResult(
            kind=kind,
            command_id=result.command_id,
            command=command_text,
            exit_code=result.exit_code,
            passed=result.exit_code == 0,
            diagnostics=diagnostics[:50],
            stdout_tail=result.stdout_tail,
            stderr_tail=result.stderr_tail,
            summary=summary,
            coverage=coverage,
            framework=framework,
        )

    def build_coverage_level(self, checks: list[ValidationCheckResult], *, fallback_used: bool = False) -> CoverageLevel:
        """Return quality-gate coverage level for executed checks."""
        if fallback_used:
            return "syntax_only"
        if not checks:
            return "none"
        kinds = {check.kind for check in checks}
        if "test" in kinds and ({"lint", "check", "build"} & kinds):
            return "full"
        return "partial"

    def classify_command(self, command_id: str, command: str) -> ValidationKind:
        """Classify a configured command id."""
        searchable = f"{command_id} {command}".casefold()
        if "lint" in searchable or "eslint" in searchable or "ruff" in searchable or "flake8" in searchable:
            return "lint"
        if "check" in searchable or "mypy" in searchable or "pyright" in searchable or "tsc" in searchable:
            return "check"
        if "test" in searchable or "pytest" in searchable or "vitest" in searchable or "jest" in searchable:
            return "test"
        if "build" in searchable or "compile" in searchable:
            return "build"
        if "smoke" in searchable:
            return "smoke"
        return "command"

    def parse_diagnostics(self, text: str) -> list[ValidationDiagnostic]:
        """Parse common linter/compiler diagnostic lines."""
        diagnostics: list[ValidationDiagnostic] = []
        seen: set[tuple[str | None, int | None, int | None, str]] = set()
        patterns = (
            re.compile(r"^(?P<file>[^:\n]+):(?P<line>\d+):(?P<column>\d+):\s*(?P<message>.+)$"),
            re.compile(r"^(?P<file>[^:\n]+):(?P<line>\d+):\s*(?P<message>.+)$"),
            re.compile(r"^(?P<file>.+?)\((?P<line>\d+),(?P<column>\d+)\):\s*(?P<message>.+)$"),
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
                line_number = int(data["line"]) if data.get("line") else None
                column_number = int(data["column"]) if data.get("column") else None
                key = (data.get("file"), line_number, column_number, message)
                if key in seen:
                    break
                seen.add(key)
                diagnostics.append(
                    ValidationDiagnostic(
                        file=data.get("file"),
                        line=line_number,
                        column=column_number,
                        message=message,
                        severity=self._infer_severity(message),
                    )
                )
                break
        return diagnostics

    def parse_summary(self, *, kind: ValidationKind, output: str, exit_code: int) -> str:
        """Return a compact human summary for common runners."""
        normalized = " ".join(output.split())

        pytest_match = re.search(
            r"(?P<failed>\d+)\s+failed.*?(?P<passed>\d+)\s+passed|(?P<passed_only>\d+)\s+passed",
            normalized,
            re.IGNORECASE,
        )
        if pytest_match:
            failed = pytest_match.group("failed") or "0"
            passed = pytest_match.group("passed") or pytest_match.group("passed_only") or "0"
            return f"pytest: {passed} passed, {failed} failed"

        vitest_tests = re.search(r"Tests\s+(?:(?P<failed>\d+)\s+failed\s+\|\s+)?(?P<passed>\d+)\s+passed", normalized)
        if vitest_tests:
            return f"vitest/jest: {vitest_tests.group('passed')} passed, {vitest_tests.group('failed') or '0'} failed"
        if "No test files found" in output:
            return "vitest/jest: no test files found"

        diagnostic_count = len(self.parse_diagnostics(output))
        if diagnostic_count:
            return f"{kind}: {diagnostic_count} diagnostic(s)"
        return f"{kind}: {'passed' if exit_code == 0 else f'failed with exit code {exit_code}'}"

    def parse_coverage(self, *, workspace_root: str | Path, output: str) -> float | None:
        """Parse coverage from known artifacts or command output."""
        workspace = Path(workspace_root)
        coverage_xml = workspace / "coverage.xml"
        if coverage_xml.exists():
            try:
                root = ET.parse(coverage_xml).getroot()
                rate = root.attrib.get("line-rate")
                if rate is not None:
                    return round(float(rate) * 100, 2)
            except (ET.ParseError, OSError, ValueError):
                pass

        lcov = workspace / "coverage" / "lcov.info"
        if not lcov.exists():
            lcov = workspace / "lcov.info"
        if lcov.exists():
            try:
                found = hit = 0
                for line in lcov.read_text(encoding="utf-8", errors="ignore").splitlines():
                    if line.startswith("LF:"):
                        found += int(line.split(":", 1)[1])
                    elif line.startswith("LH:"):
                        hit += int(line.split(":", 1)[1])
                if found:
                    return round((hit / found) * 100, 2)
            except (OSError, ValueError):
                pass

        match = re.search(r"TOTAL\s+\d+\s+\d+\s+(?P<coverage>\d+(?:\.\d+)?)%", output)
        if match:
            return float(match.group("coverage"))
        return None

    def detect_framework(self, command_id: str, command: str, output: str) -> str | None:
        """Infer test/check framework."""
        searchable = f"{command_id} {command} {output}".casefold()
        for framework in ("pytest", "vitest", "jest", "tsc", "eslint", "ruff", "mypy", "pyright"):
            if framework in searchable:
                return framework
        return None

    @classmethod
    def _touches_production_code(cls, changed_files: list[str]) -> bool:
        for path in changed_files:
            candidate = Path(path)
            lowered = candidate.as_posix().casefold()
            if candidate.suffix.lower() not in cls._SOURCE_EXTENSIONS:
                continue
            if any(token in lowered for token in ("/test", ".test.", ".spec.", "__tests__")):
                continue
            return True
        return False

    @staticmethod
    def _infer_severity(message: str) -> str:
        lowered = message.casefold()
        if "warning" in lowered or lowered.startswith("w"):
            return "warning"
        if "info" in lowered:
            return "info"
        return "error"


def create_test_runner_service() -> TestRunnerService:
    """Factory function."""
    return TestRunnerService()
