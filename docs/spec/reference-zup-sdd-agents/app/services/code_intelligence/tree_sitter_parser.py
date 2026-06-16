"""Tree-sitter based TypeScript and JavaScript parsing."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Literal, cast

from app.services.code_intelligence.ast_parser_service import Symbol, SymbolKind, SymbolLocation

try:  # pragma: no cover - availability is exercised through skip-aware tests.
    from tree_sitter import Language, Node, Parser
    import tree_sitter_typescript as ts_lang

    TREE_SITTER_AVAILABLE = True
except Exception:  # pragma: no cover
    Language = Any  # type: ignore[assignment,misc]
    Node = Any  # type: ignore[assignment,misc]
    Parser = Any  # type: ignore[assignment,misc]
    ts_lang = None  # type: ignore[assignment]
    TREE_SITTER_AVAILABLE = False


class TreeSitterParser:
    """Parse TypeScript/JavaScript files with tree-sitter when available."""

    def __init__(self) -> None:
        if not TREE_SITTER_AVAILABLE:
            raise RuntimeError("tree-sitter and tree-sitter-typescript are not installed")

        self._typescript = self._build_parser("typescript")
        self._javascript = self._build_parser("javascript")
        self._tsx = self._build_parser("tsx") if hasattr(ts_lang, "language_tsx") else self._typescript

    def parse(self, path: Path, language: Literal["typescript", "javascript"]) -> tuple[list[Symbol], list[str]]:
        """Parse a TS/JS file and return symbols plus imports."""
        source_bytes = path.read_bytes()
        parser = self._select_parser(path, language)
        tree = parser.parse(source_bytes)

        symbols: list[Symbol] = []
        imports: list[str] = []
        self._visit_node(tree.root_node, path, symbols, imports)
        return self._dedupe_symbols(symbols), list(dict.fromkeys(imports))

    def _build_parser(self, grammar: Literal["typescript", "javascript", "tsx"]) -> Parser:
        factory_name = {
            "typescript": "language_typescript",
            "javascript": "language_javascript",
            "tsx": "language_tsx",
        }[grammar]
        if not hasattr(ts_lang, factory_name):
            factory_name = "language_typescript"
        language = self._coerce_language(getattr(ts_lang, factory_name)())
        parser = Parser()
        try:
            parser.language = language
        except Exception:
            parser.set_language(language)
        return parser

    def _coerce_language(self, raw_language: object) -> Language:
        if isinstance(raw_language, Language):
            return raw_language
        language_factory = cast(Any, Language)
        try:
            return cast(Language, language_factory(raw_language))
        except TypeError:
            return cast(Language, language_factory(raw_language, "typescript"))

    def _select_parser(self, path: Path, language: Literal["typescript", "javascript"]) -> Parser:
        suffix = path.suffix.lower()
        if suffix in {".tsx", ".jsx"}:
            return self._tsx
        return self._typescript if language == "typescript" else self._javascript

    def _visit_node(self, node: Node, path: Path, symbols: list[Symbol], imports: list[str]) -> None:
        node_type = node.type

        if node_type == "import_statement":
            import_path = self._extract_import_path(node)
            if import_path:
                imports.append(import_path)
                symbols.append(
                    Symbol(
                        name=import_path,
                        kind="import",
                        location=self._node_location(node, path),
                        imports_from=import_path,
                    )
                )
        elif node_type == "call_expression":
            import_path = self._extract_dynamic_import_path(node)
            if import_path:
                imports.append(import_path)
                symbols.append(
                    Symbol(
                        name=import_path,
                        kind="import",
                        location=self._node_location(node, path),
                        imports_from=import_path,
                    )
                )
        elif node_type == "export_statement":
            export_source = self._extract_export_source(node)
            if export_source:
                imports.append(export_source)
            symbols.extend(self._extract_exports(node, path))
        elif node_type == "class_declaration":
            self._append_named_symbol(node=node, path=path, symbols=symbols, kind="class")
        elif node_type in {"function_declaration", "generator_function_declaration"}:
            self._append_named_symbol(node=node, path=path, symbols=symbols, kind="function")
        elif node_type in {"interface_declaration", "type_alias_declaration", "enum_declaration"}:
            self._append_named_symbol(node=node, path=path, symbols=symbols, kind="variable")
        elif node_type == "variable_declarator":
            for name in self._extract_binding_names(node):
                symbols.append(
                    Symbol(
                        name=name,
                        kind="variable",
                        location=self._node_location(node, path),
                        exported=self._is_exported(node),
                    )
                )

        for child in node.children:
            self._visit_node(child, path, symbols, imports)

    def _append_named_symbol(
        self,
        *,
        node: Node,
        path: Path,
        symbols: list[Symbol],
        kind: SymbolKind,
    ) -> None:
        name = self._get_node_name(node)
        if not name:
            return
        symbols.append(
            Symbol(
                name=name,
                kind=kind,
                location=self._node_location(node, path),
                exported=self._is_exported(node),
            )
        )

    def _extract_import_path(self, node: Node) -> str | None:
        for child in self._walk_nodes(node):
            if child.type == "string":
                return _unquote(_node_text(child))
        return None

    def _extract_dynamic_import_path(self, node: Node) -> str | None:
        if not node.children:
            return None
        function_node = node.children[0]
        if function_node.type != "import":
            return None
        for child in self._walk_nodes(node):
            if child.type == "string":
                return _unquote(_node_text(child))
        return None

    def _extract_export_source(self, node: Node) -> str | None:
        saw_from = False
        for child in node.children:
            if child.type == "from":
                saw_from = True
            elif saw_from and child.type == "string":
                return _unquote(_node_text(child))
        for child in self._walk_nodes(node):
            if child.type == "string":
                return _unquote(_node_text(child))
        return None

    def _extract_exports(self, node: Node, path: Path) -> list[Symbol]:
        exports: list[Symbol] = []
        for child in self._walk_nodes(node):
            if child.type == "export_specifier":
                name = self._last_identifier(child)
                if name:
                    exports.append(
                        Symbol(
                            name=name,
                            kind="export",
                            location=self._node_location(child, path),
                            exported=True,
                        )
                    )
            elif child.type == "namespace_export":
                name = self._last_identifier(child)
                if name:
                    exports.append(
                        Symbol(
                            name=name,
                            kind="export",
                            location=self._node_location(child, path),
                            exported=True,
                        )
                    )
        return exports

    def _get_node_name(self, node: Node) -> str | None:
        named = node.child_by_field_name("name")
        if named is not None:
            return _node_text(named)
        for child in node.children:
            if child.type in {"identifier", "type_identifier", "property_identifier"}:
                return _node_text(child)
        return None

    def _extract_binding_names(self, node: Node) -> list[str]:
        name_node = node.child_by_field_name("name")
        if name_node is None:
            return []
        return self._binding_names_from_node(name_node)

    def _binding_names_from_node(self, node: Node) -> list[str]:
        if node.type in {"identifier", "shorthand_property_identifier_pattern"}:
            return [_node_text(node)]
        if node.type == "property_identifier":
            return []
        names: list[str] = []
        for child in node.children:
            names.extend(self._binding_names_from_node(child))
        return names

    def _last_identifier(self, node: Node) -> str | None:
        identifiers = [
            _node_text(child)
            for child in self._walk_nodes(node)
            if child.type in {"identifier", "type_identifier", "property_identifier"}
        ]
        return identifiers[-1] if identifiers else None

    def _is_exported(self, node: Node | None) -> bool:
        current = node
        while current is not None:
            if current.type in {"export_statement", "export_specifier", "namespace_export"}:
                return True
            current = current.parent
        return False

    def _node_location(self, node: Node, path: Path) -> SymbolLocation:
        return SymbolLocation(
            file=str(path),
            line=node.start_point[0] + 1,
            column=node.start_point[1],
            end_line=node.end_point[0] + 1,
            end_column=node.end_point[1],
        )

    def _walk_nodes(self, node: Node) -> list[Node]:
        nodes = [node]
        for child in node.children:
            nodes.extend(self._walk_nodes(child))
        return nodes

    def _dedupe_symbols(self, symbols: list[Symbol]) -> list[Symbol]:
        seen: set[tuple[str, str, int, int, bool]] = set()
        deduped: list[Symbol] = []
        for symbol in symbols:
            key = (
                symbol.name,
                symbol.kind,
                symbol.location.line,
                symbol.location.column,
                symbol.exported,
            )
            if key in seen:
                continue
            seen.add(key)
            deduped.append(symbol)
        return deduped


def _node_text(node: Node) -> str:
    return node.text.decode("utf-8", errors="ignore") if node.text else ""


def _unquote(value: str) -> str:
    stripped = value.strip()
    if len(stripped) >= 2 and stripped[0] in {"'", '"', "`"} and stripped[-1] == stripped[0]:
        return stripped[1:-1]
    return stripped
