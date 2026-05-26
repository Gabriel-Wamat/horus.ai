import assert from "node:assert/strict";
import test from "node:test";
import { buildCuratorPrompt } from "../dist/infrastructure/agents/CuratorAgentImpl.js";

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: "11111111-1111-4111-8111-111111111111",
  version: 1,
  summary: "Painel de produtos com busca e estado de erro.",
  technicalApproach:
    "Usar ProductAdapter com mock data compatível com GET /api/products, estados loading, empty, error e success.",
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
      description: "Fornece mock data compatível com o contrato futuro de produtos.",
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
    },
    "CURATOR_SKILL_TEXT"
  );

  assert.match(prompt, /CURATOR_SKILL_TEXT/);
  assert.match(prompt, /Painel de produtos com busca/);
  assert.match(prompt, /ProductAdapter com mock data/);
  assert.match(prompt, /ProductGrid/);
  assert.match(prompt, /Product: \{ id: string, name: string, price: number, category: string \}/);
  assert.match(prompt, /GET \/api\/products/);
  assert.match(prompt, /"products"/);
  assert.match(prompt, /<section class='products'>Produto A<\/section>/);
  assert.match(prompt, /TC-01/);
  assert.match(prompt, /\[front\], \[qa\], \[data\], \[route\]/);
  assert.match(prompt, /Não exija execução real de browser/);
});
