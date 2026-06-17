/**
 * Avaliação do QA Agent — Bloco 1: 12 specs reaproveitados do Bloco 2 do Spec Agent
 * (6 patterns × baixa/alta complexidade).
 *
 * Métricas automáticas:
 *   M1 — Criterion Coverage Rate: % de acceptanceCriteria com >=1 testCase associado.
 *   M5 — Backend Assumption Violation Rate: % de TCs ligados a apiEndpoints que
 *        assumem resposta real de rede sem mencionar mock/adapter.
 *
 * Métricas para revisão manual (dados brutos salvos em JSON):
 *   M2 — Step Reproducibility Score
 *   M3 — Expected Result Specificity Score
 *   M4 — Coverage Dimension Matrix
 *   M6 — Curator [qa]-flag Rate (requer rodar Curator — fora deste script)
 */

import { fileURLToPath } from "url";
import { resolve, join, dirname } from "path";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

import { readFileSync, writeFileSync } from "fs";
import type { Spec, UserStory } from "@u-build/shared";
import { gerarQaOutput } from "./eval-qa-common.js";

type SpecResultEntry = {
  us_title: string;
  us_id: string;
  complexidade: string;
  pattern_gabarito: string;
  m1_schema_pass: boolean;
  spec_raw: Spec | null;
};

// Frases que indicam assunção indevida de backend real (sem qualificação de mock/adapter)
const BACKEND_REAL_PHRASES = [
  /retorna\s+(?:200|201|sucesso|dados\s+do\s+servidor)/i,
  /chamada\s+real\s+(?:ao|à|para)\s+(?:api|servidor|backend)/i,
  /o\s+servidor\s+responde/i,
  /a\s+api\s+retorna(?!.*mock)(?!.*adapter)/i,
  /verificar\s+que\s+(?:o\s+)?backend\s+(?:está|esta)\s+(?:disponível|disponivel|funcionando)/i,
];
const MOCK_QUALIFIER_PHRASES = /mock|adapter|simulad|stub|fake\s+data|dados\s+simulados/i;

function checkBackendAssumptionViolation(tc: { steps: string[]; expected: string }): boolean {
  const fullText = [...tc.steps, tc.expected].join(" ");
  const hasRealBackendClaim = BACKEND_REAL_PHRASES.some((re) => re.test(fullText));
  const hasMockQualifier = MOCK_QUALIFIER_PHRASES.test(fullText);
  return hasRealBackendClaim && !hasMockQualifier;
}

function checkCriterionCoverage(spec: Spec, testCases: { criterion: string }[]): {
  coverage: number;
  details: { criterion: string; covered: boolean; matchedTcCriteria: string[] }[];
} {
  const details = spec.acceptanceCriteria.map((criterion) => {
    const normalizedCriterion = criterion.toLowerCase();
    const criterionTokens = new Set(normalizedCriterion.split(/\W+/).filter((t) => t.length > 3));
    const matched = testCases.filter((tc) => {
      const tcTokens = new Set(tc.criterion.toLowerCase().split(/\W+/).filter((t) => t.length > 3));
      const intersection = [...criterionTokens].filter((t) => tcTokens.has(t));
      const jaccard = intersection.length / Math.max(1, new Set([...criterionTokens, ...tcTokens]).size);
      return jaccard >= 0.25 || tc.criterion.toLowerCase().includes(normalizedCriterion.slice(0, 20));
    });
    return {
      criterion,
      covered: matched.length > 0,
      matchedTcCriteria: matched.map((m) => m.criterion),
    };
  });
  const coverage = details.filter((d) => d.covered).length / Math.max(1, details.length);
  return { coverage, details };
}

