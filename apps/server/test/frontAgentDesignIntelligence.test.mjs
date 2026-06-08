import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SpecSchema } from "@u-build/shared";
import { formatDesignBriefForPrompt } from "../dist/infrastructure/design/DesignBriefPrompt.js";
import {
  buildProjectManagerAppCss,
  buildProjectManagerAppTsx,
} from "../dist/infrastructure/agents/front/frontAgentFallbackTemplates.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "US01 - Criar tarefa pessoal",
  description:
    "Permitir criação rápida de tarefa pessoal com título, descrição opcional, vencimento e categoria criável no fluxo.",
  acceptanceCriteria: [
    "Título é obrigatório",
    "Categoria pode ser criada durante o fluxo",
    "Nova tarefa aparece como pendente na lista principal",
  ],
  priority: "high",
  labels: ["tarefas-pessoais"],
  createdAt: "2026-06-08T10:00:00.000Z",
};

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: userStory.id,
  version: 1,
  summary:
    "Implementar criação rápida de tarefa pessoal persistindo no estado local da interface.",
  technicalApproach:
    "Pattern: form-crud-tool. Formulário de criação, lista filtrável e estados vazios sem dados pré-carregados.",
  components: [
    {
      name: "TaskCreationForm",
      type: "ui",
      description: "Cria uma tarefa pessoal com validação de título.",
      dependencies: [],
    },
    {
      name: "TaskList",
      type: "ui",
      description: "Lista tarefas por status e categoria.",
      dependencies: [],
    },
  ],
  apiEndpoints: [],
  dataModels: ["Task { title, description, dueAt, category, status }"],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-06-08T10:01:00.000Z",
};

const designState = (trigger, expectedUi, validationSignal) => ({
  trigger,
  expectedUi,
  validationSignal,
});

const designBrief = {
  surfaceType: "crud",
  userIntent: {
    primaryUserGoal: "Criar uma tarefa pessoal rapidamente sem sair da lista principal.",
    userMentalModel: "Lista pessoal editavel com criacao inline e retorno imediato.",
    successOutcome: "A tarefa aparece como pendente e pronta para acompanhamento.",
    nonGoals: ["Exibir metas de projeto ou indicadores de SDD."],
  },
  informationArchitecture: {
    navigationModel: "Uma superficie unica com formulario fixo e lista de tarefas.",
    hierarchy: [
      "Formulario de criacao",
      "Filtros e categorias",
      "Lista principal",
      "Estado vazio contextual",
    ],
    regions: [
      {
        name: "Formulario rapido",
        role: "Coletar titulo, descricao, vencimento e categoria.",
        priority: "primary",
        contents: ["Titulo", "Descricao", "Vencimento", "Categoria", "Acao criar"],
      },
      {
        name: "Lista de tarefas",
        role: "Exibir tarefas criadas e status pendente.",
        priority: "primary",
        contents: ["Tarefas pendentes", "Categoria", "Vencimento"],
      },
    ],
    primaryFlow: [
      "Usuario preenche titulo",
      "Usuario escolhe ou cria categoria",
      "Usuario confirma criacao",
      "Nova tarefa aparece na lista",
    ],
  },
  componentInventory: [
    {
      name: "TaskCreationForm",
      purpose: "Formulario principal de criacao.",
      variants: ["empty", "validation", "success"],
      useWhen: "Use no topo da superficie CRUD, com validacao inline.",
    },
    {
      name: "TaskList",
      purpose: "Lista persistente de tarefas criadas.",
      variants: ["empty", "success", "overflow", "mobile"],
      useWhen: "Use abaixo do formulario com cards compactos e responsivos.",
    },
  ],
  stateMatrix: {
    empty: [designState("Sem tarefas criadas", "Mensagem contextual e CTA no formulario.", "Texto de estado vazio visivel.")],
    loading: [designState("Criacao em andamento", "Botao criar desabilitado com feedback.", "Estado disabled ou aria-busy no controle.")],
    success: [designState("Tarefa criada", "Item aparece como pendente na lista.", "Lista contem a tarefa recem-criada.")],
    error: [designState("Falha ao salvar", "Banner ou mensagem inline recuperavel.", "Mensagem com role alert.")],
    selected: [designState("Categoria ativa", "Filtro selecionado visualmente.", "Controle selecionado exposto via aria-pressed.")],
    disabled: [designState("Titulo vazio", "Botao criar indisponivel.", "Botao submit disabled.")],
    validation: [designState("Titulo ausente", "Erro proximo ao campo titulo.", "Campo ligado a mensagem por aria-describedby.")],
    overflow: [designState("Muitas tarefas", "Lista com quebra ou rolagem sem deslocar formulario.", "Container preserva largura sem overflow horizontal.")],
    mobile: [designState("Viewport estreito", "Formulario e lista empilhados.", "Layout funciona em largura mobile.")],
  },
  designSystemBinding: {
    tokens: ["--task-accent", "--task-bg", "--task-surface", "--task-danger"],
    components: ["TaskCreationForm", "TaskList", "CategoryFilter"],
    allowedLibraries: ["React", "CSS modules/plain CSS"],
    imports: ["react"],
    antiPatterns: ["Cards de dashboard generico", "Metadados SDD visiveis", "Dados fake pre-carregados"],
  },
  visualStrategy: {
    colorRoles: {
      background: ["Base clara e neutra para foco operacional."],
      surface: ["Paineis brancos com borda leve."],
      text: ["Texto escuro de alta legibilidade."],
      accent: ["Cor principal reservada para criar tarefa e selecao ativa."],
      semanticStatus: ["Erro, aviso e sucesso com cores distintas."],
      categoryUtility: ["Categorias com marcadores discretos, nao decorativos."],
    },
    typography: ["Escala compacta com hierarquia clara entre formulario, filtros e tarefas."],
    density: "balanced",
    radius: ["8px para controles e cards funcionais."],
    shadow: ["Sombras discretas apenas para separar superficies."],
    motion: ["Transicoes curtas em foco, hover e insercao de tarefa."],
    domainRationale:
      "Uma ferramenta pessoal de tarefas precisa ser direta, legivel e orientada a acao, nao uma tela de status de projeto.",
  },
};

