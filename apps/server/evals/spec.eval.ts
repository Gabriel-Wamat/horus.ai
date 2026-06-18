/**
 * Spec Agent Eval Harness
 *
 * Evaluates the spec agent output against five metrics:
 *   M1 – Schema Pass Rate        : structural JSON validity
 *   M2 – Pattern Selection Accuracy : correct visual pattern for story type
 *   M3 – Artifact Completeness Score: richness of required spec fields
 *   M4 – Hallucination Rate      : invented content not implied by story
 *   M5 – AC Testability Score    : acceptance criteria are observable/actionable
 *
 * Usage (from apps/server/):
 *   tsx evals/spec.eval.ts              # deterministic fixture scenarios only
 *   tsx evals/spec.eval.ts --llm        # include LLM generation scenarios (costs tokens)
 *   tsx evals/spec.eval.ts --filter m2  # run only scenarios whose name contains "m2"
 *
 * Add to package.json:
 *   "eval:spec": "tsx evals/spec.eval.ts"
 */

import "dotenv/config";
import { SpecSchema, type Spec, type UserStory } from "@u-build/shared";
import { generateSpec } from "../src/infrastructure/agents/SpecAgentImpl.js";
import { loadAgentSkill } from "../src/infrastructure/agentSkills/loadAgentSkill.js";

// ─── CLI Flags ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const RUN_LLM = argv.includes("--llm");
const FILTER = argv.find((a) => !a.startsWith("--")) ?? "";

// ─── Metric Types ─────────────────────────────────────────────────────────────

interface MetricScores {
  m1_schemaValid: boolean;
  m2_patternMatch: boolean | null;
  m3_completeness: number;
  m4_hallucinationRisk: number;
  m5_testability: number;
}

interface ScenarioExpect {
  m1?: boolean;
  m2?: string;
  m3Min?: number;
  m3Max?: number;
  m4Min?: number;
  m4Max?: number;
  m5Min?: number;
  m5Max?: number;
}

