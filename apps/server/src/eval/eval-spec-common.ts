/**
 * Funções e tipos compartilhados pelos blocos de avaliação do Spec Agent.
 */

import { v4 as uuidv4 } from "uuid";
import { SpecSchema, type UserStory } from "@u-build/shared";
import { buildSpecPrompt } from "../infrastructure/agents/SpecAgentImpl.js";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage } from "@langchain/core/messages";

export type EvalUserStory = UserStory & {
  patternGabarito: string;
  complexidade: string;
};

export const VALID_PATTERNS = [
  "operational-dashboard",
  "chat-preview-workbench",
  "workflow-map",
  "form-crud-tool",
  "content-landing",
  "custom-product-surface",
];

// O LLama 3.3 no Groq omite campos obrigatórios quando usado com structured output estrito
// (withStructuredOutput). Usamos JSON mode livre + normalização antes do SpecSchema.parse().
export function normalizeCandidate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const c = raw as Record<string, unknown>;

  if (Array.isArray(c["components"])) {
    c["components"] = (c["components"] as any[]).slice(0, 6).map((comp) => ({
      name: comp.name ?? "",
      type: comp.type ?? "ui",
      description: comp.description ?? comp.name ?? "",
      dependencies: Array.isArray(comp.dependencies) ? comp.dependencies : [],
    }));
  }

  if (Array.isArray(c["dataModels"])) {
    c["dataModels"] = (c["dataModels"] as any[]).slice(0, 5).map((m) =>
      typeof m === "string" ? m : (m.name ?? JSON.stringify(m))
    );
  }

  if (Array.isArray(c["apiEndpoints"])) {
    c["apiEndpoints"] = (c["apiEndpoints"] as any[]).slice(0, 5).map((ep) => {
      if (typeof ep === "string") {
        const path = ep.startsWith("/") ? ep : `/${ep}`;
        return { method: "GET", path, description: `Endpoint ${path}` };
      }
      const path = String(ep.path ?? "/api/resource");
      return {
        method: ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(ep.method) ? ep.method : "GET",
        path: path.startsWith("/") ? path : `/${path}`,
        description: ep.description ?? ep.name ?? `Endpoint ${path}`,
        requestSchema: ep.requestSchema,
        responseSchema: ep.responseSchema,
      };
    });
  }

  if (Array.isArray(c["acceptanceCriteria"])) {
    c["acceptanceCriteria"] = (c["acceptanceCriteria"] as any[]).slice(0, 8);
  }

  if (c["visualContract"] && typeof c["visualContract"] === "object") {
    const vc = c["visualContract"] as Record<string, unknown>;
    for (const key of ["responsividade", "acessibilidade", "tokens"]) {
      delete vc[key];
    }
    if (!vc["tone"] || vc["tone"] === "") vc["tone"] = "professional";
    if (!vc["density"]) vc["density"] = "balanced";
    if (!vc["mode"]) vc["mode"] = "blank_project";
    if (!vc["designSource"]) vc["designSource"] = "generated_default";
    if (!vc["layoutArchetype"]) vc["layoutArchetype"] = "";
    if (!Array.isArray(vc["referenceFiles"])) vc["referenceFiles"] = [];
    const validStates = ["default", "loading", "empty", "error", "success", "selected", "focus", "disabled"];
    vc["states"] = Array.isArray(vc["states"])
      ? (vc["states"] as string[]).filter((s) => validStates.includes(s))
      : [];
    if (!Array.isArray(vc["accessibilityRules"])) vc["accessibilityRules"] = [];
    if (!Array.isArray(vc["antiPatterns"])) vc["antiPatterns"] = [];
    if (!vc["componentPolicy"] || typeof vc["componentPolicy"] !== "object") {
      vc["componentPolicy"] = { requiredPatterns: [], forbiddenPatterns: [] };
    }
    const cp = vc["componentPolicy"] as Record<string, unknown>;
    if (!Array.isArray(cp["requiredPatterns"])) cp["requiredPatterns"] = [];
    if (!Array.isArray(cp["forbiddenPatterns"])) cp["forbiddenPatterns"] = [];
  }

  return c;
}

