import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  RuntimeValidationEvidenceSchema,
  type RuntimeValidationCommandEvidence,
  type DesignContextBundle,
  type LlmSettings,
  type PromptContextBundle,
  type RuntimeValidationEvidence,
  type Spec,
  type UserStory,
} from "@u-build/shared";
import type { CuratorFeedback } from "../langgraph/state.js";
import {
  appendRuntimeAgentSkills,
  loadAgentSkill,
} from "../agentSkills/loadAgentSkill.js";
import { createChatModel } from "../llm/createChatModel.js";
import { invokeChatModel } from "../llm/invokeChatModel.js";
import { QaPreviewSmokeResultSchema } from "../preview/QaPreviewSmokeValidationService.js";
import { formatDesignContextForPrompt } from "../design/DesignContextService.js";
import { formatPromptContextForPrompt } from "../prompt/PromptContextAssembler.js";

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

function buildFallbackQaOutput(
  spec: Spec,
  executionBrief?: string
): QaOutput {
  const criteria =
    spec.acceptanceCriteria.length > 0
      ? spec.acceptanceCriteria
      : ["A alteração solicitada deve ser visível no frontend sem quebrar a spec ativa."];
  return {
    testCases: criteria.map((criterion, index) => ({
      id: `TC-${String(index + 1).padStart(2, "0")}`,
      criterion,
      steps: [
        "Abrir o preview do projeto selecionado.",
        "Verificar a tela principal em viewport desktop.",
        ...(executionBrief
          ? [`Confirmar que o pedido do chat foi atendido: ${executionBrief}`]
          : []),
      ],
      expected:
        "A tela atende ao critério sem regressões visuais, funcionais ou de acessibilidade.",
    })),
  };
}

export function buildRuntimeValidationEvidenceFromPreviewSmoke(input: {
  workflowThreadId?: string;
  userStoryId?: string;
  projectId?: string;
  previewSmoke?: z.infer<typeof QaPreviewSmokeResultSchema>;
  commands?: readonly RuntimeValidationCommandEvidence[];
}): RuntimeValidationEvidence | undefined {
  if (!input.previewSmoke && (!input.commands || input.commands.length === 0)) {
    return undefined;
  }
  const latestCommands = latestCommandEvidenceById(input.commands ?? []);
  const previewStatus = runtimePreviewStatus(input.previewSmoke?.status);
  const blockedCommand = latestCommands.find(commandRuntimeBlocked);
  const failedCommand = latestCommands.find(commandRuntimeFailed);
  const commandStatus =
    input.commands && input.commands.length > 0
      ? blockedCommand
        ? "blocked"
        : failedCommand
          ? "failed"
          : "passed"
      : "skipped";
  const status =
    commandStatus === "blocked"
      ? "blocked"
      : commandStatus === "failed" || previewStatus === "failed"
      ? "failed"
      : commandStatus === "passed" || previewStatus === "passed"
        ? "passed"
        : "skipped";
  const skippedReason =
    status === "skipped"
      ? input.previewSmoke?.reason ?? "runtime_validation_not_available"
      : null;
  const failureReason =
    status === "failed"
      ? failedCommand
        ? commandFailureReason(failedCommand)
        : input.previewSmoke?.reason ?? "runtime_validation_failed"
      : status === "blocked" && blockedCommand
        ? commandFailureReason(blockedCommand)
      : null;
  return RuntimeValidationEvidenceSchema.parse({
    id: randomUUID(),
    workflowThreadId: input.workflowThreadId ?? null,
    constructionRunId: null,
    userStoryId: input.userStoryId ?? null,
    projectId: input.projectId ?? null,
    status,
    skippedReason: skippedReason ?? failureReason,
    commands: input.commands ?? [],
    preview: {
      status: previewStatus,
      url: input.previewSmoke?.previewUrl ?? null,
      message: input.previewSmoke?.reason ?? "Preview smoke was not executed.",
      evidence: {
        title: null,
        bodySnippet: null,
        screenshotPath: null,
      },
    },
    createdAt: input.previewSmoke?.checkedAt ?? new Date().toISOString(),
  });
}

function runtimePreviewStatus(
  status: z.infer<typeof QaPreviewSmokeResultSchema>["status"] | undefined
): "passed" | "failed" | "skipped" {
  if (status === "passed") return "passed";
  if (status === "failed" || status === "blocked") return "failed";
  return "skipped";
}

function commandRuntimeFailed(command: RuntimeValidationCommandEvidence): boolean {
  if (commandRuntimeBlocked(command)) return false;
  return command.exitCode !== 0;
}

function commandRuntimeBlocked(command: RuntimeValidationCommandEvidence): boolean {
  if (command.interactivePromptDetected) return true;
  if (command.approvalRequired && !command.approved) return true;
  return false;
}

function latestCommandEvidenceById(
  commands: readonly RuntimeValidationCommandEvidence[]
): RuntimeValidationCommandEvidence[] {
  const latest = new Map<string, RuntimeValidationCommandEvidence>();
  for (const command of commands) {
    latest.set(command.commandId, command);
  }
  return [...latest.values()];
}

function commandFailureReason(command: RuntimeValidationCommandEvidence): string {
  if (command.interactivePromptDetected) {
    return `interactive_prompt:${command.interactivePromptText ?? command.commandId}`;
  }
  if (command.approvalRequired && !command.approved) {
    return `approval_required:${command.policyReason ?? command.commandId}`;
  }
  return command.stderrTail || `command_failed:${command.commandId}`;
}

export async function generateQaTests(
  userStory: UserStory,
  spec: Spec,
  curatorFeedback?: CuratorFeedback,
  llmSettings?: LlmSettings,
  executionBrief?: string,
  designContext?: DesignContextBundle,
  promptContext?: PromptContextBundle
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
  const visualContractBlock = spec.visualContract
    ? `# VisualContract da SPEC\n${JSON.stringify(spec.visualContract, null, 2)}`
    : "# VisualContract da SPEC\nNao informado; valide preservacao da identidade local pelo contexto visual quando disponivel.";

  const skill = appendRuntimeAgentSkills(
    loadAgentSkill("qa-frontend-testing"),
    promptContext?.runtimeSkills ?? []
  );
  const prompt = `Você é um QA engineer especializado em testes de interface web. Gere casos de teste detalhados para validação manual.

# Skill obrigatória do agente
${skill}
${reflectionBlock}
${executionBriefBlock}
${visualContractBlock}

${formatPromptContextForPrompt(promptContext)}

${formatDesignContextForPrompt(designContext)}

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
Inclua cobertura visual para visualContract quando existir: tokens, densidade, componentes existentes, responsividade, acessibilidade, estados e antiPatterns.
IDs devem ser TC-01, TC-02, etc.`;

  const model = createChatModel("qa", {
    temperature: 1,
  }, llmSettings).withStructuredOutput(QaOutputSchema);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return QaOutputSchema.parse(await invokeChatModel(model, prompt));
    } catch (err) {
      console.warn(`[QaAgent] Attempt ${attempt} failed to parse output:`, err);
      if (attempt === 2) {
        return buildFallbackQaOutput(spec, executionBrief);
      }
    }
  }

  return buildFallbackQaOutput(spec, executionBrief);
}
