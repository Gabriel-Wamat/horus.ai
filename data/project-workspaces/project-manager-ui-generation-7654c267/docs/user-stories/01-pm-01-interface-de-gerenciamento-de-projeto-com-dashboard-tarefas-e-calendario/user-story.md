# PM-01 - Interface de gerenciamento de projeto com dashboard, tarefas e calendario

## User Story
Como gerente de projeto, quero uma interface bonita e operacional para acompanhar desempenho, organizar tarefas e visualizar o calendário do time em três telas principais: Home Dashboard, Tarefas do Dia e Calendário. A aplicação deve parecer um produto real de gestão, com navegação lateral, filtros por período, estados visuais e layout responsivo.

## Acceptance Criteria
- A aplicação deve ter navegação entre Home, Tarefas e Calendário sem recarregar a página, com item ativo visível e shell consistente.
- A Home deve exibir dashboard de desempenho com cards de progresso, tarefas concluídas, tarefas atrasadas, produtividade semanal, gráfico/visualização simples e lista de próximos marcos.
- A tela de Tarefas deve permitir criar uma nova tarefa com título, prioridade, responsável e data, listar tarefas do dia e alternar filtros Diário, Semanal e Mensal.
- A lista de tarefas deve ter estados de tarefa pendente, em progresso, concluída e atrasada, com busca/filtro e empty state quando não houver tarefas no período.
- A tela de Calendário deve exibir visão mensal com dias, eventos/tarefas distribuídos por data, seleção de dia e painel lateral com itens daquele dia.
- O visual deve ser moderno e minimalista, com bom uso de cinzas, strokes sutis, contraste adequado, um acento controlado e sem excesso de frames ou cores high-light.
- A interface deve ser responsiva: no mobile a navegação deve compactar e as listas/calendário devem reflow sem overflow de texto.

## SPEC Summary
Interface React/TypeScript de gestão de projetos com navegação lateral e três telas: Home (dashboard), Tarefas e Calendário, responsiva e operacional.

## Technical Approach
Pattern: operational-dashboard. Implementar em React + TypeScript mantendo arquitetura existente (componentes funcionais, hooks, CSS Modules / design tokens locais). Shell com Router client-side (react-router) para navegação persistente sem reload; Sidebar com estado ativo por rota. Tela Home composta por cards de métricas, mini-gráfico (SVG/Canvas lightweight), e lista de marcos; Tarefas usando padrão form-crud-tool interno: formulário controlado (title, priority, assigneeId, dueDate) com validação acessível, listagem com filtros (diário/semana/mês), busca e estados visuais por tarefa; Calendário mensal com grid acessível, seleção de dia e painel lateral (slide-over) listando itens do dia. Estados cobertos: loading, empty, error, success, selected, disabled. Dados via adapters injetáveis (TaskApiAdapter) que implementam os contratos REST abaixo; use hooks de data (useTasks, useMetrics, useCalendar) com caching mínimo e revalidation. Responsividade: sidebar colapsável em < 768px; componentes reflow flex/stack; truncamento com ellipsis e aria-labels. Acessibilidade: foco visível, roles (navigation, grid, list), contraste WCAG AA, keyboard navigation para calendar cells. Seguir política de componentes existentes primeiro (local UI library), evitar bibliotecas novas além das já instaladas.