export async function gerarSpec(us: EvalUserStory, skill: string): Promise<unknown> {
  const prompt = buildSpecPrompt(us, skill);

  const model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY!,
    model: process.env.LLM_MODEL ?? "llama-3.3-70b-versatile",
  });

  const fullPrompt = `${prompt}

IMPORTANT: Respond ONLY with a valid JSON object matching the spec schema. No markdown fences, no explanation, no extra text. Start your response with { and end with }.`;

  const response = await model.invoke([new HumanMessage(fullPrompt)]);
  const text = typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Resposta não contém JSON válido: ${text.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]);
  const normalized = normalizeCandidate(parsed);
  return SpecSchema.parse({
    ...(normalized as object),
    id: uuidv4(),
    userStoryId: us.id,
    version: 1,
    generatedAt: new Date().toISOString(),
  });
}

export function extractPattern(technicalApproach: string, layoutArchetype?: string): string | null {
  const match = technicalApproach.match(/Pattern:\s*([a-z-]+)/i);
  const matchedId = match?.[1]?.toLowerCase();
  if (matchedId && VALID_PATTERNS.includes(matchedId)) return matchedId;
  if (layoutArchetype) {
    for (const p of VALID_PATTERNS) {
      if (layoutArchetype.toLowerCase().includes(p)) return p;
    }
  }
  return null;
}

export function avaliarArtifactCompleteness(spec: any): {
  score: number;
  itens: Record<string, boolean>;
} {
  const itens: Record<string, boolean> = {};

  itens["components_count_2_6"] =
    Array.isArray(spec.components) &&
    spec.components.length >= 2 &&
    spec.components.length <= 6;

  itens["has_ui_component"] =
    Array.isArray(spec.components) &&
    spec.components.some((c: any) => c.type === "ui");

  itens["acceptance_criteria_1_8"] =
    Array.isArray(spec.acceptanceCriteria) &&
    spec.acceptanceCriteria.length >= 1 &&
    spec.acceptanceCriteria.length <= 8;

  itens["visual_contract_with_patterns"] =
    !!spec.visualContract &&
    ((Array.isArray(spec.visualContract?.componentPolicy?.requiredPatterns) &&
      spec.visualContract.componentPolicy.requiredPatterns.length > 0) ||
      (Array.isArray(spec.visualContract?.componentPolicy?.forbiddenPatterns) &&
        spec.visualContract.componentPolicy.forbiddenPatterns.length > 0));

  const temDadosDinamicos =
    Array.isArray(spec.apiEndpoints) && spec.apiEndpoints.length > 0;
  if (temDadosDinamicos) {
    const statesStr = JSON.stringify(spec.visualContract?.states ?? {}).toLowerCase();
    itens["states_loading_empty_error_quando_dinamico"] =
      statesStr.includes("loading") &&
      (statesStr.includes("empty") || statesStr.includes("vazio")) &&
      statesStr.includes("error");
  } else {
    itens["states_loading_empty_error_quando_dinamico"] = true;
  }

  if (temDadosDinamicos) {
    const dataModelsStr = JSON.stringify(spec.dataModels ?? []).toLowerCase();
    const componentsStr = JSON.stringify(spec.components ?? []).toLowerCase();
    itens["apiEndpoint_tem_dataModel_ou_componente"] = (spec.apiEndpoints as any[]).every(
      (ep: any) => {
        const resource = ep.path?.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
        return (
          dataModelsStr.includes(resource) ||
          componentsStr.includes(resource) ||
          (Array.isArray(spec.dataModels) && spec.dataModels.length > 0)
        );
      }
    );
  } else {
    itens["apiEndpoint_tem_dataModel_ou_componente"] = true;
  }

  return { score: Object.values(itens).filter(Boolean).length, itens };
}
