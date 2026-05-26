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
  llmSettings?: LlmSettings,
  executionBrief?: string
): Promise<CuratorOutput> {
  const skill = loadAgentSkill("curator-quality-gate");
  const prompt = buildCuratorPrompt(spec, html, qaOutput, skill, executionBrief);

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

export function buildCuratorPrompt(
  spec: Spec,
  html: string,
  qaOutput: QaOutput = { testCases: [] },
  skill: string,
  executionBrief?: string
): string {
  const components = spec.components
    .map((c) => `- ${c.name} (${c.type}): ${c.description}`)
    .join("\n");
  const dataModels =
    spec.dataModels.length > 0 ? spec.dataModels.join("\n") : "N/A";
  const apiContracts =
    spec.apiEndpoints.length > 0
      ? spec.apiEndpoints
          .map((endpoint) => {
            const requestSchema = endpoint.requestSchema
              ? JSON.stringify(endpoint.requestSchema)
              : "{}";
            const responseSchema = endpoint.responseSchema
              ? JSON.stringify(endpoint.responseSchema)
              : "{}";
            return `- ${endpoint.method} ${endpoint.path}: ${endpoint.description}\n  requestSchema: ${requestSchema}\n  responseSchema: ${responseSchema}`;
          })
          .join("\n")
      : "N/A";
  const criteria = spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const htmlPreview = html;
  const qaPreview = JSON.stringify(qaOutput.testCases, null, 2);
  const executionBriefBlock = executionBrief
    ? `
# Pedido de alteração vindo do chat do Horus
${executionBrief}

Além da spec ativa, avalie se o HTML e os testes respondem especificamente a esse pedido.
`
    : "";

  return `Você é um curador de qualidade de software. Analise o HTML gerado e os casos de teste de QA. Verifique se ambos atendem à especificação técnica completa.

# Skill obrigatória do agente
${skill}
${executionBriefBlock}

# Especificação Técnica

**Resumo:**
${spec.summary}

**Abordagem Técnica:**
${spec.technicalApproach}

**Componentes esperados:**
${components}

**Modelos de Dados:**
${dataModels}

**Contratos Futuros de API/Rotas:**
${apiContracts}

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
- missingItems: lista dos itens da spec ausentes, incompletos ou sem cobertura de teste (array vazio se passou). Use prefixos curtos quando possível: [front], [qa], [data], [route], [accessibility], [responsive]
- fixTarget: se falhou, indique qual agente deve corrigir:
  - "front" → problema visual/estrutural no HTML/CSS/JS
  - "qa" → HTML adequado, mas testes ausentes, fracos ou desalinhados aos critérios de aceite
  - "both" → HTML e testes precisam ser refeitos

## Regras adicionais
- Se apiEndpoints existir, avalie se o HTML usa mock/data adapter compatível sem assumir backend real.
- Se dataModels existir, avalie se campos, formatação e fallbacks aparecem no HTML e nos testes.
- Se a abordagem técnica define loading, empty, error, success, acessibilidade ou responsividade, avalie tanto implementação quanto cobertura de QA.
- Não exija execução real de browser, screenshot, CLI ou endpoint. Avalie apenas a evidência textual disponível.`;
}
