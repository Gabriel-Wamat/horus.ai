import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  RuntimeValidationEvidenceSchema,
  type LlmSettings,
  type RuntimeValidationEvidence,
  type Spec,
  type UserStory,
} from "@u-build/shared";
import type { CuratorFeedback } from "../langgraph/state.js";
import { loadAgentSkill } from "../agentSkills/loadAgentSkill.js";
import { createChatModel } from "../llm/createChatModel.js";
import { QaPreviewSmokeResultSchema } from "../preview/QaPreviewSmokeValidationService.js";

const TestCaseSchema = z.object({
  id: z.string(),
  criterion: z.string(),
  steps: z.array(z.string()),
  expected: z.string(),
});

const QaOutputSchema = z.object({
  testCases: z.array(TestCaseSchema),
  previewSmoke: QaPreviewSmokeResultSchema.optional(),
});

export type QaOutput = z.infer<typeof QaOutputSchema> & {
  runtimeValidation?: RuntimeValidationEvidence | undefined;
};

export function buildRuntimeValidationEvidenceFromPreviewSmoke(input: {
  workflowThreadId?: string;
  userStoryId?: string;
  projectId?: string;
  previewSmoke?: z.infer<typeof QaPreviewSmokeResultSchema>;
}): RuntimeValidationEvidence | undefined {
  if (!input.previewSmoke) return undefined;
  const previewStatus =
    input.previewSmoke.status === "passed"
      ? "passed"
      : input.previewSmoke.status === "failed"
        ? "failed"
        : "skipped";
  return RuntimeValidationEvidenceSchema.parse({
    id: randomUUID(),
    workflowThreadId: input.workflowThreadId ?? null,
    constructionRunId: null,
    userStoryId: input.userStoryId ?? null,
    projectId: input.projectId ?? null,
    status: previewStatus,
    skippedReason:
      previewStatus === "skipped" ? input.previewSmoke.reason : null,
    commands: [],
    preview: {
      status: previewStatus,
      url: input.previewSmoke.previewUrl ?? null,
      message: input.previewSmoke.reason,
      evidence: {
        title: null,
        bodySnippet: null,
        screenshotPath: null,
      },
    },
    createdAt: input.previewSmoke.checkedAt,
  });
}

export async function generateQaTests(
  userStory: UserStory,
  spec: Spec,
  curatorFeedback?: CuratorFeedback,
  llmSettings?: LlmSettings,
  executionBrief?: string
): Promise<QaOutput> {
  const criteria = spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
  const components = spec.components
    .map((c) => `- ${c.name}: ${c.description}`)
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
  const executionBriefBlock = executionBrief
    ? `
# Pedido de alteração vindo do chat do Horus
${executionBrief}

Valide especificamente essa alteração, além dos critérios de aceite da user story/spec ativa.
`
    : "";

  const skill = loadAgentSkill("qa-frontend-testing");
  const prompt = `Você é um QA engineer especializado em testes de interface web. Gere casos de teste detalhados para validação manual.

# Skill obrigatória do agente
${skill}
${reflectionBlock}
${executionBriefBlock}
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
        throw new Error(
          "QaAgent failed to produce structured test cases after 2 attempts."
        );
      }
    }
  }

  throw new Error("QaAgent failed to produce structured test cases.");
}
