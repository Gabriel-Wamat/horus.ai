# NX-03 - Mapa de ativos e dependencias com modo simplificado

## User Story
Como líder técnico, quero ver a topologia dos serviços críticos e suas dependências para identificar impactos e rotas de investigação durante incidentes.

## Acceptance Criteria
- A área de Ativos deve renderizar um mapa top-to-bottom ou por lanes com nós para serviços, bancos, filas, jobs e integrações externas, sem ocultar nenhum nó importante.
- Deve existir um controle por ícones para alternar entre arestas completas e simplificadas, mantendo todos os nós visíveis nos dois modos.
- Nós devem indicar status por texto/forma além de cor, incluindo saudável, degradado, crítico, aguardando e desconhecido.
- Ao selecionar um nó, a interface deve exibir dependências, incidentes relacionados, última checagem e ações de investigação.
- O mapa deve evitar excesso de arestas, labels ilegíveis e dependência exclusiva de cor para transmitir estado.

## SPEC Summary
Mapa topológico simplificado/expandido de ativos e dependências para investigação de incidentes.

## Technical Approach
Pattern: workflow-map. Implementação React + TypeScript (preservar arquitetura frontend existente). Canvas principal renderiza grafo top-to-bottom ou por lanes usando SVG dentro de componente React controlado (no direct DOM mutations). Organizar em: Toolbar (modo de arestas, filtro de tipos), GraphRenderer (SVG groups por lane, nodes e edges), SidePanel (detalhes do nó), DataAdapter (injetável) e StateStore (React Context + reducer). Nodes: componentes UI que expõem texto, forma e ícone; estado visual não depende só de cor (shape, badge text). Edge modes: full (curvas + labels) e simplified (straight minimal connectors) mantendo todos os nós renderizados; algoritmo de roteamento aplica bundling e collision-avoidance para evitar excesso de arestas e labels ilegíveis. Data: consumido via adapters injetáveis que implementam contratos HTTP (ou GraphQL) fornecidos pelo backend; não use mocks embutidos em runtime. Responsividade: breakpoint para collapsible lanes e zoom/pan com limites; acessibilidade: roles SVG+aria-labels, keyboard focus navegável por tab/arrow, contrastes e text alternatives. Estados cobertos: loading, empty, error, success, selected, focus, disabled. Testabilidade: comportamentos observáveis e hooks para testes E2E.