interface EvalScenario {
  name: string;
  tags: string[];
  story: UserStory;
  spec?: Spec;
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

// ─── Valid Pattern IDs ────────────────────────────────────────────────────────

const VALID_PATTERNS = [
  "operational-dashboard",
  "chat-preview-workbench",
  "workflow-map",
  "form-crud-tool",
  "content-landing",
  "custom-product-surface",
] as const;

// ─── Scoring Functions ────────────────────────────────────────────────────────

function scoreM1(spec: Spec): boolean {
  return SpecSchema.safeParse(spec).success;
}

function scoreM2(spec: Spec, expectedPattern: string): boolean {
  const approach = spec.technicalApproach.toLowerCase();
  const archetype = (spec.visualContract?.layoutArchetype ?? "").toLowerCase();
  return (
    approach.includes(`pattern: ${expectedPattern}`) ||
    archetype.includes(expectedPattern)
  );
}

function scoreM3(spec: Spec, story: UserStory): number {
  let score = 0;

  if (spec.summary.length >= 20) score += 10;

  if (VALID_PATTERNS.some((p) => spec.technicalApproach.includes(`Pattern: ${p}`)))
    score += 15;

  if (spec.components.length >= 2) score += 10;

  if (spec.dataModels.length >= 1) score += 10;

  if (spec.acceptanceCriteria.length >= story.acceptanceCriteria.length) score += 15;

  const vc = spec.visualContract;
  if (vc && vc.states.length > 0) score += 15;
  if (vc && vc.antiPatterns.length > 0) score += 10;

  const approach = spec.technicalApproach.toLowerCase();
  const stateKeywords = ["loading", "vazio", "empty", "error", "erro"];
  if (stateKeywords.some((k) => approach.includes(k))) score += 15;

  return Math.min(score, 100);
}

function scoreM4(spec: Spec, story: UserStory): number {
  const storyText = [
    story.title,
    story.description,
    ...story.acceptanceCriteria,
  ]
    .join(" ")
    .toLowerCase();

  let penalty = 0;

  // apiEndpoints on a clearly static story (no backend implication)
  const impliesBackend =
    /api|backend|servidor|server|salvar|save|buscar|fetch|banco|database|persistir|persist|upload|autenticar|authenticate|enviar|send|criar\s+\w|atualizar|update|deletar|delete/i.test(
      storyText
    );
  if (!impliesBackend && spec.apiEndpoints.length > 0) penalty += 35;

  // Auth/login mentions without story implying authentication
  const impliesAuth =
    /login|autenti|auth|senha|password|signin|sign in|conta|account|credencial/i.test(
      storyText
    );
  const specMentionsAuth =
    /autenticação|authentication|login route|signin|jwt|token de acesso/i.test(
      spec.technicalApproach
    );
  if (!impliesAuth && specMentionsAuth) penalty += 25;

  // Real-time/WebSocket on a clearly static story
  const impliesRealtime =
    /tempo real|real.?time|websocket|sse|stream|live|ao vivo/i.test(storyText);
  const specMentionsRealtime =
    /websocket|sse|server.sent|real.?time|socket\.io/i.test(
      spec.technicalApproach
    );
  if (!impliesRealtime && specMentionsRealtime) penalty += 20;

  return Math.min(penalty, 100);
}

function scoreM5(spec: Spec): number {
  if (spec.acceptanceCriteria.length === 0) return 0;

  const testableVerbs =
    /\b(clica|submete|entra|seleciona|arrasta|aparece|exibe|navega|mostra|esconde|abre|fecha|digita|vê|visualiza|preenche|confirma|cancela|filtra|ordena|clique|click|submit|enter|select|appear|display|navigate|show|hide|open|close|type|see|fill|verify|filter|sort|drag)\b/i;

  const vagueMarkers =
    /\b(funciona|funcione|correto|adequado|certo|apropriado|works|correct|proper|should work|deve funcionar|está ok|is ok|é exibido corretamente|displayed correctly)\b/i;

  let testable = 0;
  for (const ac of spec.acceptanceCriteria) {
    if (testableVerbs.test(ac) && !vagueMarkers.test(ac)) testable++;
  }

  return Math.round((testable / spec.acceptanceCriteria.length) * 100);
}

function computeMetrics(spec: Spec, story: UserStory, expectedPattern?: string): MetricScores {
  return {
    m1_schemaValid: scoreM1(spec),
    m2_patternMatch: expectedPattern != null ? scoreM2(spec, expectedPattern) : null,
    m3_completeness: scoreM3(spec, story),
    m4_hallucinationRisk: scoreM4(spec, story),
    m5_testability: scoreM5(spec),
  };
}

// ─── Fixture Factories ────────────────────────────────────────────────────────

const ID1 = "bbbbbbbb-0000-4000-8000-000000000001";
const ID2 = "bbbbbbbb-0000-4000-8000-000000000002";
const NOW = new Date().toISOString();

function makeStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: ID1,
    title: "Painel de administração de usuários",
    description:
      "Como admin, quero um painel que mostre todos os usuários cadastrados com busca e filtros para ativar ou desativar contas rapidamente.",
    acceptanceCriteria: [
      "O admin visualiza uma tabela com nome, email e status de cada usuário",
      "O campo de busca filtra a lista em tempo real pelo nome ou email",
      "Ao clicar em Desativar, o status do usuário muda imediatamente na tabela",
    ],
    priority: "high",
    labels: ["admin", "gestão-de-usuários"],
    createdAt: NOW,
    ...overrides,
  };
}

