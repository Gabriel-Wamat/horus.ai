# NX-05 - Workbench de assistente com chat, evidencia e preview

## User Story
Como operador, quero conversar com um assistente operacional que explique raciocínio, consulte evidências e mostre progresso em tempo real sem inundar o chat.

## Acceptance Criteria
- A área Assistente deve combinar histórico de chat, composer, painel de evidências e preview/resultado da ação em uma composição estável.
- Mensagens do usuário, respostas do assistente, eventos de progresso e falhas devem ter tratamentos visuais distintos sem sobreposição.
- Durante uma ação, a tela deve exibir uma atividade compacta e animada indicando fase atual, sem despejar várias mensagens simultâneas.
- Cada resposta operacional deve poder revelar fontes consultadas, arquivos, comandos ou sinais usados como evidência.
- O input deve permanecer acessível/pinado, com estado disabled somente quando uma ação bloquear envio concorrente.

## SPEC Summary
Workbench de assistente com chat, painel de evidências e preview integrado, mantendo input fixo e indicativo compacto de progresso.

## Technical Approach
Pattern: chat-preview-workbench. Implementação React + TypeScript preservando arquitetura frontend existente (components/, hooks/, services/). Layout: 3 áreas responsivas em grid CSS: 1) Chat column (histórico + composer) 2) Evidence panel (colapsável à direita) 3) Preview/Result area (bottom-right ou modal dependendo de breakpoint). Componentização clara com apresentação/control separation: dumb UI components (MessageBubble, Composer, EvidenceItem, PreviewCanvas) e smart containers (AssistantWorkbenchContainer) que injetam adapters para API/Service. Estados: default, loading(action-in-progress), progress(event stream), error, empty. Interações: composer envia via AssistantService.postMessage(adapter), service expõe SSE/WebSocket/long-poll adapter para eventos de progresso; progressos renderizam como single compact animated ActivityBar em área do chat (não criar múltiplas mensagens). Evidence revelável por mensagem via toggle que consulta EvidenceAPI adapter (paginação opcional). Input permanece fixed/pinned; disabled only while action locks concurrency. Accessibility: ARIA landmarks, role=log para histórico, focus trap composer, keyboard shortcuts (Enter / Shift+Enter), live region for progress updates. Responsividade: column stack under 900px (preview collapses to modal). Use boundary adapters in services (injetáveis) — não embedar mocks.
