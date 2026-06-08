import { z } from "zod";
import type {
  CodeChangeSet,
  DesignContextBundle,
  LlmSettings,
  PromptContextBundle,
  Spec,
} from "@u-build/shared";
import type { QaOutput } from "./QaAgentImpl.js";
import {
  appendRuntimeAgentSkills,
  loadAgentSkill,
} from "../agentSkills/loadAgentSkill.js";
import { createChatModel } from "../llm/createChatModel.js";
import { invokeChatModel } from "../llm/invokeChatModel.js";
import { formatDesignContextForPrompt } from "../design/DesignContextService.js";
import { formatDesignBriefForPrompt } from "../design/DesignBriefPrompt.js";
import { formatPromptContextForPrompt } from "../prompt/PromptContextAssembler.js";

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
  codeChangeSet: CodeChangeSet | undefined,
  llmSettings?: LlmSettings,
  executionBrief?: string,
  designContext?: DesignContextBundle,
  promptContext?: PromptContextBundle
): Promise<CuratorOutput> {
  if (!codeChangeSet) {
    return {
      passed: false,
      score: 0,
      notes:
        "Curador bloqueou a execução porque o Front Agent não produziu CodeChangeSet auditável.",
      missingItems: ["[front] CodeChangeSet ausente"],
      fixTarget: "front",
    };
  }

  if (qaOutput.testCases.length === 0) {
    return {
      passed: false,
      score: 0,
      notes:
        "Curador bloqueou a execução porque o QA Agent não produziu casos de teste estruturados.",
      missingItems: ["[qa] Casos de teste estruturados ausentes"],
      fixTarget: "qa",
    };
  }

  if (qaOutput.previewSmoke && qaOutput.previewSmoke.status !== "passed") {
    return {
      passed: false,
      score: 0,
      notes:
        "Curador bloqueou a execução porque o QA Agent não validou um preview real e alcançável.",
      missingItems: [
        `[qa] Preview smoke ${qaOutput.previewSmoke.status}: ${qaOutput.previewSmoke.reason}`,
      ],
      fixTarget: "qa",
    };
  }

  if (qaOutput.runtimeValidation?.status === "failed") {
    return {
      passed: false,
      score: 0,
      notes:
        "Curador bloqueou a execução porque a evidência runtime executável falhou.",
      missingItems: summarizeRuntimeEvidenceFailure(qaOutput.runtimeValidation),
      fixTarget: "front",
    };
  }

  const failedValidation = codeChangeSet.validation.find(
    (entry) => entry.status === "failed"
  );
  if (failedValidation) {
    const failedReason =
      codeChangeSet.failedReason ??
      failedValidation.stderr ??
      failedValidation.stdout ??
      "CodeChangeSet failed controlled validation.";
    return {
      passed: false,
      score: 0,
      notes:
        "Curador bloqueou a execução porque o CodeChangeSet falhou no quality gate antes de ser aplicado ao projeto.",
      missingItems: splitNonEmptyLines(failedReason),
      fixTarget: "front",
    };
  }

  const skill = appendRuntimeAgentSkills(
    loadAgentSkill("curator-quality-gate"),
    promptContext?.runtimeSkills ?? []
  );
  const prompt = buildCuratorPrompt(
    spec,
    html,
    qaOutput,
    codeChangeSet,
    skill,
    executionBrief,
    designContext,
    promptContext
  );

  const model = createChatModel("curator", {
    temperature: 1,
  }, llmSettings).withStructuredOutput(CuratorOutputSchema);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return CuratorOutputSchema.parse(await invokeChatModel(model, prompt));
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

function splitNonEmptyLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function buildCuratorPrompt(
  spec: Spec,
  html: string,
  qaOutput: QaOutput = { testCases: [] },
  codeChangeSet: CodeChangeSet | undefined,
  skill: string,
  executionBrief?: string,
  designContext?: DesignContextBundle,
  promptContext?: PromptContextBundle
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
  const previewSmokePreview = qaOutput.previewSmoke
    ? JSON.stringify(qaOutput.previewSmoke, null, 2)
    : "N/A";
  const runtimeEvidencePreview = qaOutput.runtimeValidation
    ? JSON.stringify(
        {
          id: qaOutput.runtimeValidation.id,
          status: qaOutput.runtimeValidation.status,
          skippedReason: qaOutput.runtimeValidation.skippedReason,
          commands: qaOutput.runtimeValidation.commands.map((command) => ({
            commandId: command.commandId,
            command: command.command,
            cwd: command.cwd,
            exitCode: command.exitCode,
            stdoutTail: command.stdoutTail,
            stderrTail: command.stderrTail,
            durationMs: command.durationMs,
          })),
          preview: qaOutput.runtimeValidation.preview,
        },
        null,
        2
      )
    : "N/A";
  const changeSetPreview = codeChangeSet
    ? JSON.stringify(
        {
          id: codeChangeSet.id,
          status: codeChangeSet.status,
          operations: codeChangeSet.operations.map((operation) => ({
            targetPath: operation.targetPath,
            changeType: operation.changeType,
            diff: operation.diff,
          })),
          validation: codeChangeSet.validation,
        },
        null,
        2
      )
    : "N/A";
  const executionBriefBlock = executionBrief
    ? `
# Pedido de alteração vindo do chat do Horus
${executionBrief}

Além da spec ativa, avalie se o HTML e os testes respondem especificamente a esse pedido.
`
    : "";
  const visualContractPreview = spec.visualContract
    ? JSON.stringify(spec.visualContract, null, 2)
    : "N/A";
  const designBriefBlock = formatDesignBriefForPrompt(spec);
  const deliveryMode =
    spec.visualContract?.mode === "blank_project"
      ? "blank_project_standalone_html"
      : "project_integrated_code_change";

  return `Você é um curador de qualidade de software. Analise o HTML gerado e os casos de teste de QA. Verifique se ambos atendem à especificação técnica completa.

# Skill obrigatória do agente
${skill}
${executionBriefBlock}

${formatPromptContextForPrompt(promptContext)}

${formatDesignContextForPrompt(designContext)}

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

**VisualContract:**
\`\`\`json
${visualContractPreview}
\`\`\`

${designBriefBlock}

**Modo de entrega esperado:**
${deliveryMode}

# HTML Gerado
\`\`\`html
${htmlPreview}
\`\`\`

# Casos de Teste Gerados Pelo QA
\`\`\`json
${qaPreview}
\`\`\`

# Validação Smoke do Preview Pelo QA
\`\`\`json
${previewSmokePreview}
\`\`\`

# Evidência Runtime Executável
\`\`\`json
${runtimeEvidencePreview}
\`\`\`

# CodeChangeSet Produzido Pelo Front Agent
\`\`\`json
${changeSetPreview}
\`\`\`

## Instruções de Avaliação
- score: 0–100 indicando cobertura combinada da spec pelo HTML e pelos testes
- passed: true se score >= 70, houver CodeChangeSet auditável, houver casos de QA e não houver lacuna crítica no HTML nem nos testes
- notes: resumo objetivo da avaliação em 1–2 frases
- missingItems: lista dos itens da spec ausentes, incompletos ou sem cobertura de teste (array vazio se passou). Use prefixos curtos quando possível: [front], [front:pattern], [front:component], [front:visual], [front:copy], [qa], [data], [route], [accessibility], [responsive]
- fixTarget: se falhou, indique qual agente deve corrigir:
  - "front" → problema visual/estrutural no HTML/CSS/JS
  - "qa" → HTML adequado, mas testes ausentes, fracos ou desalinhados aos critérios de aceite
  - "both" → HTML e testes precisam ser refeitos

## Regras adicionais
- Se o modo de entrega for "project_integrated_code_change" e apiEndpoints existir, avalie se o frontend usa boundary/adapters injetáveis e compatíveis sem assumir backend inexistente nem mock/fake em runtime aplicado.
- Se o modo de entrega for "blank_project_standalone_html", avalie como protótipo navegável standalone: pode usar dados locais e camada adaptadora em memória para demonstrar estados, validações e fluxo futuro de API, desde que o HTML explicite os contratos e não finja integração real com backend inexistente.
- Se o modo for "project_integrated_code_change" e o CodeChangeSet usar mock/fake adapter, Math.random ou arquivo solto não alcançável pelo entrypoint do app, passed deve ser false.
- A regra de arquivo solto não alcançável pelo entrypoint só se aplica ao modo "project_integrated_code_change"; em "blank_project_standalone_html", arquivos em generated/horus são o artefato esperado.
- Se dataModels existir, avalie se campos, formatação e fallbacks aparecem no HTML e nos testes.
- Se a abordagem técnica define loading, empty, error, success, acessibilidade ou responsividade, avalie tanto implementação quanto cobertura de QA.
- Se visualContract existir, avalie tokens, densidade, componentes existentes, estados, responsividade, acessibilidade e antiPatterns. Violacao clara do contrato visual deve falhar.
- Se designBrief existir, avalie se a UI respeita surfaceType, userIntent, informationArchitecture, componentInventory, stateMatrix, designSystemBinding e visualStrategy. Violacao clara deve falhar com [front:pattern], [front:component], [front:visual], [front:copy] ou [qa], conforme a origem.
- Se a spec/technicalApproach/visualContract indicar um frontend pattern, avalie se HTML e CodeChangeSet respeitam a hierarquia, estados, component-policy e anti-patterns desse pattern. Violacao clara deve falhar com [front:pattern], [front:component] ou [front:visual].
- Se a UI renderizada expuser metadados SDD/workflow como copy de produto, como ids US01/US02, "User Story", "Spec", "Critérios de aceite", "Pattern", "visualContract", "Project OS", "Horus", "fallback" ou termos de agente, passed deve ser false com [front:copy], salvo quando esse texto fizer parte do domínio real do produto.
- Se visualContract.colorPolicy tiver usageRules ou se o projeto estiver em blank_project, avalie se a paleta tem papeis claros de background, surface, text, accent, semantic/status e category/utility quando aplicavel; paleta arbitraria, monocromatica sem hierarquia ou dark dashboard generico deve falhar com [front:visual].
- Falhe layouts genericos quando a spec pede ferramenta operacional, workbench de chat/preview, mapa de workflow ou CRUD; pattern errado e visivel nao e preferencia subjetiva.
- Se CodeChangeSet estiver ausente, vazio, sem diff ou sem operação de arquivo, passed deve ser false.
- Se a validação smoke do preview existir e status não for "passed", passed deve ser false.
- Se a evidência runtime executável existir e status for "failed", passed deve ser false.
- Se a evidência runtime estiver skipped, não invente execução; avalie o risco explicitamente nas notes.
- Não trate HTML textual isolado como construção suficiente; ele precisa estar vinculado ao CodeChangeSet.`;
}

function summarizeRuntimeEvidenceFailure(
  evidence: NonNullable<QaOutput["runtimeValidation"]>
): string[] {
  const failedCommands = evidence.commands
    .filter((command) => command.exitCode !== 0)
    .map((command) => {
      const detail = command.stderrTail || command.stdoutTail || "Command failed.";
      return `[runtime] ${command.commandId} failed with exit ${String(command.exitCode)}: ${detail}`;
    });
  const previewFailure =
    evidence.preview.status === "failed"
      ? [`[runtime] Preview smoke failed: ${evidence.preview.message}`]
      : [];
  return [...failedCommands, ...previewFailure].length > 0
    ? [...failedCommands, ...previewFailure]
    : ["[runtime] Runtime validation failed without detailed evidence."];
}
