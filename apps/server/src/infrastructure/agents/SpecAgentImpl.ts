import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  SpecSchema,
  VisualContractSchema,
  type DesignContextBundle,
  type LlmSettings,
  type Spec,
  type UserStory,
} from "@u-build/shared";
import { createChatModel } from "../llm/createChatModel.js";
import { resolveAgentModelConfig } from "../llm/providerConfig.js";
import { formatDesignContextForPrompt } from "../design/DesignContextService.js";

type Env = Record<string, string | undefined>;

const LlmSpecSchema = z.object({
  summary: z.string().min(1),
  technicalApproach: z.string().min(1),
  components: z.array(
    z.object({
      name: z.string().min(1),
      type: z.enum(["ui", "api", "service", "model", "utility"]),
      description: z.string().min(1),
      dependencies: z.array(z.string().min(1)),
    })
  ).min(2).max(6),
  apiEndpoints: z.array(
    z.object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: z.string().startsWith("/"),
      description: z.string().min(1),
    })
  ).max(5),
  dataModels: z.array(z.string().min(1)).min(1).max(5),
  acceptanceCriteria: z.array(z.string().min(1)).min(1).max(8),
  visualContract: VisualContractSchema,
});

const LLM_SPEC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    technicalApproach: { type: "string" },
    components: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          type: {
            type: "string",
            enum: ["ui", "api", "service", "model", "utility"],
          },
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
      maxItems: 5,
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
      minItems: 1,
      maxItems: 5,
      items: { type: "string" },
    },
    acceptanceCriteria: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" },
    },
    visualContract: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: {
          type: "string",
          enum: ["preserve_identity", "guided_redesign", "blank_project"],
        },
        designSource: {
          type: "string",
          enum: ["project_files", "user_reference", "generated_default", "mixed"],
        },
        layoutArchetype: { type: "string" },
        density: {
          type: "string",
          enum: ["compact", "balanced", "spacious"],
        },
        tone: { type: "string" },
        colorPolicy: {
          type: "object",
          additionalProperties: false,
          properties: {
            background: { type: "array", items: { type: "string" } },
            surface: { type: "array", items: { type: "string" } },
            text: { type: "array", items: { type: "string" } },
            accent: { type: "array", items: { type: "string" } },
            forbidden: { type: "array", items: { type: "string" } },
            usageRules: { type: "array", items: { type: "string" } },
          },
          required: [
            "background",
            "surface",
            "text",
            "accent",
            "forbidden",
            "usageRules",
          ],
        },
        typography: {
          type: "object",
          additionalProperties: false,
          properties: {
            families: { type: "array", items: { type: "string" } },
            scaleRules: { type: "array", items: { type: "string" } },
          },
          required: ["families", "scaleRules"],
        },
        spacingAndShape: {
          type: "object",
          additionalProperties: false,
          properties: {
            spacingScale: { type: "array", items: { type: "string" } },
            radiusRules: { type: "array", items: { type: "string" } },
            strokeRules: { type: "array", items: { type: "string" } },
            shadowRules: { type: "array", items: { type: "string" } },
          },
          required: [
            "spacingScale",
            "radiusRules",
            "strokeRules",
            "shadowRules",
          ],
        },
        componentPolicy: {
          type: "object",
          additionalProperties: false,
          properties: {
            preferExistingComponents: { type: "boolean" },
            allowedLibraries: { type: "array", items: { type: "string" } },
            requiredPatterns: { type: "array", items: { type: "string" } },
            forbiddenPatterns: { type: "array", items: { type: "string" } },
          },
          required: [
            "preferExistingComponents",
            "allowedLibraries",
            "requiredPatterns",
            "forbiddenPatterns",
          ],
        },
        states: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "default",
              "loading",
              "empty",
              "error",
              "success",
              "selected",
              "focus",
              "disabled",
            ],
          },
        },
        responsiveRules: { type: "array", items: { type: "string" } },
        accessibilityRules: { type: "array", items: { type: "string" } },
        antiPatterns: { type: "array", items: { type: "string" } },
        referenceFiles: { type: "array", items: { type: "string" } },
      },
      required: [
        "mode",
        "designSource",
        "layoutArchetype",
        "density",
        "tone",
        "colorPolicy",
        "typography",
        "spacingAndShape",
        "componentPolicy",
        "states",
        "responsiveRules",
        "accessibilityRules",
        "antiPatterns",
        "referenceFiles",
      ],
    },
  },
  required: [
    "summary",
    "technicalApproach",
    "components",
    "apiEndpoints",
    "dataModels",
    "acceptanceCriteria",
    "visualContract",
  ],
} as const;

