"""FileEditTool para edição segura de arquivos."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.core.sandbox import Sandbox

logger = logging.getLogger(__name__)


class FileEditTool:
    """Edita arquivos existentes via substituição de strings."""

    def __init__(self, *, sandbox: Sandbox | None = None) -> None:
        """Inicializa tool de edição.

        Args:
            sandbox: Sandbox opcional para validar leitura e escrita.
        """
        self.sandbox = sandbox

    async def execute(
        self,
        path: Path,
        old_string: str,
        new_string: str,
        *,
        replace_all: bool = False,
    ) -> dict[str, Any]:
        """Edita arquivo substituindo old_string por new_string.

        IMPORTANTE: old_string DEVE ser único no arquivo,
        a menos que replace_all=True.

        Args:
            path: Arquivo a editar
            old_string: Conteúdo exato a localizar
            new_string: Conteúdo que substituirá old_string
            replace_all: Se True, substitui todas as ocorrências

        Returns:
            Metadados factuais da edição
        """
        target_path = path.expanduser().resolve()
        self._validate_path(target_path)
        if self.sandbox is not None:
            self.sandbox.validate_file_read(target_path)
            self.sandbox.validate_file_write(target_path)

        if not target_path.exists():
            raise FileNotFoundError(f"File not found: {target_path}")
        if not target_path.is_file():
            raise ValueError(f"Not a file: {target_path}")
        if old_string == new_string:
            raise ValueError("old_string and new_string are identical")

        content = target_path.read_text(encoding="utf-8")
        occurrences = content.count(old_string)
        if occurrences == 0:
            raise ValueError(f"old_string not found in {target_path}")
        if occurrences > 1 and not replace_all:
            raise ValueError(
                f"old_string appears {occurrences} times. "
                "Add more context or use replace_all=True"
            )

        if replace_all:
            new_content = content.replace(old_string, new_string)
            replacements = occurrences
        else:
            new_content = content.replace(old_string, new_string, 1)
            replacements = 1

        target_path.write_text(new_content, encoding="utf-8")
        logger.info("File edited: %s (%s replacement(s))", target_path, replacements)

        return {
            "path": str(target_path),
            "replacements": replacements,
            "replace_all": replace_all,
            "old_size": len(content),
            "new_size": len(new_content),
            "diff_chars": len(new_content) - len(content),
        }

    @staticmethod
    def _validate_path(path: Path) -> None:
        """Bloqueia edição fora do workspace quando há contexto ativo."""
        try:
            from app.core.agent_context import get_workspace_path
        except Exception:
            return
        workspace = get_workspace_path()
        if workspace is None:
            return
        try:
            path.relative_to(workspace.expanduser().resolve())
        except ValueError as exc:
            raise ValueError(f"Path outside workspace: {path}") from exc
