# NX-06 - Relatorios, preferencias e configuracoes de provider

## User Story
Como gestor da plataforma, quero relatórios de operação e configurações persistentes de provider para medir eficiência, controlar integração e preparar auditoria.

## Acceptance Criteria
- A área Relatórios deve exibir métricas por período, comparação com período anterior, tabela de eventos relevantes e exportação simulada ou preparada por contrato.
- A área Configurações deve permitir escolher provider, modelo, endpoint, chave mascarada, teste de conexão, status de validação e metadados de última alteração.
- Configurações devem preservar estados pristine, dirty, testing, valid, invalid, saving e saved com feedback claro.
- Dados sensíveis nunca devem ser exibidos em texto puro; chaves devem aparecer apenas mascaradas ou como presente/ausente.
- Relatórios e configurações devem compartilhar a mesma identidade visual do shell e não criar uma segunda linguagem de cards, cores ou botões.

## SPEC Summary
Painel de Relatórios e Configurações de provider com CRUD de configurações seguras e visual de métricas por período, integrado ao shell existente.

## Technical Approach
Pattern: form-crud-tool. Frontend React + TypeScript (preservar arquitetura). Página com duas tabs: Relatórios e Configurações. Usar componentes existentes do design system local (botões, inputs, cards, tabelas) via adapters injetáveis; fallback para componentes presentes na base (ex.: /src/components). Form de provider implementado como controlled form com estados: pristine, dirty, testing, valid, invalid, saving, saved. Chave sensível armazenada no model apenas como flag presente/absent e valor mascarado no UI; nunca renderizar plaintext. Teste de conexão faz POST ao adapter de API; resposta é normalizada por um service que valida shape e atualiza estado. Relatórios buscam métricas paginadas e comparativas via API; tabela de eventos com export endpoint (gera URL/stream conforme contrato). Garantir responsividade (mobile-first, breakpoint 600/960px), acessibilidade (labels ARIA, foco visível, contrastes AA), tratamento de loading/empty/error/success e prevenção de overflow de texto (ellipsis + tooltip).
