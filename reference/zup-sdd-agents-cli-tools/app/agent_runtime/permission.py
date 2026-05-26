from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.agent_runtime.definitions import ToolCapability, ToolDecision, ToolPolicy
from app.schemas.target_repo import SddTargetConfig


class PermissionPolicyError(ValueError):
    pass


@dataclass(slots=True)
class PermissionPolicyEngine:
    dangerous_files: tuple[str, ...] = (
        ".env",
        ".env.dev",
        ".env.example",
        ".gitignore",
    )
    dangerous_dirs: tuple[str, ...] = (
        ".git",
        ".odin_workspaces",
        ".odin_memory",
        "__pycache__",
    )

    def ensure_capability(self, tool_policy: ToolPolicy, capability: ToolCapability) -> None:
        if capability not in tool_policy.capabilities:
            raise PermissionPolicyError(f"Capability {capability.value} is not allowed for this actor")

    def decide_path(self, *, root: Path, candidate: Path, config: SddTargetConfig, write: bool) -> ToolDecision:
        root = root.resolve()
        candidate = candidate.resolve()
        try:
            relative = candidate.relative_to(root).as_posix()
        except ValueError:
            return ToolDecision.DENY

        if self._is_dangerous(relative):
            return ToolDecision.DENY
        if write and not self._is_within_write_roots(relative, config.write_roots):
            return ToolDecision.DENY
        if self._touches_symlink(candidate, root):
            return ToolDecision.DENY
        return ToolDecision.ALLOW

    def ensure_path(self, *, root: Path, candidate: Path, config: SddTargetConfig, write: bool) -> None:
        decision = self.decide_path(root=root, candidate=candidate, config=config, write=write)
        if decision != ToolDecision.ALLOW:
            raise PermissionPolicyError(f"Path denied by policy: {candidate}")

    def decide_command(self, *, command_id: str, allowed_commands: list[str], config: SddTargetConfig) -> ToolDecision:
        if command_id not in config.command_catalog:
            return ToolDecision.DENY
        if command_id not in allowed_commands:
            return ToolDecision.DENY
        return ToolDecision.ALLOW

    def ensure_command(self, *, command_id: str, allowed_commands: list[str], config: SddTargetConfig) -> None:
        decision = self.decide_command(command_id=command_id, allowed_commands=allowed_commands, config=config)
        if decision != ToolDecision.ALLOW:
            raise PermissionPolicyError(f"Command denied by policy: {command_id}")

    def _is_dangerous(self, relative_path: str) -> bool:
        normalized = relative_path.lower()
        if normalized in {item.lower() for item in self.dangerous_files}:
            return True
        return any(
            normalized == dangerous_dir.lower() or normalized.startswith(f"{dangerous_dir.lower()}/")
            for dangerous_dir in self.dangerous_dirs
        )

    @staticmethod
    def _is_within_write_roots(relative_path: str, write_roots: list[str]) -> bool:
        for root in write_roots:
            normalized = root.strip().strip("/")
            if normalized in {"", "."}:
                return True
            if relative_path == normalized or relative_path.startswith(f"{normalized}/"):
                return True
        return False

    @staticmethod
    def _touches_symlink(candidate: Path, root: Path) -> bool:
        current = candidate
        while current != root and current != current.parent:
            if current.exists() and current.is_symlink():
                return True
            current = current.parent
        return False
