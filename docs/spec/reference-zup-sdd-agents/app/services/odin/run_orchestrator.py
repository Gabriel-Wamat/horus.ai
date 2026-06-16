from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.conversation import Conversation
from app.domain.models.enums import BootstrapStatus, ExecutionRunStatus, TargetMode
from app.schemas.benchmark import BenchmarkRunAcceptedResponse, BenchmarkRunCreateRequest, StoryLoaderResult
from app.schemas.runs import (
    OdinRunAcceptedResponse,
    OdinRunCreateRequest,
    RunSnapshot,
)
from app.services.benchmark_catalog_service import BenchmarkCatalogError
from app.services.odin.errors import OdinValidationError
from app.services.odin.graph_invocation_service import OdinGraphInvocationService
from app.services.odin.query_service import OdinQueryService
from app.services.odin_workflow import OdinRuntime
from app.services.odin_workflow.state.root import OdinGraphState


class OdinRunOrchestrator:
    """Create Odin runs and enqueue their first graph invocation."""

    def __init__(
        self,
        *,
        session: AsyncSession,
        runtime: OdinRuntime,
        queries: OdinQueryService,
        graph_invocations: OdinGraphInvocationService,
    ) -> None:
        self._session = session
        self._runtime = runtime
        self._queries = queries
        self._graph_invocations = graph_invocations

    async def start_run(self, payload: OdinRunCreateRequest) -> OdinRunAcceptedResponse:
        """Start an Odin run from a direct user request."""

        spec_validation_mode = self._resolve_spec_validation_mode(payload.review_required)
        snapshot = await self._start_run_internal(
            title=payload.title,
            user_story=payload.user_story,
            story_code=payload.story_code,
            source_path=payload.source_path,
            business_context=payload.business_context,
            technical_context=payload.technical_context,
            conversation_id=payload.conversation_id,
            benchmark_result=None,
            benchmark_id=None,
            story_id=None,
            target_mode=TargetMode(payload.target_mode),
            target_repo_path=payload.target_repo_path,
            allow_dirty_target_repo_outside_write_roots=payload.allow_dirty_target_repo_outside_write_roots,
            project_output_path=payload.project_output_path,
            project_name=payload.project_name,
            project_stack=payload.project_stack,
            base_branch=payload.base_branch,
            spec_validation_mode=spec_validation_mode,
        )
        return OdinRunAcceptedResponse(
            run_id=snapshot.run_id,
            thread_id=snapshot.thread_id,
            conversation_id=snapshot.conversation_id,
            status=snapshot.status,
        )

    async def start_benchmark_run(self, payload: BenchmarkRunCreateRequest) -> BenchmarkRunAcceptedResponse:
        """Start an Odin run from benchmark story metadata."""

        try:
            if self._runtime.benchmark_catalog_service is None:
                raise OdinValidationError("Benchmark catalog service is not configured")
            benchmark_result = self._runtime.benchmark_catalog_service.build_story_loader_result(
                payload.benchmark_id,
                payload.story_id,
            )
        except BenchmarkCatalogError as exc:
            raise OdinValidationError(str(exc)) from exc

        story = benchmark_result.story_snapshot
        story_payload = benchmark_result.to_user_story_payload()
        target_repo_path = payload.target_repo_path
        project_output_path = payload.project_output_path
        target_mode = TargetMode(payload.target_mode)
        project_name = payload.project_name
        project_stack = payload.project_stack
        base_branch = payload.base_branch
        spec_validation_mode = self._resolve_benchmark_spec_validation_mode(payload.spec_validation_mode)
        snapshot = await self._start_run_internal(
            title=str(story_payload["title"]),
            user_story=str(story_payload["user_story"]),
            story_code=story.story_id,
            source_path=benchmark_result.story_source_path,
            business_context=story_payload["business_context"],
            technical_context=story_payload["technical_context"],
            conversation_id=payload.conversation_id,
            benchmark_result=benchmark_result,
            benchmark_id=payload.benchmark_id,
            story_id=payload.story_id,
            target_mode=target_mode,
            target_repo_path=target_repo_path,
            allow_dirty_target_repo_outside_write_roots=False,
            project_output_path=project_output_path,
            project_name=project_name,
            project_stack=project_stack,
            base_branch=base_branch,
            spec_validation_mode=spec_validation_mode,
        )
        return BenchmarkRunAcceptedResponse(
            run_id=snapshot.run_id,
            thread_id=snapshot.thread_id,
            conversation_id=snapshot.conversation_id,
            benchmark_id=payload.benchmark_id,
            story_id=payload.story_id,
            status=snapshot.status,
            current_node=snapshot.current_node,
            review_task_id=snapshot.review_task.id if snapshot.review_task else None,
            current_agent_name=snapshot.current_agent_name,
            target_mode=snapshot.target_mode,
            project_root_path=snapshot.project_root_path,
            bootstrap_status=snapshot.bootstrap_status,
        )

    async def _start_run_internal(
        self,
        *,
        title: str,
        user_story: str,
        story_code: str | None,
        source_path: str | None,
        business_context: dict[str, object],
        technical_context: dict[str, object],
        conversation_id: uuid.UUID | None,
        benchmark_result: StoryLoaderResult | None,
        benchmark_id: str | None,
        story_id: str | None,
        target_mode: TargetMode | None,
        target_repo_path: str | None,
        allow_dirty_target_repo_outside_write_roots: bool,
        project_output_path: str | None,
        project_name: str | None,
        project_stack: str | None,
        base_branch: str,
        spec_validation_mode: str,
    ) -> RunSnapshot:
        conversation = await self._resolve_conversation(conversation_id)
        message = self._format_story_message(title, user_story, benchmark_id=benchmark_id, story_id=story_id)
        await self._runtime.messages.create(conversation_id=conversation.id, role="user", content=message)
        story = await self._runtime.user_stories.create(
            title=title,
            story_text=user_story,
            benchmark_id=benchmark_id,
            story_code=story_code,
            source_path=source_path,
            story_snapshot=benchmark_result.story_snapshot.model_dump() if benchmark_result else {},
            business_context=business_context,
            technical_context=technical_context,
            repo_context={"story_id": story_id, "shared_context": benchmark_result.shared_context if benchmark_result else {}},
        )

        resolved_target_mode = target_mode or TargetMode.EXISTING_REPO
        resolved_target_repo = self._resolve_existing_repo_path(target_repo_path or "")
        resolved_project_output = self._resolve_project_output_path(project_output_path or "")
        if resolved_target_mode == TargetMode.EXISTING_REPO and resolved_target_repo is None:
            raise OdinValidationError("target_repo_path is required for existing_repo runs")
        if resolved_target_mode == TargetMode.NEW_PROJECT and resolved_project_output is None:
            raise OdinValidationError("project_output_path is required for new_project runs")

        project_root_path = str(resolved_target_repo or resolved_project_output or "")
        resolved_project_name = project_name or (Path(project_root_path).name if project_root_path else "odin-project")
        run = await self._runtime.execution_runs.create(
            thread_id=f"{self._runtime.settings.LANGGRAPH_THREAD_ID_PREFIX}-{uuid.uuid4()}",
            conversation_id=conversation.id,
            user_story_id=story.id,
            benchmark_id=benchmark_id,
            story_id=story_id,
            target_mode=resolved_target_mode,
            target_repo_path=str(resolved_target_repo) if resolved_target_repo else None,
            project_output_path=str(resolved_project_output) if resolved_project_output else None,
            project_root_path=project_root_path or None,
            project_name=resolved_project_name,
            project_stack=project_stack or self._runtime.project_bootstrap_service.DEFAULT_STACK,
            base_branch=base_branch,
            status=ExecutionRunStatus.PENDING,
            current_node="story_ingestion",
        )
        await self._runtime.execution_runs.update(
            run,
            bootstrap_status=BootstrapStatus.PENDING if resolved_target_mode == TargetMode.NEW_PROJECT else BootstrapStatus.SKIPPED,
            requires_external_write_approval=False,
            current_agent_name="story_ingestion",
            current_actor_kind="system",
        )
        await self._session.commit()

        odin_state: OdinGraphState = {
            "metadata": {
                "run_id": str(run.id),
                "thread_id": run.thread_id,
                "conversation_id": str(conversation.id),
                "user_story_id": str(story.id),
                "benchmark_id": benchmark_id,
                "story_id": story_id,
                "story_source_path": (benchmark_result.story_source_path if benchmark_result else source_path) or "",
            },
            "input": {
                "title": title,
                "user_story": user_story,
                "user_story_snapshot": benchmark_result.story_snapshot.model_dump() if benchmark_result else {},
                "business_context": business_context,
                "technical_context": technical_context,
                "benchmark_shared_context": benchmark_result.shared_context if benchmark_result else {},
            },
            "project": {
                "repo_context": {},
                "target_mode": resolved_target_mode.value,
                "target_repo_path": str(resolved_target_repo) if resolved_target_repo else "",
                "allow_dirty_target_repo_outside_write_roots": allow_dirty_target_repo_outside_write_roots,
                "project_output_path": str(resolved_project_output) if resolved_project_output else "",
                "project_root_path": project_root_path,
                "project_name": resolved_project_name,
                "project_stack": project_stack or self._runtime.project_bootstrap_service.DEFAULT_STACK,
                "base_branch": base_branch,
                "bootstrap_status": BootstrapStatus.PENDING.value
                if resolved_target_mode == TargetMode.NEW_PROJECT
                else BootstrapStatus.SKIPPED.value,
                "requires_external_write_approval": False,
                "workspace_status": None,
            },
            "spec": {
                "spec_validation_mode": spec_validation_mode,
                "review_required": spec_validation_mode == "human",
                "review_round": 0,
            },
            "execution": {
                "status": ExecutionRunStatus.PENDING.value,
                "assignment_results": [],
                "curation_round": 0,
                "plan_round": 1,
            },
            "observability": {
                "audit_trail": [],
                "errors": [],
                "error_details": [],
            },
        }
        self._graph_invocations.schedule_graph_invocation(
            run_id=run.id,
            thread_id=run.thread_id,
            payload=odin_state,
        )
        return await self._queries.get_run(run.id)

    async def _resolve_conversation(self, conversation_id: uuid.UUID | None) -> Conversation:
        if conversation_id is None:
            return await self._runtime.conversations.create()
        conversation = await self._runtime.conversations.get_by_id(conversation_id)
        if conversation is None:
            raise OdinValidationError(f"Conversation not found: {conversation_id}")
        return conversation

    def _resolve_existing_repo_path(self, target_repo_path: str) -> Path | None:
        if not target_repo_path.strip():
            return None
        path = Path(target_repo_path).expanduser().resolve()
        if not path.exists():
            raise OdinValidationError(f"Target repository path does not exist: {path}")
        return path

    def _resolve_project_output_path(self, project_output_path: str) -> Path | None:
        return Path(project_output_path).expanduser().resolve() if project_output_path.strip() else None

    def _resolve_spec_validation_mode(self, review_required: bool | None) -> str:
        return "human" if review_required is not False else "auto"

    def _resolve_benchmark_spec_validation_mode(self, requested_mode: str | None) -> str:
        return "human"

    @staticmethod
    def _format_story_message(title: str, user_story: str, *, benchmark_id: str | None, story_id: str | None) -> str:
        prefix = f"[{benchmark_id}/{story_id}]\n\n" if benchmark_id and story_id else ""
        return f"{prefix}User Story: {title}\n\n{user_story}"
