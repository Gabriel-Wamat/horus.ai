# NX-04 - Automacoes operacionais com aprovacao e execucao auditavel

## User Story
Como responsável por mudanças, quero configurar automações de mitigação com parâmetros, aprovação e log de execução para agir com segurança durante incidentes.

## Acceptance Criteria
- A área de Automações deve listar playbooks com status, risco, tempo estimado, pré-requisitos e histórico recente.
- Deve existir fluxo de criação/execução em etapas com seleção de alvo, parâmetros, revisão, confirmação e estado de execução.
- Campos obrigatórios, validação inline, estado dirty/saving/saved e erros de servidor devem ser visíveis e acessíveis.
- Execuções devem mostrar log progressivo, comandos planejados, comandos concluídos, falhas e opção de retry quando aplicável.
- A UI deve separar ações primárias, secundárias e destrutivas sem usar cores high-light excessivas.

## SPEC Summary
Interface React/TypeScript para gerenciar playbooks de automação com criação, aprovação, execução auditável e logs progressivos.

## Technical Approach
Pattern: form-crud-tool. Implementar em React + TypeScript seguindo a arquitetura frontend existente (componentes atômicos, containers, hooks, context providers). UI: lista de playbooks (table/list), detalhe lateral ou página para criação/edição em multiple-step wizard (seleção de alvo -> parâmetros -> revisão -> confirmação -> execução). Cada passo é um form controlado com validação inline (aria-invalid, role=status). Estados: idle/dirty/saving/saved/error; execução: queued/running/success/failed with progressive streaming logs. Data layer via adapters injetáveis (PlaybookAPIAdapter) que implementam contratos REST (ver apiEndpoints); não usar mocks em runtime — injetar implementações reais ou test adapters. Component pattern: preferir componentes existentes do repo (Buttons, FormField, Modal, Table, Toast), fallback para libs já instaladas (ex: react-router, axios) e por último HTML/CSS nativo. Responsividade: list/detail collapsible em <768px; acessibilidade: keyboard-first, roles, focus management no wizard, live regions para logs; evitar cores high-light e separar ações por estilo (primary/secondary/destructive).
