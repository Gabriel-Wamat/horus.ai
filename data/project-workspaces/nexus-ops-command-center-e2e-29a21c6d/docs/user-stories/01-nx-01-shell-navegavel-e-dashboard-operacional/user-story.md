# NX-01 - Shell navegavel e dashboard operacional

## User Story
Como coordenador de operações, quero acessar um Command Center com navegação persistente entre Dashboard, Incidentes, Ativos, Automações, Relatórios e Configurações para entender rapidamente a saúde das operações e mudar de contexto sem perder orientação.

## Acceptance Criteria
- A aplicação deve ter shell responsivo com sidebar/rail, cabeçalho contextual, breadcrumbs ou indicação de rota ativa e navegação entre pelo menos seis áreas funcionais sem recarregar a página.
- O Dashboard deve exibir KPIs de incidentes abertos, SLA em risco, automações em execução, ativos críticos e fila de revisão com estados loading, vazio e erro representáveis.
- A tela deve oferecer filtros globais por período, severidade e equipe, refletindo visualmente os filtros ativos sem quebrar o layout em desktop ou mobile.
- A identidade visual deve ser de ferramenta operacional dark, densa, baseada em cinzas, strokes sutis e apenas um acento controlado para ação primária/estado positivo.
- Textos longos de nomes de incidentes, equipes e ativos devem truncar ou quebrar de forma previsível sem overflow.

## SPEC Summary
Shell navegável tipo Command Center com sidebar persistente e dashboard operacional dark, responsivo e filtrável sem reload de página.

## Technical Approach
Pattern: operational-dashboard. Implementar em React + TypeScript preservando arquitetura existente (componentes funcionais, hooks, contexto de rota). Shell com SidebarRail (persistente em desktop, colapsável em mobile), Topbar contextual com filtros globais e Breadcrumbs/RouteIndicator; rota cliente via react-router (ou adapter de roteamento injetável). Dashboard composto por KPICards, Lista de Incidentes e QueuePanel; cada bloco gerencia estados: loading, empty, error, success. Data flow via injectable adapters (Boundary Service) que expõem fetchContracts (GET /api/ops/summary, /incidents, /assets, /automations, /reports); não usar mocks em runtime. CSS-in-TS ou tokens existentes; tema dark baseado em cinzas, um único accent para primary/actions; truncamento com text-overflow/word-break controlado. Responsividade: sidebar->rail->drawer, grids fluidos; acessibilidade: landmarks, aria-current em navegação, foco visível, contraste mínimo WCAG AA para texto, testes de teclado e leitores de tela.
