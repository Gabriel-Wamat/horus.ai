/**
 * Funções compartilhadas para avaliação do QA Agent.
 *
 * O QaAgentImpl usa withStructuredOutput(QaOutputSchema), que falha com
 * Groq/llama-3.3-70b-versatile pelo mesmo motivo do SpecAgent (campos
 * omitidos quebram a validação estrita do tool-calling). Contornamos com
 * JSON mode livre + normalização, replicando o prompt exato de
 * QaAgentImpl.generateQaTests (sem CuratorFeedback/executionBrief/designContext
 * — fora de escopo desta avaliação isolada).
 */

import { z } from "zod";
import type { Spec, UserStory } from "@u-build/shared";
import { appendRuntimeAgentSkills, loadAgentSkill } from "../infrastructure/agentSkills/loadAgentSkill.js";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage } from "@langchain/core/messages";

const TestCaseSchema = z.object({
  id: z.string(),
  criterion: z.string(),
  steps: z.array(z.string()),
  expected: z.string(),
});

export const QaOutputSchema = z.object({
  testCases: z.array(TestCaseSchema),
});

export type QaTestCase = z.infer<typeof TestCaseSchema>;
export type QaOutput = z.infer<typeof QaOutputSchema>;

export type SpecWithMeta = Spec & {
  patternGabarito?: string;
  complexidade?: string;
};

function buildQaPrompt(userStory: UserStory, spec: Spec): string {
  const criteria = spec.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const components = spec.components.map((c) => `- ${c.name}: ${c.description}`).join("\n");
  const dataModels = spec.dataModels.length > 0 ? spec.dataModels.join("\n") : "N/A";
  const apiContracts =
    spec.apiEndpoints.length > 0
      ? spec.apiEndpoints
          .map((endpoint) => {
            const requestSchema = endpoint.requestSchema ? JSON.stringify(endpoint.requestSchema) : "{}";
            const responseSchema = endpoint.responseSchema ? JSON.stringify(endpoint.responseSchema) : "{}";
            return `- ${endpoint.method} ${endpoint.path}: ${endpoint.description}\n  requestSchema: ${requestSchema}\n  responseSchema: ${responseSchema}`;
          })
          .join("\n")
      : "N/A";

  const visualContractBlock = spec.visualContract
    ? `# VisualContract da SPEC\n${JSON.stringify(spec.visualContract, null, 2)}`
    : "# VisualContract da SPEC\nNao informado; valide preservacao da identidade local pelo contexto visual quando disponivel.";

  const skill = appendRuntimeAgentSkills(loadAgentSkill("qa-frontend-testing"), []);

  return `Você é um QA engineer especializado em testes de interface web. Gere casos de teste detalhados para validação manual.

# Skill obrigatória do agente
${skill}

${visualContractBlock}

# História de Usuário
${userStory.title}

# Abordagem Técnica
${spec.technicalApproach}

# Componentes da Página
${components}

# Modelos de Dados
${dataModels}

# Contratos Futuros de API/Rotas
${apiContracts}

# Critérios de Aceite
${criteria}

Gere um caso de teste por critério de aceite. Cada caso deve ter steps claros e objetivo com o resultado esperado.
Se houver contratos futuros de API/Rotas, teste a prontidão do frontend por meio de boundary/adapters injetáveis, estados de loading/empty/error/success e compatibilidade de shape; não assuma que existe backend real nem peça mocks em código aplicado ao projeto.
Inclua cobertura visual para visualContract quando existir: tokens, densidade, componentes existentes, responsividade, acessibilidade, estados e antiPatterns.
IDs devem ser TC-01, TC-02, etc.

IMPORTANT: Respond ONLY with a valid JSON object matching {"testCases": [{"id": "TC-01", "criterion": "...", "steps": ["..."], "expected": "..."}]}. No markdown fences, no explanation. Start your response with { and end with }.`;
}

function normalizeQaCandidate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const c = raw as Record<string, unknown>;
  if (Array.isArray(c["testCases"])) {
    c["testCases"] = (c["testCases"] as any[]).map((tc, idx) => ({
      id: tc.id ?? `TC-${String(idx + 1).padStart(2, "0")}`,
      criterion: typeof tc.criterion === "string" ? tc.criterion : JSON.stringify(tc.criterion ?? ""),
      steps: Array.isArray(tc.steps) ? tc.steps.map((s: unknown) => String(s)) : [],
      expected: typeof tc.expected === "string" ? tc.expected : JSON.stringify(tc.expected ?? ""),
    }));
  }
  return c;
}

export async function gerarQaOutput(userStory: UserStory, spec: Spec): Promise<QaOutput> {
  const prompt = buildQaPrompt(userStory, spec);

  const model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY!,
    model: process.env.LLM_MODEL ?? "llama-3.3-70b-versatile",
  });

  const response = await model.invoke([new HumanMessage(prompt)]);
  const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Resposta não contém JSON válido: ${text.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]);
  const normalized = normalizeQaCandidate(parsed);
  return QaOutputSchema.parse(normalized);
}
