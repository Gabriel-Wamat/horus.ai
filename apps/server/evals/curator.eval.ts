/**
 * Curator Agent Eval Harness
 *
 * Evaluates validateOutput against five metrics:
 *   M1 – Verdict Agreement / Cohen's Kappa  (#27): pass/fail decision vs. ground truth
 *   M2 – Score Calibration MAE              (#28): mean absolute error from expected score range
 *   M3 – Score Calibration RMSE             (#28): root mean squared error (summary-level)
 *   M4 – Actionable Feedback Rate           (#30): % missingItems that are specific & actionable
 *   M5 – Fix Target Accuracy                (#31): fixTarget matches expected routing signal
 *
 * Usage (from apps/server/):
 *   tsx evals/curator.eval.ts              # deterministic guard-clause scenarios only
 *   tsx evals/curator.eval.ts --llm        # include LLM semantic scenarios (costs tokens)
 *   tsx evals/curator.eval.ts --filter m4  # run only scenarios whose name contains "m4"
 *
 * Add to package.json:
 *   "eval:curator": "tsx evals/curator.eval.ts"
 */

import "dotenv/config";
import { validateOutput } from "../src/infrastructure/agents/CuratorAgentImpl.js";
import type { Spec, CodeChangeSet } from "@u-build/shared";
import type { QaOutput } from "../src/infrastructure/agents/QaAgentImpl.js";

// ─── CLI Flags ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const RUN_LLM = argv.includes("--llm");
const FILTER = argv.find((a) => !a.startsWith("--")) ?? "";

// ─── Metric Types ─────────────────────────────────────────────────────────────

interface MetricScores {
  m1_verdictMatch: boolean;
  m2_scoreInRange: boolean;
  m2_calibrationError: number | null; // 0 if in range; positive distance otherwise; null = no target
  m4_actionableFeedbackRate: number | null; // null when passed=true or no missingItems
  m5_fixTargetMatch: boolean;
}

interface ScenarioExpect {
  m1Verdict: boolean;           // expected passed value (required)
  m2ScoreMin?: number;          // expected score lower bound (inclusive)
  m2ScoreMax?: number;          // expected score upper bound (inclusive)
  m4ActionableMin?: number;     // min acceptable actionable feedback rate (0–100)
  m4ActionableMax?: number;     // max acceptable actionable feedback rate (0–100)
  m5FixTarget?: "front" | "qa" | "both";
}

interface EvalScenario {
  name: string;
  tags: string[];
  inputs: Parameters<typeof validateOutput>;
  expect: ScenarioExpect;
}

interface ActualOutput {
  passed: boolean;
  score: number;
  fixTarget: string;
  notes: string;
  missingItems: string[];
}

interface ScenarioResult {
  name: string;
  tags: string[];
  verdict: "PASS" | "FAIL";
  scores: MetricScores;
  expected: ScenarioExpect;
  failures: string[];
  actual: ActualOutput;
  latencyMs: number;
  error?: string;
}

// ─── Scoring: M2 – Score Calibration ─────────────────────────────────────────

function computeCalibrationError(
  actualScore: number,
  expect: ScenarioExpect
): number | null {
  const { m2ScoreMin: min, m2ScoreMax: max } = expect;
  if (min === undefined && max === undefined) return null;
  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  if (actualScore >= lo && actualScore <= hi) return 0;
  if (actualScore < lo) return lo - actualScore;
  return actualScore - hi;
}

// ─── Scoring: M4 – Actionable Feedback Rate ───────────────────────────────────

// Structured [tag] prefixes emitted by the curator prompt instructions
const PREFIX_TAG =
  /^\[(front|qa|both|runtime|data|route|accessibility|responsive|front:pattern|front:component|front:visual)\]/i;

const ACTIONABLE_VERBS =
  /\b(implemente|adicione|corrija|inclua|insira|garanta|verifique|certifique|remova|substitua|atualize|cubra|implement|add|fix|include|ensure|verify|create|cover|handle|apply|replace|remove|update|define|specify)\b/i;

const SPECIFIC_ELEMENTS =
  /\b(botão|button|campo|field|formulário|form[uá]?|estado|state|loading|erro|error|empty|vazio|modal|tabela|table|validação|validation|mensagem|message|texto|text|skeleton|banner|toast|input|submit|html|label|spinner|preview|smoke|runtime|test|caso|step|expected|criterion|script|css|codeset|changeset|attribute|element|component|command|exit)\b/i;

