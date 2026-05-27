import assert from "node:assert/strict";
import test from "node:test";
import { buildSpecPrompt } from "../dist/infrastructure/agents/SpecAgentImpl.js";
import { loadAgentSkill } from "../dist/infrastructure/agentSkills/loadAgentSkill.js";

test("buildSpecPrompt carries frontend pattern library guidance into runtime prompt", () => {
  const userStory = {
    id: "US-PATTERN-01",
    title: "Criar painel operacional de runs",
    description:
      "Como operador, quero ver runs, status e acoes principais em uma tela densa.",
    acceptanceCriteria: [
      "A tela deve listar runs com status.",
      "A tela deve permitir filtrar por estado.",
    ],
    priority: "medium",
    labels: ["frontend", "operations"],
  };

  const prompt = buildSpecPrompt(
    userStory,
    loadAgentSkill("spec-frontend-sdd")
  );

  assert.match(prompt, /Pattern: <id>/);
  assert.match(prompt, /operational-dashboard/);
  assert.match(prompt, /chat-preview-workbench/);
  assert.match(prompt, /workflow-map/);
  assert.match(prompt, /form-crud-tool/);
  assert.match(prompt, /content-landing/);
  assert.match(prompt, /custom-product-surface/);
  assert.match(prompt, /visualContract\.layoutArchetype/);
  assert.match(prompt, /componentPolicy\.requiredPatterns/);
  assert.match(prompt, /componentes\/tokens existentes primeiro/);
  assert.match(prompt, /excesso de frames/);
  assert.match(prompt, /landing page genérica para ferramenta/);
});