test("React fallback strips SDD metadata and starts without fake records", () => {
  const tsx = buildProjectManagerAppTsx({ userStory, spec });
  const css = buildProjectManagerAppCss();

  assert.equal(tsx.includes("US01"), false);
  assert.equal(tsx.includes("Project OS"), false);
  assert.equal(tsx.includes("Desempenho do projeto"), false);
  assert.equal(tsx.includes("Comprar itens da semana"), false);
  assert.equal(tsx.includes("Agendar consulta"), false);
  assert.equal(tsx.includes("Organizar documentos"), false);
  assert.equal(tsx.includes("const initialTasks: Task[] = [];"), true);

  assert.equal(tsx.includes("Tarefas pessoais"), true);
  assert.equal(tsx.includes("Nova categoria"), true);
  assert.equal(tsx.includes("Criar tarefa"), true);
  assert.equal(tsx.includes("const initialCategories = [\"Pessoal\"];"), true);

  assert.equal(css.includes("color-scheme: light"), true);
  assert.equal(css.includes("--task-accent"), true);
  assert.equal(css.includes("--task-warning"), true);
  assert.equal(css.includes("--task-danger"), true);
});

test("agent skills require product copy hygiene and designer color strategy", async () => {
  const [frontSkill, specSkill, curatorSkill, qaSkill] = await Promise.all([
    readFile("skills/agents/front-design-frontend/SKILL.md", "utf8"),
    readFile("skills/agents/spec-frontend-sdd/SKILL.md", "utf8"),
    readFile("skills/agents/curator-quality-gate/SKILL.md", "utf8"),
    readFile("skills/agents/qa-frontend-testing/SKILL.md", "utf8"),
  ]);

  assert.equal(frontSkill.includes("Designer Color Strategy"), true);
  assert.equal(frontSkill.includes("DesignBrief Consumption"), true);
  assert.equal(frontSkill.includes("Never use SDD/workflow metadata"), true);
  assert.equal(frontSkill.includes("do not seed runtime with fake records"), true);

  assert.equal(specSkill.includes("designBrief"), true);
  assert.equal(specSkill.includes("surfaceType"), true);
  assert.equal(specSkill.includes("Treat colorPolicy as a designer strategy"), true);
  assert.equal(specSkill.includes("do not require runtime mock/fake data"), true);
  assert.equal(specSkill.includes("Forbid SDD/workflow metadata"), true);

  assert.equal(curatorSkill.includes("designBrief"), true);
  assert.equal(curatorSkill.includes("[front:copy]"), true);
  assert.equal(curatorSkill.includes("Color roles are purposeful"), true);

  assert.equal(qaSkill.includes("designBrief"), true);
  assert.equal(qaSkill.includes("copy hygiene test"), true);
  assert.equal(qaSkill.includes("adapter-compatible state"), true);
});

test("DesignBrief is a structured contract available to downstream agents", () => {
  const parsedSpec = SpecSchema.parse({
    ...spec,
    designBrief,
  });
  const promptBlock = formatDesignBriefForPrompt(parsedSpec);

  assert.equal(parsedSpec.designBrief?.surfaceType, "crud");
  assert.equal(parsedSpec.designBrief?.stateMatrix.mobile.length, 1);
  assert.equal(promptBlock.includes("# DesignBrief da SPEC"), true);
  assert.equal(promptBlock.includes('"surfaceType": "crud"'), true);
  assert.equal(promptBlock.includes('"componentInventory"'), true);
  assert.equal(promptBlock.includes('"stateMatrix"'), true);
  assert.equal(promptBlock.includes("Metadados SDD visiveis"), true);
});
