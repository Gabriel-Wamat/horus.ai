/**
 * Front Agent Eval Harness
 *
 * Evaluates the front agent HTML generation flow against six metrics:
 *   M1 – Pattern Compliance Rate             : HTML declares the correct frontend pattern
 *   M2 – Acceptance Criteria Implementation  : AC items are represented in the generated HTML
 *   M3 – Interactive States Coverage         : loading, empty, error states are present
 *   M4 – Anti-Pattern Violation Rate         : visualContract anti-patterns are not violated
 *   M5 – Build/Lint/Test Pass Rate           : HTML is structurally valid
 *   M6 – Targeted Fix Resolution Rate        : curator feedback items are resolved on retry
 *
 * Usage (from apps/server/):
 *   tsx evals/front.eval.ts              # deterministic fixture scenarios only
 *   tsx evals/front.eval.ts --llm        # include LLM generation scenarios (costs tokens)
 *   tsx evals/front.eval.ts --filter m3  # run only scenarios whose name contains "m3"
 *
 * Add to package.json:
 *   "eval:front": "tsx evals/front.eval.ts"
 */

import "dotenv/config";
import { SpecSchema, type Spec, type UserStory } from "@u-build/shared";
import { generateFrontend } from "../src/infrastructure/agents/FrontAgentImpl.js";
import type { CuratorFeedback } from "../src/infrastructure/langgraph/state.js";

// ─── CLI Flags ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const RUN_LLM = argv.includes("--llm");
const FILTER = argv.find((a) => !a.startsWith("--")) ?? "";

// ─── Metric Types ─────────────────────────────────────────────────────────────

interface MetricScores {
  m1_patternCompliance: boolean | null;
  m2_acImplementation: number;
  m3_statesCoverage: number;
  m4_antiPatternViolation: number;
  m5_structuralValidity: boolean;
  m6_fixResolution: number | null;
}

interface ScenarioExpect {
  m1?: boolean;
  m2Min?: number;
  m2Max?: number;
  m3Min?: number;
  m3Max?: number;
  m4Min?: number;
  m4Max?: number;
  m5?: boolean;
  m6Min?: number;
  m6Max?: number;
}

interface EvalScenario {
  name: string;
  tags: string[];
  story: UserStory;
  spec: Spec;
  html?: string;
  curatorFeedback?: CuratorFeedback;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const ID1 = "bbbbbbbb-0000-4000-8000-000000000001";
const ID2 = "bbbbbbbb-0000-4000-8000-000000000002";
const NOW = new Date().toISOString();

const VALID_PATTERNS = [
  "operational-dashboard",
  "chat-preview-workbench",
  "workflow-map",
  "form-crud-tool",
  "content-landing",
  "custom-product-surface",
] as const;

// ─── Stop Words (PT-BR + EN) ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "o","a","os","as","um","uma","de","do","da","dos","das","em","no","na","nos","nas",
  "e","é","para","com","que","ao","se","por","mais","ou","como","ser","ter","estar",
  "seu","sua","seus","suas","pelo","pela","pelos","pelas","cada","este","esta","esse",
  "essa","seu","sua","num","numa","quando","onde","this","the","an","is","are","was",
  "were","be","been","have","has","had","do","does","did","will","would","could",
  "should","may","might","must","shall","can","not","no","and","or","but","in","on",
  "at","to","for","with","from","by","about","into","through","before","after","of",
  "up","down","out","off","also","its","it","he","she","they","we","you","your",
]);

// ─── Scoring Functions ────────────────────────────────────────────────────────

function scoreM1(html: string, expectedPattern: string): boolean {
  // Check for pattern in HTML comments, data attributes, class names or inline text
  return html.toLowerCase().includes(expectedPattern.toLowerCase());
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOP_WORDS.has(t));
}

function scoreM2(html: string, story: UserStory): number {
  if (story.acceptanceCriteria.length === 0) return 0;
  const lower = html.toLowerCase();
  let covered = 0;
  for (const ac of story.acceptanceCriteria) {
    const kws = extractKeywords(ac);
    if (kws.length === 0) continue;
    const found = kws.filter((kw) => lower.includes(kw));
    if (found.length >= Math.ceil(kws.length * 0.4)) covered++;
  }
  return Math.round((covered / story.acceptanceCriteria.length) * 100);
}

const STATE_KEYWORDS: Record<string, string[]> = {
  loading: ["loading", "carregando", "skeleton", "shimmer", "spinner"],
  empty: ["empty", "vazio", "nenhum", "sem dados", "no data", "nenhum resultado"],
  error: ["error", "erro", "falha", "failed", "tente novamente", "try again"],
  default: ["default", "content", "conteúdo", "lista", "tabela", "grid"],
};

function scoreM3(html: string, spec: Spec): number {
  const lower = html.toLowerCase();
  const required = spec.visualContract?.states ?? [];
  const toCheck = required.length > 0 ? required : ["loading", "empty", "error"];
  let covered = 0;
  for (const state of toCheck) {
    const kws = STATE_KEYWORDS[state] ?? [state];
    if (kws.some((kw) => lower.includes(kw))) covered++;
  }
  return Math.round((covered / toCheck.length) * 100);
}

