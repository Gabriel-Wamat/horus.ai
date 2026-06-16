from __future__ import annotations

import json
import re
import shlex
from pathlib import Path
from typing import Any


_IGNORED_DIR_NAMES = {
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    ".odin_memory",
    ".odin_workspaces",
}

_MANIFEST_NAMES = {
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Makefile",
    "makefile",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
}

_SAFE_SCRIPT_DIR_NAMES = {"scripts", "bin"}
_SCRIPT_EXCLUDED_TOKENS = {
    "deploy",
    "release",
    "publish",
    "prod",
    "production",
    "docker",
    "destroy",
    "delete",
    "remove",
    "drop",
    "reset",
    "wipe",
}
_SCRIPT_COMMAND_TYPE_TOKENS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("install", ("install", "deps", "dependencies")),
    ("setup", ("setup", "bootstrap", "prepare")),
    ("test", ("test", "tests")),
    ("check", ("check", "verify", "validate")),
    ("lint", ("lint",)),
    ("build", ("build", "compile")),
    ("smoke", ("smoke",)),
    ("run", ("run", "start", "dev", "serve", "local")),
)

MANAGED_COMMAND_IDS = {
    "inspect_repo_tree",
    "inspect_project_manifests",
}


def detect_default_write_roots(repo_root: Path) -> list[str]:
    root = repo_root.expanduser().resolve()
    if not root.exists() or not root.is_dir():
        return ["."]

    roots = ["."]
    for child in sorted(root.iterdir(), key=lambda item: item.name.casefold()):
        if not child.is_dir():
            continue
        if child.name in _IGNORED_DIR_NAMES or child.name.startswith("."):
            continue
        roots.append(child.name)
    return list(dict.fromkeys(roots))


def _python_inline(code: str) -> str:
    if "\n" in code:
        code = f"exec({code!r})"
    return f"python -c {json.dumps(code)}"


def _quote(value: str | Path) -> str:
    return shlex.quote(str(value))


def _slug(relative_dir: str, fallback: str = "root") -> str:
    raw = relative_dir.strip("./") or fallback
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", raw).strip("_").lower()
    return slug or fallback


def _cd_prefix(relative_dir: str) -> str:
    if not relative_dir or relative_dir == ".":
        return ""
    return f"cd {_quote(relative_dir)} && "


def _iter_manifest_files(repo_root: Path) -> list[Path]:
    manifests: list[Path] = []
    if not repo_root.exists() or not repo_root.is_dir():
        return manifests

    for current_root, dirnames, filenames in repo_root.walk():
        dirnames[:] = [
            dirname
            for dirname in dirnames
            if dirname not in _IGNORED_DIR_NAMES and not dirname.startswith(".")
        ]
        for filename in filenames:
            if filename in _MANIFEST_NAMES:
                manifests.append(current_root / filename)
    return sorted(manifests, key=lambda item: item.relative_to(repo_root).as_posix())


def _inspect_repo_tree_code() -> str:
    return "\n".join(
        [
            "import os",
            "from pathlib import Path",
            f"ignored = {sorted(_IGNORED_DIR_NAMES)!r}",
            "root = Path('.')",
            "count = 0",
            "for current, dirs, files in os.walk(root):",
            "    dirs[:] = sorted(d for d in dirs if d not in ignored and not d.startswith('.'))",
            "    rel = Path(current).relative_to(root)",
            "    if len(rel.parts) > 3:",
            "        dirs[:] = []",
            "        continue",
            "    for name in sorted(files):",
            "        path = (rel / name).as_posix() if rel.parts else name",
            "        print(path)",
            "        count += 1",
            "        if count >= 300:",
            "            raise SystemExit(0)",
        ]
    )


def _inspect_project_manifests_code() -> str:
    return "\n".join(
        [
            "import os",
            "from pathlib import Path",
            f"ignored = {sorted(_IGNORED_DIR_NAMES)!r}",
            f"manifest_names = {sorted(_MANIFEST_NAMES)!r}",
            "root = Path('.')",
            "found = []",
            "for current, dirs, files in os.walk(root):",
            "    dirs[:] = sorted(d for d in dirs if d not in ignored and not d.startswith('.'))",
            "    for name in sorted(files):",
            "        if name in manifest_names:",
            "            found.append((Path(current) / name).relative_to(root).as_posix())",
            "for path in sorted(found):",
            "    print(path)",
            "if not found:",
            "    print('NO_MANIFESTS_FOUND')",
        ]
    )


def _package_manager_command(root: Path, scripts: dict[str, Any]) -> tuple[str, dict[str, str]]:
    if (root / "pnpm-lock.yaml").exists():
        runner = "pnpm"
        install = "pnpm install --frozen-lockfile"
    elif (root / "yarn.lock").exists():
        runner = "yarn"
        install = "yarn install --frozen-lockfile"
    elif (root / "bun.lockb").exists() or (root / "bun.lock").exists():
        runner = "bun"
        install = "bun install"
    elif (root / "package-lock.json").exists():
        runner = "npm"
        install = "npm ci"
    else:
        runner = "npm"
        install = "npm install"

    script_commands: dict[str, str] = {}
    for script_name in ("test", "build", "dev", "start", "lint", "check"):
        if script_name not in scripts:
            continue
        if runner == "npm" and script_name == "test":
            script_commands[script_name] = "npm test"
        elif runner == "yarn":
            script_commands[script_name] = f"yarn {script_name}"
        elif runner == "bun":
            script_commands[script_name] = f"bun run {script_name}"
        else:
            script_commands[script_name] = f"{runner} run {script_name}"
    return install, script_commands


