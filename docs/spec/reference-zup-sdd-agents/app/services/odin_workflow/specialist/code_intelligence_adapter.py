"""Code intelligence integration for specialist planning."""

from __future__ import annotations

from typing import Any

from app.agent_runtime.tool_runtime import ToolExecutionEvidence
from app.domain.models.agent_assignment import AgentAssignment
from app.services.code_intelligence_service import CodeIntelligenceService
from app.services.odin_workflow.runtime import OdinRuntime

def build_code_intelligence_payload(
    *,
    service: CodeIntelligenceService,
    runtime: OdinRuntime,
    assignment: AgentAssignment,
    workspace_path: str,
    latest_evidence: ToolExecutionEvidence | None,
    attempt: int,
) -> dict[str, Any]:
    """Build optional impact-analysis payload for specialist planning."""
    candidate_files: list[str] = []
    if attempt > 1 and latest_evidence is not None:
        candidate_files = list(latest_evidence.changed_files)
    else:
        input_snapshot = assignment.input_snapshot_json if isinstance(assignment.input_snapshot_json, dict) else {}
        raw_files = input_snapshot.get("changed_files") or input_snapshot.get("target_files") or []
        if isinstance(raw_files, list):
            candidate_files = [str(item) for item in raw_files if isinstance(item, str) and item.strip()]

    if not candidate_files:
        return {}

    try:
        payload = service.analyze_changes(
            workspace_root=workspace_path,
            changed_files=candidate_files,
        ).model_dump()
        return dict(payload)
    except Exception as exc:
        runtime.logger.warning(f"Code intelligence failed for specialist planning: {exc}")
        return {}


