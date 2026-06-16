from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class SddTargetRoleProfile(BaseModel):
    allowed_commands: list[str] = Field(default_factory=list)
    default_validation_commands: list[str] = Field(default_factory=list)


class SddTargetConfig(BaseModel):
    version: int
    base_ref: str
    write_roots: list[str] = Field(default_factory=list)
    command_catalog: dict[str, str] = Field(default_factory=dict)
    test_runner_ids: list[str] = Field(default_factory=list)
    bootstrap_commands: list[str] = Field(default_factory=list)
    role_profiles: dict[str, SddTargetRoleProfile] = Field(default_factory=dict)


class FileOperation(BaseModel):
    operation: Literal["write", "delete"]
    path: str
    reason: str
    content: str | None = None
    content_base64: str | None = None


class CommandRequest(BaseModel):
    command_id: str
    reason: str


class ArchitectureBlueprint(BaseModel):
    summary: str = ""
    style: str = ""
    impacted_components: list[str] = Field(default_factory=list)
    integration_points: list[str] = Field(default_factory=list)
    validation_strategy: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class SpecialistExecutionPlan(BaseModel):
    summary: str
    file_operations: list[FileOperation] = Field(default_factory=list)
    command_requests: list[CommandRequest] = Field(default_factory=list)
    validation_commands: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    architecture_blueprint: ArchitectureBlueprint | None = None


class FileChangeSnapshot(BaseModel):
    path: str
    status: Literal["created", "modified", "deleted", "renamed", "binary", "unknown"] = "modified"
    insertions: int = 0
    deletions: int = 0
    preview: str | None = None
    language: str | None = None


class DiffStatsSnapshot(BaseModel):
    files_changed: int = 0
    insertions: int = 0
    deletions: int = 0
    changed_paths: list[str] = Field(default_factory=list)
    file_changes: list[FileChangeSnapshot] = Field(default_factory=list)


class WorkspaceSnapshot(BaseModel):
    path: str | None = None
    branch: str | None = None
    base_ref: str | None = None
    status: str | None = None
    diff_stats: DiffStatsSnapshot | None = None


class AssignmentCommandLogSnapshot(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    command_id: str
    command: str
    cwd: str
    exit_code: int | None = None
    stdout_tail: str = ""
    stderr_tail: str = ""
    started_at: datetime
    finished_at: datetime | None = None


class WorkspaceDiffResponse(BaseModel):
    run_id: uuid.UUID
    workspace: WorkspaceSnapshot
    diff: str
    diff_stats: DiffStatsSnapshot
    generated_at: datetime


class AssignmentCommandLogsResponse(BaseModel):
    run_id: uuid.UUID
    assignment_id: uuid.UUID
    commands: list[AssignmentCommandLogSnapshot] = Field(default_factory=list)


class WorkspaceFileSnapshot(BaseModel):
    path: str
    content: str
    size_bytes: int


class WorkspaceContextSnapshot(BaseModel):
    root: str
    tree: list[str] = Field(default_factory=list)
    files: list[WorkspaceFileSnapshot] = Field(default_factory=list)
    command_catalog: dict[str, str] = Field(default_factory=dict)
    write_roots: list[str] = Field(default_factory=list)


class SpecialistExecutionResult(BaseModel):
    artifact_summary: dict[str, Any]
    changed_files: list[str] = Field(default_factory=list)
    commands_run: list[str] = Field(default_factory=list)
    test_report: dict[str, Any] = Field(default_factory=dict)
    quality_gate: dict[str, Any] | None = None
    diff_stats: DiffStatsSnapshot = Field(default_factory=DiffStatsSnapshot)
    command_logs: list[AssignmentCommandLogSnapshot] = Field(default_factory=list)
    workspace_path: str | None = None
    validation_status: Literal["pending", "passed", "failed", "shadow", "skipped"] = "pending"
