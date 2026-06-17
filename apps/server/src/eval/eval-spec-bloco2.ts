/**
 * Avaliação do Spec Agent — Bloco 2: 12 USs (6 patterns × baixa/alta complexidade).
 *
 * Critério de complexidade (do plano de avaliação):
 *   baixa: 1-2 acceptance criteria, sem dados dinâmicos/API, 1 tela.
 *   alta: 6+ acceptance criteria, múltiplos componentes interdependentes,
 *         dados persistidos/CRUD/fluxo multi-etapa.
 */

import { v4 as uuidv4 } from "uuid";
import type { EvalUserStory } from "./eval-spec-common.js";
import { runSpecEvalBlock } from "./eval-spec-runner.js";

const NOW = new Date().toISOString();

const USER_STORIES: EvalUserStory[] = [
  // ── operational-dashboard ────────────────────────────────────────────
  {
    id: uuidv4(),
    title: "Lista simples de status dos servidores",
    description:
      "Como operador de infraestrutura, quero ver uma lista com o status atual (online/offline) de cada servidor monitorado, para saber rapidamente se algo está fora do ar.",
    acceptanceCriteria: [
      "A lista exibe o nome de cada servidor e seu status atual (online ou offline).",
    ],
    priority: "low",
    labels: [],
    createdAt: NOW,
    patternGabarito: "operational-dashboard",
    complexidade: "baixa",
  },
  {
    id: uuidv4(),
    title: "Central de operações de suporte multi-fila",
    description:
      "Como supervisor de suporte, quero um painel operacional que mostre simultaneamente filas de atendimento, SLA de cada ticket, agentes disponíveis, e histórico de reatribuições, com filtros cruzados e exportação de relatórios, para gerenciar a operação do time em tempo real.",
    acceptanceCriteria: [
      "O painel exibe colunas por fila de atendimento com contagem de tickets abertos.",
      "Cada ticket exibe indicador visual de SLA (dentro do prazo, em risco, vencido).",
      "É possível filtrar tickets por agente responsável, fila e status simultaneamente.",
      "Uma seção lateral lista agentes disponíveis com sua carga atual de tickets.",
      "Ao reatribuir um ticket, o histórico de reatribuições é registrado e exibido em um painel de auditoria.",
      "É possível exportar a visão atual filtrada como relatório (CSV ou similar).",
      "Tickets vencidos aparecem destacados visualmente em relação aos demais.",
      "O painel atualiza a contagem de tickets por fila sem exigir recarregamento manual da página.",
    ],
    priority: "high",
    labels: [],
    createdAt: NOW,
    patternGabarito: "operational-dashboard",
    complexidade: "alta",
  },

  // ── chat-preview-workbench ───────────────────────────────────────────
  {
    id: uuidv4(),
    title: "Caixa de perguntas e respostas simples",
    description:
      "Como usuário, quero digitar uma pergunta e ver a resposta do assistente aparecer abaixo, para tirar dúvidas rápidas.",
    acceptanceCriteria: [
      "Ao enviar uma pergunta, a resposta do assistente aparece abaixo do campo de entrada.",
    ],
    priority: "low",
    labels: [],
    createdAt: NOW,
    patternGabarito: "chat-preview-workbench",
    complexidade: "baixa",
  },
  {
    id: uuidv4(),
    title: "Workbench de geração de relatórios com revisão por etapas",
    description:
      "Como analista, quero conversar com um assistente para gerar um relatório de dados em múltiplas etapas (escopo, fontes, rascunho, revisão final), vendo a prévia do relatório evoluir ao lado do chat, com histórico de versões e possibilidade de reverter para uma versão anterior, para produzir relatórios complexos com supervisão humana.",
    acceptanceCriteria: [
      "O painel esquerdo exibe o histórico de mensagens organizado por etapa do relatório (escopo, fontes, rascunho, revisão).",
      "O painel direito exibe a prévia do relatório atualizada após cada resposta do assistente.",
      "Cada versão do relatório gerada é salva no histórico de versões com timestamp.",
      "É possível selecionar uma versão anterior do histórico e reverter a prévia para ela.",
      "Um indicador visual mostra em qual etapa do fluxo (escopo, fontes, rascunho, revisão) a conversa está.",
      "O usuário pode anexar uma fonte de dados à conversa, e ela aparece listada na etapa de fontes.",
      "Ao finalizar a revisão final, um botão permite exportar o relatório consolidado.",
    ],
    priority: "high",
    labels: [],
    createdAt: NOW,
    patternGabarito: "chat-preview-workbench",
    complexidade: "alta",
  },

  // ── workflow-map ─────────────────────────────────────────────────────
  {
    id: uuidv4(),
    title: "Visualização simples de duas etapas conectadas",
    description:
      "Como usuário, quero ver duas etapas de um processo conectadas por uma seta, para entender a ordem de execução.",
    acceptanceCriteria: [
      "As duas etapas são exibidas como caixas conectadas por uma seta indicando a ordem.",
    ],
    priority: "low",
    labels: [],
    createdAt: NOW,
    patternGabarito: "workflow-map",
    complexidade: "baixa",
  },
  {
    id: uuidv4(),
    title: "Mapa de dependências de microsserviços com simulação de impacto",
    description:
      "Como arquiteto de sistemas, quero visualizar o grafo completo de dependências entre microsserviços, identificar caminhos críticos, simular o impacto de uma falha em um serviço específico destacando todos os serviços afetados a jusante, e navegar pelo histórico de incidentes de cada nó, para planejar mudanças de infraestrutura com segurança.",
    acceptanceCriteria: [
      "Cada microsserviço é exibido como um nó com nome, versão e status de saúde atual.",
      "As arestas representam chamadas de dependência entre serviços, com direção visível.",
      "Ao selecionar um nó e acionar 'simular falha', todos os nós afetados a jusante são destacados visualmente.",
      "Caminhos críticos (sem redundância) são exibidos com estilo visual distinto das demais arestas.",
      "Clicar em um nó abre um painel lateral com o histórico de incidentes daquele serviço.",
      "É possível filtrar o grafo por domínio/equipe responsável, ocultando nós de outros domínios.",
      "Nós com incidentes ativos no momento são destacados com indicador visual diferente de nós saudáveis.",
    ],
    priority: "high",
    labels: [],
    createdAt: NOW,
    patternGabarito: "workflow-map",
    complexidade: "alta",
  },

  // ── form-crud-tool ───────────────────────────────────────────────────
  {
    id: uuidv4(),
    title: "Cadastro simples de categorias",
    description:
      "Como administrador, quero adicionar o nome de uma nova categoria em um campo de texto e salvá-la, para organizar produtos.",
    acceptanceCriteria: [
      "Um campo de texto permite digitar o nome da categoria e um botão salva a nova categoria na lista.",
    ],
    priority: "low",
    labels: [],
    createdAt: NOW,
    patternGabarito: "form-crud-tool",
    complexidade: "baixa",
  },
  {
    id: uuidv4(),
    title: "Console de gestão de usuários com papéis, permissões e auditoria",
    description:
      "Como administrador de sistema, quero gerenciar usuários com papéis customizados, permissões granulares por módulo, histórico de alterações de cada usuário, importação em lote via CSV, e bloqueio temporário com motivo registrado, para manter controle de acesso completo e auditável.",
    acceptanceCriteria: [
      "A lista de usuários exibe nome, e-mail, papel atribuído e status (ativo, bloqueado, pendente).",
      "Um formulário permite criar usuário definindo papel e marcando permissões granulares por módulo.",
      "Cada alteração em um usuário (papel, permissões, status) é registrada em um histórico de auditoria visível no perfil do usuário.",
      "É possível importar múltiplos usuários de uma vez via upload de arquivo CSV, com validação de erros linha a linha.",
      "Ao bloquear um usuário, um campo obrigatório de motivo deve ser preenchido antes de confirmar.",
      "Usuários bloqueados aparecem com indicador visual distinto e não podem ter permissões editadas até serem desbloqueados.",
      "É possível buscar e filtrar usuários por papel, status e módulo de permissão simultaneamente.",
      "Tentar excluir um usuário com histórico de atividade exige uma segunda confirmação explícita.",
    ],
    priority: "high",
    labels: [],
    createdAt: NOW,
    patternGabarito: "form-crud-tool",
    complexidade: "alta",
  },

  // ── content-landing ──────────────────────────────────────────────────
  {
    id: uuidv4(),
    title: "Página simples de divulgação de evento",
    description:
      "Como organizador, quero uma página com o nome do evento, data e um botão de inscrição, para divulgar o evento.",
    acceptanceCriteria: [
      "A página exibe o nome do evento, a data e um botão de inscrição.",
    ],
    priority: "low",
    labels: [],
    createdAt: NOW,
    patternGabarito: "content-landing",
    complexidade: "baixa",
  },
  {
    id: uuidv4(),
    title: "Landing page completa de lançamento com prova social e FAQ",
    description:
      "Como responsável de marketing, quero uma landing page completa de lançamento de produto com hero, vídeo demonstrativo, seção de funcionalidades detalhadas, comparação de planos de preço, prova social com logos de clientes, depoimentos em carrossel, seção de perguntas frequentes expansível, formulário de captura de lead com validação, e rodapé com newsletter, para maximizar a conversão de visitantes em leads qualificados.",
    acceptanceCriteria: [
      "A seção hero exibe headline, subtítulo, vídeo demonstrativo embutido e botão de CTA principal.",
      "A seção de funcionalidades lista ao menos 4 recursos do produto com ícone, título e descrição.",
      "A seção de planos exibe ao menos 2 opções de preço em formato de comparação lado a lado.",
      "A seção de prova social exibe logos de clientes e um carrossel navegável de depoimentos.",
      "A seção de FAQ permite expandir e recolher cada pergunta individualmente.",
      "O formulário de captura de lead valida campos obrigatórios antes de permitir o envio.",
      "Ao submeter o formulário com sucesso, uma mensagem de confirmação visual é exibida ao usuário.",
      "O rodapé contém um campo de inscrição para newsletter com validação de formato de e-mail.",
    ],
    priority: "high",
    labels: [],
    createdAt: NOW,
    patternGabarito: "content-landing",
    complexidade: "alta",
  },

  // ── custom-product-surface ───────────────────────────────────────────
  {
    id: uuidv4(),
    title: "Quadro simples de notas adesivas",
    description:
      "Como usuário, quero adicionar uma nota de texto livre em uma área da tela e poder movê-la, para organizar ideias soltas.",
    acceptanceCriteria: [
      "É possível criar uma nota de texto na área da tela e arrastá-la para outra posição.",
    ],
    priority: "low",
    labels: [],
    createdAt: NOW,
    patternGabarito: "custom-product-surface",
    complexidade: "baixa",
  },
  {
    id: uuidv4(),
    title: "Mesa de composição musical por camadas com mixagem ao vivo",
    description:
      "Como produtor musical amador, quero uma superfície de composição não convencional onde posso adicionar camadas de som (bateria, baixo, melodia), ajustar volume e efeitos de cada camada em tempo real através de controles deslizantes, visualizar a forma de onda de cada camada, sincronizar todas as camadas a um BPM global, salvar a composição como projeto, e exportar uma mixagem final, para criar protótipos de música diretamente no navegador.",
    acceptanceCriteria: [
      "É possível adicionar uma nova camada de som escolhendo entre tipos predefinidos (bateria, baixo, melodia).",
      "Cada camada exibe sua forma de onda visual e um controle deslizante de volume independente.",
      "Um controle de BPM global ajusta a velocidade de reprodução de todas as camadas simultaneamente.",
      "Cada camada possui controles de efeito (ex: reverb, distorção) ajustáveis individualmente.",
      "É possível silenciar (mute) ou isolar (solo) uma camada específica durante a reprodução.",
      "A composição pode ser salva como projeto nomeado e recarregada posteriormente.",
      "Um botão de exportação gera a mixagem final combinando todas as camadas ativas.",
      "Camadas podem ser reordenadas ou removidas da composição pelo usuário.",
    ],
    priority: "high",
    labels: [],
    createdAt: NOW,
    patternGabarito: "custom-product-surface",
    complexidade: "alta",
  },
];

runSpecEvalBlock("Bloco 2", USER_STORIES, "eval-spec-bloco2-results.json").catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