const VAGUE_TERMS =
  /\b(correto|adequado|certo|funciona|works|melhorar|improve|better|ok|good|fine|qualquer|geral|genérico|generico)\b/i;

function isActionable(item: string): boolean {
  const trimmed = item.trim();
  if (trimmed.length < 20) return false;
  if (VAGUE_TERMS.test(trimmed)) return false;
  if (PREFIX_TAG.test(trimmed)) return true; // tagged items are always specific
  return ACTIONABLE_VERBS.test(trimmed) || SPECIFIC_ELEMENTS.test(trimmed);
}

function scoreM4(passed: boolean, missingItems: string[]): number | null {
  if (passed) return null; // approval: no feedback to measure
  if (missingItems.length === 0) return null;
  const actionable = missingItems.filter(isActionable).length;
  return Math.round((actionable / missingItems.length) * 100);
}

// ─── Scoring: M1 – Cohen's Kappa (summary-level) ─────────────────────────────

function cohenKappa(results: ScenarioResult[]): number | null {
  const N = results.length;
  if (N === 0) return null;

  let TP = 0, TN = 0, FP = 0, FN = 0;
  for (const r of results) {
    const pred = r.actual.passed;
    const exp = r.expected.m1Verdict;
    if (pred && exp) TP++;
    else if (!pred && !exp) TN++;
    else if (pred && !exp) FP++;
    else FN++;
  }

  const Po = (TP + TN) / N;
  const pYesPred = (TP + FP) / N;
  const pYesExp = (TP + FN) / N;
  const pNoPred = (FN + TN) / N;
  const pNoExp = (FP + TN) / N;
  const Pe = pYesPred * pYesExp + pNoPred * pNoExp;

  if (1 - Pe < 1e-9) return 1.0;
  return parseFloat(((Po - Pe) / (1 - Pe)).toFixed(3));
}

// ─── Composite ────────────────────────────────────────────────────────────────

function computeMetrics(actual: ActualOutput, expect: ScenarioExpect): MetricScores {
  const m2_calibrationError = computeCalibrationError(actual.score, expect);
  const m2_scoreInRange = m2_calibrationError === null || m2_calibrationError === 0;

  return {
    m1_verdictMatch: actual.passed === expect.m1Verdict,
    m2_scoreInRange,
    m2_calibrationError,
    m4_actionableFeedbackRate: scoreM4(actual.passed, actual.missingItems),
    m5_fixTargetMatch:
      expect.m5FixTarget === undefined || actual.fixTarget === expect.m5FixTarget,
  };
}

// ─── checkExpect ──────────────────────────────────────────────────────────────