function makeGoodSpec(story: UserStory): Spec {
  return SpecSchema.parse({
    id: ID2,
    userStoryId: story.id,
    version: 1,
    summary: "Painel administrativo de usuários com busca, filtro e ações de status",
    technicalApproach:
      "Pattern: operational-dashboard. Tabela de dados paginada com cabeçalho fixo, campo de busca em tempo real com debounce de 300ms e filtro por status. Linha expandida mostra ações de ativar/desativar. Loading skeleton durante fetch. Estado vazio com CTA de recarregar. Error banner não bloqueante. Responsivo: coluna de ações colapsa em mobile. Acessibilidade: role=table, aria-live na contagem de resultados filtrados.",
    components: [
      {
        name: "UserTable",
        type: "ui",
        description:
          "Tabela principal com virtualização para listas longas, ordenação por coluna e seleção múltipla",
        dependencies: ["UserTableRow", "TablePagination"],
      },
      {
        name: "UserSearchBar",
        type: "ui",
        description: "Input de busca com debounce e indicador de loading",
        dependencies: [],
      },
      {
        name: "UserStatusToggle",
        type: "ui",
        description: "Botão de toggle ativar/desativar com confirmação inline",
        dependencies: [],
      },
    ],
    apiEndpoints: [
      {
        method: "GET",
        path: "/api/admin/users",
        description: "Lista paginada de usuários com filtros de busca e status",
      },
      {
        method: "PATCH",
        path: "/api/admin/users/:id/status",
        description: "Atualiza o status ativo/inativo de um usuário",
      },
    ],
    dataModels: [
      "User: { id, name, email, status: 'active'|'inactive', createdAt }",
      "UserListResponse: { items: User[], total, page, pageSize }",
    ],
    acceptanceCriteria: [
      "O admin visualiza uma tabela com nome, email e status de cada usuário",
      "O campo de busca filtra a lista enquanto o admin digita, com debounce de 300ms",
      "Ao clicar em Desativar, o status do usuário muda imediatamente na tabela sem reload",
      "Em tela mobile a coluna de ações é acessível via menu contextual",
      "Estado vazio exibe mensagem 'Nenhum usuário encontrado' e botão de limpar filtro",
    ],
    visualContract: {
      mode: "preserve_identity",
      designSource: "project_files",
      layoutArchetype: "operational-dashboard / admin user table",
      density: "compact",
      tone: "profissional e direto; sem decoração excessiva",
      colorPolicy: {
        background: ["#f9fafb"],
        surface: ["#ffffff"],
        text: ["#111827", "#6b7280"],
        accent: ["#3b82f6"],
        forbidden: ["gradientes decorativos", "sombras pesadas"],
        usageRules: ["accent apenas em ações primárias e links"],
      },
      typography: {
        families: ["system-ui", "Inter"],
        scaleRules: ["label: 0.75rem", "body: 0.875rem", "heading: 1.25rem"],
      },
      spacingAndShape: {
        spacingScale: ["4px", "8px", "12px", "16px", "24px"],
        radiusRules: ["8px para cards", "4px para inputs"],
        strokeRules: ["1px #d1d5db para bordas de tabela"],
        shadowRules: ["sem sombra no corpo da tabela"],
      },
      componentPolicy: {
        preferExistingComponents: true,
        allowedLibraries: ["shadcn/ui"],
        requiredPatterns: ["tabela com filtro inline", "skeleton loading por linha"],
        forbiddenPatterns: ["modal bloqueante para ações simples", "card grid para dados tabulares"],
      },
      states: ["default", "loading", "empty", "error"],
      responsiveRules: ["colunas secundárias colapsam em telas < 768px"],
      accessibilityRules: ["role=table", "aria-live='polite' na contagem de resultados"],
      antiPatterns: ["card grid para dado tabular", "loading bloqueante de tela inteira"],
      referenceFiles: [],
    },
    generatedAt: NOW,
  });
}

function makeMinimalSpec(story: UserStory): Spec {
  return SpecSchema.parse({
    id: ID2,
    userStoryId: story.id,
    version: 1,
    summary: "Tela",
    technicalApproach: "HTML simples.",
    components: [
      {
        name: "Page",
        type: "ui",
        description: "Página principal",
        dependencies: [],
      },
      {
        name: "List",
        type: "ui",
        description: "Lista de itens",
        dependencies: [],
      },
    ],
    apiEndpoints: [],
    dataModels: ["User: { id, name }"],
    acceptanceCriteria: ["A tela funciona", "Os dados são exibidos corretamente"],
    visualContract: {
      mode: "blank_project",
      designSource: "generated_default",
      layoutArchetype: "generic page",
      density: "balanced",
      tone: "neutro",
      colorPolicy: { background: [], surface: [], text: [], accent: [], forbidden: [], usageRules: [] },
      typography: { families: [], scaleRules: [] },
      spacingAndShape: { spacingScale: [], radiusRules: [], strokeRules: [], shadowRules: [] },
      componentPolicy: { preferExistingComponents: true, allowedLibraries: [], requiredPatterns: [], forbiddenPatterns: [] },
      states: [],
      responsiveRules: [],
      accessibilityRules: [],
      antiPatterns: [],
      referenceFiles: [],
    },
    generatedAt: NOW,
  });
}

