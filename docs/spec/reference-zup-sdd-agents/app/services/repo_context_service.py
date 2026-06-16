import re
import tomllib
import os
from pathlib import Path

from app.schemas.repo import RepoContextSummary


class RepoContextService:
    _FILE_ALLOWLIST = {"README.md", "pyproject.toml", "docker-compose.yml"}
    _DIR_ALLOWLIST = {"app", "alembic", "project_context", "src", "frontend", "backend", "pages"}
    _EXCLUDED_DIRS = {
        ".git",
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        ".venv",
        "__pycache__",
        "coverage",
        "dist",
        "htmlcov",
        "node_modules",
        "playwright-report",
    }
    _LANGUAGE_BY_SUFFIX = {
        ".py": "python",
        ".md": "markdown",
        ".toml": "toml",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".mako": "mako",
    }

    def __init__(self, repo_root: Path | None = None):
        self._repo_root = repo_root or Path(__file__).resolve().parents[2]

    def collect(self) -> RepoContextSummary:
        repo_files = self._collect_files()
        return RepoContextSummary(
            languages=self._detect_languages(repo_files),
            frameworks=self._detect_frameworks(),
            entrypoints=self._detect_entrypoints(),
            database_entities=self._detect_database_entities(),
            api_routes=self._detect_api_routes(),
            frontend_entrypoints=self._detect_frontend_entrypoints(),
            frontend_routes=self._detect_frontend_routes(),
            frontend_components=self._detect_frontend_components(),
            infra_summary=self._build_infra_summary(),
            architecture_summary=self._build_architecture_summary(),
        )

    def _collect_files(self) -> list[Path]:
        files: list[Path] = []
        for file_name in sorted(self._FILE_ALLOWLIST):
            path = self._repo_root / file_name
            if path.exists():
                files.append(path)
        for dir_name in sorted(self._DIR_ALLOWLIST):
            path = self._repo_root / dir_name
            if path.exists():
                files.extend(self._iter_source_files(path))
        return files

    def _iter_source_files(self, root: Path) -> list[Path]:
        files: list[Path] = []
        for current_root, dir_names, file_names in os.walk(root):
            dir_names[:] = [
                name
                for name in dir_names
                if name not in self._EXCLUDED_DIRS and not name.startswith(".")
            ]
            current_path = Path(current_root)
            files.extend(
                current_path / file_name
                for file_name in file_names
                if not file_name.startswith(".")
            )
        return sorted(files)

    def _detect_languages(self, files: list[Path]) -> list[str]:
        languages = {
            self._LANGUAGE_BY_SUFFIX[file.suffix]
            for file in files
            if file.suffix in self._LANGUAGE_BY_SUFFIX
        }
        return sorted(languages)

    def _detect_frameworks(self) -> list[str]:
        pyproject_path = self._repo_root / "pyproject.toml"
        if not pyproject_path.exists():
            return []
        data = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
        dependencies = " ".join(data.get("project", {}).get("dependencies", []))
        frameworks: list[str] = []
        if "fastapi" in dependencies:
            frameworks.append("FastAPI")
        if "sqlalchemy" in dependencies:
            frameworks.append("SQLAlchemy")
        if "alembic" in dependencies:
            frameworks.append("Alembic")
        if "langchain" in dependencies:
            frameworks.append("LangChain")
        if "langgraph" in dependencies:
            frameworks.append("LangGraph")
        return frameworks

    def _detect_entrypoints(self) -> list[str]:
        entrypoints: list[str] = []
        main_path = self._repo_root / "app" / "main.py"
        if main_path.exists():
            entrypoints.append("app.main:app")
        return entrypoints

    def _detect_database_entities(self) -> list[str]:
        pattern = re.compile(r'__tablename__\s*=\s*"([^"]+)"')
        entities: set[str] = set()
        for candidate_dir in (
            self._repo_root / "app" / "domain" / "models",
            self._repo_root / "backend",
            self._repo_root / "src",
        ):
            if not candidate_dir.exists():
                continue
            for file in candidate_dir.rglob("*.py"):
                content = file.read_text(encoding="utf-8")
                entities.update(pattern.findall(content))
        return sorted(entities)

    def _detect_api_routes(self) -> list[str]:
        routes: list[str] = []
        pattern = re.compile(r'@router\.(get|post|put|delete|patch)\("([^"]+)"')
        for candidate_dir in (
            self._repo_root / "app" / "routers",
            self._repo_root / "backend",
            self._repo_root / "src",
        ):
            if not candidate_dir.exists():
                continue
            for file in candidate_dir.rglob("*.py"):
                content = file.read_text(encoding="utf-8")
                for method, path in pattern.findall(content):
                    routes.append(f"{method.upper()} {path}")
        return sorted(routes)

    def _detect_frontend_entrypoints(self) -> list[str]:
        entrypoints: list[str] = []
        for relative_path in (
            ("src", "main.tsx"),
            ("src", "main.jsx"),
            ("src", "App.tsx"),
            ("src", "App.jsx"),
            ("frontend", "src", "main.tsx"),
            ("frontend", "src", "App.tsx"),
            ("pages", "index.tsx"),
        ):
            path = self._repo_root.joinpath(*relative_path)
            if path.exists():
                entrypoints.append(str(path.relative_to(self._repo_root)))
        return sorted(set(entrypoints))

    def _detect_frontend_routes(self) -> list[str]:
        routes: set[str] = set()
        page_roots = [
            self._repo_root / "pages",
            self._repo_root / "app",
            self._repo_root / "src" / "pages",
            self._repo_root / "frontend" / "src" / "pages",
        ]
        for page_root in page_roots:
            if not page_root.exists():
                continue
            for file in page_root.rglob("*.tsx"):
                route = "/" + file.relative_to(page_root).with_suffix("").as_posix()
                route = route.replace("/index", "") or "/"
                routes.add(route)
        return sorted(routes)

    def _detect_frontend_components(self) -> list[str]:
        component_names: set[str] = set()
        component_dirs = [
            self._repo_root / "src" / "components",
            self._repo_root / "frontend" / "src" / "components",
            self._repo_root / "app" / "components",
        ]
        for component_dir in component_dirs:
            if not component_dir.exists():
                continue
            for file in component_dir.rglob("*"):
                if file.suffix in {".tsx", ".jsx"}:
                    component_names.add(file.stem)
        return sorted(component_names)

    def _build_infra_summary(self) -> str:
        compose_path = self._repo_root / "docker-compose.yml"
        frameworks = self._detect_frameworks()
        framework_label = ", ".join(frameworks) if frameworks else "frameworks not detected"
        if compose_path.exists():
            return f"Repository with Docker Compose and detected frameworks: {framework_label}."
        return f"Repository with local runtime and detected frameworks: {framework_label}."

    def _build_architecture_summary(self) -> str:
        return (
            "Architecture summary is inferred from discovered folders, entrypoints, contracts, and persistence files; "
            "agents must verify boundaries in the target workspace before choosing an implementation structure."
        )
