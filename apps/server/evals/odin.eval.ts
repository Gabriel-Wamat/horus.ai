/**
 * Odin Agent Eval Harness
 *
 * Runs decideRouting from OdinAgentImpl directly against fixture scenarios and
 * reports whether the agent makes correct routing decisions across four metrics.
 *
 * Metrics:
 *   M1 – Routing Decision Accuracy   : returned agent set exactly matches expected
 *   M2 – FixTarget Fidelity Rate     : curator fixTarget correctly narrows routing on retry
 *   M3 – Initial Routing Plausibility: spec-driven routing without curator feedback
 *   M4 – Telemetry Completeness      : result is a non-empty array of known agent names
 *
 * Usage (from apps/server/):
 *   tsx evals/odin.eval.ts              # all scenarios (fully deterministic — no LLM cost)
 *   tsx evals/odin.eval.ts --filter m2  # run only scenarios whose name contains "m2"
 *
 * Add to package.json:
 *   "eval:odin": "tsx evals/odin.eval.ts"
 */

import "dotenv/config";
import { decideRouting } from "../src/infrastructure/agents/OdinAgentImpl.js";
import type { Spec } from "@u-build/shared";
import type { CuratorFeedback } from "../src/infrastructure/langgraph/state.js";

// ─── CLI Flags ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const FILTER = argv.find((a) => !a.startsWith("--")) ?? "";

// ─── Known Agents ────────────────────────────────────────────────────────────

const KNOWN_AGENTS = new Set(["frontAgent", "qaAgent"]);

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScenarioExpect {
  agents: string[];
}

interface EvalScenario {
  name: string;
  tags: string[];
  spec: Spec;
  curatorFeedback?: CuratorFeedback;
  expect: ScenarioExpect;
}

interface ScenarioResult {
  name: string;
  tags: string[];
  verdict: "PASS" | "FAIL";
  m1_routingAccuracy: boolean;
  m4_telemetryComplete: boolean;
  actual: string[];
  expected: string[];
  latencyMs: number;
  error?: string;
}

// ─── Fixture Factories ───────────────────────────────────────────────────────

const ID1 = "aaaaaaaa-0000-4000-8000-000000000001";
const ID2 = "aaaaaaaa-0000-4000-8000-000000000002";
const NOW = new Date().toISOString();

function makeSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    id: ID1,
    userStoryId: ID2,
    version: 1,
    summary: "Login form with email and password fields",
    technicalApproach:
      "Standalone HTML page with inline JavaScript form validation.",
    components: [
      {
        name: "LoginForm",
        type: "ui",
        description: "Form with email input, password input, and submit button",
        dependencies: [],
      },
    ],
    apiEndpoints: [],
    dataModels: [],
    acceptanceCriteria: ["User can submit valid credentials"],
    generatedAt: NOW,
    ...overrides,
  };
}