def _add_package_commands(repo_root: Path, manifest: Path, catalog: dict[str, str]) -> None:
    try:
        package_data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    scripts = package_data.get("scripts")
    if not isinstance(scripts, dict):
        scripts = {}
    relative_dir = manifest.parent.relative_to(repo_root).as_posix()
    if relative_dir == ".":
        relative_dir = ""
    slug = _slug(relative_dir, "package")
    prefix = _cd_prefix(relative_dir)
    install_command, script_commands = _package_manager_command(manifest.parent, scripts)
    catalog[f"install_{slug}_dependencies"] = f"{prefix}{install_command}"
    for script_name, command in script_commands.items():
        command_type = "run" if script_name in {"dev", "start"} else script_name
        catalog[f"{command_type}_{slug}_{script_name}"] = f"{prefix}{command}"


def _add_python_commands(repo_root: Path, manifest: Path, catalog: dict[str, str]) -> None:
    relative_dir = manifest.parent.relative_to(repo_root).as_posix()
    if relative_dir == ".":
        relative_dir = ""
    slug = _slug(relative_dir, "python")
    prefix = _cd_prefix(relative_dir)
    if manifest.name == "requirements.txt":
        catalog[f"install_{slug}_dependencies"] = f"{prefix}python -m pip install -r requirements.txt"
    elif manifest.name == "pyproject.toml":
        catalog[f"install_{slug}_dependencies"] = f"{prefix}python -m pip install -e ."
        content = manifest.read_text(encoding="utf-8", errors="ignore")
        if "[build-system]" in content:
            catalog[f"build_{slug}"] = f"{prefix}python -m build"

    has_tests = any(
        (manifest.parent / name).exists()
        for name in ("tests", "test", "pytest.ini", "tox.ini")
    )
    manifest_text = manifest.read_text(encoding="utf-8", errors="ignore")
    if has_tests or "pytest" in manifest_text or "unittest" in manifest_text:
        catalog[f"test_{slug}"] = f"{prefix}python -m pytest"


def _add_cargo_commands(repo_root: Path, manifest: Path, catalog: dict[str, str]) -> None:
    relative_dir = manifest.parent.relative_to(repo_root).as_posix()
    relative_dir = "" if relative_dir == "." else relative_dir
    slug = _slug(relative_dir, "cargo")
    prefix = _cd_prefix(relative_dir)
    catalog[f"build_{slug}"] = f"{prefix}cargo build"
    catalog[f"test_{slug}"] = f"{prefix}cargo test"
    catalog[f"run_{slug}"] = f"{prefix}cargo run"


def _add_go_commands(repo_root: Path, manifest: Path, catalog: dict[str, str]) -> None:
    relative_dir = manifest.parent.relative_to(repo_root).as_posix()
    relative_dir = "" if relative_dir == "." else relative_dir
    slug = _slug(relative_dir, "go")
    prefix = _cd_prefix(relative_dir)
    catalog[f"build_{slug}"] = f"{prefix}go build ./..."
    catalog[f"test_{slug}"] = f"{prefix}go test ./..."
    catalog[f"run_{slug}"] = f"{prefix}go run ."


def _add_jvm_commands(repo_root: Path, manifest: Path, catalog: dict[str, str]) -> None:
    relative_dir = manifest.parent.relative_to(repo_root).as_posix()
    relative_dir = "" if relative_dir == "." else relative_dir
    slug = _slug(relative_dir, "jvm")
    prefix = _cd_prefix(relative_dir)
    if manifest.name == "pom.xml":
        catalog[f"build_{slug}"] = f"{prefix}mvn package"
        catalog[f"test_{slug}"] = f"{prefix}mvn test"
        return
    wrapper = "./gradlew" if (manifest.parent / "gradlew").exists() else "gradle"
    catalog[f"build_{slug}"] = f"{prefix}{wrapper} build"
    catalog[f"test_{slug}"] = f"{prefix}{wrapper} test"


def _add_make_commands(repo_root: Path, manifest: Path, catalog: dict[str, str]) -> None:
    content = manifest.read_text(encoding="utf-8", errors="ignore")
    targets = {
        match.group("target")
        for match in re.finditer(r"^(?P<target>[A-Za-z0-9_.-]+)\s*:(?![=])", content, re.MULTILINE)
    }
    safe_targets = {"install", "setup", "test", "check", "lint", "build", "run", "dev", "start", "serve", "smoke"}
    relative_dir = manifest.parent.relative_to(repo_root).as_posix()
    relative_dir = "" if relative_dir == "." else relative_dir
    slug = _slug(relative_dir, "make")
    prefix = _cd_prefix(relative_dir)
    for target in sorted(targets & safe_targets):
        command_type = "run" if target in {"run", "dev", "start", "serve"} else target
        catalog[f"{command_type}_{slug}_{target}"] = f"{prefix}make {target}"


