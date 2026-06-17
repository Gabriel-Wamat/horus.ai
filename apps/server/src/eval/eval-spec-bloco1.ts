/**
 * Avaliação do Spec Agent — Bloco 1: 6 USs de complexidade média, 1 por pattern.
 */

import { v4 as uuidv4 } from "uuid";
import type { EvalUserStory } from "./eval-spec-common.js";
import { runSpecEvalBlock } from "./eval-spec-runner.js";

const NOW = new Date().toISOString();

const USER_STORIES: EvalUserStory[] = [
  {
    id: uuidv4(),
    title: "Painel de monitoramento de tarefas da equipe",
    description:
      "Como gerente, quero visualizar todas as tarefas abertas da minha equipe em uma tabela filtrável, com status e responsável, para identificar gargalos rapidamente.",
    acceptanceCriteria: [
      "A tabela exibe colunas: tarefa, responsável, status e data limite.",
      "É possível filtrar tarefas por status (aberto, em andamento, concluído).",
      "Tarefas atrasadas aparecem com destaque visual distinto.",
      "Ao clicar em uma tarefa, um painel lateral exibe os detalhes completos.",
    ],
    priority: "medium",
    labels: [],
    createdAt: NOW,
    patternGabarito: "operational-dashboard",
    complexidade: "média",
  },
  {
    id: uuidv4(),
    title: "Interface de chat com prévia de código gerado",
    description:
      "Como desenvolvedor, quero enviar mensagens para um assistente de IA e ver o código gerado ao lado, para revisar e copiar rapidamente.",
    acceptanceCriteria: [
      "O painel esquerdo exibe o histórico de mensagens do chat.",
      "O painel direito exibe o último trecho de código gerado com highlight de sintaxe.",
      "Um botão 'Copiar' permite copiar o código gerado para a área de transferência.",
      "O campo de entrada suporta envio com a tecla Enter e exibe contador de caracteres.",
    ],
    priority: "medium",
    labels: [],
    createdAt: NOW,
    patternGabarito: "chat-preview-workbench",
    complexidade: "média",
  },
  {
    id: uuidv4(),
    title: "Mapa visual do pipeline de dados",
    description:
      "Como engenheiro de dados, quero visualizar as dependências entre etapas do meu pipeline em um grafo interativo, para identificar gargalos e dependências críticas.",
    acceptanceCriteria: [
      "Cada etapa do pipeline é exibida como um nó com nome e status de execução.",
      "As arestas entre nós representam dependências entre as etapas.",
      "Nós com falha de execução são destacados em vermelho.",
      "Clicar em um nó exibe seus logs de execução em um painel lateral.",
    ],
    priority: "medium",
    labels: [],
    createdAt: NOW,
    patternGabarito: "workflow-map",
    complexidade: "média",
  },
  {
    id: uuidv4(),
    title: "Gerenciamento de chaves de API",
    description:
      "Como administrador, quero criar, visualizar e revogar chaves de API para integrações externas, com controle de permissões por chave.",
    acceptanceCriteria: [
      "A lista exibe as chaves existentes com nome, data de criação e permissões associadas.",
      "Um formulário permite criar nova chave informando nome e selecionando permissões.",
      "É possível revogar uma chave existente com etapa de confirmação antes de excluir.",
      "Chaves revogadas são exibidas com indicador visual distinto e não permitem edição.",
    ],
    priority: "medium",
    labels: [],
    createdAt: NOW,
    patternGabarito: "form-crud-tool",
    complexidade: "média",
  },
  {
    id: uuidv4(),
    title: "Página de lançamento de produto SaaS",
    description:
      "Como responsável de marketing, quero uma página de apresentação do produto com seções de benefícios, depoimentos e chamada para ação, para converter visitantes em leads.",
    acceptanceCriteria: [
      "A página exibe seção hero com headline, subtítulo e botão de chamada para ação.",
      "Seção de benefícios lista 3 diferenciais do produto com ícone e descrição curta.",
      "Seção de depoimentos exibe ao menos 2 testemunhos com nome e cargo do autor.",
      "O rodapé contém links para política de privacidade e página de contato.",
    ],
    priority: "medium",
    labels: [],
    createdAt: NOW,
    patternGabarito: "content-landing",
    complexidade: "média",
  },
  {
    id: uuidv4(),
    title: "Editor de fluxos de automação por blocos",
    description:
      "Como analista de operações, quero montar fluxos de automação arrastando blocos de condição e ação em uma tela livre, para criar regras de negócio sem precisar escrever código.",
    acceptanceCriteria: [
      "A tela exibe uma paleta lateral com tipos de blocos disponíveis: condição, ação e espera.",
      "Blocos podem ser arrastados da paleta para a área de trabalho e conectados entre si.",
      "Cada bloco tem um formulário inline de configuração exibido ao ser selecionado.",
      "O fluxo pode ser salvo com um nome e recarregado em sessões futuras.",
      "A tela exibe aviso visual quando há blocos presentes mas desconectados no fluxo.",
    ],
    priority: "medium",
    labels: [],
    createdAt: NOW,
    patternGabarito: "custom-product-surface",
    complexidade: "média",
  },
];

runSpecEvalBlock("Bloco 1", USER_STORIES, "eval-spec-bloco1-results.json").catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