function makeFeedback(
  fixTarget: CuratorFeedback["fixTarget"],
  passed = false
): CuratorFeedback {
  return {
    passed,
    score: passed ? 90 : 20,
    notes: passed ? "Looks great" : `Fix required: ${fixTarget}`,
    missingItems: passed ? [] : ["Missing required functionality"],
    fixTarget,
  };
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

const SCENARIOS: EvalScenario[] = [
  // ── M2 – FixTarget Fidelity Rate ─────────────────────────────────────────
  {
    name: "m2: fixTarget-front-routes-only-front",
    tags: ["m2", "reflection"],
    spec: makeSpec(),
    curatorFeedback: makeFeedback("front"),
    expect: { agents: ["frontAgent"] },
  },
  {
    name: "m2: fixTarget-qa-routes-only-qa",
    tags: ["m2", "reflection"],
    spec: makeSpec(),
    curatorFeedback: makeFeedback("qa"),
    expect: { agents: ["qaAgent"] },
  },
  {
    name: "m2: fixTarget-both-routes-front-and-qa",
    tags: ["m2", "reflection"],
    spec: makeSpec(),
    curatorFeedback: makeFeedback("both"),
    expect: { agents: ["frontAgent", "qaAgent"] },
  },
  {
    name: "m2: passed-true-bypasses-reflection-falls-to-initial",
    tags: ["m2", "m3", "reflection"],
    spec: makeSpec({
      components: [
        {
          name: "LoginForm",
          type: "ui",
          description: "Login UI",
          dependencies: [],
        },
      ],
    }),
    curatorFeedback: makeFeedback("front", /* passed= */ true),
    expect: { agents: ["frontAgent", "qaAgent"] },
  },

  // ── M3 – Initial Routing Plausibility ────────────────────────────────────
  {
    name: "m3: ui-component-routes-front-and-qa",
    tags: ["m3", "initial"],
    spec: makeSpec({
      components: [
        {
          name: "Dashboard",
          type: "ui",
          description: "Main dashboard view",
          dependencies: [],
        },
      ],
      apiEndpoints: [],
    }),
    expect: { agents: ["frontAgent", "qaAgent"] },
  },
  {
    name: "m3: utility-component-routes-front-and-qa",
    tags: ["m3", "initial"],
    spec: makeSpec({
      components: [
        {
          name: "DateHelper",
          type: "utility",
          description: "Date formatting utilities",
          dependencies: [],
        },
      ],
      apiEndpoints: [],
    }),
    expect: { agents: ["frontAgent", "qaAgent"] },
  },
  {
    name: "m3: service-component-with-api-routes-qa-only",
    tags: ["m3", "initial"],
    spec: makeSpec({
      components: [
        {
          name: "AuthService",
          type: "service",
          description: "Authentication service logic",
          dependencies: [],
        },
      ],
      apiEndpoints: [
        {
          method: "POST",
          path: "/api/auth/login",
          description: "Authenticate user and return session token",
        },
      ],
    }),
    expect: { agents: ["qaAgent"] },
  },
  {
    name: "m3: service-component-no-api-routes-front-and-qa",
    tags: ["m3", "initial"],
    spec: makeSpec({
      components: [
        {
          name: "StateManager",
          type: "service",
          description: "Client-side state management",
          dependencies: [],
        },
      ],
      apiEndpoints: [],
    }),
    expect: { agents: ["frontAgent", "qaAgent"] },
  },
  {
    name: "m3: model-component-with-api-routes-qa-only",
    tags: ["m3", "initial"],
    spec: makeSpec({
      components: [
        {
          name: "UserModel",
          type: "model",
          description: "User data model and schema",
          dependencies: [],
        },
      ],
      apiEndpoints: [
        {
          method: "GET",
          path: "/api/users",
          description: "List all users",
        },
      ],
    }),
    expect: { agents: ["qaAgent"] },
  },
  {
    name: "m3: mixed-ui-and-service-with-api-routes-front-and-qa",
    tags: ["m3", "initial"],
    spec: makeSpec({
      components: [
        {
          name: "UserTable",
          type: "ui",
          description: "Displays paginated user list",
          dependencies: [],
        },
        {
          name: "UserService",
          type: "service",
          description: "Fetches and caches user data",
          dependencies: [],
        },
      ],
      apiEndpoints: [
        {
          method: "GET",
          path: "/api/users",
          description: "List users",
        },
      ],
    }),
    expect: { agents: ["frontAgent", "qaAgent"] },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function agentSetEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
}

function telemetryComplete(agents: string[]): boolean {
  return agents.length > 0 && agents.every((a) => KNOWN_AGENTS.has(a));
}

// ─── Runner ──────────────────────────────────────────────────────────────────

function runScenario(scenario: EvalScenario): ScenarioResult {
  console.log(`\n${"─".repeat(60)}`);
  console.log(
    `[eval] cenário: ${scenario.name}  tags=[${scenario.tags.join(", ")}]`
  );
  console.log(`[eval] entradas:`);
  console.log(
    `  spec.components   : ${scenario.spec.components
      .map((c) => `${c.name}(${c.type})`)
      .join(", ")}`
  );
  console.log(
    `  spec.apiEndpoints : ${
      scenario.spec.apiEndpoints.length === 0
        ? "nenhum"
        : scenario.spec.apiEndpoints
            .map((e) => `${e.method} ${e.path}`)
            .join(", ")
    }`
  );
  if (scenario.curatorFeedback) {
    console.log(
      `  curatorFeedback   : passed=${scenario.curatorFeedback.passed}  fixTarget=${scenario.curatorFeedback.fixTarget}  score=${scenario.curatorFeedback.score}`
    );
  } else {
    console.log(`  curatorFeedback   : ausente (roteamento inicial)`);
  }
  console.log(`[eval] esperado: agents=[${scenario.expect.agents.join(", ")}]`);

  const start = Date.now();

  try {
    const actual = decideRouting(scenario.spec, scenario.curatorFeedback);
    const latencyMs = Date.now() - start;

    console.log(`[eval] saida bruta (${latencyMs}ms): [${actual.join(", ")}]`);

    const m1_routingAccuracy = agentSetEqual(actual, scenario.expect.agents);
    const m4_telemetryComplete = telemetryComplete(actual);

    console.log(`[eval] comparacao:`);
    console.log(
      `  agents    : esperado=[${scenario.expect.agents.join(", ")}]  obtido=[${actual.join(", ")}]  → ${m1_routingAccuracy ? "OK" : "DIVERGENCIA"}`
    );
    console.log(
      `  telemetria: array nao-vazio com agentes validos → ${m4_telemetryComplete ? "OK" : "INCOMPLETO"}`
    );

    const verdict =
      m1_routingAccuracy && m4_telemetryComplete ? "PASS" : "FAIL";
    console.log(`[eval] veredicto: ${verdict}`);

    return {
      name: scenario.name,
      tags: scenario.tags,
      verdict,
      m1_routingAccuracy,
      m4_telemetryComplete,
      actual,
      expected: scenario.expect.agents,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    console.log(`[eval] ERRO apos ${latencyMs}ms: ${String(err)}`);
    return {
      name: scenario.name,
      tags: scenario.tags,
      verdict: "FAIL",
      m1_routingAccuracy: false,
      m4_telemetryComplete: false,
      actual: [],
      expected: scenario.expect.agents,
      latencyMs,
      error: String(err),
    };
  }
}

function fmt(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function row(r: ScenarioResult): string {
  const icon = r.verdict === "PASS" ? " ✓ " : " ✗ ";
  const agentsStr = `agents=[${r.actual.join(", ")}]`;
  const timeStr = fmt(r.latencyMs);
  return `${icon} ${r.name.padEnd(52)} ${agentsStr.padEnd(28)} [${timeStr}]`;
}

function failures(r: ScenarioResult): string[] {
  const lines: string[] = [];
  if (!r.m1_routingAccuracy)
    lines.push(
      `  → routing: esperado=[${r.expected.join(", ")}], obtido=[${r.actual.join(", ")}]`
    );
  if (!r.m4_telemetryComplete)
    lines.push(
      `  → telemetria: array invalido, vazio ou com agente desconhecido`
    );
  if (r.error) lines.push(`  → erro: ${r.error}`);
  return lines;
}

function main() {
  const activeScenarios = SCENARIOS.filter((s) => {
    if (FILTER && !s.name.includes(FILTER)) return false;
    return true;
  });

  const line = "─".repeat(80);
  console.log("\nAvaliacao do Agente Odin (Roteador)");
  console.log(line);

  const results: ScenarioResult[] = [];
  for (const scenario of activeScenarios) {
    process.stdout.write(`  running: ${scenario.name}…\r`);
    const result = runScenario(scenario);
    results.push(result);
    console.log(row(result));
    if (result.verdict === "FAIL") {
      for (const f of failures(result)) console.log(f);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(line);
  const total = results.length;
  const passed = results.filter((r) => r.verdict === "PASS").length;
  const pct = total === 0 ? 0 : ((passed / total) * 100).toFixed(0);

  const m1 = results.filter((r) => r.m1_routingAccuracy).length;
  const m2Results = results.filter((r) => r.tags.includes("m2"));
  const m2 = m2Results.filter((r) => r.m1_routingAccuracy).length;
  const m3Results = results.filter((r) => r.tags.includes("m3"));
  const m3 = m3Results.filter((r) => r.m1_routingAccuracy).length;
  const m4 = results.filter((r) => r.m4_telemetryComplete).length;
  const avgMs =
    total > 0
      ? Math.round(
          results.reduce((a, r) => a + r.latencyMs, 0) / total
        )
      : 0;

  console.log(`\nResultados: ${passed}/${total} aprovados  (${pct}%)`);
  console.log(`  M1 Routing Decision Accuracy   : ${m1}/${total}`);
  console.log(
    `  M2 FixTarget Fidelity Rate     : ${m2}/${m2Results.length}  (cenarios de reflexao)`
  );
  console.log(
    `  M3 Initial Routing Plausibility: ${m3}/${m3Results.length}  (cenarios sem feedback)`
  );
  console.log(
    `  M4 Telemetry Completeness      : ${m4}/${total}  (estrutura valida)`
  );
  console.log(
    `  Latencia media                 : ${fmt(avgMs)}  (${total} cenario${total > 1 ? "s" : ""})`
  );
  console.log();
  process.exit(passed === total ? 0 : 1);
}

main();