async function main() {
  const specsPath = join(__dirname, "results", "eval-spec-bloco2-results.json");
  const specEntries: SpecResultEntry[] = JSON.parse(readFileSync(specsPath, "utf-8"));
  const validSpecs = specEntries.filter((e) => e.m1_schema_pass && e.spec_raw);

  console.log("=".repeat(60));
  console.log(`AVALIAÇÃO DO QA AGENT — Bloco 1 (${validSpecs.length} specs reaproveitados)`);
  console.log(`Modelo: ${process.env.LLM_MODEL ?? "default"} / Provider: ${process.env.LLM_PROVIDER}`);
  console.log("=".repeat(60));

  const results: any[] = [];

  for (const entry of validSpecs) {
    const spec = entry.spec_raw as Spec;
    const userStory: UserStory = {
      id: entry.us_id,
      title: entry.us_title,
      description: entry.us_title,
      acceptanceCriteria: spec.acceptanceCriteria,
      priority: "medium",
      labels: [],
      createdAt: new Date().toISOString(),
    };

    console.log(`\n► Rodando QA para: "${entry.us_title}" [${entry.complexidade}, pattern: ${entry.pattern_gabarito}]`);

    const resultado: any = {
      us_title: entry.us_title,
      complexidade: entry.complexidade,
      pattern_gabarito: entry.pattern_gabarito,
      spec_acceptance_criteria: spec.acceptanceCriteria,
      spec_has_api_endpoints: spec.apiEndpoints.length > 0,
      spec_has_data_models: spec.dataModels.length > 0,
      spec_has_visual_contract: !!spec.visualContract,
      m1_schema_pass: false,
      m1_erro: null,
      qa_test_cases: null,
      m1_criterion_coverage: null,
      m1_criterion_details: null,
      m5_backend_violations: null,
      m5_violation_count: 0,
      m5_total_api_related_tcs: 0,
    };

    try {
      const qaOutput = await gerarQaOutput(userStory, spec);
      resultado.m1_schema_pass = true;
      resultado.qa_test_cases = qaOutput.testCases;

      const { coverage, details } = checkCriterionCoverage(spec, qaOutput.testCases);
      resultado.m1_criterion_coverage = coverage;
      resultado.m1_criterion_details = details;

      const apiRelatedTcs = qaOutput.testCases.filter((tc) => {
        const text = [...tc.steps, tc.expected, tc.criterion].join(" ").toLowerCase();
        return spec.apiEndpoints.some((ep) => text.includes(ep.path.toLowerCase().replace(/[{}:]/g, "")));
      });
      const violations = apiRelatedTcs.filter(checkBackendAssumptionViolation);
      resultado.m5_backend_violations = violations.map((v) => v.id);
      resultado.m5_violation_count = violations.length;
      resultado.m5_total_api_related_tcs = apiRelatedTcs.length;

      console.log(`  M1 Geração:        ✓ passou (${qaOutput.testCases.length} test cases)`);
      console.log(`  M1 Criterion Cov.: ${(coverage * 100).toFixed(0)}% (${details.filter((d) => d.covered).length}/${details.length})`);
      console.log(`  M5 Backend Viol.:  ${violations.length}/${apiRelatedTcs.length} TCs relacionados a API`);
    } catch (err: any) {
      resultado.m1_schema_pass = false;
      resultado.m1_erro = err?.message ?? String(err);
      console.log(`  M1 Geração:        ✗ FALHOU — ${resultado.m1_erro.slice(0, 150)}`);
    }

    results.push(resultado);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMÁRIO AUTOMÁTICO");
  console.log("=".repeat(60));

  const total = results.length;
  const genPass = results.filter((r) => r.m1_schema_pass).length;
  const coverages = results.filter((r) => r.m1_schema_pass).map((r) => r.m1_criterion_coverage);
  const avgCoverage = coverages.length ? coverages.reduce((a, b) => a + b, 0) / coverages.length : 0;
  const totalApiTcs = results.reduce((a, r) => a + (r.m5_total_api_related_tcs || 0), 0);
  const totalViolations = results.reduce((a, r) => a + (r.m5_violation_count || 0), 0);

  console.log(`Geração bem-sucedida:     ${genPass}/${total} (${((genPass / total) * 100).toFixed(0)}%)`);
  console.log(`M1 Criterion Coverage:    ${(avgCoverage * 100).toFixed(1)}%  — threshold =100%`);
  console.log(`M5 Backend Assumption:    ${totalViolations}/${totalApiTcs} TCs com violação  — threshold =0%`);
  console.log(`\nM2/M3/M4/M6: dados brutos salvos para revisão manual.`);

  console.log("\nDetalhes por spec:");
  console.log("-".repeat(110));
  console.log("US".padEnd(46) + "Complex.".padEnd(10) + "Pattern".padEnd(24) + "TCs".padEnd(6) + "Coverage".padEnd(10) + "M5 Viol.");
  console.log("-".repeat(110));
  for (const r of results) {
    console.log(
      r.us_title.substring(0, 45).padEnd(46) +
        r.complexidade.padEnd(10) +
        r.pattern_gabarito.padEnd(24) +
        String(r.qa_test_cases?.length ?? "N/A").padEnd(6) +
        (r.m1_schema_pass ? `${(r.m1_criterion_coverage * 100).toFixed(0)}%` : "N/A").padEnd(10) +
        `${r.m5_violation_count}/${r.m5_total_api_related_tcs}`
    );
  }

  const outputPath = join(__dirname, "results", "eval-qa-bloco1-results.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nResultados completos salvos em: ${outputPath}`);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
