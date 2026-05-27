import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCuratorPrompt,
  validateOutput,
} from "../dist/infrastructure/agents/CuratorAgentImpl.js";

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: "11111111-1111-4111-8111-111111111111",
  version: 1,
  summary: "Painel de produtos com busca e estado de erro.",
  technicalApproach:
    "Usar ProductAdapter injetável compatível com GET /api/products, estados loading, empty, error e success.",
  components: [
    {
      name: "ProductGrid",
      type: "ui",
      description: "Renderiza cards de produto com preço, categoria e fallback visual.",
      dependencies: ["ProductAdapter"],
    },
    {
      name: "ProductAdapter",
      type: "utility",
      description: "Fornece boundary injetável compatível com o contrato futuro de produtos.",
      dependencies: [],
    },
  ],
  apiEndpoints: [
    {
      method: "GET",
      path: "/api/products",
      description: "Contrato futuro para listar produtos no painel.",
      requestSchema: {},
      responseSchema: {
        products: [
          {
            id: "string",
            name: "string",
            price: "number",
            category: "string",
          },
        ],
      },
    },
  ],
  dataModels: [
    "Product: { id: string, name: string, price: number, category: string }",
  ],
  acceptanceCriteria: [
    "A grade deve renderizar produtos com nome, preço e categoria.",
    "A UI deve exibir estado de erro quando o adapter falhar.",
  ],
  generatedAt: "2026-05-26T00:00:00.000Z",
};

const codeChangeSet = {
  id: "33333333-3333-4333-8333-333333333333",
  workflowThreadId: "44444444-4444-4444-8444-444444444444",
  userStoryId: "11111111-1111-4111-8111-111111111111",
  sourceAgent: "front",
  status: "proposed",
  operations: [
    {
      targetPath: "generated/horus/11111111-1111-4111-8111-111111111111.html",
      changeType: "create",
      beforeContent: null,
      afterContent: "<main><section class='products'>Produto A</section></main>",
      diff: "diff --git a/generated/horus/story.html b/generated/horus/story.html",
    },
  ],
  validation: [],
  createdAt: "2026-05-26T00:00:00.000Z",
};

test("buildCuratorPrompt includes complete spec, HTML, QA, data, and route contracts", () => {
  const prompt = buildCuratorPrompt(
    spec,
    "<main><section class='products'>Produto A</section></main>",
    {
      testCases: [
        {
          id: "TC-01",
          criterion: "A grade deve renderizar produtos",
          steps: ["Abrir a página", "Inspecionar cards"],
          expected: "Cards mostram nome, preço e categoria.",
        },
      ],
      previewSmoke: {
        status: "passed",
        reason: "preview_reachable",
        previewSessionId: "55555555-5555-4555-8555-555555555555",
        previewStatus: "running",
        previewUrl: "http://127.0.0.1:5174/",
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        bodyBytes: 128,
        elapsedMs: 15,
        checkedAt: "2026-05-26T00:00:00.000Z",
        runtimeEvidence: { commandId: "dev" },
      },
      runtimeValidation: {
        id: "66666666-6666-4666-8666-666666666666",
        workflowThreadId: "44444444-4444-4444-8444-444444444444",
        constructionRunId: null,
        userStoryId: "11111111-1111-4111-8111-111111111111",
        projectId: null,
        status: "passed",
        skippedReason: null,
        commands: [
          {
            commandId: "type-check-root-type-check",
            command: "pnpm run type-check",
            cwd: "/tmp/project",
            exitCode: 0,
            stdoutTail: "",
            stderrTail: "",
            durationMs: 120,
          },
        ],
        preview: {
          status: "passed",
          url: "http://127.0.0.1:5174/",
          message: "preview_reachable",
          evidence: {
            title: null,
            bodySnippet: null,
            screenshotPath: null,
          },
        },
        createdAt: "2026-05-26T00:00:00.000Z",
      },
    },
    codeChangeSet,
    "CURATOR_SKILL_TEXT"
  );

  assert.match(prompt, /CURATOR_SKILL_TEXT/);
  assert.match(prompt, /Painel de produtos com busca/);
  assert.match(prompt, /ProductAdapter injetável/);
  assert.match(prompt, /ProductGrid/);
  assert.match(prompt, /Product: \{ id: string, name: string, price: number, category: string \}/);
  assert.match(prompt, /GET \/api\/products/);
  assert.match(prompt, /"products"/);
  assert.match(prompt, /<section class='products'>Produto A<\/section>/);
  assert.match(prompt, /TC-01/);
  assert.match(prompt, /Validação Smoke do Preview Pelo QA/);
  assert.match(prompt, /preview_reachable/);
  assert.match(prompt, /Evidência Runtime Executável/);
  assert.match(prompt, /type-check-root-type-check/);
  assert.match(prompt, /"status": "passed"/);
  assert.match(prompt, /CodeChangeSet Produzido Pelo Front Agent/);
  assert.match(prompt, /generated\/horus\/11111111-1111-4111-8111-111111111111\.html/);
  assert.match(prompt, /\[front\], \[qa\], \[data\], \[route\]/);
  assert.match(prompt, /houver CodeChangeSet auditável/);
});

test("validateOutput blocks failed executable runtime evidence", async () => {
  const result = await validateOutput(
    spec,
    "<main><section class='products'>Produto A</section></main>",
    {
      testCases: [
        {
          id: "TC-01",
          criterion: "A grade deve renderizar produtos",
          steps: ["Abrir a página"],
          expected: "Cards renderizados.",
        },
      ],
      runtimeValidation: {
        id: "66666666-6666-4666-8666-666666666666",
        workflowThreadId: "44444444-4444-4444-8444-444444444444",
        constructionRunId: null,
        userStoryId: "11111111-1111-4111-8111-111111111111",
        projectId: null,
        status: "failed",
        skippedReason: null,
        commands: [
          {
            commandId: "type-check-root-type-check",
            command: "pnpm run type-check",
            cwd: "/tmp/project",
            exitCode: 2,
            stdoutTail: "",
            stderrTail: "src/App.tsx(1,1): error TS1005",
            durationMs: 120,
          },
        ],
        preview: {
          status: "skipped",
          url: null,
          message: "Preview smoke was not executed.",
          evidence: {
            title: null,
            bodySnippet: null,
            screenshotPath: null,
          },
        },
        createdAt: "2026-05-26T00:00:00.000Z",
      },
    },
    codeChangeSet
  );

  assert.equal(result.passed, false);
  assert.equal(result.score, 0);
  assert.equal(result.fixTarget, "front");
  assert.match(result.missingItems[0], /type-check-root-type-check/);
  assert.match(result.missingItems[0], /TS1005/);
});

test("validateOutput blocks when QA preview smoke did not pass", async () => {
  const result = await validateOutput(
    spec,
    "<main><section class='products'>Produto A</section></main>",
    {
      testCases: [
        {
          id: "TC-01",
          criterion: "A grade deve renderizar produtos",
          steps: ["Abrir a página"],
          expected: "Cards renderizados.",
        },
      ],
      previewSmoke: {
        status: "blocked",
        reason: "missing_runtime_evidence",
        elapsedMs: 0,
        checkedAt: "2026-05-26T00:00:00.000Z",
      },
    },
    codeChangeSet
  );

  assert.equal(result.passed, false);
  assert.equal(result.score, 0);
  assert.equal(result.fixTarget, "qa");
  assert.deepEqual(result.missingItems, [
    "[qa] Preview smoke blocked: missing_runtime_evidence",
  ]);
});
