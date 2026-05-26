from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Type

from pydantic import BaseModel


class AgentKind(StrEnum):
    PLANNING = "planning"
    REVIEW = "review"
    EXECUTION = "execution"
    VERIFICATION = "verification"
    CURATION = "curation"
    SYSTEM = "system"
    EXPLORATION = "exploration"


class ModelRole(StrEnum):
    CHAT = "chat"
    SPEC_AUTHOR = "spec_author"
    SPEC_REVIEWER = "spec_reviewer"
    SUPERVISOR = "supervisor"
    REPO_EXPLORER = "repo_explorer"
    BACKEND_SPECIALIST = "backend_specialist"
    FRONTEND_SPECIALIST = "frontend_specialist"
    QA_SPECIALIST = "qa_specialist"
    VERIFICATION = "verification"
    CURATOR = "curator"
    SUMMARY = "summary"


class ToolCapability(StrEnum):
    REPO_READ = "repo.read"
    REPO_WRITE = "repo.write"
    REPO_PATCH = "repo.patch"
    REPO_DIFF = "repo.diff"
    REPO_EXEC = "repo.exec"
    REPO_TREE = "repo.tree"
    CODE_ANALYSIS = "code.analysis"
    CODE_VALIDATION = "code.validation"
    MEMORY_READ = "memory.read"
    MEMORY_WRITE = "memory.write"
    MCP_RESOURCE = "mcp.resource"


class ToolDecision(StrEnum):
    ALLOW = "allow"
    ASK = "ask"
    DENY = "deny"


class MemoryScope(StrEnum):
    PLATFORM = "platform"
    SESSION = "session"
    BENCHMARK_OR_PROJECT = "benchmark_or_project"
    TARGET_REPO = "target_repo"
    AGENT_LOCAL = "agent_local"


class IsolationPolicy(StrEnum):
    NONE = "none"
    READ_ONLY = "read_only"
    WORKTREE = "worktree"
    PROJECT_ROOT = "project_root"


class AgentBackgroundPolicy(StrEnum):
    FOREGROUND = "foreground"
    BACKGROUND = "background"


class AgentReasoningVisibility(StrEnum):
    CHAT = "chat"
    TRACE = "trace"
    INTERNAL = "internal"


class AgentReasoningEventType(StrEnum):
    REASONING_SUMMARY = "reasoning_summary"
    PLAN_CREATED = "plan_created"
    PLAN_REVISED = "plan_revised"
    DECISION_RATIONALE = "decision_rationale"
    TOOL_STARTED = "tool_started"
    TOOL_FINISHED = "tool_finished"
    TOOL_SUMMARY = "tool_summary"
    FILE_CHANGE = "file_change"
    VALIDATION_STARTED = "validation_started"
    VALIDATION_FINISHED = "validation_finished"
    REVIEW_REQUESTED = "review_requested"
    REVIEW_DECIDED = "review_decided"
    VERIFICATION_VERDICT = "verification_verdict"
    CURATION_VERDICT = "curation_verdict"
    WORKFLOW_UPDATE = "workflow_update"
    WARNING = "warning"
    ERROR = "error"


@dataclass(frozen=True, slots=True)
class ToolPolicy:
    capabilities: tuple[ToolCapability, ...] = ()
    allow_commands: bool = False
    read_only: bool = False


@dataclass(frozen=True, slots=True)
class ToolDefinition:
    name: str
    capability: ToolCapability
    description: str


