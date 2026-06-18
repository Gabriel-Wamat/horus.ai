/**
 * QA Agent Eval Harness
 *
 * Evaluates the QA agent test case generation against four metrics:
 *   M1 – Criterion Coverage Rate            (#21): each spec AC has a mapped test case
 *   M2 – Step Reproducibility Score         (#22): steps are concrete and actionable
 *   M3 – Expected Result Specificity Score  (#23): expected fields are observable, not vague
 *   M6 – Curator [qa]-flag Rate             (#26): rate at which curator flags QA for fixes
 *
 * Usage (from apps/server/):
 *   tsx evals/qa.eval.ts              # deterministic fixture scenarios only
 *   tsx evals/qa.eval.ts --llm        # include LLM generation scenarios (costs tokens)
 *   tsx evals/qa.eval.ts --filter m3  # run only scenarios whose name contains "m3"
 *
 * Add to package.json:
 *   "eval:qa": "tsx evals/qa.eval.ts"
 */

import "dotenv/config";
import { generateQaTests } from "../src/infrastructure/agents/QaAgentImpl.js";
import { validateOutput } from "../src/infrastructure/agents/CuratorAgentImpl.js";
import type { Spec, CodeChangeSet, UserStory } from "@u-build/shared";
import type { QaOutput } from "../src/infrastructure/agents/QaAgentImpl.js";

// ─── CLI Flags ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const RUN_LLM = argv.includes("--llm");
const FILTER = argv.find((a) => !a.startsWith("--")) ?? "";

// ─── Metric Types ─────────────────────────────────────────────────────────────

interface MetricScores {
  m1_criterionCoverage: number;
  m2_stepReproducibility: number;
  m3_expectedSpecificity: number;
  m6_curatorQaFlagged: boolean | null;
}

interface ScenarioExpect {
  m1Min?: number;
  m1Max?: number;
  m2Min?: number;
  m2Max?: number;
  m3Min?: number;
  m3Max?: number;
  m6Flagged?: boolean;
}

interface EvalScenario {
  name: string;
  tags: string[];
  story: UserStory;
  spec: Spec;
  qaOutput?: QaOutput;
  html?: string;
  codeChangeSet?: CodeChangeSet;
  expect: ScenarioExpect;
}

interface ScenarioResult {
  name: string;
  tags: string[];
  verdict: "PASS" | "FAIL";
  scores: MetricScores;
  expected: ScenarioExpect;
  failures: string[];
  latencyMs: number;
  error?: string;
}

// ─── IDs & Constants ──────────────────────────────────────────────────────────

const ID1 = "cccccccc-0000-4000-8000-000000000001";
const ID2 = "cccccccc-0000-4000-8000-000000000002";
const ID3 = "cccccccc-0000-4000-8000-000000000003";
const NOW = new Date().toISOString();

// ─── Scoring: Stop Words ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "o","a","os","as","um","uma","de","do","da","dos","das","em","no","na","nos","nas",
  "e","é","para","com","que","ao","se","por","mais","ou","como","ser","ter","estar",
  "seu","sua","cada","este","esta","esse","essa","pelo","pela","the","an","is","are",
  "was","be","been","have","has","had","do","does","did","will","would","could","should",
  "may","might","can","not","no","and","or","but","in","on","at","to","for","with","of",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOP_WORDS.has(t));
}

// ─── Scoring: M1 – Criterion Coverage Rate ────────────────────────────────────

function scoreM1(qaOutput: QaOutput, spec: Spec): number {
  if (spec.acceptanceCriteria.length === 0) return 100;
  if (qaOutput.testCases.length === 0) return 0;

  let covered = 0;
  for (const ac of spec.acceptanceCriteria) {
    const acKws = extractKeywords(ac);
    if (acKws.length === 0) continue;
    const isCovered = qaOutput.testCases.some((tc) => {
      const tcKws = extractKeywords(tc.criterion);
      const overlap = tcKws.filter((kw) => acKws.includes(kw));
      return overlap.length >= Math.max(1, Math.ceil(acKws.length * 0.25));
    });
    if (isCovered) covered++;
  }
  return Math.round((covered / spec.acceptanceCriteria.length) * 100);
}