function makeHallucinatedSpec(story: UserStory): Spec {
  return SpecSchema.parse({
    id: ID2,
    userStoryId: story.id,
    version: 1,
    summary: "Página de listagem estática com painel de analytics e autenticação JWT",
    technicalApproach:
      "Pattern: operational-dashboard. Inclui autenticação JWT com refresh token, WebSocket para atualizações em tempo real e integração com serviço de analytics externo. Endpoint POST /api/auth/login obrigatório.",
    components: [
      {
        name: "AuthGuard",
        type: "service",
        description: "Guarda de rota com validação de token JWT",
        dependencies: [],
      },
      {
        name: "AnalyticsDashboard",
        type: "ui",
        description: "Painel de métricas em tempo real com gráficos",
        dependencies: [],
      },
      {
        name: "WebSocketManager",
        type: "service",
        description: "Gerenciador de conexão WebSocket para dados ao vivo",
        dependencies: [],
      },
    ],
    apiEndpoints: [
      { method: "POST", path: "/api/auth/login", description: "Autenticação com JWT" },
      { method: "GET", path: "/api/analytics/metrics", description: "Métricas de uso em tempo real" },
    ],
    dataModels: ["JwtPayload: { sub, iat, exp }", "AnalyticsMetrics: { dau, wau, mau }"],
    acceptanceCriteria: [
      "O sistema autentica o usuário via JWT",
      "Os gráficos atualizam em tempo real via WebSocket",
    ],
    visualContract: {
      mode: "blank_project",
      designSource: "generated_default",
      layoutArchetype: "operational-dashboard",
      density: "compact",
      tone: "técnico",
      colorPolicy: { background: [], surface: [], text: [], accent: [], forbidden: [], usageRules: [] },
      typography: { families: [], scaleRules: [] },
      spacingAndShape: { spacingScale: [], radiusRules: [], strokeRules: [], shadowRules: [] },
      componentPolicy: { preferExistingComponents: true, allowedLibraries: [], requiredPatterns: [], forbiddenPatterns: [] },
      states: [],
      responsiveRules: [],
      accessibilityRules: [],
      antiPatterns: [],
      referenceFiles: [],
    },
    generatedAt: NOW,
  });
}

// ─── Fixtures: User Stories ───────────────────────────────────────────────────

const STORY_ADMIN_USERS = makeStory();

const STORY_CHAT_AGENT: UserStory = {
  id: "cccccccc-0000-4000-8000-000000000001",
  title: "Interface de chat com agente de IA",
  description:
    "Como usuário, quero enviar mensagens para um agente de IA e visualizar as respostas em tempo real com um indicador de progresso mostrando os passos do agente.",
  acceptanceCriteria: [
    "O usuário digita uma mensagem e clica em Enviar",
    "Um indicador de progresso mostra os passos intermediários do agente enquanto processa",
    "A resposta final do agente é exibida com formatação Markdown",
    "O botão Enviar é desabilitado durante o processamento",
  ],
  priority: "high",
  labels: ["chat", "agente"],
  createdAt: NOW,
};

const STORY_PROFILE_SETTINGS: UserStory = {
  id: "dddddddd-0000-4000-8000-000000000001",
  title: "Edição de perfil do usuário",
  description:
    "Como usuário, quero editar meu nome, email e foto de perfil através de um formulário com validação inline e salvar as alterações no backend.",
  acceptanceCriteria: [
    "O formulário exibe os dados atuais do usuário ao carregar",
    "Ao alterar o email para um formato inválido, uma mensagem de erro aparece abaixo do campo",
    "O botão Salvar fica desabilitado enquanto o upload da foto está em progresso",
    "Após salvar com sucesso, um toast de confirmação é exibido no topo da tela",
  ],
  priority: "medium",
  labels: ["perfil", "formulário"],
  createdAt: NOW,
};

const STORY_STATIC_MARKETING: UserStory = {
  id: "eeeeeeee-0000-4000-8000-000000000001",
  title: "Página de apresentação do produto",
  description:
    "Como visitante, quero ver uma página de apresentação do produto com hero section, lista de funcionalidades e depoimentos de clientes.",
  acceptanceCriteria: [
    "A hero section exibe título, subtítulo e botão de call-to-action",
    "A seção de funcionalidades lista pelo menos 3 items com ícone e descrição",
    "Os depoimentos são exibidos em um carrossel com navegação por dots",
    "A página carrega em menos de 2 segundos em conexão 4G",
  ],
  priority: "low",
  labels: ["marketing", "landing"],
  createdAt: NOW,
};

// ─── Scenarios ───────────────────────────────────────────────────────────────

