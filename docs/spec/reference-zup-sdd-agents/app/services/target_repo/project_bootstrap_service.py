from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
import re
import subprocess
import sys
from typing import Any

import yaml  # type: ignore[import-untyped]

from app.core.config import Settings
from app.core.logging import get_logger
from app.services.target_repo.default_contract import (
    MANAGED_COMMAND_IDS,
    build_default_target_contract,
    detect_default_write_roots,
)


class ProjectBootstrapError(ValueError):
    pass


@dataclass(slots=True)
class ProjectBootstrapResult:
    project_root: Path
    project_name: str
    project_stack: str
    target_repo_path: Path
    base_ref: str


class ProjectBootstrapService:
    DEFAULT_STACK = "discover_from_user_story"
    CONFIG_FILENAME = ".sdd-target.yaml"
    REQUIRED_ROLE_PROFILES = ("backend_specialist", "frontend_specialist", "qa_specialist")
    _MANAGED_COMMAND_IDS = MANAGED_COMMAND_IDS
    _logger = get_logger("app.services.target_repo.project_bootstrap_service")

    def __init__(self, *, settings: Settings, workspace_root: Path):
        self._settings = settings
        self._workspace_root = workspace_root.resolve()

    @property
    def workspace_root(self) -> Path:
        return self._workspace_root

    def is_external_to_workspace(self, path: str | Path | None) -> bool:
        if path is None:
            return False
        candidate = Path(path).expanduser().resolve()
        try:
            candidate.relative_to(self._workspace_root)
            return False
        except ValueError:
            return True

    def validate_existing_repo_target(self, path: str | Path) -> Path:
        candidate = Path(path).expanduser().resolve()
        if not candidate.exists() or not candidate.is_dir():
            raise ProjectBootstrapError(f"Target repository path not found: {candidate}")
        self.ensure_target_contract(candidate)
        return candidate

    def ensure_target_contract(self, repo_root: str | Path) -> Path:
        root = Path(repo_root).expanduser().resolve()
        config_path = root / self.CONFIG_FILENAME
        base_ref = self._detect_repo_base_ref(root)

        normalized_contract = self._build_target_contract(
            base_branch=base_ref,
            write_roots=self._detect_write_roots(root),
            repo_root=root,
        )
        raw: dict[str, Any] = {}
        if config_path.exists():
            try:
                loaded = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
            except yaml.YAMLError as exc:
                self._logger.warning(
                    "target_contract_yaml_parse_failed repo=%s config=%s error=%s",
                    root,
                    config_path,
                    exc,
                )
                loaded = {}
            if isinstance(loaded, dict):
                raw = loaded
        normalized_contract = self._normalize_target_contract(
            contract=raw,
            defaults=normalized_contract,
        )
        config_path.write_text(
            yaml.safe_dump(normalized_contract, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
        return config_path

    async def bootstrap_new_project(
        self,
        *,
        project_output_path: str | Path,
        project_name: str | None,
        project_stack: str | None,
        base_branch: str,
    ) -> ProjectBootstrapResult:
        project_root = Path(project_output_path).expanduser().resolve()
        parent = project_root.parent
        if not parent.exists() or not parent.is_dir():
            raise ProjectBootstrapError(f"Parent directory not found for project output path: {parent}")
        if project_root.exists():
            allowed_seed_files = {self.CONFIG_FILENAME, ".DS_Store"}
            blocking_entries = [entry for entry in project_root.iterdir() if entry.name not in allowed_seed_files]
            if blocking_entries:
                raise ProjectBootstrapError(f"Project output path already exists and is not empty: {project_root}")
        else:
            project_root.mkdir(parents=True, exist_ok=True)

        resolved_name = project_name or project_root.name
        resolved_stack = project_stack or self.DEFAULT_STACK

        self._write_minimum_runtime_scaffold(project_root=project_root)

        (project_root / ".gitignore").write_text(
            "\n".join(
                [
                    "__pycache__/",
                    ".pytest_cache/",
                    ".ruff_cache/",
                    "node_modules/",
                    ".DS_Store",
                    ".venv/",
                    "dist/",
                    "coverage/",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        (project_root / "project.sdd.yaml").write_text(
            yaml.safe_dump(
                {
                    "name": resolved_name,
                    "stack": resolved_stack,
                    "bootstrap_mode": "generated_from_scratch",
                    "base_branch": base_branch,
                },
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )
        python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        (project_root / ".tool-versions").write_text(f"python {python_version}\n", encoding="utf-8")
        (project_root / ".python-version").write_text(f"{python_version}\n", encoding="utf-8")
        (project_root / self.CONFIG_FILENAME).write_text(
            yaml.safe_dump(
                self._build_target_contract(
                    base_branch=base_branch,
                    write_roots=self._detect_write_roots(project_root),
                    repo_root=project_root,
                ),
                sort_keys=False,
                allow_unicode=True,
            ),
            encoding="utf-8",
        )

        await self._run_git(project_root, "init", "-b", base_branch)
        await self._run_git(project_root, "config", "user.email", self._settings.ODIN_BOOTSTRAP_GIT_USER_EMAIL)
        await self._run_git(project_root, "config", "user.name", self._settings.ODIN_BOOTSTRAP_GIT_USER_NAME)
        await self._run_git(project_root, "add", ".")
        await self._run_git(project_root, "commit", "-m", "chore: bootstrap project target")

        return ProjectBootstrapResult(
            project_root=project_root,
            project_name=resolved_name,
            project_stack=resolved_stack,
            target_repo_path=project_root,
            base_ref=base_branch,
        )

    @staticmethod
    def _write_minimum_runtime_scaffold(*, project_root: Path) -> None:
        src_dir = project_root / "src"
        src_dir.mkdir(parents=True, exist_ok=True)
        (src_dir / ".gitkeep").write_text("", encoding="utf-8")

    @staticmethod
    def _build_target_contract(
        *,
        base_branch: str,
        write_roots: list[str],
        repo_root: Path | None = None,
    ) -> dict[str, object]:
        return build_default_target_contract(base_ref=base_branch, write_roots=write_roots, repo_root=repo_root)

    def _detect_write_roots(self, repo_root: Path) -> list[str]:
        return detect_default_write_roots(repo_root)

    @classmethod
    def _is_real_test_command(cls, command_id: str, command: str) -> bool:
        normalized = f"{command_id} {command}".casefold()
        if re.search(r"\b(install|setup)\b", normalized):
            if re.search(r"\b(pip|npm|pnpm|yarn)\b", normalized):
                return False
        if "find " in normalized and "sort >/dev/null" in normalized:
            return False
        if "subprocess.call([runner,'test'" in normalized or "subprocess.call([runner, 'test'" in normalized:
            return True
        patterns = (
            r"\bpytest\b",
            r"\bnpm\s+test\b",
            r"\bpnpm\s+test\b",
            r"\byarn\s+test\b",
            r"\bvitest\b",
            r"\bjest\b",
            r"\bcypress\b",
            r"\bplaywright\b",
            r"\bgo\s+test\b",
            r"\bcargo\s+test\b",
            r"\bmvn\b.*\btest\b",
            r"\bgradle\b.*\btest\b",
            r"\bctest\b",
            r"\bunittest\b",
        )
        return any(re.search(pattern, normalized) for pattern in patterns)

    @classmethod
    def _normalize_target_contract(
        cls,
        *,
        contract: dict[str, Any],
        defaults: dict[str, Any],
    ) -> dict[str, Any]:
        normalized = dict(contract or {})
        normalized["version"] = int(normalized.get("version") or defaults["version"])
        normalized["base_ref"] = str(normalized.get("base_ref") or defaults["base_ref"])

        write_roots = normalized.get("write_roots")
        if not isinstance(write_roots, list) or not write_roots:
            normalized["write_roots"] = list(defaults["write_roots"])
        else:
            sanitized_write_roots = cls._sanitize_write_roots(write_roots)
            normalized["write_roots"] = sanitized_write_roots or list(defaults["write_roots"])

        command_catalog = normalized.get("command_catalog")
        if not isinstance(command_catalog, dict):
            command_catalog = {}
        command_catalog = {str(key): str(value) for key, value in command_catalog.items()}
        for command_id, command in defaults["command_catalog"].items():
            existing = command_catalog.get(command_id)
            if existing is None:
                command_catalog[command_id] = command
                continue
            if command_id in cls._MANAGED_COMMAND_IDS and cls._should_upgrade_managed_command(
                command_id=command_id,
                existing_command=existing,
            ):
                command_catalog[command_id] = command
        normalized["command_catalog"] = command_catalog

        bootstrap_commands = normalized.get("bootstrap_commands")
        if not isinstance(bootstrap_commands, list):
            bootstrap_commands = []
        bootstrap = [str(item) for item in bootstrap_commands if isinstance(item, str) and item in command_catalog]
        for command_id in defaults.get("bootstrap_commands", []):
            if command_id in command_catalog and command_id not in bootstrap:
                bootstrap.append(command_id)
        normalized["bootstrap_commands"] = bootstrap

        role_profiles = normalized.get("role_profiles")
        if not isinstance(role_profiles, dict):
            role_profiles = {}
        for role_name in cls.REQUIRED_ROLE_PROFILES:
            role_default = defaults["role_profiles"][role_name]
            current = role_profiles.get(role_name)
            if not isinstance(current, dict):
                current = {}

            allowed = current.get("allowed_commands")
            if not isinstance(allowed, list):
                allowed = []
            allowed_set = {
                str(item)
                for item in allowed
                if isinstance(item, str) and str(item) in command_catalog
            }
            allowed_set.update(role_default["allowed_commands"])
            current["allowed_commands"] = [item for item in role_default["allowed_commands"] if item in allowed_set] + [
                item for item in sorted(allowed_set) if item not in role_default["allowed_commands"]
            ]

            defaults_validation = list(role_default["default_validation_commands"])
            validation = current.get("default_validation_commands")
            if not isinstance(validation, list) or not validation:
                validation = defaults_validation
            validation = [
                str(item)
                for item in validation
                if isinstance(item, str) and str(item) in command_catalog
            ]
            current["default_validation_commands"] = list(
                dict.fromkeys([*(validation or []), *defaults_validation])
            )
            role_profiles[role_name] = current
        normalized["role_profiles"] = role_profiles

        configured_test_runners = normalized.get("test_runner_ids")
        if not isinstance(configured_test_runners, list):
            configured_test_runners = []
        test_runner_ids = [
            str(command_id)
            for command_id in configured_test_runners
            if isinstance(command_id, str)
            and command_id in command_catalog
            and cls._is_real_test_command(command_id, command_catalog[command_id])
        ]
        if not test_runner_ids:
            inferred = [
                command_id
                for command_id, command in command_catalog.items()
                if cls._is_real_test_command(command_id, command)
            ]
            test_runner_ids = inferred or list(defaults["test_runner_ids"])
        normalized["test_runner_ids"] = list(dict.fromkeys(test_runner_ids))

        for role_name in cls.REQUIRED_ROLE_PROFILES:
            role_profile = normalized["role_profiles"][role_name]
            defaults_validation = list(defaults["role_profiles"][role_name]["default_validation_commands"])
            current_validation = [
                command_id
                for command_id in role_profile.get("default_validation_commands", [])
                if command_id in command_catalog
            ]
            has_real_test = any(
                cls._is_real_test_command(command_id, command_catalog.get(command_id, ""))
                for command_id in current_validation
            )
            if not has_real_test:
                role_profile["default_validation_commands"] = defaults_validation

        return normalized

    @staticmethod
    def _sanitize_write_roots(values: list[Any]) -> list[str]:
        sanitized: list[str] = []
        for raw_value in values:
            if not isinstance(raw_value, str):
                continue
            write_root = raw_value.strip()
            if not write_root:
                continue
            candidate = Path(write_root)
            if candidate.is_absolute():
                continue
            if ".." in candidate.parts:
                continue
            if write_root not in sanitized:
                sanitized.append(write_root)
        return sanitized

    @staticmethod
    def _detect_repo_base_ref(repo_root: Path) -> str:
        try:
            result = subprocess.run(
                ["git", "-C", str(repo_root), "rev-parse", "--abbrev-ref", "HEAD"],
                check=False,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError:
            return "main"
        branch = (result.stdout or "").strip()
        if result.returncode == 0 and branch and branch != "HEAD":
            return branch
        return "main"

    @staticmethod
    def _should_upgrade_managed_command(*, command_id: str, existing_command: str) -> bool:
        normalized = existing_command.casefold()
        legacy_shell_tokens = (
            "if [ -",
            "elif [ -",
            "find ",
            "sort >/dev/null",
            "grep -q",
            "xargs -0",
            "command -v node",
        )
        if any(token in normalized for token in legacy_shell_tokens):
            return True
        return False

    async def _run_git(self, repo_root: Path, *args: str) -> None:
        process = await asyncio.create_subprocess_exec(
            "git",
            "-C",
            str(repo_root),
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            message = stderr.decode("utf-8", errors="ignore").strip() or stdout.decode("utf-8", errors="ignore").strip()
            raise ProjectBootstrapError(f"git {' '.join(args)} failed in {repo_root}: {message}")
