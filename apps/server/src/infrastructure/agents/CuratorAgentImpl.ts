import { z } from "zod";
import type { CodeChangeSet, LlmSettings, Spec } from "@u-build/shared";
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
  codeChangeSet: CodeChangeSet | undefined,
  llmSettings?: LlmSettings,
  executionBrief?: string
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

  const skill = loadAgentSkill("curator-quality-gate");
  const prompt = buildCuratorPrompt(
    spec,
    html,
    qaOutput,
    codeChangeSet,
    skill,
    executionBrief
  );

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
- missingItems: lista dos itens da spec ausentes, incompletos ou sem cobertura de teste (array vazio se passou). Use prefixos curtos quando possível: [front], [qa], [data], [route], [accessibility], [responsive]
- fixTarget: se falhou, indique qual agente deve corrigir:
  - "front" → problema visual/estrutural no HTML/CSS/JS
  - "qa" → HTML adequado, mas testes ausentes, fracos ou desalinhados aos critérios de aceite
  - "both" → HTML e testes precisam ser refeitos

## Regras adicionais
- Se apiEndpoints existir, avalie se o frontend usa boundary/adapters injetáveis e compatíveis sem assumir backend inexistente nem mock/fake em runtime aplicado.
- Se o CodeChangeSet usar mock/fake adapter, Math.random ou arquivo solto não alcançável pelo entrypoint do app, passed deve ser false.
- Se dataModels existir, avalie se campos, formatação e fallbacks aparecem no HTML e nos testes.
- Se a abordagem técnica define loading, empty, error, success, acessibilidade ou responsividade, avalie tanto implementação quanto cobertura de QA.
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
