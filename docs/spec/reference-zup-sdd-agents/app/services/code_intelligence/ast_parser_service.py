"""AST parsing primitives for code intelligence."""
from __future__ import annotations

import ast
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel

from app.core.logging import get_logger
from app.services.code_intelligence.lru_cache import LRUCache

logger = get_logger(__name__)

SymbolKind = Literal["class", "function", "variable", "import", "export"]


@dataclass(frozen=True)
class SymbolLocation:
    """Location of a symbol in source code."""

    file: str
    line: int
    column: int
    end_line: int | None = None
    end_column: int | None = None


class Symbol(BaseModel):
    """Parsed symbol from source code."""

    name: str
    kind: SymbolKind
    location: SymbolLocation
    parent: str | None = None
    imports_from: str | None = None
    exported: bool = False


class ParsedFile(BaseModel):
    """Complete parse result for a single file."""

    file_path: str
    language: str
    symbols: list[Symbol]
    imports: list[str]
    parse_error: str | None = None
    fingerprint: str


class ASTParserService:
    """Parse source files into structured symbols and imports."""

    def __init__(self, *, cache_maxsize: int = 1000, use_tree_sitter: bool = True) -> None:
        self._cache: LRUCache[str, ParsedFile] = LRUCache(maxsize=cache_maxsize)
        self._tree_sitter: Any | None = self._build_tree_sitter_parser() if use_tree_sitter else None

    def parse_file(self, file_path: str | Path) -> ParsedFile:
        """Parse a single file and return structured symbols."""
        path = Path(file_path).resolve()
        fingerprint = self._compute_fingerprint(path)
        cached = self._cache.get(str(path))
        if cached and cached.fingerprint == fingerprint:
            return cached

        language = self._detect_language(path)
        if language == "python":
            result = self._parse_python(path, fingerprint)
        elif language in {"typescript", "javascript"}:
            result = self._parse_typescript_javascript(path, language, fingerprint)
        else:
            result = ParsedFile(
                file_path=str(path),
                language=language,
                symbols=[],
                imports=[],
                parse_error=f"Unsupported language: {language}",
                fingerprint=fingerprint,
            )

        self._cache.put(str(path), result)
        return result

    def invalidate_cache(self, file_path: str | Path | None = None) -> None:
        """Invalidate a single parse result or the full parser cache."""
        if file_path is None:
            self._cache.invalidate()
            return
        self._cache.invalidate(str(Path(file_path).resolve()))

    def cache_stats(self) -> object:
        """Return parser cache statistics."""
        return self._cache.stats()

    def _compute_fingerprint(self, path: Path) -> str:
        """Create a stable cache fingerprint from path, mtime, and size."""
        try:
            stat = path.stat()
        except OSError:
            return "invalid"
        payload = f"{path}:{stat.st_mtime_ns}:{stat.st_size}"
        return hashlib.sha256(payload.encode()).hexdigest()[:16]

    def _detect_language(self, path: Path) -> str:
        """Detect source language from extension."""
        suffix = path.suffix.lower()
        if suffix == ".py":
            return "python"
        if suffix in {".ts", ".tsx"}:
            return "typescript"
        if suffix in {".js", ".jsx", ".mjs"}:
            return "javascript"
        return "unknown"

    def _parse_python(self, path: Path, fingerprint: str) -> ParsedFile:
        """Parse Python with the built-in ast module."""
        try:
            source = path.read_text(encoding="utf-8", errors="ignore")
            tree = ast.parse(source, filename=str(path))
        except SyntaxError as exc:
            return ParsedFile(
                file_path=str(path),
                language="python",
                symbols=[],
                imports=[],
                parse_error=f"SyntaxError: {exc}",
                fingerprint=fingerprint,
            )
        except Exception as exc:
            return ParsedFile(
                file_path=str(path),
                language="python",
                symbols=[],
                imports=[],
                parse_error=str(exc),
                fingerprint=fingerprint,
            )

        visitor = _PythonSymbolVisitor(path)
        visitor.visit(tree)
        return ParsedFile(
            file_path=str(path),
            language="python",
            symbols=visitor.symbols,
            imports=list(dict.fromkeys(visitor.imports)),
            fingerprint=fingerprint,
        )

    def _build_tree_sitter_parser(self) -> Any | None:
        """Create optional tree-sitter parser without making it a hard runtime dependency."""
        try:
            from app.services.code_intelligence.tree_sitter_parser import (
                TREE_SITTER_AVAILABLE,
                TreeSitterParser,
            )
        except Exception as exc:
            logger.debug("tree_sitter_import_unavailable error=%s", exc)
            return None
        if not TREE_SITTER_AVAILABLE:
            return None
        try:
            return TreeSitterParser()
        except Exception as exc:
            logger.warning("tree_sitter_parser_init_failed error=%s", exc)
            return None

    def _parse_typescript_javascript(self, path: Path, language: str, fingerprint: str) -> ParsedFile:
        """Parse TypeScript/JavaScript with tree-sitter and regex fallback."""
        if self._tree_sitter is not None:
            try:
                symbols, imports = self._tree_sitter.parse(path, language)
                return ParsedFile(
                    file_path=str(path),
                    language=language,
                    symbols=symbols,
                    imports=list(dict.fromkeys(imports)),
                    fingerprint=fingerprint,
                )
            except Exception as exc:
                logger.warning("tree_sitter_parse_failed path=%s error=%s", path, exc)

        return self._parse_typescript_javascript_regex(path, language, fingerprint)

    def _parse_typescript_javascript_regex(self, path: Path, language: str, fingerprint: str) -> ParsedFile:
        """Parse TypeScript/JavaScript with a conservative regex fallback."""
        try:
            source = path.read_text(encoding="utf-8", errors="ignore")
        except Exception as exc:
            return ParsedFile(
                file_path=str(path),
                language=language,
                symbols=[],
                imports=[],
                parse_error=str(exc),
                fingerprint=fingerprint,
            )

        symbols: list[Symbol] = []
        imports: list[str] = []
        for line_number, line in enumerate(source.splitlines(), start=1):
            stripped = line.strip()
            if not stripped:
                continue

            for module in _extract_js_imports(stripped):
                imports.append(module)
                symbols.append(
                    Symbol(
                        name=module,
                        kind="import",
                        location=SymbolLocation(file=str(path), line=line_number, column=line.find(stripped)),
                        imports_from=module,
                    )
                )

            exported = stripped.startswith("export ")
            declaration = re.search(
                r"(?:export\s+)?(?:default\s+)?(class|function|const|let|var|interface|type)\s+([A-Za-z_$][\w$]*)",
                stripped,
            )
            if declaration:
                raw_kind, name = declaration.groups()
                kind: SymbolKind = "class" if raw_kind == "class" else "function" if raw_kind == "function" else "variable"
                symbols.append(
                    Symbol(
                        name=name,
                        kind="export" if exported else kind,
                        location=SymbolLocation(
                            file=str(path),
                            line=line_number,
                            column=max(0, line.find(name)),
                        ),
                        exported=exported,
                    )
                )

            if exported:
                for name in re.findall(r"export\s*\{\s*([^}]+)\s*\}", stripped):
                    for part in name.split(","):
                        exported_name = part.strip().split(" as ")[-1].strip()
                        if exported_name:
                            symbols.append(
                                Symbol(
                                    name=exported_name,
                                    kind="export",
                                    location=SymbolLocation(file=str(path), line=line_number, column=0),
                                    exported=True,
                                )
                            )

        return ParsedFile(
            file_path=str(path),
            language=language,
            symbols=symbols,
            imports=list(dict.fromkeys(imports)),
            fingerprint=fingerprint,
        )


