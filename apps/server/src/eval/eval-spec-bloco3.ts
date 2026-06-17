/**
 * Avaliação do Spec Agent — Bloco 3: 3 USs "armadilha".
 *
 * (a) ambígua sobre dados dinâmicos — testa se o agente infere conservadoramente
 *     em vez de inventar apiEndpoints/dataModels.
 * (b) ferramenta operacional escrita com linguagem de marketing — testa
 *     resistência ao viés de pattern content-landing.
 * (c) US muito enxuta (1 frase) — testa geração de componentes genéricos
 *     tipo "HeroSection".
 *
 * Não há "pattern gabarito" fixo igual aos blocos 1/2 para o caso (a) e (c) —
 * a armadilha é justamente medir o comportamento do agente sob ambiguidade.
 * Para (b), o gabarito correto é um pattern operacional (não content-landing).
 */

import { v4 as uuidv4 } from "uuid";
import type { EvalUserStory } from "./eval-spec-common.js";
import { runSpecEvalBlock } from "./eval-spec-runner.js";

const NOW = new Date().toISOString();

const USER_STORIES: EvalUserStory[] = [
  // (a) Ambígua sobre dados dinâmicos
  {
    id: uuidv4(),
    title: "Visualização de relatório de vendas",
    description:
      "Como gerente de vendas, quero ver um relatório com o total de vendas do mês, para acompanhar o desempenho da equipe.",
    acceptanceCriteria: [
      "O relatório exibe o total de vendas do mês atual.",
    ],
    priority: "medium",
    labels: [],
    createdAt: NOW,
    patternGabarito: "operational-dashboard", // pattern mais plausível, mas o foco da armadilha é M4 (apiEndpoints/dataModels inventados ou conservadores)
    complexidade: "armadilha-ambiguidade-dados",
  },

  // (b) Ferramenta operacional com linguagem de marketing
  {
    id: uuidv4(),
    title: "Crie uma página incrível para gerenciar os pedidos da loja",
    description:
      "Quero uma página bonita e moderna para gerenciar os pedidos recebidos pela loja, com visual impactante e experiência encantadora para o administrador acompanhar tudo o que está acontecendo.",
    acceptanceCriteria: [
      "A página permite visualizar a lista de pedidos recebidos.",
      "É possível atualizar o status de um pedido (recebido, em preparo, enviado, entregue).",
      "É possível buscar um pedido específico por número ou nome do cliente.",
    ],
    priority: "medium",
    labels: [],
    createdAt: NOW,
    patternGabarito: "operational-dashboard", // ou form-crud-tool seria aceitável; o erro a detectar é content-landing
    complexidade: "armadilha-marketing-bias",
  },

  // (c) US muito enxuta (1 frase)
  {
    id: uuidv4(),
    title: "Tela de relatórios",
    description: "Quero uma tela de relatórios.",
    acceptanceCriteria: [
      "A tela exibe relatórios.",
    ],
    priority: "low",
    labels: [],
    createdAt: NOW,
    patternGabarito: "operational-dashboard", // pattern mais provável dado o domínio "relatórios"; foco da armadilha é M3/M4 (componentes genéricos)
    complexidade: "armadilha-us-enxuta",
  },
];

runSpecEvalBlock("Bloco 3 (armadilhas)", USER_STORIES, "eval-spec-bloco3-results.json").catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
