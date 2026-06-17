/**
 * Runner genérico de avaliação do Spec Agent.
 * Recebe um array de EvalUserStory e um nome de bloco; gera specs, calcula
 * M1-M3 automaticamente e salva resultados em JSON para revisão manual de M4/M5.
 */

import { fileURLToPath } from "url";
import { resolve, join, dirname } from "path";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

import { writeFileSync } from "fs";
import { loadAgentSkill } from "../infrastructure/agentSkills/loadAgentSkill.js";
import {
  type EvalUserStory,
  gerarSpec,
  extractPattern,
  avaliarArtifactCompleteness,
} from "./eval-spec-common.js";

export async function runSpecEvalBlock(
  blockName: string,
  userStories: EvalUserStory[],
  outputFileName: string
) {
  const skill = loadAgentSkill("spec-frontend-sdd");
  const results: any[] = [];

  console.log("=".repeat(60));
  console.log(`AVALIAÇÃO DO SPEC AGENT — ${blockName} (${userStories.length} USs)`);
  console.log(`Modelo: ${process.env.LLM_MODEL ?? "default"} / Provider: ${process.env.LLM_PROVIDER}`);
  console.log("=".repeat(60));

  for (const us of userStories) {
    console.log(`\n► Rodando US: "${us.title}" [gabarito: ${us.patternGabarito}, complexidade: ${us.complexidade}]`);
    const resultado: any = {
      us_title: us.title,
      us_id: us.id,
      complexidade: us.complexidade,
      pattern_gabarito: us.patternGabarito,
      m1_schema_pass: false,
      m1_erro: null,
      m2_pattern_extraido: null,
      m2_pattern_correto: false,
      m3_completeness_score: 0,
      m3_itens: {},
      spec_raw: null,
      spec_summary: null,
      spec_technicalApproach: null,
      spec_components: null,
      spec_acceptanceCriteria: null,
      spec_apiEndpoints: null,
      spec_dataModels: null,
    };

    try {
      const spec = (await gerarSpec(us, skill)) as any;

      resultado.m1_schema_pass = true;

      const patternExtraido = extractPattern(
        spec.technicalApproach,
        spec.visualContract?.layoutArchetype
      );
      resultado.m2_pattern_extraido = patternExtraido;
      resultado.m2_pattern_correto = patternExtraido === us.patternGabarito;

      const { score, itens } = avaliarArtifactCompleteness(spec);
      resultado.m3_completeness_score = score;
      resultado.m3_itens = itens;

      resultado.spec_summary = spec.summary;
      resultado.spec_technicalApproach = spec.technicalApproach;
      resultado.spec_components = spec.components;
      resultado.spec_acceptanceCriteria = spec.acceptanceCriteria;
      resultado.spec_apiEndpoints = spec.apiEndpoints;
      resultado.spec_dataModels = spec.dataModels;
      resultado.spec_raw = spec;

      console.log(`  M1 Schema:       ✓ passou`);
      console.log(
        `  M2 Pattern:      extraído="${patternExtraido}" → ${
          resultado.m2_pattern_correto ? "✓ correto" : "✗ ERRADO (gabarito: " + us.patternGabarito + ")"
        }`
      );
      console.log(`  M3 Completeness: ${score}/6`);
    } catch (err: any) {
      resultado.m1_schema_pass = false;
      resultado.m1_erro = err?.message ?? String(err);
      console.log(`  M1 Schema:       ✗ FALHOU — ${resultado.m1_erro.slice(0, 150)}`);
    }

    results.push(resultado);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMÁRIO AUTOMÁTICO");
  console.log("=".repeat(60));

  const total = results.length;
  const m1Pass = results.filter((r) => r.m1_schema_pass).length;
  const m2Pass = results.filter((r) => r.m2_pattern_correto).length;
  const m3Scores = results.filter((r) => r.m1_schema_pass).map((r) => r.m3_completeness_score);
  const m3Media = m3Scores.length
    ? (m3Scores.reduce((a: number, b: number) => a + b, 0) / m3Scores.length).toFixed(2)
    : "N/A";

  console.log(`M1 Schema Pass Rate:      ${m1Pass}/${total} (${((m1Pass / total) * 100).toFixed(0)}%)  — threshold ≥95%`);
  console.log(`M2 Pattern Accuracy:      ${m2Pass}/${total} (${((m2Pass / total) * 100).toFixed(0)}%)  — threshold ≥90%`);
  console.log(`M3 Completeness (média):  ${m3Media}/6        — threshold ≥5.1/6 (85%)`);
  console.log(`\nM4/M5: dados brutos salvos para revisão manual.`);

  console.log("\nDetalhes por US:");
  console.log("-".repeat(120));
  console.log(
    "US".padEnd(46) + "Complex.".padEnd(10) + "Gabarito".padEnd(24) + "Extraído".padEnd(24) + "M2".padEnd(6) + "M3"
  );
  console.log("-".repeat(120));
  for (const r of results) {
    console.log(
      r.us_title.substring(0, 45).padEnd(46) +
        r.complexidade.padEnd(10) +
        r.pattern_gabarito.padEnd(24) +
        (r.m2_pattern_extraido ?? "null").padEnd(24) +
        (r.m2_pattern_correto ? "✓" : "✗").padEnd(6) +
        (r.m1_schema_pass ? `${r.m3_completeness_score}/6` : "N/A")
    );
  }

  const outputPath = join(__dirname, "results", outputFileName);
  writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nResultados completos salvos em: ${outputPath}`);

  return results;
}
