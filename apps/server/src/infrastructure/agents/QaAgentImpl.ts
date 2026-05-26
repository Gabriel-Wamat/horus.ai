import { z } from "zod";
import type { LlmSettings, Spec, UserStory } from "@u-build/shared";
import type { CuratorFeedback } from "../langgraph/state.js";
import { loadAgentSkill } from "../agentSkills/loadAgentSkill.js";
import { createChatModel } from "../llm/createChatModel.js";

const TestCaseSchema = z.object({
  id: z.string(),
  criterion: z.string(),
  steps: z.array(z.string()),
  expected: z.string(),
});

const QaOutputSchema = z.object({
  testCases: z.array(TestCaseSchema),
});

export type QaOutput = z.infer<typeof QaOutputSchema>;

export async function generateQaTests(
  userStory: UserStory,
  spec: Spec,
  curatorFeedback?: CuratorFeedback,
  llmSettings?: LlmSettings
): Promise<QaOutput> {
  const criteria = spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
  const components = spec.components
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n");

  const reflectionBlock =
    curatorFeedback && !curatorFeedback.passed
      ? `
# Feedback da Curadoria (tentativa anterior — REFINE os casos de teste)
**Avaliação:** ${curatorFeedback.notes}
**Itens com cobertura insuficiente:**
${curatorFeedback.missingItems.map((m) => `- ${m}`).join("\n")}

Garanta que os novos casos de teste cubram todos os itens acima com maior precisão.
`
      : "";

  const skill = loadAgentSkill("qa-frontend-testing");
  const prompt = `Você é um QA engineer especializado em testes de interface web. Gere casos de teste detalhados para validação manual.

# Skill obrigatória do agente
${skill}
${reflectionBlock}
# História de Usuário
${userStory.title}

# Componentes da Página
${components}

# Critérios de Aceite
${criteria}

Gere um caso de teste por critério de aceite. Cada caso deve ter steps claros e objetivo com o resultado esperado.
IDs devem ser TC-01, TC-02, etc.`;

  const model = createChatModel("qa", {
    temperature: 1,
  }, llmSettings).withStructuredOutput(QaOutputSchema);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return QaOutputSchema.parse(await model.invoke(prompt));
    } catch (err) {
      console.warn(`[QaAgent] Attempt ${attempt} failed to parse output:`, err);
      if (attempt === 2) {
        console.error("[QaAgent] All retries exhausted — returning empty test cases");
        return { testCases: [] };
      }
    }
  }

  return { testCases: [] };
}
