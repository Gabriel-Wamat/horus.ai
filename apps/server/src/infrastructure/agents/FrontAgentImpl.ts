import { ChatAnthropic } from "@langchain/anthropic";
import type { Spec, UserStory } from "@u-build/shared";
import type { CuratorFeedback } from "../langgraph/state.js";

export interface FrontendOutput {
  html: string;
}

const model = new ChatAnthropic({
  model: "gpt-4.1-mini",
  temperature: 0.2,
  maxTokens: 8192,
});

export async function generateFrontend(
  userStory: UserStory,
  spec: Spec,
  curatorFeedback?: CuratorFeedback
): Promise<FrontendOutput> {
  const components = spec.components
    .map((c) => `- ${c.name} (${c.type}): ${c.description}`)
    .join("\n");
  const criteria = spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
  const dataModels =
    spec.dataModels.length > 0 ? spec.dataModels.join("\n") : "N/A";

  // Reflection: include curator feedback when retrying so the agent self-corrects
  const reflectionBlock =
    curatorFeedback && !curatorFeedback.passed
      ? `
# Feedback da Curadoria (tentativa anterior — CORRIJA estes problemas)
**Score anterior:** ${curatorFeedback.score}/100
**Avaliação:** ${curatorFeedback.notes}
**Itens faltando:**
${curatorFeedback.missingItems.map((m) => `- ${m}`).join("\n")}

Você DEVE corrigir todos os itens acima na nova implementação.
`
      : "";

  const prompt = `Você é um desenvolvedor frontend expert. Gere uma página HTML completa e funcional com base na especificação técnica abaixo.
${reflectionBlock}
# História de Usuário
**Título:** ${userStory.title}

# Especificação Técnica
**Resumo:** ${spec.summary}

**Abordagem Técnica:** ${spec.technicalApproach}

**Componentes/Seções:**
${components}

**Modelos de Dados:**
${dataModels}

**Critérios de Aceite:**
${criteria}

# Regras de Implementação
- Use apenas HTML, CSS e JavaScript vanilla (sem frameworks, sem CDNs externos)
- CSS e JS devem estar embutidos no HTML (dentro das tags <style> e <script>)
- Design responsivo usando CSS Flexbox e/ou Grid com media queries
- Use variáveis CSS (--cor-primaria, --cor-fundo, etc.) para o tema
- Inclua dados de exemplo (mock data) realistas em JavaScript para popular a UI
- O código deve ser completo, funcional e abrível diretamente no browser
- Retorne APENAS o código HTML completo, começando com <!DOCTYPE html>
- Não inclua explicações, markdown code fences, ou qualquer texto fora do HTML`;

  const response = await model.invoke(prompt);
  const content =
    typeof response.content === "string"
      ? response.content
      : response.content
          .map((c) => ("text" in c ? c.text : ""))
          .join("");

  const html = content
    .replace(/^```html\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  return { html };
}