function checkExpect(
  scores: MetricScores,
  actual: ActualOutput,
  expect: ScenarioExpect
): string[] {
  const fails: string[] = [];

  if (!scores.m1_verdictMatch)
    fails.push(`M1 verdict: expected=${expect.m1Verdict}, got=${actual.passed}`);

  if (!scores.m2_scoreInRange) {
    const range = [
      expect.m2ScoreMin !== undefined ? `≥${expect.m2ScoreMin}` : "",
      expect.m2ScoreMax !== undefined ? `≤${expect.m2ScoreMax}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    fails.push(
      `M2 score ${range}: got=${actual.score}  (error=${scores.m2_calibrationError})`
    );
  }

  if (expect.m4ActionableMin !== undefined) {
    if (scores.m4_actionableFeedbackRate === null)
      fails.push(
        `M4 actionable: expected≥${expect.m4ActionableMin}% but no missingItems to score`
      );
    else if (scores.m4_actionableFeedbackRate < expect.m4ActionableMin)
      fails.push(
        `M4 actionable: expected≥${expect.m4ActionableMin}%, got=${scores.m4_actionableFeedbackRate}%`
      );
  }
  if (
    expect.m4ActionableMax !== undefined &&
    scores.m4_actionableFeedbackRate !== null &&
    scores.m4_actionableFeedbackRate > expect.m4ActionableMax
  ) {
    fails.push(
      `M4 actionable: expected≤${expect.m4ActionableMax}%, got=${scores.m4_actionableFeedbackRate}%`
    );
  }

  if (!scores.m5_fixTargetMatch)
    fails.push(`M5 fixTarget: expected=${expect.m5FixTarget}, got=${actual.fixTarget}`);

  return fails;
}

// ─── Fixture Factories ───────────────────────────────────────────────────────

const ID1 = "aaaaaaaa-0000-4000-8000-000000000001";
const ID2 = "aaaaaaaa-0000-4000-8000-000000000002";
const ID3 = "aaaaaaaa-0000-4000-8000-000000000003";
const NOW = new Date().toISOString();

function makeSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    id: ID1,
    userStoryId: ID2,
    version: 1,
    summary: "Login form with email and password fields",
    technicalApproach:
      "Standalone HTML page with inline JavaScript form validation. No framework dependency.",
    components: [
      {
        name: "LoginForm",
        type: "ui",
        description:
          "Form with email input, password input, inline validation errors, and a submit button with loading state",
        dependencies: [],
      },
    ],
    apiEndpoints: [],
    dataModels: [],
    acceptanceCriteria: [
      "User can submit valid email and password",
      "Inline error messages appear for empty or invalid fields",
      "Submit button is disabled and shows loading text during submission",
    ],
    generatedAt: NOW,
    ...overrides,
  };
}

function makeCodeChangeSet(
  validationStatus: "passed" | "failed" | "not_run" = "passed"
): CodeChangeSet {
  return {
    id: ID1,
    workflowThreadId: ID3,
    userStoryId: ID2,
    sourceAgent: "front",
    status: "proposed",
    operations: [
      {
        changeType: "create",
        targetPath: "src/pages/login.html",
        beforeContent: null,
        diff: "+<!DOCTYPE html>...",
        afterContent: "<!DOCTYPE html>...",
        preconditions: [],
        metadata: {},
      },
    ],
    validation:
      validationStatus === "not_run"
        ? []
        : [
            {
              command: "npx html-validate src/pages/login.html",
              cwd: "/workspace",
              exitCode: validationStatus === "passed" ? 0 : 1,
              status: validationStatus,
              ...(validationStatus === "failed" && {
                stderr: "Error: missing required attribute 'alt' on <img> element",
              }),
            },
          ],
    createdAt: NOW,
  };
}

function makeQaOutput(overrides: Partial<QaOutput> = {}): QaOutput {
  return {
    testCases: [
      {
        id: "TC-01",
        criterion: "User can submit valid credentials",
        steps: [
          "Open the login page",
          "Enter a valid email address in the email field",
          "Enter a password with 8+ characters",
          "Click the Sign in button",
        ],
        expected: "The form submits and the button shows a loading state",
      },
      {
        id: "TC-02",
        criterion: "Inline validation error on empty submit",
        steps: [
          "Open the login page",
          "Click the Sign in button without filling any fields",
        ],
        expected:
          "Error messages appear below the email and password fields indicating they are required",
      },
      {
        id: "TC-03",
        criterion: "Password length validation",
        steps: [
          "Enter a valid email",
          "Enter a password shorter than 8 characters",
          "Click Sign in",
        ],
        expected: "An error message appears below the password field",
      },
    ],
    ...overrides,
  };
}

// ─── HTML Fixtures ───────────────────────────────────────────────────────────

const GOOD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.5rem; font-weight: 600; color: #111827; margin-bottom: 0.5rem; }
    .subtitle { color: #6b7280; font-size: 0.875rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.25rem; }
    input { width: 100%; padding: 0.625rem 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.875rem; outline: none; transition: border-color 0.15s; }
    input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
    input.error { border-color: #ef4444; }
    .field { margin-bottom: 1rem; }
    .error-msg { display: none; color: #ef4444; font-size: 0.75rem; margin-top: 0.25rem; }
    .error-msg.visible { display: block; }
    button { width: 100%; padding: 0.625rem; background: #3b82f6; color: #fff; border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 500; cursor: pointer; margin-top: 0.5rem; transition: background 0.15s; }
    button:hover:not(:disabled) { background: #2563eb; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Welcome back</h1>
    <p class="subtitle">Sign in to your account</p>
    <form id="loginForm" novalidate>
      <div class="field">
        <label for="email">Email address</label>
        <input type="email" id="email" name="email" placeholder="you@example.com" autocomplete="email" required />
        <p class="error-msg" id="emailError">Please enter a valid email address</p>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Min. 8 characters" autocomplete="current-password" required minlength="8" />
        <p class="error-msg" id="passwordError">Password must be at least 8 characters</p>
      </div>
      <button type="submit" id="submitBtn">Sign in</button>
    </form>
  </div>
  <script>
    const form = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let valid = true;
      const emailRe = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

      if (!emailRe.test(emailInput.value)) {
        emailError.classList.add('visible');
        emailInput.classList.add('error');
        valid = false;
      } else {
        emailError.classList.remove('visible');
        emailInput.classList.remove('error');
      }

      if (passwordInput.value.length < 8) {
        passwordError.classList.add('visible');
        passwordInput.classList.add('error');
        valid = false;
      } else {
        passwordError.classList.remove('visible');
        passwordInput.classList.remove('error');
      }

      if (!valid) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';
      await new Promise((r) => setTimeout(r, 800));
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    });
  </script>
</body>
</html>`;

const POOR_HTML = `<!DOCTYPE html>
<html>
<head><title>Page</title></head>
<body>
  <h1>Hello World</h1>
  <p>Content goes here.</p>
  <form>
    <input type="text" placeholder="input" />
    <button>Submit</button>
  </form>
</body>
</html>`;

// ─── Scenarios ───────────────────────────────────────────────────────────────

const SCENARIOS: EvalScenario[] = [
  // ── Guard Clause Scenarios (deterministic — M1, M2, M4, M5) ──────────────
  // Guard clauses emit [tag]-prefixed missingItems → expected 100% actionable
  {
    name: "guard: missing-codeset",
    tags: ["deterministic", "guard", "m1", "m2", "m4", "m5"],
    inputs: [makeSpec(), GOOD_HTML, makeQaOutput(), undefined],
    expect: {
      m1Verdict: false,
      m2ScoreMin: 0,
      m2ScoreMax: 0,
      m4ActionableMin: 80,
      m5FixTarget: "front",
    },
  },
  {
    name: "guard: empty-test-cases",
    tags: ["deterministic", "guard", "m1", "m2", "m4", "m5"],
    inputs: [makeSpec(), GOOD_HTML, makeQaOutput({ testCases: [] }), makeCodeChangeSet()],
    expect: {
      m1Verdict: false,
      m2ScoreMin: 0,
      m2ScoreMax: 0,
      m4ActionableMin: 80,
      m5FixTarget: "qa",
    },
  },
  {
    name: "guard: preview-smoke-failed",
    tags: ["deterministic", "guard", "m1", "m2", "m4", "m5"],
    inputs: [
      makeSpec(),
      GOOD_HTML,
      makeQaOutput({
        previewSmoke: {
          status: "failed",
          reason: "Preview URL returned 404",
          elapsedMs: 500,
          checkedAt: NOW,
        },
      }),
      makeCodeChangeSet(),
    ],
    expect: {
      m1Verdict: false,
      m2ScoreMin: 0,
      m2ScoreMax: 0,
      m4ActionableMin: 80,
      m5FixTarget: "qa",
    },
  },
  {
    name: "guard: runtime-validation-failed",
    tags: ["deterministic", "guard", "m1", "m2", "m4", "m5"],
    inputs: [
      makeSpec(),
      GOOD_HTML,
      makeQaOutput({
        runtimeValidation: {
          id: ID1,
          workflowThreadId: null,
          constructionRunId: null,
          userStoryId: null,
          projectId: null,
          status: "failed",
          skippedReason: null,
          commands: [
            {
              commandId: "cmd-001",
              taskId: null,
              command: "npm test",
              cwd: "/workspace",
              approvalRequired: false,
              risk: "low",
              policyReason: null,
              approved: false,
              approvedBy: null,
              approvalReason: null,
              exitCode: 1,
              stdoutTail: "",
              stderrTail: "FAIL src/LoginForm.test.ts — 3 tests failed",
              stdoutPath: null,
              stderrPath: null,
              interactivePromptDetected: false,
              interactivePromptText: null,
              durationMs: 3200,
            },
          ],
          preview: {
            status: "skipped",
            url: null,
            message: "Preview smoke was not executed.",
            evidence: { title: null, bodySnippet: null, screenshotPath: null },
          },
          createdAt: NOW,
        },
      }),
      makeCodeChangeSet(),
    ],
    expect: {
      m1Verdict: false,
      m2ScoreMin: 0,
      m2ScoreMax: 0,
      m4ActionableMin: 80,
      m5FixTarget: "front",
    },
  },
  {
    name: "guard: codeset-validation-failed",
    tags: ["deterministic", "guard", "m1", "m2", "m4", "m5"],
    inputs: [makeSpec(), GOOD_HTML, makeQaOutput(), makeCodeChangeSet("failed")],
    expect: {
      m1Verdict: false,
      m2ScoreMin: 0,
      m2ScoreMax: 0,
      m4ActionableMin: 80,
      m5FixTarget: "front",
    },
  },

  // ── LLM Semantic Scenarios (M1, M2, M4, M5) ──────────────────────────────
  {
    name: "llm: good-implementation-passes",
    tags: ["llm", "m1", "m2"],
    inputs: [makeSpec(), GOOD_HTML, makeQaOutput(), makeCodeChangeSet()],
    expect: {
      m1Verdict: true,
      m2ScoreMin: 70,
    },
  },
  {
    name: "llm: generic-html-fails",
    tags: ["llm", "m1", "m2", "m4", "m5"],
    inputs: [makeSpec(), POOR_HTML, makeQaOutput(), makeCodeChangeSet()],
    expect: {
      m1Verdict: false,
      m2ScoreMax: 54,
      m4ActionableMin: 60,
      m5FixTarget: "front",
    },
  },
  {
    name: "llm: weak-qa-one-vague-test",
    tags: ["llm", "m1", "m4", "m5"],
    inputs: [
      makeSpec(),
      GOOD_HTML,
      makeQaOutput({
        testCases: [
          {
            id: "TC-01",
            criterion: "Form works",
            steps: ["Open page", "Try to login"],
            expected: "It works",
          },
        ],
      }),
      makeCodeChangeSet(),
    ],
    expect: {
      m1Verdict: false,
      m4ActionableMin: 50,
      m5FixTarget: "qa",
    },
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

async function runScenario(scenario: EvalScenario): Promise<ScenarioResult> {
  const [spec, html, qaOutput, codeChangeSet] = scenario.inputs;
  const start = Date.now();

  console.log(`\n${"─".repeat(60)}`);
  console.log(`[eval] cenário: ${scenario.name}  tags=[${scenario.tags.join(", ")}]`);
  console.log(`[eval] entradas:`);
  console.log(`  spec.summary        : "${spec.summary}"`);
  console.log(`  spec.acceptanceCriteria (${spec.acceptanceCriteria.length}):`);
  for (const ac of spec.acceptanceCriteria) console.log(`    - ${ac}`);
  console.log(
    `  html                : ${html.length} chars — "${html.slice(0, 80).replace(/\s+/g, " ").trim()}…"`
  );
  console.log(`  qaOutput.testCases  : ${qaOutput?.testCases?.length ?? 0} caso(s)`);
  if (qaOutput?.testCases?.length) {
    for (const tc of qaOutput.testCases) console.log(`    [${tc.id}] ${tc.criterion}`);
  }
  console.log(
    `  previewSmoke        : ${qaOutput?.previewSmoke ? `status=${qaOutput.previewSmoke.status}` : "ausente"}`
  );
  console.log(
    `  runtimeValidation   : ${qaOutput?.runtimeValidation ? `status=${qaOutput.runtimeValidation.status}` : "ausente"}`
  );
  console.log(
    `  codeChangeSet       : ${
      codeChangeSet
        ? `presente — validação=[${codeChangeSet.validation.map((v) => v.status).join(", ") || "nenhuma"}]`
        : "AUSENTE"
    }`
  );
  const range = [
    scenario.expect.m2ScoreMin !== undefined ? `≥${scenario.expect.m2ScoreMin}` : "",
    scenario.expect.m2ScoreMax !== undefined ? `≤${scenario.expect.m2ScoreMax}` : "",
  ]
    .filter(Boolean)
    .join(" ") || "qualquer";
  console.log(
    `[eval] esperado: verdict=${scenario.expect.m1Verdict}  score=${range}  m4≥${scenario.expect.m4ActionableMin ?? "n/a"}%  fixTarget=${scenario.expect.m5FixTarget ?? "qualquer"}`
  );

  try {
    console.log(`[eval] chamando validateOutput…`);
    const raw = await validateOutput(...scenario.inputs);
    const latencyMs = Date.now() - start;

    const actual: ActualOutput = {
      passed: raw.passed,
      score: raw.score,
      fixTarget: raw.fixTarget,
      notes: raw.notes,
      missingItems: raw.missingItems,
    };

    console.log(`[eval] saida bruta (${latencyMs}ms):`);
    console.log(`  passed      : ${actual.passed}`);
    console.log(`  score       : ${actual.score}`);
    console.log(`  fixTarget   : ${actual.fixTarget}`);
    console.log(
      `  notes       : "${actual.notes.slice(0, 120)}${actual.notes.length > 120 ? "…" : ""}"`
    );
    if (actual.missingItems.length) {
      console.log(`  missingItems (${actual.missingItems.length}):`);
      for (const item of actual.missingItems) {
        const actionable = isActionable(item);
        console.log(`    · [${actionable ? "✓" : "✗"}] ${item}`);
      }
    }

    const scores = computeMetrics(actual, scenario.expect);
    const failures = checkExpect(scores, actual, scenario.expect);
    const verdict = failures.length === 0 ? "PASS" : "FAIL";

    console.log(`[eval] métricas:`);
    console.log(
      `  M1 verdict match    : esperado=${scenario.expect.m1Verdict}  obtido=${actual.passed}  → ${scores.m1_verdictMatch ? "OK" : "DIVERGÊNCIA"}`
    );
    console.log(
      `  M2 score in range   : esperado=${range}  obtido=${actual.score}  erro=${scores.m2_calibrationError ?? "n/a"}  → ${scores.m2_scoreInRange ? "OK" : "FORA DO INTERVALO"}`
    );
    console.log(
      `  M4 actionable rate  : ${scores.m4_actionableFeedbackRate === null ? "n/a (aprovado ou sem itens)" : `${scores.m4_actionableFeedbackRate}%`}`
    );
    console.log(
      `  M5 fixTarget match  : esperado=${scenario.expect.m5FixTarget ?? "qualquer"}  obtido=${actual.fixTarget}  → ${scores.m5_fixTargetMatch ? "OK" : "DIVERGÊNCIA"}`
    );
    console.log(`[eval] veredicto: ${verdict}`);
    if (failures.length > 0) {
      for (const f of failures) console.log(`  ✗ ${f}`);
    }

    return {
      name: scenario.name,
      tags: scenario.tags,
      verdict,
      scores,
      expected: scenario.expect,
      failures,
      actual,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    console.log(`[eval] ERRO após ${latencyMs}ms: ${String(err)}`);
    const scores: MetricScores = {
      m1_verdictMatch: false,
      m2_scoreInRange: false,
      m2_calibrationError: null,
      m4_actionableFeedbackRate: null,
      m5_fixTargetMatch: false,
    };
    const actual: ActualOutput = {
      passed: false,
      score: -1,
      fixTarget: "?",
      notes: String(err),
      missingItems: [],
    };
    return {
      name: scenario.name,
      tags: scenario.tags,
      verdict: "FAIL",
      scores,
      expected: scenario.expect,
      failures: [`erro: ${String(err)}`],
      actual,
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
  const m1 = `M1=${r.scores.m1_verdictMatch ? "ok  " : "fail"}`;
  const m2 = `M2=${String(r.actual.score).padStart(3)} err=${String(r.scores.m2_calibrationError ?? "--").padStart(3)}`;
  const m4 =
    r.scores.m4_actionableFeedbackRate === null
      ? "M4=--  "
      : `M4=${String(r.scores.m4_actionableFeedbackRate).padStart(3)}%`;
  const m5 = `M5=${r.scores.m5_fixTargetMatch ? "ok  " : "fail"}`;
  return `${icon} ${r.name.padEnd(44)} ${m1}  ${m2}  ${m4}  ${m5}  [${fmt(r.latencyMs)}]`;
}

async function main() {
  const activeScenarios = SCENARIOS.filter((s) => {
    if (!RUN_LLM && s.tags.includes("llm")) return false;
    if (FILTER && !s.name.includes(FILTER)) return false;
    return true;
  });

  const line = "─".repeat(110);
  console.log("\nAvaliação do Agente Curador");
  console.log(line);
  if (!RUN_LLM)
    console.log("(Cenários LLM ignorados — passe --llm para incluí-los)\n");

  const results: ScenarioResult[] = [];
  for (const scenario of activeScenarios) {
    process.stdout.write(`  running: ${scenario.name}…\r`);
    const result = await runScenario(scenario);
    results.push(result);
    console.log(row(result));
    if (result.verdict === "FAIL") {
      for (const f of result.failures) console.log(`    → ${f}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(line);

  const total = results.length;
  const passed = results.filter((r) => r.verdict === "PASS").length;
  const pct = total === 0 ? 0 : ((passed / total) * 100).toFixed(0);

  // M1 – Verdict Agreement + Cohen's Kappa
  const m1Correct = results.filter((r) => r.scores.m1_verdictMatch).length;
  const kappa = cohenKappa(results);
  const kappaStr =
    kappa === null ? "n/a" : `κ=${kappa.toFixed(3)} ${kappa >= 0.8 ? "(forte)" : kappa >= 0.6 ? "(moderado)" : "(fraco)"}`;

  // M2/M3 – Score Calibration MAE and RMSE
  const calibrationErrors = results
    .map((r) => r.scores.m2_calibrationError)
    .filter((e): e is number => e !== null);
  const mae =
    calibrationErrors.length > 0
      ? calibrationErrors.reduce((a, e) => a + e, 0) / calibrationErrors.length
      : null;
  const rmse =
    calibrationErrors.length > 0
      ? Math.sqrt(
          calibrationErrors.reduce((a, e) => a + e * e, 0) / calibrationErrors.length
        )
      : null;
  const m2Correct = results.filter((r) => r.scores.m2_scoreInRange).length;
  const withM2 = results.filter(
    (r) => r.expected.m2ScoreMin !== undefined || r.expected.m2ScoreMax !== undefined
  );

  // M4 – Actionable Feedback Rate
  const actionableRates = results
    .map((r) => r.scores.m4_actionableFeedbackRate)
    .filter((v): v is number => v !== null);
  const avgM4 =
    actionableRates.length > 0
      ? Math.round(actionableRates.reduce((a, v) => a + v, 0) / actionableRates.length)
      : null;
  const withM4 = results.filter(
    (r) =>
      r.expected.m4ActionableMin !== undefined || r.expected.m4ActionableMax !== undefined
  );
  const m4Correct = withM4.filter((r) => {
    const v = r.scores.m4_actionableFeedbackRate;
    if (v === null) return false;
    if (r.expected.m4ActionableMin !== undefined && v < r.expected.m4ActionableMin)
      return false;
    if (r.expected.m4ActionableMax !== undefined && v > r.expected.m4ActionableMax)
      return false;
    return true;
  }).length;

  // M5 – Fix Target Accuracy
  const withM5 = results.filter((r) => r.expected.m5FixTarget !== undefined);
  const m5Correct = withM5.filter((r) => r.scores.m5_fixTargetMatch).length;

  // LLM latency
  const llmResults = results.filter((r) => r.tags.includes("llm"));
  const avgLlmMs =
    llmResults.length > 0
      ? Math.round(llmResults.reduce((a, r) => a + r.latencyMs, 0) / llmResults.length)
      : 0;

  console.log(`\nResultados: ${passed}/${total} aprovados  (${pct}%)`);
  console.log(
    `  M1 Verdict Agreement / Kappa (#27)  : ${m1Correct}/${total} corretos  ${kappaStr}`
  );
  if (withM2.length > 0)
    console.log(
      `  M2 Score Calibration MAE    (#28)  : ${mae !== null ? mae.toFixed(1) : "n/a"}  (${m2Correct}/${withM2.length} dentro do intervalo)`
    );
  if (calibrationErrors.length > 0)
    console.log(
      `  M3 Score Calibration RMSE   (#28)  : ${rmse !== null ? rmse.toFixed(1) : "n/a"}`
    );
  if (withM4.length > 0)
    console.log(
      `  M4 Actionable Feedback Rate (#30)  : média=${avgM4 !== null ? `${avgM4}%` : "n/a"}  (${m4Correct}/${withM4.length} dentro do intervalo)`
    );
  if (withM5.length > 0)
    console.log(
      `  M5 Fix Target Accuracy      (#31)  : ${m5Correct}/${withM5.length} corretos`
    );
  if (llmResults.length > 0)
    console.log(
      `  Latência média LLM                 : ${fmt(avgLlmMs)}  (${llmResults.length} chamada${llmResults.length > 1 ? "s" : ""})`
    );

  console.log();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