function detectAntiPatternViolation(html: string, antiPattern: string): boolean {
  const ap = antiPattern.toLowerCase();
  const lower = html.toLowerCase();

  if (ap.includes("modal bloqueante") || (ap.includes("modal") && ap.includes("ação"))) {
    const hasFixedOverlay = /position\s*:\s*fixed/.test(lower);
    const hasModal = /class="[^"]*modal[^"]*"/.test(lower);
    return hasFixedOverlay && hasModal;
  }

  if (ap.includes("card") && (ap.includes("tabular") || ap.includes("dado"))) {
    const hasCardGrid =
      /class="[^"]*grid[^"]*"/.test(lower) && /class="[^"]*card[^"]*"/.test(lower);
    const hasTable = /<table\b/.test(lower);
    return hasCardGrid && !hasTable;
  }

  if (ap.includes("loading bloqueante") || (ap.includes("loading") && ap.includes("inteira"))) {
    const hasFullScreenOverlay =
      /position\s*:\s*fixed/.test(lower) &&
      /width\s*:\s*100%/.test(lower) &&
      /height\s*:\s*100%/.test(lower);
    const hasLoadingText = /carregando|loading/.test(lower);
    return hasFullScreenOverlay && hasLoadingText;
  }

  // Generic: check if anti-pattern keyword cluster appears in a suspicious context
  const tokens = ap.split(/\s+/).filter((t) => t.length > 3);
  const matchCount = tokens.filter((t) => lower.includes(t)).length;
  return matchCount >= Math.ceil(tokens.length * 0.6);
}

function scoreM4(html: string, spec: Spec): number {
  const antiPatterns = spec.visualContract?.antiPatterns ?? [];
  if (antiPatterns.length === 0) return 0;
  let violations = 0;
  for (const ap of antiPatterns) {
    if (detectAntiPatternViolation(html, ap)) violations++;
  }
  return Math.round((violations / antiPatterns.length) * 100);
}

function scoreM5(html: string): boolean {
  const trimmed = html.trimStart().toLowerCase();
  return (
    trimmed.startsWith("<!doctype html>") &&
    /<html\b/i.test(html) &&
    /<head\b/i.test(html) &&
    /<body\b/i.test(html) &&
    /<\/body>/i.test(html) &&
    /<\/html>/i.test(html) &&
    /<title[^>]*>[^<]+<\/title>/i.test(html) &&
    /<meta\s+charset/i.test(html)
  );
}

function scoreM6(html: string, feedback: CuratorFeedback): number {
  if (feedback.missingItems.length === 0) return 100;
  const lower = html.toLowerCase();
  let resolved = 0;
  for (const item of feedback.missingItems) {
    const kws = extractKeywords(item);
    if (kws.length === 0) continue;
    const found = kws.filter((kw) => lower.includes(kw));
    if (found.length >= Math.ceil(kws.length * 0.4)) resolved++;
  }
  return Math.round((resolved / feedback.missingItems.length) * 100);
}

function computeMetrics(
  html: string,
  story: UserStory,
  spec: Spec,
  expectedPattern: string | undefined,
  curatorFeedback: CuratorFeedback | undefined
): MetricScores {
  return {
    m1_patternCompliance: expectedPattern != null ? scoreM1(html, expectedPattern) : null,
    m2_acImplementation: scoreM2(html, story),
    m3_statesCoverage: scoreM3(html, spec),
    m4_antiPatternViolation: scoreM4(html, spec),
    m5_structuralValidity: scoreM5(html),
    m6_fixResolution: curatorFeedback ? scoreM6(html, curatorFeedback) : null,
  };
}

// ─── Stories ──────────────────────────────────────────────────────────────────

const STORY_ADMIN_USERS: UserStory = {
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
};