def _add_container_commands(repo_root: Path, manifest: Path, catalog: dict[str, str]) -> None:
    relative_dir = manifest.parent.relative_to(repo_root).as_posix()
    relative_dir = "" if relative_dir == "." else relative_dir
    slug = _slug(relative_dir, "container")
    prefix = _cd_prefix(relative_dir)
    if manifest.name == "Dockerfile":
        catalog[f"build_{slug}_container"] = f"{prefix}docker build -t sdd-local-{slug} ."
        return
    if manifest.name in {"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}:
        catalog[f"check_{slug}_compose_config"] = f"{prefix}docker compose -f {_quote(manifest.name)} config"


def _add_shell_script_commands(repo_root: Path, catalog: dict[str, str]) -> None:
    if not repo_root.exists() or not repo_root.is_dir():
        return

    for script_dir_name in sorted(_SAFE_SCRIPT_DIR_NAMES):
        script_dir = repo_root / script_dir_name
        if not script_dir.exists() or not script_dir.is_dir():
            continue
        for script in sorted(script_dir.rglob("*.sh"), key=lambda item: item.relative_to(repo_root).as_posix()):
            if any(part in _IGNORED_DIR_NAMES or part.startswith(".") for part in script.relative_to(repo_root).parts):
                continue

            stem_tokens = {
                token
                for token in re.split(r"[^a-zA-Z0-9]+", script.stem.casefold())
                if token
            }
            if not stem_tokens or stem_tokens & _SCRIPT_EXCLUDED_TOKENS:
                continue

            command_type = next(
                (
                    candidate_type
                    for candidate_type, tokens in _SCRIPT_COMMAND_TYPE_TOKENS
                    if stem_tokens & set(tokens)
                ),
                None,
            )
            if command_type is None:
                continue

            relative = script.relative_to(repo_root).as_posix()
            slug = _slug(relative.removesuffix(".sh"), "script")
            command = f"./{_quote(relative)}" if script.stat().st_mode & 0o111 else f"sh {_quote(relative)}"
            catalog.setdefault(f"{command_type}_{slug}", command)


def build_default_command_catalog(repo_root: Path | None = None) -> dict[str, str]:
    catalog: dict[str, str] = {
        "inspect_repo_tree": _python_inline(_inspect_repo_tree_code()),
        "inspect_project_manifests": _python_inline(_inspect_project_manifests_code()),
    }
    if repo_root is None:
        return catalog

    root = repo_root.expanduser().resolve()
    for manifest in _iter_manifest_files(root):
        if manifest.name == "package.json":
            _add_package_commands(root, manifest, catalog)
        elif manifest.name in {"pyproject.toml", "requirements.txt"}:
            _add_python_commands(root, manifest, catalog)
        elif manifest.name == "Cargo.toml":
            _add_cargo_commands(root, manifest, catalog)
        elif manifest.name == "go.mod":
            _add_go_commands(root, manifest, catalog)
        elif manifest.name in {"pom.xml", "build.gradle", "build.gradle.kts"}:
            _add_jvm_commands(root, manifest, catalog)
        elif manifest.name in {"Makefile", "makefile"}:
            _add_make_commands(root, manifest, catalog)
        elif manifest.name in {"Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}:
            _add_container_commands(root, manifest, catalog)
    _add_shell_script_commands(root, catalog)
    return catalog


def _default_validation_command_ids(command_catalog: dict[str, str]) -> list[str]:
    validation_prefixes = ("test_", "build_", "check_", "lint_", "smoke_")
    return [command_id for command_id in command_catalog if command_id.startswith(validation_prefixes)]


def _test_runner_command_ids(command_catalog: dict[str, str]) -> list[str]:
    return [command_id for command_id in command_catalog if command_id.startswith("test_")]


def build_default_target_contract(
    *,
    base_ref: str,
    write_roots: list[str],
    repo_root: Path | None = None,
) -> dict[str, Any]:
    command_catalog = build_default_command_catalog(repo_root)
    validation_commands = _default_validation_command_ids(command_catalog)
    allowed_commands = list(command_catalog)
    return {
        "version": 1,
        "base_ref": base_ref,
        "write_roots": write_roots,
        "command_catalog": command_catalog,
        "test_runner_ids": _test_runner_command_ids(command_catalog),
        "bootstrap_commands": ["inspect_repo_tree", "inspect_project_manifests"],
        "role_profiles": {
            "backend_specialist": {
                "allowed_commands": allowed_commands,
                "default_validation_commands": validation_commands,
            },
            "frontend_specialist": {
                "allowed_commands": allowed_commands,
                "default_validation_commands": validation_commands,
            },
            "qa_specialist": {
                "allowed_commands": allowed_commands,
                "default_validation_commands": validation_commands,
            },
        },
    }