class _PythonSymbolVisitor(ast.NodeVisitor):
    def __init__(self, path: Path) -> None:
        self.path = path
        self.symbols: list[Symbol] = []
        self.imports: list[str] = []
        self._parents: list[str] = []

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self.symbols.append(
            Symbol(
                name=node.name,
                kind="class",
                location=_location(self.path, node),
                parent=self._parent,
            )
        )
        self._parents.append(node.name)
        self.generic_visit(node)
        self._parents.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._visit_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._visit_function(node)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.imports.append(alias.name)
            self.symbols.append(
                Symbol(
                    name=alias.asname or alias.name.split(".")[0],
                    kind="import",
                    location=_location(self.path, node),
                    parent=self._parent,
                    imports_from=alias.name,
                )
            )

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = "." * node.level + (node.module or "")
        if module:
            self.imports.append(module)
        for alias in node.names:
            imported_from = f"{module}.{alias.name}" if module else alias.name
            self.symbols.append(
                Symbol(
                    name=alias.asname or alias.name,
                    kind="import",
                    location=_location(self.path, node),
                    parent=self._parent,
                    imports_from=imported_from,
                )
            )

    @property
    def _parent(self) -> str | None:
        return ".".join(self._parents) if self._parents else None

    def _visit_function(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        self.symbols.append(
            Symbol(
                name=node.name,
                kind="function",
                location=_location(self.path, node),
                parent=self._parent,
            )
        )
        self._parents.append(node.name)
        self.generic_visit(node)
        self._parents.pop()


def _location(path: Path, node: ast.AST) -> SymbolLocation:
    return SymbolLocation(
        file=str(path),
        line=getattr(node, "lineno", 1),
        column=getattr(node, "col_offset", 0),
        end_line=getattr(node, "end_lineno", None),
        end_column=getattr(node, "end_col_offset", None),
    )


def _extract_js_imports(line: str) -> list[str]:
    imports: list[str] = []
    patterns = (
        r"import\s+(?:type\s+)?(?:[^'\"]+\s+from\s+)?['\"]([^'\"]+)['\"]",
        r"export\s+(?:[^'\"]+\s+from\s+)['\"]([^'\"]+)['\"]",
        r"require\(\s*['\"]([^'\"]+)['\"]\s*\)",
    )
    for pattern in patterns:
        imports.extend(match.group(1) for match in re.finditer(pattern, line))
    return imports