const STORY_CHAT_AGENT: UserStory = {
  id: "cccccccc-0000-4000-8000-000000000001",
  title: "Interface de chat com agente de IA",
  description:
    "Como usuário, quero enviar mensagens para um agente de IA e visualizar as respostas em tempo real com indicador de progresso.",
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
    "Como usuário, quero editar meu nome, email e foto de perfil através de um formulário com validação inline.",
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
    "Como visitante, quero ver uma página de apresentação do produto com hero section, lista de funcionalidades e depoimentos.",
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

// ─── Spec Factories ───────────────────────────────────────────────────────────

function makeAdminSpec(): Spec {
  return SpecSchema.parse({
    id: ID2,
    userStoryId: STORY_ADMIN_USERS.id,
    version: 1,
    summary: "Painel administrativo de usuários com busca, filtro e ações de status",
    technicalApproach:
      "Pattern: operational-dashboard. Tabela paginada com busca em tempo real (debounce 300ms) e filtro por status. Skeleton loading por linha. Estado vazio com CTA de limpar filtro. Error banner não bloqueante.",
    components: [
      { name: "UserTable", type: "ui", description: "Tabela de usuários com paginação e ordenação", dependencies: ["UserTableRow"] },
      { name: "UserSearchBar", type: "ui", description: "Input de busca com debounce", dependencies: [] },
      { name: "UserStatusToggle", type: "ui", description: "Botão toggle ativar/desativar", dependencies: [] },
    ],
    apiEndpoints: [
      { method: "GET", path: "/api/admin/users", description: "Lista de usuários com filtros" },
      { method: "PATCH", path: "/api/admin/users/:id/status", description: "Atualiza status do usuário" },
    ],
    dataModels: ["User: { id, name, email, status: 'active'|'inactive' }"],
    acceptanceCriteria: STORY_ADMIN_USERS.acceptanceCriteria,
    visualContract: {
      mode: "preserve_identity",
      designSource: "project_files",
      layoutArchetype: "operational-dashboard / admin user table",
      density: "compact",
      tone: "profissional e direto",
      colorPolicy: { background: ["#f9fafb"], surface: ["#ffffff"], text: ["#111827"], accent: ["#3b82f6"], forbidden: [], usageRules: [] },
      typography: { families: ["system-ui"], scaleRules: [] },
      spacingAndShape: { spacingScale: [], radiusRules: [], strokeRules: [], shadowRules: [] },
      componentPolicy: { preferExistingComponents: true, allowedLibraries: [], requiredPatterns: ["tabela com filtro inline", "skeleton loading por linha"], forbiddenPatterns: [] },
      states: ["default", "loading", "empty", "error"],
      responsiveRules: [],
      accessibilityRules: [],
      antiPatterns: ["card grid para dado tabular", "modal bloqueante para ações simples", "loading bloqueante de tela inteira"],
      referenceFiles: [],
    },
    generatedAt: NOW,
  });
}

function makeChatSpec(): Spec {
  return SpecSchema.parse({
    id: ID2,
    userStoryId: STORY_CHAT_AGENT.id,
    version: 1,
    summary: "Interface de chat com streaming de resposta e indicador de progresso do agente",
    technicalApproach:
      "Pattern: chat-preview-workbench. Painel dividido: input + histórico de mensagens à esquerda, preview do progresso do agente à direita. Indicador de streaming com dots animados. Markdown rendering na resposta final. Botão desabilitado durante processamento.",
    components: [
      { name: "ChatInput", type: "ui", description: "Textarea com botão Enviar", dependencies: [] },
      { name: "MessageList", type: "ui", description: "Histórico de mensagens com scroll", dependencies: [] },
      { name: "AgentProgressIndicator", type: "ui", description: "Passos intermediários do agente", dependencies: [] },
    ],
    apiEndpoints: [],
    dataModels: ["Message: { role: 'user'|'agent', content, timestamp }", "AgentStep: { id, label, status }"],
    acceptanceCriteria: STORY_CHAT_AGENT.acceptanceCriteria,
    visualContract: {
      mode: "blank_project",
      designSource: "generated_default",
      layoutArchetype: "chat-preview-workbench",
      density: "balanced",
      tone: "técnico e acessível",
      colorPolicy: { background: [], surface: [], text: [], accent: [], forbidden: [], usageRules: [] },
      typography: { families: [], scaleRules: [] },
      spacingAndShape: { spacingScale: [], radiusRules: [], strokeRules: [], shadowRules: [] },
      componentPolicy: { preferExistingComponents: true, allowedLibraries: [], requiredPatterns: [], forbiddenPatterns: [] },
      states: ["default", "loading", "empty", "error"],
      responsiveRules: [],
      accessibilityRules: [],
      antiPatterns: [],
      referenceFiles: [],
    },
    generatedAt: NOW,
  });
}

function makeProfileSpec(): Spec {
  return SpecSchema.parse({
    id: ID2,
    userStoryId: STORY_PROFILE_SETTINGS.id,
    version: 1,
    summary: "Formulário de edição de perfil com validação inline e upload de foto",
    technicalApproach:
      "Pattern: form-crud-tool. Formulário com campos de nome, email e foto. Validação inline no blur. Upload de foto com preview e indicador de progresso. Toast de sucesso após salvar. Botão desabilitado durante upload.",
    components: [
      { name: "ProfileForm", type: "ui", description: "Formulário principal de perfil", dependencies: [] },
      { name: "AvatarUpload", type: "ui", description: "Upload de foto com preview", dependencies: [] },
      { name: "ToastNotification", type: "ui", description: "Toast de confirmação de sucesso", dependencies: [] },
    ],
    apiEndpoints: [
      { method: "PUT", path: "/api/profile", description: "Salva alterações do perfil" },
      { method: "POST", path: "/api/profile/avatar", description: "Upload da foto de perfil" },
    ],
    dataModels: ["Profile: { name, email, avatarUrl }"],
    acceptanceCriteria: STORY_PROFILE_SETTINGS.acceptanceCriteria,
    visualContract: {
      mode: "blank_project",
      designSource: "generated_default",
      layoutArchetype: "form-crud-tool",
      density: "balanced",
      tone: "limpo e acessível",
      colorPolicy: { background: [], surface: [], text: [], accent: [], forbidden: [], usageRules: [] },
      typography: { families: [], scaleRules: [] },
      spacingAndShape: { spacingScale: [], radiusRules: [], strokeRules: [], shadowRules: [] },
      componentPolicy: { preferExistingComponents: true, allowedLibraries: [], requiredPatterns: [], forbiddenPatterns: [] },
      states: ["default", "loading", "error"],
      responsiveRules: [],
      accessibilityRules: [],
      antiPatterns: ["modal bloqueante para ações simples"],
      referenceFiles: [],
    },
    generatedAt: NOW,
  });
}

function makeMarketingSpec(): Spec {
  return SpecSchema.parse({
    id: ID2,
    userStoryId: STORY_STATIC_MARKETING.id,
    version: 1,
    summary: "Página de apresentação do produto com hero, funcionalidades e depoimentos",
    technicalApproach:
      "Pattern: content-landing. HTML estático com CSS Grid. Hero section com CTA. Grid de funcionalidades com ícone e descrição. Carrossel de depoimentos com CSS scroll snap e dots de navegação. Sem backend.",
    components: [
      { name: "HeroSection", type: "ui", description: "Título, subtítulo e CTA principal", dependencies: [] },
      { name: "FeatureGrid", type: "ui", description: "Grid de funcionalidades com ícone", dependencies: [] },
      { name: "TestimonialCarousel", type: "ui", description: "Carrossel com dots de navegação", dependencies: [] },
    ],
    apiEndpoints: [],
    dataModels: ["Feature: { icon, title, description }", "Testimonial: { author, quote }"],
    acceptanceCriteria: STORY_STATIC_MARKETING.acceptanceCriteria,
    visualContract: {
      mode: "blank_project",
      designSource: "generated_default",
      layoutArchetype: "content-landing / product marketing page",
      density: "spacious",
      tone: "convidativo e inspirador",
      colorPolicy: { background: [], surface: [], text: [], accent: [], forbidden: [], usageRules: [] },
      typography: { families: [], scaleRules: [] },
      spacingAndShape: { spacingScale: [], radiusRules: [], strokeRules: [], shadowRules: [] },
      componentPolicy: { preferExistingComponents: true, allowedLibraries: [], requiredPatterns: [], forbiddenPatterns: [] },
      states: ["default", "loading"],
      responsiveRules: [],
      accessibilityRules: [],
      antiPatterns: ["tabela de dados em página de marketing", "modal bloqueante na primeira visita"],
      referenceFiles: [],
    },
    generatedAt: NOW,
  });
}

// ─── HTML Fixtures ────────────────────────────────────────────────────────────

// Good HTML: has pattern comment, covers ACs, all interactive states, no anti-patterns, valid structure
const GOOD_ADMIN_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Painel de Usuários</title>
<!-- pattern: operational-dashboard -->
<style>
:root{--bg:#f9fafb;--surface:#fff;--text:#111827;--muted:#6b7280;--accent:#3b82f6;--border:#d1d5db}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--text);padding:24px}
.search-bar{display:flex;gap:8px;margin-bottom:16px}
.search-bar input{flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:4px;font-size:.875rem}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:8px}
th,td{padding:12px 16px;text-align:left;border-bottom:1px solid var(--border);font-size:.875rem}
th{color:var(--muted);font-size:.75rem;text-transform:uppercase}
.status-badge{display:inline-flex;padding:2px 8px;border-radius:9999px;font-size:.75rem;font-weight:500}
.status-badge.active{background:#d1fae5;color:#065f46}
.status-badge.inactive{background:#fee2e2;color:#991b1b}
.skeleton{height:40px;background:#e5e7eb;border-radius:4px;margin-bottom:8px;animation:shimmer 1.5s infinite}
@keyframes shimmer{0%,100%{opacity:1}50%{opacity:.5}}
.empty-state{text-align:center;padding:48px;color:var(--muted)}
.error-banner{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;color:#991b1b;margin-bottom:16px}
</style>
</head>
<body>
<h1 style="font-size:1.25rem;font-weight:600;margin-bottom:24px">Gerenciamento de Usuários</h1>

<!-- Estado: loading -->
<div id="state-loading" style="display:none" aria-live="polite">
  <div class="skeleton"></div>
  <div class="skeleton"></div>
  <div class="skeleton"></div>
</div>

<!-- Estado: error -->
<div id="state-error" class="error-banner" style="display:none" role="alert">
  Erro ao carregar usuários. <button onclick="loadUsers()">Tentar novamente</button>
</div>

<!-- Estado: empty -->
<div id="state-empty" class="empty-state" style="display:none">
  <p>Nenhum usuário encontrado.</p>
  <button onclick="clearFilters()">Limpar filtro</button>
</div>

<!-- Estado: default -->
<div id="state-default">
  <div class="search-bar">
    <input type="search" id="busca" placeholder="Buscar por nome ou email…"
           oninput="filtrar()" aria-label="Buscar usuários">
    <select id="filtro-status" onchange="filtrar()" aria-label="Status">
      <option value="">Todos</option>
      <option value="active">Ativos</option>
      <option value="inactive">Inativos</option>
    </select>
  </div>
  <table role="table" aria-label="Lista de usuários">
    <thead>
      <tr><th>Nome</th><th>Email</th><th>Status</th><th>Ações</th></tr>
    </thead>
    <tbody id="user-list"></tbody>
  </table>
</div>

<script>
const USERS=[
  {id:'1',name:'Ana Silva',email:'ana@ex.com',status:'active'},
  {id:'2',name:'Bruno Costa',email:'bruno@ex.com',status:'inactive'},
];

function setState(s){
  ['loading','error','empty','default'].forEach(function(k){
    var el=document.getElementById('state-'+k);
    if(el) el.style.display=k===s?'':'none';
  });
}

function filtrar(){
  var q=(document.getElementById('busca').value||'').toLowerCase();
  var sf=document.getElementById('filtro-status').value;
  var filtered=USERS.filter(function(u){
    return (!q||(u.name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q)))
      &&(!sf||u.status===sf);
  });
  if(!filtered.length){setState('empty');return;}
  setState('default');
  document.getElementById('user-list').innerHTML=filtered.map(function(u){
    return '<tr><td>'+u.name+'</td><td>'+u.email+'</td>'
      +'<td><span class="status-badge '+u.status+'">'+(u.status==='active'?'Ativo':'Inativo')+'</span></td>'
      +'<td><button onclick="toggleStatus(\''+u.id+'\',\''+u.status+'\')">'
      +(u.status==='active'?'Desativar':'Ativar')+'</button></td></tr>';
  }).join('');
}

function toggleStatus(id,cur){
  var u=USERS.find(function(x){return x.id===id;});
  if(u) u.status=cur==='active'?'inactive':'active';
  filtrar();
}

function clearFilters(){
  document.getElementById('busca').value='';
  document.getElementById('filtro-status').value='';
  filtrar();
}

function loadUsers(){setState('default');filtrar();}
setState('default');filtrar();
</script>
</body>
</html>`;

// Minimal HTML: valid structure but missing pattern, states, and AC coverage
const MINIMAL_ADMIN_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Usuários</title>
<style>body{font-family:sans-serif;padding:20px}</style>
</head>
<body>
<h1>Usuários</h1>
<p>Lista de usuários cadastrados.</p>
<table>
  <thead><tr><th>Nome</th><th>Email</th></tr></thead>
  <tbody>
    <tr><td>Ana</td><td>ana@ex.com</td></tr>
  </tbody>
</table>
</body>
</html>`;

// Anti-pattern HTML: card grid + blocking modal + full-screen loading overlay
const ANTIPATTERN_ADMIN_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Usuários</title>
<!-- pattern: operational-dashboard -->
<style>
body{font-family:sans-serif;padding:20px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px}
.modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center}
.modal-box{background:#fff;border-radius:8px;padding:24px;min-width:400px}
.loading-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;z-index:9999;display:flex;align-items:center;justify-content:center;font-size:2rem}
</style>
</head>
<body>
<h1>Usuários</h1>
<div class="grid" id="user-grid">
  <div class="card"><h3>Ana Silva</h3><p>ana@ex.com</p><p>Ativo</p><button onclick="showModal('1')">Desativar</button></div>
  <div class="card"><h3>Bruno Costa</h3><p>bruno@ex.com</p><p>Inativo</p><button onclick="showModal('2')">Ativar</button></div>
</div>
<div class="modal" id="modal" style="display:none">
  <div class="modal-box">
    <h2>Confirmar ação</h2>
    <p>Deseja alterar o status do usuário?</p>
    <button onclick="confirmAction()">Confirmar</button>
    <button onclick="closeModal()">Cancelar</button>
  </div>
</div>
<div class="loading-overlay" id="loading-overlay" style="display:none">Carregando...</div>
<script>
var target=null;
function showModal(id){target=id;document.getElementById('modal').style.display='flex';}
function closeModal(){document.getElementById('modal').style.display='none';}
function confirmAction(){closeModal();}
</script>
</body>
</html>`;

// Retry HTML: addresses curator feedback items (loading skeleton, empty state, error banner, search with debounce)
const RETRY_ADMIN_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Painel de Usuários</title>
<!-- pattern: operational-dashboard -->
<style>
body{font-family:system-ui,sans-serif;padding:24px}
.skeleton{height:40px;background:#e5e7eb;border-radius:4px;margin:4px 0;animation:shimmer 1.5s infinite}
@keyframes shimmer{0%,100%{opacity:1}50%{opacity:.4}}
.empty-state{padding:32px;text-align:center;color:#6b7280}
.error-banner{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;color:#b91c1c}
input[type=search]{padding:8px 12px;border:1px solid #d1d5db;border-radius:4px;width:300px}
table{width:100%;border-collapse:collapse}
th,td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:left}
</style>
</head>
<body>
<h1>Gerenciamento de Usuários</h1>

<div id="st-loading" aria-live="polite">
  <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
</div>

<div id="st-error" class="error-banner" style="display:none" role="alert">
  Erro ao carregar dados. <button onclick="load()">Tentar novamente</button>
</div>

<div id="st-empty" class="empty-state" style="display:none">
  Nenhum usuário encontrado. <button onclick="reset()">Limpar filtro</button>
</div>

<div id="st-default" style="display:none">
  <input type="search" id="busca" placeholder="Buscar por nome ou email…"
         oninput="scheduleFilter()" aria-label="Buscar usuários">
  <table>
    <thead><tr><th>Nome</th><th>Email</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody id="tbody"></tbody>
  </table>
</div>

<script>
var USERS=[{id:'1',name:'Ana',email:'ana@ex.com',status:'active'},{id:'2',name:'Bruno',email:'b@ex.com',status:'inactive'}];
var debounceTimer=null;
function scheduleFilter(){clearTimeout(debounceTimer);debounceTimer=setTimeout(filter,300);}
function setState(s){['loading','error','empty','default'].forEach(function(k){
  var el=document.getElementById('st-'+k);if(el)el.style.display=k===s?'':'none';
});}
function filter(){
  var q=document.getElementById('busca').value.toLowerCase();
  var res=USERS.filter(function(u){return !q||(u.name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q));});
  if(!res.length){setState('empty');return;}
  setState('default');
  document.getElementById('tbody').innerHTML=res.map(function(u){
    return '<tr><td>'+u.name+'</td><td>'+u.email+'</td><td>'+u.status+'</td>'
      +'<td><button onclick="toggle(\''+u.id+'\')">'+(u.status==='active'?'Desativar':'Ativar')+'</button></td></tr>';
  }).join('');
}
function toggle(id){var u=USERS.find(function(x){return x.id===id;});if(u)u.status=u.status==='active'?'inactive':'active';filter();}
function reset(){document.getElementById('busca').value='';filter();}
function load(){setTimeout(function(){setState('default');filter();},300);}
setTimeout(function(){setState('default');filter();},500);
</script>
</body>
</html>`;

// ─── Fixture: Curator Feedback ────────────────────────────────────────────────

const CURATOR_FEEDBACK_MISSING_STATES: CuratorFeedback = {
  passed: false,
  score: 35,
  notes: "O HTML não implementa os estados de loading, empty e error conforme o visualContract, e a busca não usa debounce.",
  missingItems: [
    "Estado de loading com skeleton por linha não implementado",
    "Estado empty com mensagem 'Nenhum usuário encontrado' e botão de limpar filtro ausente",
    "Estado de erro com banner não bloqueante ausente",
    "Busca em tempo real com debounce não implementada",
  ],
  fixTarget: "front",
};

// ─── Scenarios ────────────────────────────────────────────────────────────────

const SPEC_ADMIN = makeAdminSpec();
const SPEC_CHAT = makeChatSpec();
const SPEC_PROFILE = makeProfileSpec();
const SPEC_MARKETING = makeMarketingSpec();

const SCENARIOS: EvalScenario[] = [
  // ── M1: Pattern Compliance Rate ───────────────────────────────────────────
  {
    name: "m1: good-html-declares-operational-dashboard",
    tags: ["deterministic", "m1"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    html: GOOD_ADMIN_HTML,
    expect: { m1: true },
  },
  {
    name: "m1: minimal-html-without-pattern-comment-fails",
    tags: ["deterministic", "m1"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    html: MINIMAL_ADMIN_HTML,
    expect: { m1: false },
  },

  // ── M2: Acceptance Criteria Implementation Rate ───────────────────────────
  {
    name: "m2: rich-html-covers-admin-acs",
    tags: ["deterministic", "m2"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    html: GOOD_ADMIN_HTML,
    expect: { m2Min: 75 },
  },
  {
    name: "m2: minimal-html-misses-most-acs",
    tags: ["deterministic", "m2"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    html: MINIMAL_ADMIN_HTML,
    expect: { m2Max: 40 },
  },

  // ── M3: Interactive States Coverage ──────────────────────────────────────
  {
    name: "m3: html-with-all-states-scores-high",
    tags: ["deterministic", "m3"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    html: GOOD_ADMIN_HTML,
    expect: { m3Min: 80 },
  },
  {
    name: "m3: stateless-html-scores-low",
    tags: ["deterministic", "m3"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    html: MINIMAL_ADMIN_HTML,
    expect: { m3Max: 30 },
  },

  // ── M4: Anti-Pattern Violation Rate ──────────────────────────────────────
  {
    name: "m4: table-html-no-antipattern-violations",
    tags: ["deterministic", "m4"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    html: GOOD_ADMIN_HTML,
    expect: { m4Max: 0 },
  },
  {
    name: "m4: card-grid-and-modal-html-has-violations",
    tags: ["deterministic", "m4"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    html: ANTIPATTERN_ADMIN_HTML,
    expect: { m4Min: 40 },
  },

  // ── M5: Build/Lint/Test Pass Rate ─────────────────────────────────────────
  {
    name: "m5: complete-html-passes-structural-check",
    tags: ["deterministic", "m5"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    html: GOOD_ADMIN_HTML,
    expect: { m5: true },
  },

  // ── M6: Targeted Fix Resolution Rate ─────────────────────────────────────
  {
    name: "m6: retry-html-resolves-curator-feedback-items",
    tags: ["deterministic", "m6"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    html: RETRY_ADMIN_HTML,
    curatorFeedback: CURATOR_FEEDBACK_MISSING_STATES,
    expect: { m6Min: 75 },
  },

  // ── LLM: End-to-end generation ────────────────────────────────────────────
  {
    name: "llm: admin-panel-html-pattern-compliance-and-validity",
    tags: ["llm", "m1", "m5"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    expect: { m1: true, m5: true },
  },
  {
    name: "llm: marketing-page-acs-coverage",
    tags: ["llm", "m2"],
    story: STORY_STATIC_MARKETING,
    spec: SPEC_MARKETING,
    expect: { m2Min: 60 },
  },
  {
    name: "llm: chat-interface-interactive-states",
    tags: ["llm", "m3"],
    story: STORY_CHAT_AGENT,
    spec: SPEC_CHAT,
    expect: { m3Min: 60 },
  },
  {
    name: "llm: form-html-avoids-antipatterns",
    tags: ["llm", "m4", "m5"],
    story: STORY_PROFILE_SETTINGS,
    spec: SPEC_PROFILE,
    expect: { m4Max: 20, m5: true },
  },
  {
    name: "llm: admin-retry-with-curator-feedback-resolves-issues",
    tags: ["llm", "m6"],
    story: STORY_ADMIN_USERS,
    spec: SPEC_ADMIN,
    curatorFeedback: CURATOR_FEEDBACK_MISSING_STATES,
    expect: { m6Min: 60 },
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

function checkExpect(scores: MetricScores, expect: ScenarioExpect): string[] {
  const fails: string[] = [];

  if (expect.m1 !== undefined) {
    if (scores.m1_patternCompliance === null) {
      fails.push(`M1 pattern: expected=${expect.m1} but no pattern expected was set`);
    } else if (scores.m1_patternCompliance !== expect.m1) {
      fails.push(`M1 pattern: expected=${expect.m1}, got=${scores.m1_patternCompliance}`);
    }
  }
  if (expect.m2Min !== undefined && scores.m2_acImplementation < expect.m2Min)
    fails.push(`M2 AC impl: expected≥${expect.m2Min}, got=${scores.m2_acImplementation}`);
  if (expect.m2Max !== undefined && scores.m2_acImplementation > expect.m2Max)
    fails.push(`M2 AC impl: expected≤${expect.m2Max}, got=${scores.m2_acImplementation}`);
  if (expect.m3Min !== undefined && scores.m3_statesCoverage < expect.m3Min)
    fails.push(`M3 states: expected≥${expect.m3Min}, got=${scores.m3_statesCoverage}`);
  if (expect.m3Max !== undefined && scores.m3_statesCoverage > expect.m3Max)
    fails.push(`M3 states: expected≤${expect.m3Max}, got=${scores.m3_statesCoverage}`);
  if (expect.m4Min !== undefined && scores.m4_antiPatternViolation < expect.m4Min)
    fails.push(`M4 anti-pattern: expected≥${expect.m4Min}, got=${scores.m4_antiPatternViolation}`);
  if (expect.m4Max !== undefined && scores.m4_antiPatternViolation > expect.m4Max)
    fails.push(`M4 anti-pattern: expected≤${expect.m4Max}, got=${scores.m4_antiPatternViolation}`);
  if (expect.m5 !== undefined && scores.m5_structuralValidity !== expect.m5)
    fails.push(`M5 structural: expected=${expect.m5}, got=${scores.m5_structuralValidity}`);
  if (expect.m6Min !== undefined) {
    if (scores.m6_fixResolution === null)
      fails.push(`M6 fix: expected≥${expect.m6Min} but no curator feedback was set`);
    else if (scores.m6_fixResolution < expect.m6Min)
      fails.push(`M6 fix: expected≥${expect.m6Min}, got=${scores.m6_fixResolution}`);
  }
  if (expect.m6Max !== undefined && scores.m6_fixResolution !== null && scores.m6_fixResolution > expect.m6Max)
    fails.push(`M6 fix: expected≤${expect.m6Max}, got=${scores.m6_fixResolution}`);

  return fails;
}

async function runScenario(scenario: EvalScenario): Promise<ScenarioResult> {
  const start = Date.now();
  const expectedPattern = VALID_PATTERNS.find((p) =>
    scenario.spec.technicalApproach.toLowerCase().includes(p)
  );

  console.log(`\n${"─".repeat(60)}`);
  console.log(
    `[eval] cenário: ${scenario.name}  tags=[${scenario.tags.join(", ")}]`
  );
  console.log(`[eval] story: "${scenario.story.title}"`);
  console.log(`[eval] padrão esperado: ${expectedPattern ?? "n/a"}`);
  console.log(
    `[eval] html: ${scenario.html ? "fixture (pré-gerado)" : "LLM (geração ao vivo)"}`
  );
  if (scenario.curatorFeedback) {
    console.log(
      `[eval] curatorFeedback: score=${scenario.curatorFeedback.score}  itens=${scenario.curatorFeedback.missingItems.length}`
    );
  }
  console.log(
    `[eval] esperado: M1=${scenario.expect.m1 ?? "n/a"}  M2=[${scenario.expect.m2Min ?? ""}..${scenario.expect.m2Max ?? ""}]  M3=[${scenario.expect.m3Min ?? ""}..${scenario.expect.m3Max ?? ""}]  M4≤${scenario.expect.m4Max ?? "n/a"}  M5=${scenario.expect.m5 ?? "n/a"}  M6≥${scenario.expect.m6Min ?? "n/a"}`
  );

  try {
    let html: string;

    if (scenario.html) {
      html = scenario.html;
      console.log("[eval] usando html fixture");
    } else {
      console.log("[eval] chamando generateFrontend…");
      const output = await generateFrontend(
        scenario.story,
        scenario.spec,
        scenario.curatorFeedback
      );
      html = output.html;
    }

    const latencyMs = Date.now() - start;
    const scores = computeMetrics(
      html,
      scenario.story,
      scenario.spec,
      expectedPattern,
      scenario.curatorFeedback
    );

    console.log(`[eval] resultado (${latencyMs}ms):`);
    console.log(`  M1 pattern compliance   : ${scores.m1_patternCompliance === null ? "n/a" : scores.m1_patternCompliance} (esperado="${expectedPattern ?? "n/a"}")`);
    console.log(`  M2 AC implementation    : ${scores.m2_acImplementation}/100`);
    console.log(`  M3 states coverage      : ${scores.m3_statesCoverage}/100`);
    console.log(`  M4 anti-pattern violation: ${scores.m4_antiPatternViolation}/100 (menor = melhor)`);
    console.log(`  M5 structural validity  : ${scores.m5_structuralValidity}`);
    console.log(`  M6 fix resolution       : ${scores.m6_fixResolution === null ? "n/a" : `${scores.m6_fixResolution}/100`}`);
    console.log(`  html length (chars)     : ${html.length}`);

    const failures = checkExpect(scores, scenario.expect);
    const verdict = failures.length === 0 ? "PASS" : "FAIL";
    console.log(`[eval] veredicto: ${verdict}`);
    if (failures.length > 0) {
      for (const f of failures) console.log(`  ✗ ${f}`);
    }

    return { name: scenario.name, tags: scenario.tags, verdict, scores, expected: scenario.expect, failures, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    console.log(`[eval] ERRO após ${latencyMs}ms: ${String(err)}`);
    const scores: MetricScores = {
      m1_patternCompliance: null,
      m2_acImplementation: 0,
      m3_statesCoverage: 0,
      m4_antiPatternViolation: 100,
      m5_structuralValidity: false,
      m6_fixResolution: null,
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
  const m1 = `M1=${r.scores.m1_patternCompliance === null ? "--" : r.scores.m1_patternCompliance ? "ok" : "fail"}`;
  const m2 = `M2=${String(r.scores.m2_acImplementation).padStart(3)}`;
  const m3 = `M3=${String(r.scores.m3_statesCoverage).padStart(3)}`;
  const m4 = `M4=${String(r.scores.m4_antiPatternViolation).padStart(3)}`;
  const m5 = `M5=${r.scores.m5_structuralValidity ? "ok" : "fail"}`;
  const m6 = `M6=${r.scores.m6_fixResolution === null ? "--" : String(r.scores.m6_fixResolution).padStart(3)}`;
  return `${icon} ${r.name.padEnd(56)} ${m1}  ${m2}  ${m3}  ${m4}  ${m5}  ${m6}  [${fmt(r.latencyMs)}]`;
}

async function main() {
  const active = SCENARIOS.filter((s) => {
    if (!RUN_LLM && s.tags.includes("llm")) return false;
    if (FILTER && !s.name.includes(FILTER)) return false;
    return true;
  });

  const line = "─".repeat(110);
  console.log("\nAvaliação do Front Agent (geração de HTML)");
  console.log(line);
  if (!RUN_LLM) {
    console.log("(Cenários LLM ignorados — passe --llm para incluí-los)\n");
  }

  const results: ScenarioResult[] = [];
  for (const scenario of active) {
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

  const withM1 = results.filter((r) => r.expected.m1 !== undefined);
  const withM2 = results.filter((r) => r.expected.m2Min !== undefined || r.expected.m2Max !== undefined);
  const withM3 = results.filter((r) => r.expected.m3Min !== undefined || r.expected.m3Max !== undefined);
  const withM4 = results.filter((r) => r.expected.m4Min !== undefined || r.expected.m4Max !== undefined);
  const withM5 = results.filter((r) => r.expected.m5 !== undefined);
  const withM6 = results.filter((r) => r.expected.m6Min !== undefined || r.expected.m6Max !== undefined);

  const m1Ok = withM1.filter((r) => r.scores.m1_patternCompliance === r.expected.m1).length;
  const m2Ok = withM2.filter((r) => {
    const s = r.scores.m2_acImplementation;
    return (r.expected.m2Min === undefined || s >= r.expected.m2Min) && (r.expected.m2Max === undefined || s <= r.expected.m2Max);
  }).length;
  const m3Ok = withM3.filter((r) => {
    const s = r.scores.m3_statesCoverage;
    return (r.expected.m3Min === undefined || s >= r.expected.m3Min) && (r.expected.m3Max === undefined || s <= r.expected.m3Max);
  }).length;
  const m4Ok = withM4.filter((r) => {
    const s = r.scores.m4_antiPatternViolation;
    return (r.expected.m4Min === undefined || s >= r.expected.m4Min) && (r.expected.m4Max === undefined || s <= r.expected.m4Max);
  }).length;
  const m5Ok = withM5.filter((r) => r.scores.m5_structuralValidity === r.expected.m5).length;
  const m6Ok = withM6.filter((r) => {
    const s = r.scores.m6_fixResolution;
    if (s === null) return false;
    return (r.expected.m6Min === undefined || s >= r.expected.m6Min) && (r.expected.m6Max === undefined || s <= r.expected.m6Max);
  }).length;

  const llmResults = results.filter((r) => r.tags.includes("llm"));
  const avgLlmMs =
    llmResults.length > 0
      ? Math.round(llmResults.reduce((acc, r) => acc + r.latencyMs, 0) / llmResults.length)
      : 0;

  const avgM2 = results.length > 0 ? Math.round(results.reduce((acc, r) => acc + r.scores.m2_acImplementation, 0) / results.length) : 0;
  const avgM3 = results.length > 0 ? Math.round(results.reduce((acc, r) => acc + r.scores.m3_statesCoverage, 0) / results.length) : 0;
  const avgM4 = results.length > 0 ? Math.round(results.reduce((acc, r) => acc + r.scores.m4_antiPatternViolation, 0) / results.length) : 0;

  console.log(`\nResultados: ${passed}/${total} aprovados  (${pct}%)`);
  if (withM1.length > 0)
    console.log(`  M1 Pattern Compliance Rate         : ${m1Ok}/${withM1.length} corretos`);
  if (withM2.length > 0)
    console.log(`  M2 AC Implementation (média)       : ${avgM2}/100  (${m2Ok}/${withM2.length} dentro do intervalo)`);
  if (withM3.length > 0)
    console.log(`  M3 States Coverage (média)         : ${avgM3}/100  (${m3Ok}/${withM3.length} dentro do intervalo)`);
  if (withM4.length > 0)
    console.log(`  M4 Anti-Pattern Violations (média) : ${avgM4}/100  (${m4Ok}/${withM4.length} dentro do intervalo)  [menor = melhor]`);
  if (withM5.length > 0)
    console.log(`  M5 Structural Validity             : ${m5Ok}/${withM5.length} corretos`);
  if (withM6.length > 0)
    console.log(`  M6 Fix Resolution Rate             : ${m6Ok}/${withM6.length} dentro do intervalo`);
  if (llmResults.length > 0)
    console.log(`  Latência média LLM                 : ${fmt(avgLlmMs)}  (${llmResults.length} chamada${llmResults.length > 1 ? "s" : ""})`);

  console.log();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
