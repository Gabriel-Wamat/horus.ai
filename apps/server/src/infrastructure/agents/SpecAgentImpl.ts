import { ChatAnthropic } from "@langchain/anthropic";
import { v4 as uuidv4 } from "uuid";
import { SpecSchema, type Spec, type UserStory } from "@u-build/shared";

// Schema sem campos que o LLM não deve gerar — serão preenchidos aqui
const LlmSpecSchema = SpecSchema.omit({
  id: true,
  userStoryId: true,
  generatedAt: true,
  approvedAt: true,
  approvedBy: true,
});

const model = new ChatAnthropic({
  model: "claude-haiku-4-5-20251001",
  temperature: 0,
}).withStructuredOutput(LlmSpecSchema);

export async function generateSpec(userStory: UserStory): Promise<Spec> {
  const prompt = buildPrompt(userStory);
  const raw = await model.invoke(prompt);

  return SpecSchema.parse({
    ...raw,
    id: uuidv4(),
    userStoryId: userStory.id,
    generatedAt: new Date().toISOString(),
  });
}

function buildPrompt(us: UserStory): string {
  return `Você é um arquiteto de software especializado em sites estáticos. Analise a história de usuário abaixo e gere uma especificação técnica detalhada.

# História de Usuário
**Título:** ${us.title}

**Descrição:**
${us.description}

**Critérios de Aceite:**
${us.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

# Instruções
- O site deve ser implementado em HTML, CSS e JavaScript puro (vanilla) — sem frameworks ou bibliotecas externas
- Gere um summary conciso (1-2 frases) do que será implementado
- Descreva o technicalApproach com a estratégia de implementação: estrutura de arquivos HTML/CSS/JS, organização das seções da página, técnicas de responsividade com CSS puro (flexbox, grid, media queries)
- Liste os components como seções/blocos da página (tipo "ui"): ex. HeroSection, MenuSection, FooterSection
- apiEndpoints deve ser um array vazio [] pois é um site estático sem backend
- dataModels deve listar as estruturas de dados JS que serão usadas (ex. "Item de cardápio: { nome, descricao, preco, categoria, imagemUrl }")
- acceptanceCriteria deve espelhar os critérios da história em linguagem técnica de HTML/CSS/JS
- Responda em português`;
}
