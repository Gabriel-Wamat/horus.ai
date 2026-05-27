import assert from "node:assert/strict";
import test from "node:test";
import {
  VisualDesignGateService,
  visualGateFeedbackItems,
  visualGateToRuntimeEvidence,
} from "../dist/infrastructure/visual/VisualDesignGateService.js";

const userStoryId = "11111111-1111-4111-8111-111111111111";
const workflowThreadId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";

const spec = {
  id: "44444444-4444-4444-8444-444444444444",
  userStoryId,
  version: 1,
  summary: "Tela operacional compacta.",
  technicalApproach: "Preservar identidade visual escura.",
  components: [],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: ["Tela deve renderizar conteúdo e ser responsiva."],
  visualContract: {
    mode: "preserve_identity",
    designSource: "project_files",
    layoutArchetype: "dark operational console",
    density: "compact",
    tone: "Escuro, cinza, com accent verde controlado.",
    colorPolicy: {
      background: ["#0b0f0d"],
      surface: ["#151a17"],
      text: ["#e5ece8"],
      accent: ["#14c77b"],
      forbidden: ["cores high-light saturadas"],
      usageRules: ["Accent apenas em ações primárias."],
    },
    typography: {
      families: ["Inter"],
      scaleRules: ["Sem hero scale dentro de painel."],
    },
    spacingAndShape: {
      spacingScale: ["8px", "12px", "16px"],
      radiusRules: ["Raio contido."],
      strokeRules: ["Strokes cinza sutis."],
      shadowRules: ["Sem glow."],
    },
    componentPolicy: {
      preferExistingComponents: true,
      allowedLibraries: ["lucide-react"],
      requiredPatterns: ["botões compactos"],
      forbiddenPatterns: ["cards aninhados"],
    },
    states: ["default"],
    responsiveRules: ["Sem overflow horizontal no mobile."],
    accessibilityRules: ["Foco visível."],
    antiPatterns: ["excesso de frames"],
    referenceFiles: ["ID_VISUAL.md", "src/index.css"],
  },
  generatedAt: "2026-05-27T00:00:00.000Z",
};

const designContext = {
  projectId,
  sourceFiles: ["ID_VISUAL.md", "src/index.css"],
  tokens: {
    "--background": "#0b0f0d",
    "--surface": "#151a17",
    "--accent": "#14c77b",
  },
  components: [],
  visualSummary: "Dark operational console.",
  constraints: ["Use cinza e verde controlado."],
  antiPatterns: ["Sem high-light saturado.", "Sem excesso de frames."],
  warnings: [],
  generatedAt: "2026-05-27T00:00:00.000Z",
};

function changeSet(afterContent) {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    workflowThreadId,
    userStoryId,
    sourceAgent: "front",
    status: "proposed",
    operations: [
      {
        targetPath: "src/index.html",
        changeType: "update",
        beforeContent: "<main>old</main>",
        afterContent,
        diff: "diff --git a/src/index.html b/src/index.html",
      },
    ],
    validation: [],
    createdAt: "2026-05-27T00:00:00.000Z",
  };
}

test("VisualDesignGateService passes a non-blank candidate that keeps the visual contract", async () => {
  const service = new VisualDesignGateService();
  const result = await service.validate({
    spec,
    html: "<main class='console'><h1>Horus</h1><button>Construir</button></main>",
    codeChangeSet: changeSet(
      "<main style='background:#0b0f0d;color:#e5ece8'><section class='panel'>Status pronto</section><button style='background:#14c77b'>Construir</button></main>"
    ),
    workflowThreadId,
    userStoryId,
    projectId,
    designContext,
  });

  assert.equal(result.status, "passed");
  assert.ok(result.score >= result.threshold);
  assert.equal(result.screenshots.length, 2);
  assert.ok(result.screenshots.every((screenshot) => screenshot.nonBlank));
});

test("VisualDesignGateService blocks blank and mobile-overflow candidates", async () => {
  const service = new VisualDesignGateService();
  const result = await service.validate({
    spec,
    html: "",
    codeChangeSet: changeSet("<main style='width:1200px'></main>"),
    workflowThreadId,
    userStoryId,
    projectId,
    designContext,
  });

  assert.equal(result.status, "failed");
  assert.ok(
    result.issues.some((issue) => issue.category === "blank_render"),
    "blank render issue should be present"
  );
  assert.ok(
    result.issues.some((issue) => issue.category === "responsive_overflow"),
    "responsive overflow issue should be present"
  );
  assert.match(visualGateFeedbackItems(result).join("\n"), /\[front:visual]/);
});

test("VisualDesignGateService allows responsive max-width breakpoints", async () => {
  const service = new VisualDesignGateService();
  const result = await service.validate({
    spec,
    html: "<main><h1>Painel operacional pronto</h1><p>Interface com tarefas, filtros e calendario.</p></main>",
    codeChangeSet: changeSet(`
      <style>
        .shell { max-width: 1180px; width: min(100%, 1180px); }
        @media (max-width: 980px) { .shell { grid-template-columns: 1fr; } }
        @media (max-width: 640px) { .shell { padding: 16px; } }
      </style>
      <main class="shell"><h1>Painel operacional pronto</h1><button>Filtrar</button></main>
    `),
    workflowThreadId,
    userStoryId,
    projectId,
    designContext,
  });

  assert.equal(
    result.issues.some((issue) => issue.category === "responsive_overflow"),
    false
  );
});

test("visualGateToRuntimeEvidence exposes compact preview evidence for UI progress", async () => {
  const service = new VisualDesignGateService();
  const result = await service.validate({
    spec,
    html: "<main><h1>Painel operacional pronto</h1></main>",
    codeChangeSet: changeSet(
      "<main><h1>Painel operacional pronto</h1><p>Status visual validado.</p></main>"
    ),
    workflowThreadId,
    userStoryId,
    projectId,
    designContext,
  });

  const evidence = visualGateToRuntimeEvidence({
    result,
    workflowThreadId,
    userStoryId,
    projectId,
  });

  assert.equal(evidence.preview.evidence.title, "Visual gate");
  assert.equal(evidence.preview.status, "passed");
  assert.equal(evidence.workflowThreadId, workflowThreadId);
});
