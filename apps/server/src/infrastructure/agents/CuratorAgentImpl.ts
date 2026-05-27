import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import type { Spec } from "@u-build/shared";

const CuratorOutputSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  notes: z.string(),
  missingItems: z.array(z.string()),
  // Reflection pattern: directs which agent(s) need to retry
  fixTarget: z.enum(["front", "qa", "both"]),
});

export type CuratorOutput = z.infer<typeof CuratorOutputSchema>;

const model = new ChatAnthropic({
  model: "gpt-4.1-mini",
  temperature: 1,
}).withStructuredOutput(CuratorOutputSchema);

export async function validateOutput(
  spec: Spec,
  html: string
): Promise<CuratorOutput> {
  const components = spec.components
    .map((c) => `- ${c.name} (${c.type}): ${c.description}`)
    .join("\n");
  const criteria = spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const htmlPreview = html;

  const prompt = `Você é um curador de qualidade de software. Analise o HTML gerado e verifique se atende à especificação técnica.

# Especificação Técnica

**Componentes esperados:**
${components}

**Critérios de Aceite:**
${criteria}

# HTML Gerado
\`\`\`html
${htmlPreview}
\`\`\`

## Instruções de Avaliação
- score: 0–100 indicando cobertura da spec
- passed: true se score >= 70
- notes: resumo objetivo da avaliação em 1–2 frases
- missingItems: lista dos itens da spec ausentes ou incompletos (array vazio se passou)
- fixTarget: se falhou, indique qual agente deve corrigir:
  - "front" → problema visual/estrutural no HTML/CSS/JS
  - "qa" → critérios de aceite mal interpretados nos testes
  - "both" → ambos precisam ser refeitos`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await model.invoke(prompt);
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