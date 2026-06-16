# NX-02 - Triagem de incidentes com board, filtros e detalhe

## User Story
Como analista NOC, quero triagem de incidentes em board/lista com filtros, agrupamento por severidade e painel de detalhe para priorizar o que exige ação imediata.

## Acceptance Criteria
- A área de Incidentes deve alternar entre visualização board e lista mantendo os mesmos dados, filtros e seleção atual.
- Cada incidente deve mostrar severidade, SLA restante, serviço afetado, dono, status e último evento de forma escaneável e compacta.
- Ao selecionar um incidente, a interface deve abrir um detalhe lateral com timeline, ações recomendadas, checklist de mitigação e botão de atribuição.
- Filtros por severidade, status, time responsável, SLA e texto livre devem compor estado derivado e exibir resultado vazio quando nada combinar.
- Ações destrutivas ou sensíveis devem exigir confirmação clara e não competir visualmente com ações primárias.

## SPEC Summary
Triagem de incidentes com board/lista sincronizados, filtros compostos e painel lateral de detalhe para priorização NOC.

## Technical Approach
Pattern: operational-dashboard. Implementar em React + TypeScript mantendo arquitetura existente (componentes funcionais, hooks, CSS-in-JS or project token system). UI: topo com barra de filtros composta (severity, status, team, SLA range, full-text) que atualiza estado derivado central (URL-driven via query params). Área principal alterna entre Board (grid agrupado por severidade, cartões compactos) e Lista (table-like rows) reusando o mesmo data provider; seleção preservada ao alternar. DetailDrawer lateral controlado por selectedIncident com timeline (virtualized list), recommended actions, mitigation checklist e botão de atribuição com modal de confirmação para ações sensíveis. Data adapter: IncidentApiAdapter injetável implementando contratos REST (GET /incidents with filters, GET /incidents/:id, POST /incidents/:id/assign, POST /incidents/:id/actions). UI deve suportar loading/empty/error/success states, ser responsivo (desktop two-column, tablet single-column with drawer overlay, mobile full-screen drawer), e acessível (keyboard focus trap in drawer, ARIA roles, semantic lists, color contrast and text truncation with ellipsis). Use existing UI tokens/components first; expose adapters for backend boundary — não solicitar mocks em runtime.
