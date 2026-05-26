import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  SpecSchema,
  type LlmSettings,
  type Spec,
  type UserStory,
} from "@u-build/shared";
import { createChatModel } from "../llm/createChatModel.js";
import { resolveAgentModelConfig } from "../llm/providerConfig.js";

const LlmSpecSchema = z.object({
  summary: z.string().min(20).max(240),
  technicalApproach: z.string().min(80).max(1200),
  components: z.array(
    z.object({
      name: z.string().min(2).max(80),
      type: z.enum(["ui", "logic", "data", "api"]),
      description: z.string().min(20).max(300),
      dependencies: z.array(z.string().min(1).max(80)).max(8),
    })
  ).min(2).max(6),
  apiEndpoints: z.array(
    z.object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: z.string().min(1).max(160),
      description: z.string().min(20).max(300),
    })
  ).max(5),
  dataModels: z.array(z.string().min(8).max(240)).min(1).max(5),
  acceptanceCriteria: z.array(z.string().min(8).max(240)).min(1).max(8),
});

const LLM_SPEC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    technicalApproach: { type: "string" },
    components: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["ui", "logic", "data", "api"] },
          description: { type: "string" },
          dependencies: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["name", "type", "description", "dependencies"],
      },
    },
    apiEndpoints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          },
          path: { type: "string" },
          description: { type: "string" },
        },
        required: ["method", "path", "description"],
      },
    },
    dataModels: {
      type: "array",
      items: { type: "string" },
    },
    acceptanceCriteria: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "summary",
    "technicalApproach",
    "components",
    "apiEndpoints",
    "dataModels",
    "acceptanceCriteria",
  ],
} as const;

const SPEC_GENERATION_TIMEOUT_MS = Number(
  process.env["SPEC_AGENT_TIMEOUT_MS"] ?? 180_000
);

export interface GenerateSpecOptions {
  skill: string;
  llmSettings?: LlmSettings | undefined;
}

export async function generateSpec(
  userStory: UserStory,
  options: GenerateSpecOptions
): Promise<Spec> {
  const prompt = buildPrompt(userStory, options.skill);
  console.log(
    `[SpecAgent] calling LLM for userStory=${userStory.id} title="${userStory.title}"`
  );
  const raw = await invokeSpecModel(prompt, options.llmSettings);

  return SpecSchema.parse({
    ...raw,
    version: 1,
    id: uuidv4(),
    userStoryId: userStory.id,
    generatedAt: new Date().toISOString(),
  });
}

async function invokeSpecModel(
  prompt: string,
  llmSettings: LlmSettings | undefined
): Promise<z.infer<typeof LlmSpecSchema>> {
  const config = resolveAgentModelConfig(
    "spec",
    { maxTokens: 1400 },
    process.env,
    llmSettings
  );

  if (config.provider === "openai") {
    return invokeOpenAiResponses(prompt, config);
  }

  const model = createChatModel(
    "spec",
    { maxTokens: 1400 },
    llmSettings
  ).withStructuredOutput(LlmSpecSchema);

  return (await withTimeout(
    model.invoke(prompt),
    SPEC_GENERATION_TIMEOUT_MS,
    `SpecAgent timed out after ${SPEC_GENERATION_TIMEOUT_MS / 1000}s while generating a structured spec.`
  )) as z.infer<typeof LlmSpecSchema>;
}

async function invokeOpenAiResponses(
  prompt: string,
  config: ReturnType<typeof resolveAgentModelConfig>
): Promise<z.infer<typeof LlmSpecSchema>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    SPEC_GENERATION_TIMEOUT_MS
  );

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        input: prompt,
        ...(config.maxTokens ? { max_output_tokens: config.maxTokens } : {}),
        text: {
          format: {
            type: "json_schema",
            name: "horus_spec",
            strict: true,
            schema: LLM_SPEC_JSON_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(
        `OpenAI Responses API failed (${response.status}): ${extractErrorMessage(body)}`
      );
    }

    const outputText = extractOutputText(body);
    if (!outputText) {
      throw new Error("OpenAI Responses API returned no output_text for SpecAgent.");
    }

    return LlmSpecSchema.parse(JSON.parse(outputText));
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `SpecAgent timed out after ${SPEC_GENERATION_TIMEOUT_MS / 1000}s while generating a structured spec.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractOutputText(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return undefined;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }

  return undefined;
}

function extractErrorMessage(body: unknown): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    (body as { error?: { message?: unknown } }).error &&
    typeof (body as { error: { message?: unknown } }).error.message === "string"
  ) {
    return (body as { error: { message: string } }).error.message;
  }
  return "unknown error";
}

function buildPrompt(us: UserStory, skill: string): string {
  const requiredSkill = buildSkillDigest(skill);
  if (!requiredSkill) {
    throw new Error("SpecAgent requires a non-empty skill prompt.");
  }

  return `Você é o SpecAgent do Horus. Sua entrada é EXCLUSIVAMENTE uma UserStory versionada do workspace.
Gere uma spec técnica objetiva para downstream agents. Não responda como chat. Não trate como pergunta do usuário.

# Skill obrigatória do agente
${requiredSkill}

# UserStory JSON
${JSON.stringify(
  {
    id: us.id,
    title: us.title,
    description: us.description,
    acceptanceCriteria: us.acceptanceCriteria,
    priority: us.priority,
    labels: us.labels,
  },
  null,
  2
)}

# Instruções de saída
- A spec deve ser implementável em HTML, CSS e JavaScript puro (vanilla) — sem frameworks ou bibliotecas externas
- Gere um summary conciso de 1 frase
- Descreva o technicalApproach em no máximo 900 caracteres: estrutura de HTML/CSS/JS, organização visual, componentes, estados, data adapter, responsividade e acessibilidade
- Liste 2 a 6 components como blocos de responsabilidade; use nomes específicos do domínio
- apiEndpoints deve representar contratos futuros para rotas do backend quando a história implicar dados remotos, persistência, envio, busca, filtro ou atualização; deixe [] apenas quando a interface for realmente estática
- Quando apiEndpoints existir, mantenha claro no technicalApproach que o frontend atual deve usar mock data por uma camada adaptadora compatível com esses contratos
- dataModels deve listar de 1 a 5 estruturas de dados JS e formatos de resposta esperados
- acceptanceCriteria deve cobrir todos os critérios da UserStory em linguagem técnica e observável para QA
- Seja direto; não escreva documentação longa; não repita a user story inteira
- Responda em português`;
}

function buildSkillDigest(skill: string): string {
  const normalized = skill.trim();
  if (!normalized) return "";

  return `Skill ativa: spec-frontend-sdd.
Siga o protocolo operacional abaixo, derivado da skill versionada:
- gere specs escopadas à user story e aos critérios de aceite;
- preserve arquitetura frontend-first com HTML, CSS e JavaScript vanilla;
- descreva componentes por responsabilidade visível, estado, dados e interação;
- inclua contratos de API apenas quando a história implicar dados remotos, persistência, busca, envio ou atualização;
- mantenha mock data atrás de data adapter quando houver rota futura;
- torne cada critério testável por comportamento observável;
- cubra loading, empty, error, success, acessibilidade, responsividade e texto sem overflow quando aplicável;
- não invente fluxos, autenticação, dashboards, backend real ou integrações fora do pedido;
- produza saída objetiva e parseável pelo schema compartilhado.`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