export interface GenerateSpecOptions {
  skill: string;
  llmSettings?: LlmSettings | undefined;
  env?: Env;
  designContext?: DesignContextBundle | undefined;
}

export async function generateSpec(
  userStory: UserStory,
  options: GenerateSpecOptions
): Promise<Spec> {
  const prompt = buildSpecPrompt(userStory, options.skill, options.designContext);
  console.log(
    `[SpecAgent] calling LLM for userStory=${userStory.id} title="${userStory.title}"`
  );
  const raw = await invokeSpecModel(prompt, options.llmSettings, options.env);

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
  llmSettings: LlmSettings | undefined,
  env: Env = process.env
): Promise<z.infer<typeof LlmSpecSchema>> {
  const timeoutMs = resolveSpecTimeoutMs(env);
  const config = resolveAgentModelConfig(
    "spec",
    {},
    env,
    llmSettings
  );

  if (config.provider === "openai") {
    return invokeOpenAiResponses(prompt, config, env, timeoutMs);
  }

  const model = createChatModel(
    "spec",
    {},
    llmSettings,
    env
  ).withStructuredOutput(LlmSpecSchema);

  return (await withTimeout(
    model.invoke(prompt),
    timeoutMs,
    `SpecAgent timed out after ${timeoutMs / 1000}s while generating a structured spec.`
  )) as z.infer<typeof LlmSpecSchema>;
}

