"""Sistema de Git worktrees para isolamento de agentes.

Baseado em: Odin_agentes_idea/utils_agent/worktree.ts
Permite que cada agente trabalhe em:
- Branch temporário isolado
- Diretório worktree separado
- Sem afetar branch principal
- Merge ou descarte controlado
"""

from __future__ import annotations

import asyncio
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.core.logging import get_logger
from app.tools.bash_tool import BashTool

logger = get_logger(__name__)

_VALID_WORKTREE_SLUG_SEGMENT = re.compile(r"^[a-zA-Z0-9._-]+$")


@dataclass
class WorktreeInfo:
    """Informações de um worktree.

    Attributes:
        agent_id: ID do agente
        branch_name: Nome do branch temporário
        worktree_path: Path do worktree
        base_branch: Branch de origem
        created_at: Quando foi criado
        has_changes: Se tem mudanças não commitadas
    """

    agent_id: str
    branch_name: str
    worktree_path: Path
    base_branch: str
    created_at: datetime
    has_changes: bool = False


class GitWorktreeError(Exception):
    """Erro relacionado a worktrees."""


class WorktreeManager:
    """Gerencia criação e lifecycle de Git worktrees para agentes.

    Responsabilidades:
    1. Criar worktree isolado por agente
    2. Gerenciar branches temporários
    3. Detectar mudanças
    4. Merge para branch base, quando solicitado
    5. Cleanup automático
    """

    def __init__(self, bash_tool: Optional[BashTool] = None) -> None:
        """Inicializa manager de worktrees.

        Args:
            bash_tool: Tool para executar comandos Git.
        """
        self.bash_tool = bash_tool or BashTool(allow_destructive=False)
        self._active_worktrees: dict[str, WorktreeInfo] = {}
        self._git_lock = asyncio.Lock()
        logger.info("WorktreeManager initialized")

    async def _git_command(
        self,
        command: str,
        cwd: Optional[Path] = None,
        check_errors: bool = True,
    ) -> str:
        """Executa comando Git sem prompt interativo.

        Args:
            command: Comando Git sem o prefixo `git`
            cwd: Working directory
            check_errors: Se exit code diferente de zero deve falhar

        Returns:
            stdout normalizado
        """
        full_command = f"GIT_TERMINAL_PROMPT=0 GIT_ASKPASS='' git {command}"
        result = await self.bash_tool.execute(full_command, cwd=cwd)
        if check_errors and result.exit_code != 0:
            raise GitWorktreeError(
                f"Git command failed: {command}\n"
                f"cwd: {result.cwd}\n"
                f"stdout: {result.stdout}\n"
                f"stderr: {result.stderr}"
            )
        return result.stdout.strip()

    async def _is_git_repository(self, path: Path) -> bool:
        """Verifica se path é um repositório Git."""
        try:
            await self._git_command("rev-parse --is-inside-work-tree", cwd=path)
            return True
        except GitWorktreeError:
            return False

    async def _get_current_branch(self, cwd: Path) -> str:
        """Retorna branch atual ou HEAD quando detached."""
        return await self._git_command("rev-parse --abbrev-ref HEAD", cwd=cwd)

    async def create_worktree(
        self,
        agent_id: str,
        project_root: Path,
        base_branch: Optional[str] = None,
    ) -> WorktreeInfo:
        """Cria worktree isolado para agente.

        Args:
            agent_id: ID do agente
            project_root: Root do projeto Git
            base_branch: Branch base; usa branch atual se None

        Returns:
            Informações do worktree criado
        """
        project_root = project_root.expanduser().resolve()
        safe_agent_id = self._safe_slug(agent_id)
        async with self._git_lock:
            if not await self._is_git_repository(project_root):
                raise GitWorktreeError(f"{project_root} is not a Git repository")
            if agent_id in self._active_worktrees:
                raise GitWorktreeError(f"Worktree for {agent_id} already exists")
            if base_branch is None:
                base_branch = await self._get_current_branch(project_root)

            branch_name = f"agent/{safe_agent_id}"
            worktree_path = project_root.parent / f"{project_root.name}-worktree-{safe_agent_id}"

            try:
                await self._cleanup_failed_worktree(project_root, worktree_path, branch_name)
                await self._git_command(
                    f"branch {self._quote(branch_name)} {self._quote(base_branch)}",
                    cwd=project_root,
                )
                await self._git_command(
                    f"worktree add {self._quote(str(worktree_path))} {self._quote(branch_name)}",
                    cwd=project_root,
                )
            except Exception as exc:
                await self._cleanup_failed_worktree(project_root, worktree_path, branch_name)
                raise GitWorktreeError(f"Failed to create worktree: {exc}") from exc

            info = WorktreeInfo(
                agent_id=agent_id,
                branch_name=branch_name,
                worktree_path=worktree_path,
                base_branch=base_branch,
                created_at=datetime.now(timezone.utc),
            )
            self._active_worktrees[agent_id] = info
            logger.info("Created worktree %s for agent %s on %s", worktree_path, agent_id, branch_name)
            return info

    async def _cleanup_failed_worktree(
        self,
        project_root: Path,
        worktree_path: Path,
        branch_name: str,
    ) -> None:
        """Remove resíduos de uma tentativa anterior."""
        if worktree_path.exists():
            await self._git_command(
                f"worktree remove {self._quote(str(worktree_path))} --force",
                cwd=project_root,
                check_errors=False,
            )
            if worktree_path.exists():
                shutil.rmtree(worktree_path, ignore_errors=True)
        await self._git_command(
            f"branch -D {self._quote(branch_name)}",
            cwd=project_root,
            check_errors=False,
        )

    async def has_changes(self, agent_id: str) -> bool:
        """Verifica se worktree tem mudanças não commitadas."""
        info = self._require_worktree(agent_id)
        output = await self._git_command("status --porcelain", cwd=info.worktree_path)
        info.has_changes = bool(output.strip())
        return info.has_changes

    async def commit_changes(self, agent_id: str, commit_message: str) -> None:
        """Commita mudanças no worktree."""
        info = self._require_worktree(agent_id)
        if not await self.has_changes(agent_id):
            logger.info("No changes to commit for %s", agent_id)
            return
        await self._git_command("add -A", cwd=info.worktree_path)
        await self._git_command(
            f"commit -m {self._quote(commit_message)}",
            cwd=info.worktree_path,
        )
        info.has_changes = False
        logger.info("Committed changes for %s: %s", agent_id, commit_message)

    async def merge_to_base(
        self,
        agent_id: str,
        project_root: Path,
        commit_message: Optional[str] = None,
    ) -> bool:
        """Faz merge do branch do worktree para a branch base.

        Returns:
            True quando merge aplica limpo; False quando houve conflito.
        """
        project_root = project_root.expanduser().resolve()
        info = self._require_worktree(agent_id)
        async with self._git_lock:
            if await self.has_changes(agent_id):
                await self.commit_changes(agent_id, commit_message or f"Agent {agent_id} work")

            await self._git_command(f"checkout {self._quote(info.base_branch)}", cwd=project_root)
            try:
                await self._git_command(f"merge --no-edit {self._quote(info.branch_name)}", cwd=project_root)
            except GitWorktreeError as exc:
                logger.warning("Merge requires conflict resolution for %s: %s", agent_id, exc)
                resolved = await self._resolve_merge_conflicts(project_root)
                if not resolved:
                    logger.error("Merge conflict for %s could not be resolved safely", agent_id)
                    await self._git_command("merge --abort", cwd=project_root, check_errors=False)
                    return False

            logger.info("Merged %s into %s", info.branch_name, info.base_branch)
            return True

    async def _resolve_merge_conflicts(self, project_root: Path) -> bool:
        """Resolve conflitos textuais simples usando união das duas versões."""
        conflicted_output = await self._git_command(
            "diff --name-only --diff-filter=U",
            cwd=project_root,
            check_errors=False,
        )
        conflicted_paths = [line.strip() for line in conflicted_output.splitlines() if line.strip()]
        if not conflicted_paths:
            return False

        for relative_path in conflicted_paths:
            path = (project_root / relative_path).resolve()
            if not self._resolve_conflict_markers(path):
                return False

        await self._git_command("add -A", cwd=project_root)
        try:
            await self._git_command("commit --no-edit", cwd=project_root)
            return True
        except GitWorktreeError:
            return False

    async def remove_worktree(
        self,
        agent_id: str,
        project_root: Path,
        force: bool = False,
    ) -> None:
        """Remove worktree e branch temporário."""
        project_root = project_root.expanduser().resolve()
        info = self._require_worktree(agent_id)
        async with self._git_lock:
            if not force and await self.has_changes(agent_id):
                raise GitWorktreeError("Worktree has uncommitted changes. Use force=True to discard.")

            force_flag = "--force" if force else ""
            await self._git_command(
                f"worktree remove {self._quote(str(info.worktree_path))} {force_flag}".strip(),
                cwd=project_root,
            )
            await self._git_command(
                f"branch -D {self._quote(info.branch_name)}",
                cwd=project_root,
                check_errors=False,
            )
            self._active_worktrees.pop(agent_id, None)
            logger.info("Removed worktree for %s: %s", agent_id, info.worktree_path)

    async def list_active_worktrees(self) -> list[WorktreeInfo]:
        """Lista todos os worktrees ativos."""
        return list(self._active_worktrees.values())

    async def get_worktree_info(self, agent_id: str) -> Optional[WorktreeInfo]:
        """Retorna informações de um worktree."""
        return self._active_worktrees.get(agent_id)

    def _require_worktree(self, agent_id: str) -> WorktreeInfo:
        """Retorna worktree ativo ou falha."""
        info = self._active_worktrees.get(agent_id)
        if info is None:
            raise GitWorktreeError(f"Worktree for {agent_id} does not exist")
        return info

    @staticmethod
    def _resolve_conflict_markers(path: Path) -> bool:
        """Remove markers de conflito preservando blocos de ambos os lados."""
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return False
        if "<<<<<<< " not in content or "=======" not in content or ">>>>>>> " not in content:
            return False

        lines = content.splitlines(keepends=True)
        resolved: list[str] = []
        index = 0
        while index < len(lines):
            line = lines[index]
            if not line.startswith("<<<<<<< "):
                resolved.append(line)
                index += 1
                continue

            index += 1
            ours: list[str] = []
            while index < len(lines) and not lines[index].startswith("======="):
                ours.append(lines[index])
                index += 1
            if index >= len(lines):
                return False
            index += 1

            theirs: list[str] = []
            while index < len(lines) and not lines[index].startswith(">>>>>>> "):
                theirs.append(lines[index])
                index += 1
            if index >= len(lines):
                return False
            index += 1

            resolved.extend(ours)
            resolved.extend(line for line in theirs if line not in ours)

        path.write_text("".join(resolved), encoding="utf-8")
        return True

    @staticmethod
    def _safe_slug(agent_id: str) -> str:
        """Normaliza agent_id para segmento seguro de branch/path."""
        slug = agent_id.strip().replace("/", "+")
        slug = re.sub(r"[^a-zA-Z0-9._+-]", "-", slug)[:64].strip(".-+")
        if not slug:
            raise GitWorktreeError("Invalid agent_id for worktree slug")
        for segment in slug.split("+"):
            if segment in {".", ".."} or not _VALID_WORKTREE_SLUG_SEGMENT.match(segment):
                raise GitWorktreeError(f"Invalid agent_id for worktree slug: {agent_id}")
        return slug

    @staticmethod
    def _quote(value: str) -> str:
        """Escapa argumento para comando shell."""
        return BashTool.quote_arg(value)


_worktree_manager: Optional[WorktreeManager] = None


def get_worktree_manager() -> WorktreeManager:
    """Retorna instância singleton do worktree manager."""
    global _worktree_manager
    if _worktree_manager is None:
        _worktree_manager = WorktreeManager()
    return _worktree_manager