const SCENARIOS: EvalScenario[] = [
  // ── M1: Schema Pass Rate ──────────────────────────────────────────────────
  {
    name: "m1: complete-spec-passes-schema",
    tags: ["deterministic", "m1"],
    story: STORY_ADMIN_USERS,
    spec: makeGoodSpec(STORY_ADMIN_USERS),
    expect: { m1: true },
  },
  {
    name: "m1: minimal-spec-still-passes-schema",
    tags: ["deterministic", "m1"],
    story: STORY_ADMIN_USERS,
    spec: makeMinimalSpec(STORY_ADMIN_USERS),
    expect: { m1: true },
  },

  // ── M2: Pattern Selection Accuracy ────────────────────────────────────────
  {
    name: "m2: admin-panel-uses-dashboard-pattern",
    tags: ["deterministic", "m2"],
    story: STORY_ADMIN_USERS,
    spec: makeGoodSpec(STORY_ADMIN_USERS),
    expect: { m2: "operational-dashboard" },
  },
  {
    name: "m2: marketing-page-uses-content-landing-pattern",
    tags: ["deterministic", "m2"],
    story: STORY_STATIC_MARKETING,
    spec: (() =>
      SpecSchema.parse({
        id: ID2,
        userStoryId: STORY_STATIC_MARKETING.id,
        version: 1,
        summary: "Página de apresentação do produto com hero, features e depoimentos",
        technicalApproach:
          "Pattern: content-landing. HTML estático com CSS Grid para layout de seções. Carrossel de depoimentos com CSS scroll snap e navegação por dots. Sem chamadas de API. Responsivo: layout de 1 coluna em mobile, 3 colunas em desktop. Carregamento lazy de imagens.",
        components: [
          { name: "HeroSection", type: "ui", description: "Título, subtítulo e CTA principal", dependencies: [] },
          { name: "FeatureList", type: "ui", description: "Grid de funcionalidades com ícone e descrição", dependencies: [] },
          { name: "TestimonialCarousel", type: "ui", description: "Carrossel de depoimentos com dots de navegação", dependencies: [] },
        ],
        apiEndpoints: [],
        dataModels: ["Feature: { icon, title, description }", "Testimonial: { author, role, quote, avatar }"],
        acceptanceCriteria: STORY_STATIC_MARKETING.acceptanceCriteria,
        visualContract: {
          mode: "blank_project",
          designSource: "generated_default",
          layoutArchetype: "content-landing / product marketing page",
          density: "spacious",
          tone: "convidativo e inspirador",
          colorPolicy: { background: ["#ffffff"], surface: ["#f9fafb"], text: ["#111827"], accent: ["#6366f1"], forbidden: [], usageRules: [] },
          typography: { families: ["Inter"], scaleRules: ["hero: 2.5rem", "body: 1rem"] },
          spacingAndShape: { spacingScale: ["16px", "32px", "64px"], radiusRules: ["12px para cards"], strokeRules: [], shadowRules: ["sombra suave em cards"] },
          componentPolicy: { preferExistingComponents: true, allowedLibraries: [], requiredPatterns: ["hero section", "scroll snap carousel"], forbiddenPatterns: ["formulário de login", "tabela de dados"] },
          states: ["default", "loading"],
          responsiveRules: ["1 coluna em mobile", "3 colunas em desktop"],
          accessibilityRules: ["aria-label nos dots do carrossel"],
          antiPatterns: ["tabela de dados em página de marketing", "modal bloqueante na primeira visita"],
          referenceFiles: [],
        },
        generatedAt: NOW,
      }))(),
    expect: { m2: "content-landing" },
  },

  // ── M3: Artifact Completeness Score ───────────────────────────────────────
  {
    name: "m3: rich-spec-scores-high",
    tags: ["deterministic", "m3"],
    story: STORY_ADMIN_USERS,
    spec: makeGoodSpec(STORY_ADMIN_USERS),
    expect: { m3Min: 85 },
  },
  {
    name: "m3: minimal-spec-scores-low",
    tags: ["deterministic", "m3"],
    story: STORY_ADMIN_USERS,
    spec: makeMinimalSpec(STORY_ADMIN_USERS),
    expect: { m3Max: 35 },
  },

  // ── M4: Hallucination Rate ────────────────────────────────────────────────
  {
    name: "m4: static-story-clean-spec-no-hallucination",
    tags: ["deterministic", "m4"],
    story: STORY_STATIC_MARKETING,
    spec: (() => {
      const s = makeMinimalSpec(STORY_STATIC_MARKETING);
      return {
        ...s,
        summary: "Página de apresentação com hero, funcionalidades e depoimentos",
        technicalApproach:
          "Pattern: content-landing. HTML estático com CSS Grid. Carrossel de depoimentos via CSS scroll snap. Sem dependências de backend. Responsivo: layout de 1 coluna em mobile.",
        acceptanceCriteria: STORY_STATIC_MARKETING.acceptanceCriteria,
        visualContract: s.visualContract
          ? {
              ...s.visualContract,
              layoutArchetype: "content-landing / product marketing page",
            }
          : s.visualContract,
      };
    })(),
    expect: { m4Max: 0 },
  },
  {
    name: "m4: hallucinated-auth-and-websocket-on-static-story",
    tags: ["deterministic", "m4"],
    story: STORY_STATIC_MARKETING,
    spec: makeHallucinatedSpec(STORY_STATIC_MARKETING),
    expect: { m4Min: 30 },
  },

  // ── M5: Acceptance Criteria Testability ───────────────────────────────────
  {
    name: "m5: testable-criteria-score-high",
    tags: ["deterministic", "m5"],
    story: STORY_PROFILE_SETTINGS,
    spec: makeGoodSpec(STORY_PROFILE_SETTINGS),
    expect: { m5Min: 60 },
  },
  {
    name: "m5: vague-criteria-score-low",
    tags: ["deterministic", "m5"],
    story: STORY_ADMIN_USERS,
    spec: makeMinimalSpec(STORY_ADMIN_USERS),
    expect: { m5Max: 20 },
  },

  // ── LLM: End-to-end generation ────────────────────────────────────────────
  {
    name: "llm: admin-panel-selects-dashboard-pattern",
    tags: ["llm", "m1", "m2", "m3"],
    story: STORY_ADMIN_USERS,
    expect: {
      m1: true,
      m2: "operational-dashboard",
      m3Min: 70,
      m4Max: 40,
    },
  },
  {
    name: "llm: chat-interface-selects-workbench-pattern",
    tags: ["llm", "m1", "m2", "m3"],
    story: STORY_CHAT_AGENT,
    expect: {
      m1: true,
      m2: "chat-preview-workbench",
      m3Min: 70,
    },
  },
  {
    name: "llm: settings-form-selects-form-crud-pattern",
    tags: ["llm", "m1", "m2", "m3", "m5"],
    story: STORY_PROFILE_SETTINGS,
    expect: {
      m1: true,
      m2: "form-crud-tool",
      m3Min: 70,
      m5Min: 50,
    },
  },
  {
    name: "llm: static-landing-page-no-hallucinated-endpoints",
    tags: ["llm", "m1", "m2", "m4"],
    story: STORY_STATIC_MARKETING,
    expect: {
      m1: true,
      m2: "content-landing",
      m4Max: 10,
    },
  },
  {
    name: "llm: all-story-acs-covered-in-spec",
    tags: ["llm", "m3", "m5"],
    story: STORY_PROFILE_SETTINGS,
    expect: {
      m1: true,
      m3Min: 65,
      m5Min: 50,
    },
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

function checkExpect(
  scores: MetricScores,
  expect: ScenarioExpect
): string[] {
  const fails: string[] = [];

  if (expect.m1 !== undefined && scores.m1_schemaValid !== expect.m1) {
    fails.push(`M1 schema: expected=${expect.m1}, got=${scores.m1_schemaValid}`);
  }
  if (expect.m2 !== undefined) {
    if (scores.m2_patternMatch === null) {
      fails.push(`M2 pattern: expected="${expect.m2}" but no pattern to compare`);
    } else if (!scores.m2_patternMatch) {
      fails.push(`M2 pattern: expected="${expect.m2}" not found in spec`);
    }
  }
  if (expect.m3Min !== undefined && scores.m3_completeness < expect.m3Min) {
    fails.push(`M3 completeness: expected≥${expect.m3Min}, got=${scores.m3_completeness}`);
  }
  if (expect.m3Max !== undefined && scores.m3_completeness > expect.m3Max) {
    fails.push(`M3 completeness: expected≤${expect.m3Max}, got=${scores.m3_completeness}`);
  }
  if (expect.m4Min !== undefined && scores.m4_hallucinationRisk < expect.m4Min) {
    fails.push(`M4 hallucination: expected≥${expect.m4Min}, got=${scores.m4_hallucinationRisk}`);
  }
  if (expect.m4Max !== undefined && scores.m4_hallucinationRisk > expect.m4Max) {
    fails.push(`M4 hallucination: expected≤${expect.m4Max}, got=${scores.m4_hallucinationRisk}`);
  }
  if (expect.m5Min !== undefined && scores.m5_testability < expect.m5Min) {
    fails.push(`M5 testability: expected≥${expect.m5Min}, got=${scores.m5_testability}`);
  }
  if (expect.m5Max !== undefined && scores.m5_testability > expect.m5Max) {
    fails.push(`M5 testability: expected≤${expect.m5Max}, got=${scores.m5_testability}`);
  }

  return fails;
}

async function runScenario(
  scenario: EvalScenario,
  skill: string
): Promise<ScenarioResult> {
  const start = Date.now();

  console.log(`\n${"─".repeat(60)}`);
  console.log(
    `[eval] cenário: ${scenario.name}  tags=[${scenario.tags.join(", ")}]`
  );
  console.log(`[eval] story: "${scenario.story.title}"`);
  console.log(
    `[eval] story.acceptanceCriteria (${scenario.story.acceptanceCriteria.length}):`
  );
  for (const ac of scenario.story.acceptanceCriteria) {
    console.log(`    - ${ac}`);
  }
  console.log(`[eval] spec: ${scenario.spec ? "fixture (pré-gerada)" : "LLM (geração ao vivo)"}`);
  console.log(
    `[eval] esperado: M1=${scenario.expect.m1 ?? "n/a"}  M2=${scenario.expect.m2 ?? "n/a"}  M3=[${scenario.expect.m3Min ?? ""}..${scenario.expect.m3Max ?? ""}]  M4≤${scenario.expect.m4Max ?? "n/a"}  M5≥${scenario.expect.m5Min ?? "n/a"}`
  );

  try {
    let spec: Spec;

    if (scenario.spec) {
      spec = scenario.spec;
      console.log("[eval] usando spec fixture");
    } else {
      console.log("[eval] chamando generateSpec…");
      spec = await generateSpec(scenario.story, { skill });
    }

    const latencyMs = Date.now() - start;
    const scores = computeMetrics(spec, scenario.story, scenario.expect.m2);

    console.log(`[eval] resultado (${latencyMs}ms):`);
    console.log(`  M1 schema válido    : ${scores.m1_schemaValid}`);
    console.log(`  M2 padrão visual    : ${scores.m2_patternMatch === null ? "n/a" : scores.m2_patternMatch} (archetype="${spec.visualContract?.layoutArchetype ?? "n/a"}")`);
    console.log(`  M3 completude       : ${scores.m3_completeness}/100`);
    console.log(`  M4 risco alucinação : ${scores.m4_hallucinationRisk}/100 (menor = melhor)`);
    console.log(`  M5 testabilidade AC : ${scores.m5_testability}/100`);
    console.log(`  spec.summary        : "${spec.summary}"`);
    console.log(`  spec.components     : ${spec.components.length}`);
    console.log(`  spec.apiEndpoints   : ${spec.apiEndpoints.length}`);
    console.log(`  spec.dataModels     : ${spec.dataModels.length}`);
    console.log(`  spec.acceptanceCriteria (${spec.acceptanceCriteria.length}):`);
    for (const ac of spec.acceptanceCriteria) {
      console.log(`    - ${ac}`);
    }
    if (spec.visualContract) {
      console.log(`  visualContract.states      : [${spec.visualContract.states.join(", ")}]`);
      console.log(`  visualContract.antiPatterns: ${spec.visualContract.antiPatterns.length}`);
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
      m1_schemaValid: false,
      m2_patternMatch: null,
      m3_completeness: 0,
      m4_hallucinationRisk: 100,
      m5_testability: 0,
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
  const m1 = `M1=${r.scores.m1_schemaValid ? "ok" : "fail"}`;
  const m2 = `M2=${r.scores.m2_patternMatch === null ? "--" : r.scores.m2_patternMatch ? "ok" : "fail"}`;
  const m3 = `M3=${String(r.scores.m3_completeness).padStart(3)}`;
  const m4 = `M4=${String(r.scores.m4_hallucinationRisk).padStart(3)}`;
  const m5 = `M5=${String(r.scores.m5_testability).padStart(3)}`;
  const time = fmt(r.latencyMs);
  return `${icon} ${r.name.padEnd(52)} ${m1}  ${m2}  ${m3}  ${m4}  ${m5}  [${time}]`;
}

async function main() {
  const activeScenarios = SCENARIOS.filter((s) => {
    if (!RUN_LLM && s.tags.includes("llm")) return false;
    if (FILTER && !s.name.includes(FILTER)) return false;
    return true;
  });

  const line = "─".repeat(100);
  console.log("\nAvaliação do Agente de Especificações");
  console.log(line);
  if (!RUN_LLM) {
    console.log("(Cenários LLM ignorados — passe --llm para incluí-los)\n");
  }

  const skill = loadAgentSkill("spec-frontend-sdd");

  const results: ScenarioResult[] = [];
  for (const scenario of activeScenarios) {
    process.stdout.write(`  running: ${scenario.name}…\r`);
    const result = await runScenario(scenario, skill);
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

  const withM1 = results.filter((r) => r.expected.m1 !== undefined);
  const withM2 = results.filter((r) => r.expected.m2 !== undefined);
  const withM3 = results.filter(
    (r) => r.expected.m3Min !== undefined || r.expected.m3Max !== undefined
  );
  const withM4 = results.filter(
    (r) => r.expected.m4Min !== undefined || r.expected.m4Max !== undefined
  );
  const withM5 = results.filter(
    (r) => r.expected.m5Min !== undefined || r.expected.m5Max !== undefined
  );

  const m1Ok = withM1.filter((r) => r.scores.m1_schemaValid === r.expected.m1).length;
  const m2Ok = withM2.filter((r) => r.scores.m2_patternMatch === true).length;
  const m3Ok = withM3.filter((r) => {
    const s = r.scores.m3_completeness;
    return (
      (r.expected.m3Min === undefined || s >= r.expected.m3Min) &&
      (r.expected.m3Max === undefined || s <= r.expected.m3Max)
    );
  }).length;
  const m4Ok = withM4.filter((r) => {
    const s = r.scores.m4_hallucinationRisk;
    return (
      (r.expected.m4Min === undefined || s >= r.expected.m4Min) &&
      (r.expected.m4Max === undefined || s <= r.expected.m4Max)
    );
  }).length;
  const m5Ok = withM5.filter((r) => {
    const s = r.scores.m5_testability;
    return (
      (r.expected.m5Min === undefined || s >= r.expected.m5Min) &&
      (r.expected.m5Max === undefined || s <= r.expected.m5Max)
    );
  }).length;

  const llmResults = results.filter((r) => r.tags.includes("llm"));
  const avgLlmMs =
    llmResults.length > 0
      ? Math.round(
          llmResults.reduce((acc, r) => acc + r.latencyMs, 0) / llmResults.length
        )
      : 0;

  const avgM3 =
    results.length > 0
      ? Math.round(results.reduce((acc, r) => acc + r.scores.m3_completeness, 0) / results.length)
      : 0;
  const avgM4 =
    results.length > 0
      ? Math.round(
          results.reduce((acc, r) => acc + r.scores.m4_hallucinationRisk, 0) / results.length
        )
      : 0;
  const avgM5 =
    results.length > 0
      ? Math.round(results.reduce((acc, r) => acc + r.scores.m5_testability, 0) / results.length)
      : 0;

  console.log(`\nResultados: ${passed}/${total} aprovados  (${pct}%)`);
  if (withM1.length > 0)
    console.log(`  M1 Schema Pass Rate       : ${m1Ok}/${withM1.length} corretos`);
  if (withM2.length > 0)
    console.log(`  M2 Pattern Accuracy       : ${m2Ok}/${withM2.length} corretos`);
  if (withM3.length > 0)
    console.log(
      `  M3 Completeness (média)   : ${avgM3}/100  (${m3Ok}/${withM3.length} dentro do intervalo)`
    );
  if (withM4.length > 0)
    console.log(
      `  M4 Hallucination (média)  : ${avgM4}/100  (${m4Ok}/${withM4.length} dentro do intervalo)  [menor = melhor; m4Min testa detecção de problemas]`
    );
  if (withM5.length > 0)
    console.log(
      `  M5 Testability (média)    : ${avgM5}/100  (${m5Ok}/${withM5.length} dentro do intervalo)`
    );
  if (llmResults.length > 0)
    console.log(
      `  Latência média LLM        : ${fmt(avgLlmMs)}  (${llmResults.length} chamada${llmResults.length > 1 ? "s" : ""})`
    );

  console.log();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