// ─── Scoring: M2 – Step Reproducibility Score ─────────────────────────────────

const ACTION_VERBS =
  /\b(clique|clica|click|digita|type|enter|preencha|fill|abra|open|navegue|navigate|selecione|select|pressione|press|submeta|submit|role|scroll|arraste|drag|hover|marque|check|desmarque|uncheck|alterne|toggle|foque|focus|carregue|upload|baixe|download|limpe|clear|redefina|reset|expanda|expand|recolha|collapse|ordene|sort|filtre|filter|pesquise|search|aguarde|wait|recarregue|reload|atualize|refresh|confirme|confirm|cancele|cancel|feche|close)\b/i;

function scoreM2(qaOutput: QaOutput): number {
  if (qaOutput.testCases.length === 0) return 0;
  let totalSteps = 0;
  let specificSteps = 0;
  for (const tc of qaOutput.testCases) {
    for (const step of tc.steps) {
      totalSteps++;
      if (ACTION_VERBS.test(step) && step.trim().length > 20) specificSteps++;
    }
  }
  if (totalSteps === 0) return 0;
  return Math.round((specificSteps / totalSteps) * 100);
}

// ─── Scoring: M3 – Expected Result Specificity Score ─────────────────────────

const VAGUE_EXPECTED =
  /\b(funciona|funcione|correto|adequado|certo|it works|works correctly|correct behavior|should work|deve funcionar|está ok|is ok|tudo certo|everything works|it.s correct|it is correct|a tela atende)\b/i;

const SPECIFIC_INDICATORS =
  /\b(exibe|mostra|aparece|displays?|shows?|appears?|desabilita|disabled|habilitado|enabled|visível|visible|oculto|hidden|contém|contains?|navega|navigate|redireciona|redirect|toast|alerta|alert|mensagem|message|erro|error|sucesso|success|loading|carregando|skeleton|botão|button|campo|field|texto|text|label|ícone|icon|spinner)\b/i;

function scoreM3(qaOutput: QaOutput): number {
  if (qaOutput.testCases.length === 0) return 0;
  let specific = 0;
  for (const tc of qaOutput.testCases) {
    const isVague = VAGUE_EXPECTED.test(tc.expected);
    const hasSpecific = SPECIFIC_INDICATORS.test(tc.expected);
    if (!isVague && hasSpecific) specific++;
  }
  return Math.round((specific / qaOutput.testCases.length) * 100);
}

// ─── Scoring: M6 – Curator [qa]-flag Rate ────────────────────────────────────

async function scoreM6(
  spec: Spec,
  html: string,
  qaOutput: QaOutput,
  codeChangeSet: CodeChangeSet | undefined
): Promise<boolean> {
  const result = await validateOutput(spec, html, qaOutput, codeChangeSet);
  return result.fixTarget === "qa" || result.fixTarget === "both";
}

// ─── Composite ────────────────────────────────────────────────────────────────

async function computeMetrics(
  qaOutput: QaOutput,
  spec: Spec,
  html: string | undefined,
  codeChangeSet: CodeChangeSet | undefined,
  evaluateM6: boolean
): Promise<MetricScores> {
  const m6 =
    evaluateM6 && html !== undefined
      ? await scoreM6(spec, html, qaOutput, codeChangeSet)
      : null;
  return {
    m1_criterionCoverage: scoreM1(qaOutput, spec),
    m2_stepReproducibility: scoreM2(qaOutput),
    m3_expectedSpecificity: scoreM3(qaOutput),
    m6_curatorQaFlagged: m6,
  };
}

// ─── Fixture Factories ────────────────────────────────────────────────────────

function makeStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: ID1,
    title: "Formulário de login com validação inline",
    description:
      "Como usuário, quero fazer login com email e senha com validação em tempo real para receber feedback imediato sobre erros de preenchimento.",
    acceptanceCriteria: [
      "Usuário consegue submeter email e senha válidos",
      "Mensagens de erro inline aparecem para campos vazios ou inválidos",
      "Botão de submit é desabilitado e mostra texto de loading durante o envio",
    ],
    priority: "high",
    labels: ["auth", "formulário"],
    createdAt: NOW,
    ...overrides,
  };
}

function makeSpec(overrides: Partial<Spec> = {}): Spec {
  return {
    id: ID2,
    userStoryId: ID1,
    version: 1,
    summary: "Formulário de login com email, senha, validação inline e estado de loading",
    technicalApproach:
      "Página HTML standalone com validação JavaScript inline. Sem dependência de framework.",
    components: [
      {
        name: "LoginForm",
        type: "ui",
        description:
          "Formulário com input de email, input de senha, mensagens de erro inline e botão de submit com estado de loading",
        dependencies: [],
      },
    ],
    apiEndpoints: [],
    dataModels: [],
    acceptanceCriteria: [
      "Usuário consegue submeter email e senha válidos",
      "Mensagens de erro inline aparecem para campos vazios ou inválidos",
      "Botão de submit é desabilitado e mostra texto de loading durante o envio",
    ],
    generatedAt: NOW,
    ...overrides,
  };
}

function makeCodeChangeSet(
  validationStatus: "passed" | "failed" | "not_run" = "passed"
): CodeChangeSet {
  return {
    id: ID2,
    workflowThreadId: ID3,
    userStoryId: ID1,
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
                stderr: "Error: missing required attribute",
              }),
            },
          ],
    createdAt: NOW,
  };
}

// ─── QA Output Fixtures ───────────────────────────────────────────────────────

function makeGoodQaOutput(): QaOutput {
  return {
    testCases: [
      {
        id: "TC-01",
        criterion: "Usuário consegue submeter email e senha válidos",
        steps: [
          "Abra a página de login no navegador",
          "Digite um endereço de email válido no campo de email (ex: user@example.com)",
          "Digite uma senha com 8 ou mais caracteres no campo de senha",
          "Clique no botão 'Sign in'",
        ],
        expected:
          "O formulário é submetido com sucesso, o botão exibe texto de loading e fica desabilitado durante o envio",
      },
      {
        id: "TC-02",
        criterion: "Mensagens de erro inline aparecem para campos vazios ou inválidos",
        steps: [
          "Abra a página de login no navegador",
          "Deixe o campo de email vazio e o campo de senha vazio",
          "Clique no botão 'Sign in' sem preencher nenhum campo",
        ],
        expected:
          "Mensagens de erro aparecem abaixo dos campos de email e senha indicando que são obrigatórios e o formulário não é submetido",
      },
      {
        id: "TC-03",
        criterion: "Botão de submit é desabilitado e mostra texto de loading durante o envio",
        steps: [
          "Abra a página de login no navegador",
          "Digite um email válido e uma senha válida nos respectivos campos",
          "Clique no botão 'Sign in' e observe imediatamente o estado do botão",
        ],
        expected:
          "O botão fica desabilitado (atributo disabled aplicado) e exibe texto de loading como 'Signing in…' enquanto a requisição está em andamento",
      },
    ],
  };
}

function makeVagueQaOutput(): QaOutput {
  return {
    testCases: [
      {
        id: "TC-01",
        criterion: "Form works",
        steps: ["Open page", "Try to login"],
        expected: "It works correctly",
      },
      {
        id: "TC-02",
        criterion: "Validation works",
        steps: ["Open page", "Submit form"],
        expected: "The form is correct",
      },
      {
        id: "TC-03",
        criterion: "Button works",
        steps: ["Open page", "Click button"],
        expected: "Everything works as expected",
      },
    ],
  };
}

function makePartialQaOutput(): QaOutput {
  return {
    testCases: [
      {
        id: "TC-01",
        criterion: "Usuário consegue submeter credenciais",
        steps: [
          "Abra a página de login",
          "Digite o email no campo de email",
          "Clique em Sign in",
        ],
        expected:
          "O formulário é submetido e o botão mostra estado de loading",
      },
    ],
  };
}

