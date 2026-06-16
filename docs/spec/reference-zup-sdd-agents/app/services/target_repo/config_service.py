from __future__ import annotations

from pathlib import Path
import re

import yaml  # type: ignore[import-untyped]

from app.schemas.target_repo import SddTargetConfig


class TargetRepoConfigError(ValueError):
    pass


class TargetRepoConfigService:
    CONFIG_FILENAME = ".sdd-target.yaml"
    REQUIRED_ROLE_PROFILES = {
        "backend_specialist",
        "frontend_specialist",
        "qa_specialist",
    }
    FORBIDDEN_COMMAND_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
        (re.compile(r"\brm\s+-rf\s+/(?:\s|$)", re.IGNORECASE), "destructive root wipe"),
        (re.compile(r"\brm\s+-rf\s+~(?:/|\s|$)", re.IGNORECASE), "destructive home wipe"),
        (re.compile(r"\bmkfs(?:\.[a-z0-9]+)?\b", re.IGNORECASE), "filesystem formatting"),
        (re.compile(r"\bdd\s+if=/dev/zero\s+of=/dev/", re.IGNORECASE), "raw disk overwrite"),
        (re.compile(r":\(\)\s*\{\s*:\|:&\s*\};:", re.IGNORECASE), "fork bomb"),
        (re.compile(r"\b(shutdown|reboot|poweroff|halt)\b", re.IGNORECASE), "host shutdown/reboot"),
        (re.compile(r"\b(curl|wget|nc|netcat|scp|sftp)\b", re.IGNORECASE), "network transfer command is blocked"),
    )

    def load(self, repo_root: str | Path) -> SddTargetConfig:
        root = Path(repo_root).expanduser().resolve()
        config_path = root / self.CONFIG_FILENAME
        if not config_path.exists():
            raise TargetRepoConfigError(f"Target repo config not found: {config_path}")

        raw = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
        if not isinstance(raw, dict):
            raise TargetRepoConfigError(f"Target repo config must be a mapping: {config_path}")

        try:
            config = SddTargetConfig.model_validate(raw)
        except Exception as exc:  # pragma: no cover - Pydantic message is enough
            raise TargetRepoConfigError(f"Invalid target repo config: {exc}") from exc

        self._validate(root, config)
        return config

    def _validate(self, repo_root: Path, config: SddTargetConfig) -> None:
        if not config.write_roots:
            raise TargetRepoConfigError("write_roots must not be empty")
        if not config.command_catalog:
            raise TargetRepoConfigError("command_catalog must not be empty")

        for write_root in config.write_roots:
            normalized = Path(write_root)
            if normalized.is_absolute():
                raise TargetRepoConfigError(f"write_root must be relative: {write_root}")
            if ".." in normalized.parts:
                raise TargetRepoConfigError(f"write_root must stay inside the repo: {write_root}")
            candidate = (repo_root / normalized).resolve()
            try:
                candidate.relative_to(repo_root)
            except ValueError as exc:
                raise TargetRepoConfigError(f"write_root escapes repo boundary: {write_root}") from exc

        for command_id, command in config.command_catalog.items():
            self._validate_command_catalog_safety(command_id=command_id, command=command)

        missing_profiles = self.REQUIRED_ROLE_PROFILES - set(config.role_profiles)
        if missing_profiles:
            raise TargetRepoConfigError(
                "Missing role_profiles for: " + ", ".join(sorted(missing_profiles))
            )

        known_commands = set(config.command_catalog)
        missing_bootstrap = [command_id for command_id in config.bootstrap_commands if command_id not in known_commands]
        if missing_bootstrap:
            raise TargetRepoConfigError(
                "bootstrap_commands reference unknown command ids: " + ", ".join(sorted(missing_bootstrap))
            )

        for role_name, profile in config.role_profiles.items():
            missing_allowed = [command_id for command_id in profile.allowed_commands if command_id not in known_commands]
            if missing_allowed:
                raise TargetRepoConfigError(
                    f"role_profiles.{role_name}.allowed_commands reference unknown ids: "
                    + ", ".join(sorted(missing_allowed))
                )
            missing_validation = [
                command_id for command_id in profile.default_validation_commands if command_id not in known_commands
            ]
            if missing_validation:
                raise TargetRepoConfigError(
                    f"role_profiles.{role_name}.default_validation_commands reference unknown ids: "
                    + ", ".join(sorted(missing_validation))
                )

        test_runner_ids = list(config.test_runner_ids)
        if not test_runner_ids:
            config.test_runner_ids = sorted(
                command_id
                for command_id, command in config.command_catalog.items()
                if self._is_real_test_command(command_id, command)
            )
            test_runner_ids = list(config.test_runner_ids)

        unknown_test_runners = [command_id for command_id in test_runner_ids if command_id not in known_commands]
        if unknown_test_runners:
            raise TargetRepoConfigError(
                "test_runner_ids reference unknown command ids: " + ", ".join(sorted(unknown_test_runners))
            )

        invalid_test_commands = [
            command_id
            for command_id in test_runner_ids
            if not self._is_real_test_command(command_id, config.command_catalog.get(command_id, ""))
        ]
        if invalid_test_commands:
            raise TargetRepoConfigError(
                "test_runner_ids must point to real test commands declared by the target repository: "
                + ", ".join(sorted(invalid_test_commands))
            )

    @staticmethod
    def _is_real_test_command(command_id: str, command: str) -> bool:
        normalized = f"{command_id} {command}".casefold()
        if re.search(r"\b(install|setup)\b", normalized):
            if re.search(r"\b(pip|npm|pnpm|yarn)\b", normalized):
                return False
        if "find " in normalized and "sort >/dev/null" in normalized:
            return False
        if "subprocess.call([runner,'test'" in normalized or "subprocess.call([runner, 'test'" in normalized:
            return True

        real_test_patterns = (
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
        return any(re.search(pattern, normalized) for pattern in real_test_patterns)

    @classmethod
    def _validate_command_catalog_safety(cls, *, command_id: str, command: str) -> None:
        for pattern, reason in cls.FORBIDDEN_COMMAND_PATTERNS:
            if pattern.search(command):
                raise TargetRepoConfigError(
                    f"command_catalog.{command_id} contains forbidden shell pattern ({reason})"
                )
