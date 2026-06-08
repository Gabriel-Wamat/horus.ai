import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  DesignBriefSchema,
  SpecSchema,
  VisualContractSchema,
  type DesignContextBundle,
  type LlmSettings,
  type PromptContextBundle,
  type Spec,
  type UserStory,
} from "@u-build/shared";
import { createChatModel } from "../llm/createChatModel.js";
import {
  createLinkedAbortController,
  invokeChatModel,
} from "../llm/invokeChatModel.js";
import { resolveAgentModelConfig } from "../llm/providerConfig.js";
import { formatDesignContextForPrompt } from "../design/DesignContextService.js";
import { formatSurfacePatternLibraryForPrompt } from "../design/SurfacePatternLibrary.js";
import { appendRuntimeAgentSkills } from "../agentSkills/loadAgentSkill.js";
import { formatPromptContextForPrompt } from "../prompt/PromptContextAssembler.js";

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
  designBrief: DesignBriefSchema,
});

const DESIGN_STATE_REQUIREMENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    trigger: { type: "string" },
    expectedUi: { type: "string" },
    validationSignal: { type: "string" },
  },
  required: ["trigger", "expectedUi", "validationSignal"],
} as const;

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
    designBrief: {
      type: "object",
      additionalProperties: false,
      properties: {
        surfaceType: {
          type: "string",
          enum: [
            "crud",
            "dashboard",
            "calendar",
            "kanban",
            "editor-canvas",
            "chat-preview",
            "workflow-map",
            "auth",
            "onboarding",
            "settings",
            "file-browser",
            "report",
            "checkout",
            "media-gallery",
            "form",
            "search-results",
            "detail-view",
            "data-table",
            "custom",
          ],
        },
        userIntent: {
          type: "object",
          additionalProperties: false,
          properties: {
            primaryUserGoal: { type: "string" },
            userMentalModel: { type: "string" },
            successOutcome: { type: "string" },
            nonGoals: { type: "array", items: { type: "string" } },
          },
          required: [
            "primaryUserGoal",
            "userMentalModel",
            "successOutcome",
            "nonGoals",
          ],
        },
        informationArchitecture: {
          type: "object",
          additionalProperties: false,
          properties: {
            regions: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  role: { type: "string" },
                  priority: {
                    type: "string",
                    enum: ["primary", "secondary", "supporting"],
                  },
                  contents: { type: "array", items: { type: "string" } },
                },
                required: ["name", "role", "priority", "contents"],
              },
            },
            hierarchy: {
              type: "array",
              minItems: 1,
              items: { type: "string" },
            },
            navigationModel: { type: "string" },
            primaryFlow: {
              type: "array",
              minItems: 1,
              items: { type: "string" },
            },
          },
          required: ["regions", "hierarchy", "navigationModel", "primaryFlow"],
        },
        componentInventory: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              purpose: { type: "string" },
              variants: { type: "array", items: { type: "string" } },
              useWhen: { type: "string" },
            },
            required: ["name", "purpose", "variants", "useWhen"],
          },
        },
        stateMatrix: {
          type: "object",
          additionalProperties: false,
          properties: {
            empty: {
              type: "array",
              items: DESIGN_STATE_REQUIREMENT_JSON_SCHEMA,
            },
            loading: {
              type: "array",
              items: DESIGN_STATE_REQUIREMENT_JSON_SCHEMA,
            },
            success: {
              type: "array",
              items: DESIGN_STATE_REQUIREMENT_JSON_SCHEMA,
            },
            error: {
              type: "array",
              items: DESIGN_STATE_REQUIREMENT_JSON_SCHEMA,
            },
            selected: {
              type: "array",
              items: DESIGN_STATE_REQUIREMENT_JSON_SCHEMA,
            },
            disabled: {
              type: "array",
              items: DESIGN_STATE_REQUIREMENT_JSON_SCHEMA,
            },
            validation: {
              type: "array",
              items: DESIGN_STATE_REQUIREMENT_JSON_SCHEMA,
            },
            overflow: {
              type: "array",
              items: DESIGN_STATE_REQUIREMENT_JSON_SCHEMA,
            },
            mobile: {
              type: "array",
              items: DESIGN_STATE_REQUIREMENT_JSON_SCHEMA,
            },
          },
          required: [
            "empty",
            "loading",
            "success",
            "error",
            "selected",
            "disabled",
            "validation",
            "overflow",
            "mobile",
          ],
        },
        designSystemBinding: {
          type: "object",
          additionalProperties: false,
          properties: {
            tokens: { type: "array", items: { type: "string" } },
            components: { type: "array", items: { type: "string" } },
            allowedLibraries: { type: "array", items: { type: "string" } },
            imports: { type: "array", items: { type: "string" } },
            antiPatterns: { type: "array", items: { type: "string" } },
          },
          required: [
            "tokens",
            "components",
            "allowedLibraries",
            "imports",
            "antiPatterns",
          ],
        },
        visualStrategy: {
          type: "object",
          additionalProperties: false,
          properties: {
            colorRoles: {
              type: "object",
              additionalProperties: false,
              properties: {
                background: { type: "array", items: { type: "string" } },
                surface: { type: "array", items: { type: "string" } },
                text: { type: "array", items: { type: "string" } },
                accent: { type: "array", items: { type: "string" } },
                semanticStatus: { type: "array", items: { type: "string" } },
                categoryUtility: { type: "array", items: { type: "string" } },
              },
              required: [
                "background",
                "surface",
                "text",
                "accent",
                "semanticStatus",
                "categoryUtility",
              ],
            },
            typography: { type: "array", items: { type: "string" } },
            density: { type: "string" },
            radius: { type: "array", items: { type: "string" } },
            shadow: { type: "array", items: { type: "string" } },
            motion: { type: "array", items: { type: "string" } },
            domainRationale: { type: "string" },
          },
          required: [
            "colorRoles",
            "typography",
            "density",
            "radius",
            "shadow",
            "motion",
            "domainRationale",
          ],
        },
      },
      required: [
        "surfaceType",
        "userIntent",
        "informationArchitecture",
        "componentInventory",
        "stateMatrix",
        "designSystemBinding",
        "visualStrategy",
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
    "designBrief",
  ],
} as const;