// ─── HTML Fixture (for M6) ────────────────────────────────────────────────────

const LOGIN_HTML = `<!DOCTYPE html>
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
    label { display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.25rem; }
    input { width: 100%; padding: 0.625rem 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.875rem; outline: none; }
    input.error { border-color: #ef4444; }
    .field { margin-bottom: 1rem; }
    .error-msg { display: none; color: #ef4444; font-size: 0.75rem; margin-top: 0.25rem; }
    .error-msg.visible { display: block; }
    button { width: 100%; padding: 0.625rem; background: #3b82f6; color: #fff; border: none; border-radius: 8px; font-size: 0.875rem; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Welcome back</h1>
    <form id="loginForm" novalidate>
      <div class="field">
        <label for="email">Email address</label>
        <input type="email" id="email" name="email" required />
        <p class="error-msg" id="emailError">Please enter a valid email address</p>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required minlength="8" />
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

// ─── Stories & Specs ──────────────────────────────────────────────────────────

const STORY_LOGIN = makeStory();
const SPEC_LOGIN = makeSpec();
const CODESET_OK = makeCodeChangeSet("passed");

const STORY_ADMIN: UserStory = {
  id: "dddddddd-0000-4000-8000-000000000001",
  title: "Painel de administração de usuários",
  description:
    "Como admin, quero um painel que mostre todos os usuários cadastrados com busca e filtros para ativar ou desativar contas rapidamente.",
  acceptanceCriteria: [
    "O admin visualiza uma tabela com nome, email e status de cada usuário",
    "O campo de busca filtra a lista em tempo real pelo nome ou email",
    "Ao clicar em Desativar, o status do usuário muda imediatamente na tabela",
    "Estado vazio exibe mensagem 'Nenhum usuário encontrado' com botão de limpar filtro",
  ],
  priority: "high",
  labels: ["admin", "gestão-de-usuários"],
  createdAt: NOW,
};

const SPEC_ADMIN: Spec = {
  id: "dddddddd-0000-4000-8000-000000000002",
  userStoryId: STORY_ADMIN.id,
  version: 1,
  summary: "Painel administrativo de usuários com busca, filtro e ações de status",
  technicalApproach:
    "Pattern: operational-dashboard. Tabela paginada com busca em tempo real (debounce 300ms). Skeleton loading por linha. Estado vazio com CTA. Error banner não bloqueante.",
  components: [
    { name: "UserTable", type: "ui", description: "Tabela de usuários com paginação", dependencies: [] },
    { name: "UserSearchBar", type: "ui", description: "Input de busca com debounce", dependencies: [] },
    { name: "UserStatusToggle", type: "ui", description: "Toggle ativar/desativar", dependencies: [] },
  ],
  apiEndpoints: [
    { method: "GET", path: "/api/admin/users", description: "Lista de usuários com filtros" },
    { method: "PATCH", path: "/api/admin/users/:id/status", description: "Atualiza status do usuário" },
  ],
  dataModels: ["User: { id, name, email, status: 'active'|'inactive' }"],
  acceptanceCriteria: STORY_ADMIN.acceptanceCriteria,
  generatedAt: NOW,
};

// ─── Scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS: EvalScenario[] = [
  // ── M1: Criterion Coverage Rate ───────────────────────────────────────────
  {
    name: "m1: full-qa-covers-all-spec-criteria",
    tags: ["deterministic", "m1"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    qaOutput: makeGoodQaOutput(),
    expect: { m1Min: 90 },
  },
  {
    name: "m1: partial-qa-misses-two-criteria",
    tags: ["deterministic", "m1"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    qaOutput: makePartialQaOutput(),
    expect: { m1Max: 40 },
  },
  {
    name: "m1: empty-qa-covers-nothing",
    tags: ["deterministic", "m1"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    qaOutput: { testCases: [] },
    expect: { m1Max: 0 },
  },

  // ── M2: Step Reproducibility Score ───────────────────────────────────────
  {
    name: "m2: specific-steps-score-high",
    tags: ["deterministic", "m2"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    qaOutput: makeGoodQaOutput(),
    expect: { m2Min: 70 },
  },
  {
    name: "m2: vague-steps-score-low",
    tags: ["deterministic", "m2"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    qaOutput: makeVagueQaOutput(),
    expect: { m2Max: 30 },
  },

  // ── M3: Expected Result Specificity Score ─────────────────────────────────
  {
    name: "m3: specific-expected-results-score-high",
    tags: ["deterministic", "m3"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    qaOutput: makeGoodQaOutput(),
    expect: { m3Min: 70 },
  },
  {
    name: "m3: vague-expected-results-score-low",
    tags: ["deterministic", "m3"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    qaOutput: makeVagueQaOutput(),
    expect: { m3Max: 20 },
  },

  // ── M6: Curator [qa]-flag Rate ────────────────────────────────────────────
  {
    name: "m6: empty-qa-is-curator-flagged",
    tags: ["deterministic", "m6"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    qaOutput: { testCases: [] },
    html: LOGIN_HTML,
    codeChangeSet: CODESET_OK,
    expect: { m6Flagged: true },
  },

  // ── LLM: End-to-end generation ────────────────────────────────────────────
  {
    name: "llm: login-form-qa-covers-all-criteria",
    tags: ["llm", "m1", "m2", "m3"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    expect: { m1Min: 80, m2Min: 50, m3Min: 50 },
  },
  {
    name: "llm: admin-panel-qa-covers-four-criteria",
    tags: ["llm", "m1", "m2"],
    story: STORY_ADMIN,
    spec: SPEC_ADMIN,
    expect: { m1Min: 75, m2Min: 50 },
  },
  {
    name: "llm: good-qa-output-not-curator-flagged",
    tags: ["llm", "m6"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    html: LOGIN_HTML,
    codeChangeSet: CODESET_OK,
    expect: { m6Flagged: false },
  },
  {
    name: "llm: vague-single-test-is-curator-flagged",
    tags: ["llm", "m6"],
    story: STORY_LOGIN,
    spec: SPEC_LOGIN,
    qaOutput: makeVagueQaOutput(),
    html: LOGIN_HTML,
    codeChangeSet: CODESET_OK,
    expect: { m6Flagged: true },
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

function checkExpect(scores: MetricScores, expect: ScenarioExpect): string[] {
  const fails: string[] = [];

  if (expect.m1Min !== undefined && scores.m1_criterionCoverage < expect.m1Min)
    fails.push(`M1 coverage: expected≥${expect.m1Min}, got=${scores.m1_criterionCoverage}`);
  if (expect.m1Max !== undefined && scores.m1_criterionCoverage > expect.m1Max)
    fails.push(`M1 coverage: expected≤${expect.m1Max}, got=${scores.m1_criterionCoverage}`);

  if (expect.m2Min !== undefined && scores.m2_stepReproducibility < expect.m2Min)
    fails.push(`M2 steps: expected≥${expect.m2Min}, got=${scores.m2_stepReproducibility}`);
  if (expect.m2Max !== undefined && scores.m2_stepReproducibility > expect.m2Max)
    fails.push(`M2 steps: expected≤${expect.m2Max}, got=${scores.m2_stepReproducibility}`);

  if (expect.m3Min !== undefined && scores.m3_expectedSpecificity < expect.m3Min)
    fails.push(`M3 expected: expected≥${expect.m3Min}, got=${scores.m3_expectedSpecificity}`);
  if (expect.m3Max !== undefined && scores.m3_expectedSpecificity > expect.m3Max)
    fails.push(`M3 expected: expected≤${expect.m3Max}, got=${scores.m3_expectedSpecificity}`);

  if (expect.m6Flagged !== undefined) {
    if (scores.m6_curatorQaFlagged === null) {
      fails.push(`M6 curator flag: expected=${expect.m6Flagged} but M6 was not evaluated`);
    } else if (scores.m6_curatorQaFlagged !== expect.m6Flagged) {
      fails.push(`M6 curator flag: expected=${expect.m6Flagged}, got=${scores.m6_curatorQaFlagged}`);
    }
  }

  return fails;
}

async function runScenario(scenario: EvalScenario): Promise<ScenarioResult> {
  const start = Date.now();

  console.log(`\n${"─".repeat(60)}`);
  console.log(`[eval] cenário: ${scenario.name}  tags=[${scenario.tags.join(", ")}]`);
  console.log(`[eval] story: "${scenario.story.title}"`);
  console.log(`[eval] spec.acceptanceCriteria (${scenario.spec.acceptanceCriteria.length}):`);
  for (const ac of scenario.spec.acceptanceCriteria) console.log(`    - ${ac}`);
  console.log(
    `[eval] qaOutput: ${scenario.qaOutput ? "fixture (pré-gerada)" : "LLM (geração ao vivo)"}`
  );
  const evaluateM6 =
    scenario.expect.m6Flagged !== undefined && scenario.html !== undefined;
  console.log(
    `[eval] esperado: M1=[${scenario.expect.m1Min ?? ""}..${scenario.expect.m1Max ?? ""}]  M2=[${scenario.expect.m2Min ?? ""}..${scenario.expect.m2Max ?? ""}]  M3=[${scenario.expect.m3Min ?? ""}..${scenario.expect.m3Max ?? ""}]  M6_flagged=${scenario.expect.m6Flagged ?? "n/a"}`
  );

  try {
    let qaOutput: QaOutput;

    if (scenario.qaOutput) {
      qaOutput = scenario.qaOutput;
      console.log("[eval] usando qaOutput fixture");
    } else {
      console.log("[eval] chamando generateQaTests…");
      qaOutput = await generateQaTests(scenario.story, scenario.spec);
    }

    const latencyMs = Date.now() - start;
    const scores = await computeMetrics(
      qaOutput,
      scenario.spec,
      scenario.html,
      scenario.codeChangeSet,
      evaluateM6
    );

    console.log(`[eval] resultado (${latencyMs}ms):`);
    console.log(`  M1 criterion coverage    : ${scores.m1_criterionCoverage}/100`);
    console.log(`  M2 step reproducibility  : ${scores.m2_stepReproducibility}/100`);
    console.log(`  M3 expected specificity  : ${scores.m3_expectedSpecificity}/100`);
    console.log(`  M6 curator qa-flagged    : ${scores.m6_curatorQaFlagged === null ? "n/a" : scores.m6_curatorQaFlagged}`);
    console.log(`  testCases count          : ${qaOutput.testCases.length}`);
    for (const tc of qaOutput.testCases) {
      console.log(`    [${tc.id}] ${tc.criterion}`);
      console.log(`      steps: ${tc.steps.length}  expected_len: ${tc.expected.length}`);
    }

    const failures = checkExpect(scores, scenario.expect);
    const verdict = failures.length === 0 ? "PASS" : "FAIL";
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
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    console.log(`[eval] ERRO após ${latencyMs}ms: ${String(err)}`);
    const scores: MetricScores = {
      m1_criterionCoverage: 0,
      m2_stepReproducibility: 0,
      m3_expectedSpecificity: 0,
      m6_curatorQaFlagged: null,
    };
    return {
      name: scenario.name,
      tags: scenario.tags,
      verdict: "FAIL",
      scores,
      expected: scenario.expect,
      failures: [`erro: ${String(err)}`],
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
  const m1 = `M1=${String(r.scores.m1_criterionCoverage).padStart(3)}`;
  const m2 = `M2=${String(r.scores.m2_stepReproducibility).padStart(3)}`;
  const m3 = `M3=${String(r.scores.m3_expectedSpecificity).padStart(3)}`;
  const m6 =
    r.scores.m6_curatorQaFlagged === null
      ? "M6=--"
      : `M6=${r.scores.m6_curatorQaFlagged ? "flagged" : "ok     "}`;
  return `${icon} ${r.name.padEnd(52)} ${m1}  ${m2}  ${m3}  ${m6}  [${fmt(r.latencyMs)}]`;
}

async function main() {
  const activeScenarios = SCENARIOS.filter((s) => {
    if (!RUN_LLM && s.tags.includes("llm")) return false;
    if (FILTER && !s.name.includes(FILTER)) return false;
    return true;
  });

  const line = "─".repeat(100);
  console.log("\nAvaliação do QA Agent (geração de casos de teste)");
  console.log(line);
  if (!RUN_LLM) {
    console.log("(Cenários LLM ignorados — passe --llm para incluí-los)\n");
  }

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

  const withM1 = results.filter(
    (r) => r.expected.m1Min !== undefined || r.expected.m1Max !== undefined
  );
  const withM2 = results.filter(
    (r) => r.expected.m2Min !== undefined || r.expected.m2Max !== undefined
  );
  const withM3 = results.filter(
    (r) => r.expected.m3Min !== undefined || r.expected.m3Max !== undefined
  );
  const withM6 = results.filter((r) => r.expected.m6Flagged !== undefined);

  const m1Ok = withM1.filter((r) => {
    const s = r.scores.m1_criterionCoverage;
    return (
      (r.expected.m1Min === undefined || s >= r.expected.m1Min) &&
      (r.expected.m1Max === undefined || s <= r.expected.m1Max)
    );
  }).length;
  const m2Ok = withM2.filter((r) => {
    const s = r.scores.m2_stepReproducibility;
    return (
      (r.expected.m2Min === undefined || s >= r.expected.m2Min) &&
      (r.expected.m2Max === undefined || s <= r.expected.m2Max)
    );
  }).length;
  const m3Ok = withM3.filter((r) => {
    const s = r.scores.m3_expectedSpecificity;
    return (
      (r.expected.m3Min === undefined || s >= r.expected.m3Min) &&
      (r.expected.m3Max === undefined || s <= r.expected.m3Max)
    );
  }).length;
  const m6Ok = withM6.filter(
    (r) =>
      r.scores.m6_curatorQaFlagged !== null &&
      r.scores.m6_curatorQaFlagged === r.expected.m6Flagged
  ).length;

  const llmResults = results.filter((r) => r.tags.includes("llm"));
  const avgLlmMs =
    llmResults.length > 0
      ? Math.round(
          llmResults.reduce((acc, r) => acc + r.latencyMs, 0) / llmResults.length
        )
      : 0;

  const avgM1 =
    results.length > 0
      ? Math.round(
          results.reduce((acc, r) => acc + r.scores.m1_criterionCoverage, 0) / results.length
        )
      : 0;
  const avgM2 =
    results.length > 0
      ? Math.round(
          results.reduce((acc, r) => acc + r.scores.m2_stepReproducibility, 0) / results.length
        )
      : 0;
  const avgM3 =
    results.length > 0
      ? Math.round(
          results.reduce((acc, r) => acc + r.scores.m3_expectedSpecificity, 0) / results.length
        )
      : 0;

  console.log(`\nResultados: ${passed}/${total} aprovados  (${pct}%)`);
  if (withM1.length > 0)
    console.log(
      `  M1 Criterion Coverage Rate (#21) (média)   : ${avgM1}/100  (${m1Ok}/${withM1.length} dentro do intervalo)`
    );
  if (withM2.length > 0)
    console.log(
      `  M2 Step Reproducibility Score (#22) (média): ${avgM2}/100  (${m2Ok}/${withM2.length} dentro do intervalo)`
    );
  if (withM3.length > 0)
    console.log(
      `  M3 Expected Specificity Score (#23) (média): ${avgM3}/100  (${m3Ok}/${withM3.length} dentro do intervalo)`
    );
  if (withM6.length > 0)
    console.log(
      `  M6 Curator [qa]-flag Rate (#26)            : ${m6Ok}/${withM6.length} corretos`
    );
  if (llmResults.length > 0)
    console.log(
      `  Latência média LLM                         : ${fmt(avgLlmMs)}  (${llmResults.length} chamada${llmResults.length > 1 ? "s" : ""})`
    );

  console.log();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
