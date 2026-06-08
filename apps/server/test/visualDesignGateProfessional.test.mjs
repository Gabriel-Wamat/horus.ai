import assert from "node:assert/strict";
import test from "node:test";
import { VisualDesignGateService } from "../dist/infrastructure/visual/VisualDesignGateService.js";

const spec = {
  id: "11111111-1111-4111-8111-111111111111",
  userStoryId: "22222222-2222-4222-8222-222222222222",
  version: 1,
  summary: "Criar tarefas pessoais em uma lista operacional simples.",
  technicalApproach: "Pattern: form-crud-tool com formulario e lista vazia.",
  components: [
    {
      name: "TaskCreationForm",
      type: "ui",
      description: "Formulario para criar tarefas.",
      dependencies: [],
    },
  ],
  apiEndpoints: [],
  dataModels: ["Task"],
  acceptanceCriteria: ["Criar tarefa pessoal sem dados pre-carregados."],
  designBrief: {
    surfaceType: "crud",
    userIntent: {
      primaryUserGoal: "Criar uma tarefa pessoal rapidamente.",
      userMentalModel: "Formulario e lista de tarefas pessoais.",
      successOutcome: "A tarefa aparece como pendente.",
      nonGoals: ["Dashboard de projeto"],
    },
    informationArchitecture: {
      regions: [
        {
          name: "Criacao",
          role: "Coletar dados da tarefa.",
          priority: "primary",
          contents: ["Titulo", "Categoria", "Criar"],
        },
      ],
      hierarchy: ["Formulario", "Lista"],
      navigationModel: "Superficie unica",
      primaryFlow: ["Preencher titulo", "Criar tarefa", "Ver item pendente"],
    },
    componentInventory: [
      {
        name: "TaskCreationForm",
        purpose: "Criar tarefa.",
        variants: ["empty", "validation", "success"],
        useWhen: "No topo da tela CRUD.",
      },
    ],
    stateMatrix: {
      success: [
        {
          trigger: "Tarefa criada",
          expectedUi: "Item pendente na lista.",
          validationSignal: "Texto da tarefa aparece.",
        },
      ],
      error: [
        {
          trigger: "Falha de validacao",
          expectedUi: "Mensagem de erro no campo.",
          validationSignal: "role alert.",
        },
      ],
      validation: [
        {
          trigger: "Titulo vazio",
          expectedUi: "Submit desabilitado.",
          validationSignal: "disabled.",
        },
      ],
    },
    designSystemBinding: {
      tokens: ["--task-bg", "--task-accent", "--task-danger"],
      components: ["TaskCreationForm"],
      allowedLibraries: ["react"],
      imports: ["react"],
      antiPatterns: ["Dashboard generico", "USxx visivel", "mock data"],
    },
    visualStrategy: {
      colorRoles: {
        background: ["Neutro claro"],
        surface: ["Branco"],
        text: ["Escuro"],
        accent: ["Acao primaria"],
        semanticStatus: ["Erro e sucesso distintos"],
        categoryUtility: ["Marcadores discretos"],
      },
      typography: ["Escala compacta"],
      density: "balanced",
      radius: ["8px"],
      shadow: ["Baixa elevacao"],
      motion: ["Transicao curta"],
      domainRationale:
        "Tarefa pessoal precisa ser direta e orientada a acao, sem metricas de projeto.",
    },
  },
  generatedAt: "2026-06-08T10:00:00.000Z",
};

test("visual gate blocks workflow copy, fake data, wrong surface and weak palette", async () => {
  const html = `
    <main style="background:#0f172a;color:#dbeafe">
      <section style="border:1px solid #123a5a;background:#102a43">
        <h1>US01 - Criar tarefa pessoal</h1>
        <p>Project OS dashboard com desempenho do projeto e frentes ativas.</p>
        <div>Status do projeto atualizado agora</div>
        <script>
          const mockTasks = [{ title: "Comprar itens da semana" }];
          const nextId = Math.random();
        </script>
      </section>
    </main>
    <style>
      .metric { color:#16466d; background:#1b4f7a; border-color:#226091; }
    </style>
  `;

  const result = await new VisualDesignGateService().validate({ spec, html });
  const categories = new Set(result.issues.map((issue) => issue.category));

  assert.equal(result.status, "failed");
  assert.equal(categories.has("workflow_metadata"), true);
  assert.equal(categories.has("fake_runtime_data"), true);
  assert.equal(categories.has("wrong_surface_pattern"), true);
  assert.equal(categories.has("palette_without_rationale"), true);
});