# Tool capability metadata mapping
TOOL_CAPABILITY_METADATA = {
    ToolCapability.REPO_READ: [
        ToolDefinition(
            name="read_file",
            capability=ToolCapability.REPO_READ,
            description="Read file contents from workspace"
        ),
        ToolDefinition(
            name="list_directory",
            capability=ToolCapability.REPO_READ,
            description="List directory contents"
        ),
    ],
    ToolCapability.REPO_WRITE: [
        ToolDefinition(
            name="write_file",
            capability=ToolCapability.REPO_WRITE,
            description="Write file to workspace"
        ),
        ToolDefinition(
            name="edit_file",
            capability=ToolCapability.REPO_WRITE,
            description="Edit file by replacing exact old content with new content"
        ),
    ],
    ToolCapability.REPO_PATCH: [
        ToolDefinition(
            name="apply_patch",
            capability=ToolCapability.REPO_PATCH,
            description="Apply unified diff patch to file for efficient modifications"
        ),
    ],
    ToolCapability.REPO_EXEC: [
        ToolDefinition(
            name="exec_command",
            capability=ToolCapability.REPO_EXEC,
            description="Execute shell command in workspace"
        ),
        ToolDefinition(
            name="run_tests",
            capability=ToolCapability.REPO_EXEC,
            description="Run tests and return results"
        ),
    ],
    ToolCapability.REPO_TREE: [
        ToolDefinition(
            name="file_tree",
            capability=ToolCapability.REPO_TREE,
            description="Generate file tree structure"
        ),
        ToolDefinition(
            name="glob_files",
            capability=ToolCapability.REPO_TREE,
            description="Search files by glob pattern (e.g., '**/*.py', 'src/**/test_*.ts')"
        ),
    ],
    ToolCapability.CODE_ANALYSIS: [
        ToolDefinition(
            name="diff_files",
            capability=ToolCapability.CODE_ANALYSIS,
            description="Generate diff between two files"
        ),
        ToolDefinition(
            name="search_code",
            capability=ToolCapability.CODE_ANALYSIS,
            description="Search code using regex patterns"
        ),
    ],
    ToolCapability.CODE_VALIDATION: [
        ToolDefinition(
            name="validate_syntax",
            capability=ToolCapability.CODE_VALIDATION,
            description="Validate syntax of generated code files (Python, TypeScript, JavaScript)"
        ),
        ToolDefinition(
            name="read_lints",
            capability=ToolCapability.CODE_VALIDATION,
            description=(
                "Read lint, type-check, and validation diagnostics from allowed "
                "project commands"
            )
        ),
    ],
}


def get_tools_for_capability(capability: ToolCapability) -> list[ToolDefinition]:
    """Get tool definitions for a given capability."""
    return TOOL_CAPABILITY_METADATA.get(capability, [])


@dataclass(frozen=True, slots=True)
class MemoryPolicy:
    read_scopes: tuple[MemoryScope, ...] = ()
    write_scopes: tuple[MemoryScope, ...] = ()
    allow_durable_write: bool = False


@dataclass(frozen=True, slots=True)
class AgentEventPolicy:
    visibility: AgentReasoningVisibility = AgentReasoningVisibility.TRACE
    emit_start_event: bool = True
    emit_completion_event: bool = True
    start_event_type: AgentReasoningEventType = AgentReasoningEventType.REASONING_SUMMARY
    completion_event_type: AgentReasoningEventType | None = AgentReasoningEventType.DECISION_RATIONALE


@dataclass(frozen=True, slots=True)
class AgentDefinition:
    name: str
    kind: AgentKind
    model_role: ModelRole
    prompt_id: str
    prompt_version: str
    skill_id: str | None
    skill_version: str | None
    output_schema: Type[BaseModel] | None
    tool_policy: ToolPolicy = field(default_factory=ToolPolicy)
    memory_policy: MemoryPolicy = field(default_factory=MemoryPolicy)
    isolation_policy: IsolationPolicy = IsolationPolicy.NONE
    background_policy: AgentBackgroundPolicy = AgentBackgroundPolicy.FOREGROUND
    event_policy: AgentEventPolicy = field(default_factory=AgentEventPolicy)
    reference_path: str | None = None
    additional_rules: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SystemActorDefinition:
    name: str
    kind: AgentKind = AgentKind.SYSTEM
    event_policy: AgentEventPolicy = field(
        default_factory=lambda: AgentEventPolicy(
            visibility=AgentReasoningVisibility.TRACE,
            emit_start_event=True,
            emit_completion_event=True,
            start_event_type=AgentReasoningEventType.WORKFLOW_UPDATE,
            completion_event_type=AgentReasoningEventType.WORKFLOW_UPDATE,
        )
    )