export interface GenerateSpecOptions {
  skill: string;
  llmSettings?: LlmSettings | undefined;
  env?: Env;
  designContext?: DesignContextBundle | undefined;
  promptContext?: PromptContextBundle | undefined;
}

export async function generateSpec(
  userStory: UserStory,
  options: GenerateSpecOptions
): Promise<Spec> {
  const skill = appendRuntimeAgentSkills(
    options.skill,
    options.promptContext?.runtimeSkills ?? []
  );
  const prompt = buildSpecPrompt(
    userStory,
    skill,
    options.designContext,
    options.promptContext
  );
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
    invokeChatModel(model, prompt),
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
  const { controller, cleanup } = createLinkedAbortController();
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
    cleanup();
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
  const designBrief = normalized["designBrief"];
  if (designBrief && typeof designBrief === "object" && !Array.isArray(designBrief)) {
    const normalizedDesignBrief = { ...(designBrief as Record<string, unknown>) };
    normalizedDesignBrief["componentInventory"] = sliceArray(
      normalizedDesignBrief["componentInventory"],
      8
    );
    normalized["designBrief"] = normalizedDesignBrief;
  }
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
  designContext?: DesignContextBundle,
  promptContext?: PromptContextBundle
): string {
  const requiredSkill = buildSkillDigest(skill);
  if (!requiredSkill) {
    throw new Error("SpecAgent requires a non-empty skill prompt.");
  }

  return `Você é o SpecAgent do Horus. Sua entrada é EXCLUSIVAMENTE uma UserStory versionada do workspace.
Gere uma spec técnica objetiva para downstream agents. Não responda como chat. Não trate como pergunta do usuário.

# Skill obrigatória do agente
${requiredSkill}

${formatPromptContextForPrompt(promptContext)}

${formatDesignContextForPrompt(designContext)}

# Biblioteca versionada de patterns por surfaceType
${formatSurfacePatternLibraryForPrompt()}

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
- Gere um summary conciso de 1 frase descrevendo a experiência de produto; não repita ids/títulos de requisito como "US01", "User Story" ou nomes internos de workflow
- Descreva o technicalApproach em no máximo 900 caracteres: estrutura de HTML/CSS/JS, organização visual, componentes, estados, data adapter, responsividade e acessibilidade
- O technicalApproach deve citar explicitamente "Pattern: <id>" com um destes ids: operational-dashboard, chat-preview-workbench, workflow-map, form-crud-tool, content-landing ou custom-product-surface
- Liste 2 a 6 components como blocos de responsabilidade; use nomes específicos do domínio
- Cada component.type deve ser exatamente um destes valores: ui, api, service, model, utility
- apiEndpoints deve representar contratos futuros para rotas do backend quando a história implicar dados remotos, persistência, envio, busca, filtro ou atualização; deixe [] apenas quando a interface for realmente estática
- Quando apiEndpoints existir, cada path deve começar com /
- Quando apiEndpoints existir, mantenha claro no technicalApproach que o frontend deve usar contratos reais já disponíveis ou boundary/adapters injetáveis; não peça mock/fake data em código aplicado ao projeto
- dataModels deve listar de 1 a 5 estruturas de dados JS e formatos de resposta esperados
- acceptanceCriteria deve cobrir todos os critérios da UserStory em linguagem técnica e observável para QA
- designBrief é obrigatório e deve ser produzido antes da implementação: ele é o contrato de Design Intelligence que Front/QA/Curator usarão
- designBrief.surfaceType deve classificar a interface com exatamente um tipo: crud, dashboard, calendar, kanban, editor-canvas, chat-preview, workflow-map, auth, onboarding, settings, file-browser, report, checkout, media-gallery, form, search-results, detail-view, data-table ou custom
- Escolha o pattern, informationArchitecture, componentInventory, stateMatrix, designSystemBinding e visualStrategy a partir da biblioteca versionada de patterns por surfaceType acima; não use dashboard genérico quando a biblioteca indicar outra intenção
- designBrief.userIntent deve explicar o que o usuário está tentando fazer, seu modelo mental, o resultado de sucesso e o que fica fora do escopo
- designBrief.informationArchitecture deve listar regiões da tela, hierarquia, navegação e fluxo primário em linguagem acionável para o FrontAgent
- designBrief.componentInventory deve listar componentes esperados, variantes e quando usar cada componente; use nomes do domínio e componentes reais do projeto quando conhecidos
- designBrief.stateMatrix deve cobrir empty, loading, success, error, selected, disabled, validation, overflow e mobile com trigger, UI esperada e sinal de validação; use [] somente quando o estado não se aplica
- designBrief.designSystemBinding deve listar tokens, componentes reais, bibliotecas permitidas, imports e antiPatterns; quando DesignContextBundle existir, derive dele em vez de inventar
- designBrief.visualStrategy deve definir papéis de cor, tipografia, densidade, raio, sombra, movimento e justificativa por domínio
- visualContract é obrigatório: derive do contexto visual real quando existir; se não houver evidência, use mode blank_project e designSource generated_default
- visualContract.layoutArchetype deve incluir o mesmo pattern escolhido; visualContract.componentPolicy deve registrar requiredPatterns e forbiddenPatterns coerentes com o pattern
- visualContract.colorPolicy deve ser uma estrategia de design com papeis claros: background, surface, text, accent, semantic/status e category/utility quando aplicavel. usageRules deve explicar como a paleta serve dominio, publico, contraste, hierarquia e estados; nao gere uma lista arbitraria de hex.
- visualContract deve citar referenceFiles lidos, tokens/regras relevantes, estados visuais, responsividade, acessibilidade e antiPatterns que Front/QA/Curator devem validar
- Não invente paleta paralela quando o contexto visual trouxer tokens; preservar identidade local tem prioridade sobre estilos "modernos" genéricos
- Inclua nos antiPatterns a proibicao de metadados SDD/workflow como copy visivel: ids USxx, "User Story", "Spec", "Pattern", "visualContract", "Project OS", "Horus" ou "fallback", salvo se esses termos forem realmente o dominio do produto
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
  const runtimeSkillSection = normalized.includes("# Active Project Skills")
    ? `\n\nSkills runtime ativas vinculadas ao projeto:\n${clipRuntimeSkillSection(normalized)}`
    : "";

  return `Skill ativa: spec-frontend-sdd.
Siga o protocolo operacional abaixo, derivado da skill versionada:
- gere specs escopadas à user story e aos critérios de aceite;
- preserve a arquitetura frontend real do projeto alvo, incluindo React/TypeScript quando aplicável;
- descreva componentes por responsabilidade visível, estado, dados e interação;
- inclua contratos de API apenas quando a história implicar dados remotos, persistência, busca, envio ou atualização;
- use contratos reais ou adapters injetáveis; não solicite mock/fake data em runtime aplicado ao projeto;
- produza designBrief como contrato estruturado antes do FrontAgent: surfaceType, userIntent, informationArchitecture, componentInventory, stateMatrix, designSystemBinding e visualStrategy;
- use designBrief.surfaceType para selecionar o pattern e impedir generic dashboards/landing pages quando o domínio pedir CRUD, calendário, kanban, editor/canvas, chat-preview, workflow-map, auth, onboarding, settings, file-browser, report, checkout ou media gallery;
- escolha exatamente o frontend pattern indicado pela biblioteca versionada de patterns por surfaceType e carregue-o no technicalApproach como "Pattern: <id>";
- registre o pattern em visualContract.layoutArchetype e use componentPolicy.requiredPatterns/forbiddenPatterns para tornar a escolha validável;
- defina colorPolicy como estrategia cromatica de designer, com papeis para background, surface, text, accent, semantic/status e category/utility quando aplicavel, explicando uso por dominio, publico, contraste, hierarquia e estados;
- aplique política de componentes: componentes/tokens existentes primeiro, bibliotecas já instaladas segundo, HTML/CSS/JS nativo terceiro, sem dependências inventadas;
- exponha anti-patterns curator-testáveis: excesso de frames, cards aninhados, cores high-light, paleta monocromática, overflow de texto, landing page genérica para ferramenta e drift visual;
- exponha anti-pattern curator-testável para metadados SDD/workflow visíveis na UI: ids USxx, User Story, Spec, Pattern, visualContract, Project OS, Horus e fallback, salvo quando fizerem parte do dominio real do produto;
- torne cada critério testável por comportamento observável;
- cubra loading, empty, error, success, acessibilidade, responsividade e texto sem overflow quando aplicável;
- não invente fluxos, autenticação, dashboards, backend real ou integrações fora do pedido;
- produza saída objetiva e parseável pelo schema compartilhado.${runtimeSkillSection}`;
}

function clipRuntimeSkillSection(skill: string): string {
  const section = skill.split("# Active Project Skills").slice(1).join("# Active Project Skills");
  const content = `# Active Project Skills${section}`.trim();
  const maxBytes = 12_000;
  if (Buffer.byteLength(content, "utf8") <= maxBytes) return content;
  return `${Buffer.from(content, "utf8")
    .subarray(0, maxBytes - 80)
    .toString("utf8")
    .replace(/\uFFFD$/u, "")}\n\n[Runtime skill section clipped by prompt budget]`;
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