async function invokeOpenAiResponses(
  prompt: string,
  config: ReturnType<typeof resolveAgentModelConfig>,
  env: Env,
  timeoutMs: number
): Promise<z.infer<typeof LlmSpecSchema>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const reasoningEffort = env["OPENAI_REASONING_EFFORT"]?.trim();
    const textVerbosity = env["OPENAI_TEXT_VERBOSITY"]?.trim() ?? "low";
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
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        text: {
          verbosity: textVerbosity,
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

    console.log(
      `[SpecAgent] OpenAI Responses API completed in ${Date.now() - startedAt}ms`
    );
    const parsedJson = JSON.parse(outputText);
    const parsedSpec = parseLlmSpecCandidate(parsedJson);
    console.log("[SpecAgent] structured output parsed successfully");
    return parsedSpec;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `SpecAgent timed out after ${timeoutMs / 1000}s while generating a structured spec.`
      );
    }
    if (err instanceof z.ZodError) {
      throw new Error(`SpecAgent output failed schema validation: ${formatZodIssues(err)}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseLlmSpecCandidate(candidate: unknown): z.infer<typeof LlmSpecSchema> {
  return LlmSpecSchema.parse(normalizeLlmSpecCandidate(candidate));
}

function normalizeLlmSpecCandidate(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return candidate;
  }
  const normalized = { ...(candidate as Record<string, unknown>) };
  normalized["components"] = sliceArray(normalized["components"], 6);
  normalized["apiEndpoints"] = sliceArray(normalized["apiEndpoints"], 5);
  normalized["dataModels"] = sliceArray(normalized["dataModels"], 5);
  normalized["acceptanceCriteria"] = sliceArray(
    normalized["acceptanceCriteria"],
    8
  );
  return normalized;
}

function sliceArray(value: unknown, maxLength: number): unknown {
  return Array.isArray(value) ? value.slice(0, maxLength) : value;
}

function resolveSpecTimeoutMs(env: Env): number {
  const raw = env["SPEC_AGENT_TIMEOUT_MS"]?.trim();
  if (!raw) return 180_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("SPEC_AGENT_TIMEOUT_MS must be a positive finite number.");
  }
  return parsed;
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

export function buildSpecPrompt(
  us: UserStory,
  skill: string,
  designContext?: DesignContextBundle
): string {
  const requiredSkill = buildSkillDigest(skill);
  if (!requiredSkill) {
    throw new Error("SpecAgent requires a non-empty skill prompt.");
  }

  return `Você é o SpecAgent do Horus. Sua entrada é EXCLUSIVAMENTE uma UserStory versionada do workspace.
Gere uma spec técnica objetiva para downstream agents. Não responda como chat. Não trate como pergunta do usuário.

# Skill obrigatória do agente
${requiredSkill}

${formatDesignContextForPrompt(designContext)}

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
- A spec deve respeitar a stack real do projeto quando houver projeto alvo; não force HTML/JS standalone quando o app usa React/TypeScript
- Gere um summary conciso de 1 frase
- Descreva o technicalApproach em no máximo 900 caracteres: estrutura de HTML/CSS/JS, organização visual, componentes, estados, data adapter, responsividade e acessibilidade
- O technicalApproach deve citar explicitamente "Pattern: <id>" com um destes ids: operational-dashboard, chat-preview-workbench, workflow-map, form-crud-tool, content-landing ou custom-product-surface
- Liste 2 a 6 components como blocos de responsabilidade; use nomes específicos do domínio
- Cada component.type deve ser exatamente um destes valores: ui, api, service, model, utility
- apiEndpoints deve representar contratos futuros para rotas do backend quando a história implicar dados remotos, persistência, envio, busca, filtro ou atualização; deixe [] apenas quando a interface for realmente estática
- Quando apiEndpoints existir, cada path deve começar com /
- Quando apiEndpoints existir, mantenha claro no technicalApproach que o frontend deve usar contratos reais já disponíveis ou boundary/adapters injetáveis; não peça mock/fake data em código aplicado ao projeto
- dataModels deve listar de 1 a 5 estruturas de dados JS e formatos de resposta esperados
- acceptanceCriteria deve cobrir todos os critérios da UserStory em linguagem técnica e observável para QA
- visualContract é obrigatório: derive do contexto visual real quando existir; se não houver evidência, use mode blank_project e designSource generated_default
- visualContract.layoutArchetype deve incluir o mesmo pattern escolhido; visualContract.componentPolicy deve registrar requiredPatterns e forbiddenPatterns coerentes com o pattern
- visualContract deve citar referenceFiles lidos, tokens/regras relevantes, estados visuais, responsividade, acessibilidade e antiPatterns que Front/QA/Curator devem validar
- Não invente paleta paralela quando o contexto visual trouxer tokens; preservar identidade local tem prioridade sobre estilos "modernos" genéricos
- Seja direto; não escreva documentação longa; não repita a user story inteira
- Responda em português`;
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function buildSkillDigest(skill: string): string {
  const normalized = skill.trim();
  if (!normalized) return "";

  return `Skill ativa: spec-frontend-sdd.
Siga o protocolo operacional abaixo, derivado da skill versionada:
- gere specs escopadas à user story e aos critérios de aceite;
- preserve a arquitetura frontend real do projeto alvo, incluindo React/TypeScript quando aplicável;
- descreva componentes por responsabilidade visível, estado, dados e interação;
- inclua contratos de API apenas quando a história implicar dados remotos, persistência, busca, envio ou atualização;
- use contratos reais ou adapters injetáveis; não solicite mock/fake data em runtime aplicado ao projeto;
- escolha exatamente um frontend pattern e carregue-o no technicalApproach como "Pattern: <id>": operational-dashboard, chat-preview-workbench, workflow-map, form-crud-tool, content-landing ou custom-product-surface;
- use operational-dashboard para ferramentas internas, monitoramento, admin, CRM, analytics, file browsing e consoles de trabalho densos;
- use chat-preview-workbench para chat com preview, progresso de agentes, output gerado e controles de execução;
- use workflow-map para grafos, mapas de dependência, pipelines e topologias de agentes;
- use form-crud-tool para configurações, CRUD, key management, formulários e fluxos com validação;
- use content-landing somente para marketing, portfolio, produto público, venue, pessoa, marca ou storytelling;
- use custom-product-surface somente quando nenhum pattern conhecido se encaixar e explique a razão;
- registre o pattern em visualContract.layoutArchetype e use componentPolicy.requiredPatterns/forbiddenPatterns para tornar a escolha validável;
- aplique política de componentes: componentes/tokens existentes primeiro, bibliotecas já instaladas segundo, HTML/CSS/JS nativo terceiro, sem dependências inventadas;
- exponha anti-patterns curator-testáveis: excesso de frames, cards aninhados, cores high-light, paleta monocromática, overflow de texto, landing page genérica para ferramenta e drift visual;
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
