import { z } from "zod";
import type { LlmSettings, Spec } from "@u-build/shared";
import type { QaOutput } from "./QaAgentImpl.js";
import { loadAgentSkill } from "../agentSkills/loadAgentSkill.js";
import { createChatModel } from "../llm/createChatModel.js";

const CuratorOutputSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  notes: z.string(),
  missingItems: z.array(z.string()),
  // Reflection pattern: directs which agent(s) need to retry
  fixTarget: z.enum(["front", "qa", "both"]),
});

export type CuratorOutput = z.infer<typeof CuratorOutputSchema>;

export async function validateOutput(
  spec: Spec,
  html: string,
  qaOutput: QaOutput = { testCases: [] },
  llmSettings?: LlmSettings
): Promise<CuratorOutput> {
  const components = spec.components
    .map((c) => `- ${c.name} (${c.type}): ${c.description}`)
    .join("\n");
  const criteria = spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const htmlPreview = html;
  const qaPreview = JSON.stringify(qaOutput.testCases, null, 2);
  const skill = loadAgentSkill("curator-quality-gate");

  const prompt = `Você é um curador de qualidade de software. Analise o HTML gerado e os casos de teste de QA. Verifique se ambos atendem à especificação técnica.

# Skill obrigatória do agente
${skill}

# Especificação Técnica

**Componentes esperados:**
${components}

**Critérios de Aceite:**
${criteria}

# HTML Gerado
\`\`\`html
${htmlPreview}
\`\`\`

# Casos de Teste Gerados Pelo QA
\`\`\`json
${qaPreview}
\`\`\`

## Instruções de Avaliação
- score: 0–100 indicando cobertura combinada da spec pelo HTML e pelos testes
- passed: true se score >= 70 e não houver lacuna crítica no HTML nem nos testes
- notes: resumo objetivo da avaliação em 1–2 frases
- missingItems: lista dos itens da spec ausentes, incompletos ou sem cobertura de teste (array vazio se passou)
- fixTarget: se falhou, indique qual agente deve corrigir:
  - "front" → problema visual/estrutural no HTML/CSS/JS
  - "qa" → HTML adequado, mas testes ausentes, fracos ou desalinhados aos critérios de aceite
  - "both" → HTML e testes precisam ser refeitos`;

  const model = createChatModel("curator", {
    temperature: 1,
  }, llmSettings).withStructuredOutput(CuratorOutputSchema);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return CuratorOutputSchema.parse(await model.invoke(prompt));
    } catch (err) {
      console.warn(`[CuratorAgent] Attempt ${attempt} failed to parse output:`, err);
      if (attempt === 2) {
        console.error("[CuratorAgent] All retries exhausted — marking as failed");
        return {
          passed: false,
          score: 0,
          notes: "Curador não conseguiu avaliar o output (falha de parsing).",
          missingItems: ["Avaliação manual necessária"],
          fixTarget: "both",
        };
      }
    }
  }

  return {
    passed: false,
    score: 0,
    notes: "Curador não conseguiu avaliar o output.",
    missingItems: [],
    fixTarget: "both",
  };
}
