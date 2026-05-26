"""SendMessageTool para comunicação entre teammates."""

from __future__ import annotations

from typing import Any

from app.core.agent_context import require_agent_context
from app.core.logging import get_logger
from app.core.teammate_system import MessagePriority, MessageType, get_teammate_system

logger = get_logger(__name__)


class SendMessageTool:
    """Tool para enviar mensagens entre teammates.

    Permite que agentes:
    - Enviem mensagens diretas para outros teammates
    - Façam broadcast para todos
    - Compartilhem metadados de coordenação
    """

    async def execute(
        self,
        to: str,
        message: str,
        *,
        message_type: str = "info",
        priority: str = "normal",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Envia mensagem para teammate.

        Args:
            to: Nome do teammate destinatário ("all" para broadcast)
            message: Conteúdo da mensagem
            message_type: Tipo (info, request, response, artifact, coordination, error)
            priority: Prioridade (low, normal, high, urgent)
            metadata: Metadados opcionais

        Returns:
            Confirmação de envio ou erro factual.
        """
        context = require_agent_context()
        context_metadata = context.metadata or {}
        team_name = str(context_metadata.get("team_name") or f"run-{str(context.run_id)[:8]}")

        try:
            msg_type = MessageType(message_type)
        except ValueError:
            msg_type = MessageType.INFO

        try:
            msg_priority = MessagePriority(priority)
        except ValueError:
            msg_priority = MessagePriority.NORMAL

        teammate_system = get_teammate_system()
        try:
            sent_message = await teammate_system.send_message(
                team_name=team_name,
                from_agent=context.agent_name,
                to_agent=to,
                message_type=msg_type,
                content=message,
                priority=msg_priority,
                metadata=metadata,
            )
        except ValueError as exc:
            logger.error("SendMessageTool failed: %s", exc)
            return {"success": False, "error": str(exc)}

        logger.info("Message sent via SendMessageTool: %s -> %s", context.agent_name, to)
        return {
            "success": True,
            "message_id": sent_message.id,
            "from": context.agent_name,
            "to": to,
            "team_name": team_name,
            "message_type": sent_message.message_type.value,
            "priority": sent_message.priority.value,
            "timestamp": sent_message.timestamp.isoformat(),
        }
