import type { DesignSurfaceType } from "@u-build/shared";

export type FrontendPatternId =
  | "operational-dashboard"
  | "chat-preview-workbench"
  | "workflow-map"
  | "form-crud-tool"
  | "content-landing"
  | "custom-product-surface";

export interface SurfacePatternDefinition {
  readonly surfaceType: DesignSurfaceType;
  readonly patternId: FrontendPatternId;
  readonly intent: string;
  readonly informationArchitecture: readonly string[];
  readonly componentInventory: readonly string[];
  readonly requiredStates: readonly string[];
  readonly visualStrategy: readonly string[];
  readonly requiredPatterns: readonly string[];
  readonly forbiddenPatterns: readonly string[];
  readonly antiPatterns: readonly string[];
}

export const SURFACE_PATTERN_LIBRARY_VERSION = "2026-06-08.v1";

export const SURFACE_PATTERN_LIBRARY: readonly SurfacePatternDefinition[] = [
  surface("crud", "form-crud-tool", {
    intent: "Criar, editar, filtrar e validar registros do dominio.",
    informationArchitecture: ["form region", "filters", "primary list", "item actions"],
    componentInventory: ["validated form", "filter controls", "empty state", "record list"],
    requiredStates: ["empty", "loading", "success", "error", "validation", "overflow", "mobile"],
    visualStrategy: ["action-first hierarchy", "compact controls", "semantic validation colors"],
    requiredPatterns: ["visible submit path", "inline validation", "list updates after create"],
    forbiddenPatterns: ["generic project dashboard", "preloaded fake records"],
  }),
  surface("dashboard", "operational-dashboard", {
    intent: "Monitorar estado, tendencias e excecoes para decisao operacional.",
    informationArchitecture: ["summary strip", "trend/detail panels", "exception queue", "filters"],
    componentInventory: ["metric", "chart", "status table", "alert list"],
    requiredStates: ["loading", "success", "error", "selected", "overflow", "mobile"],
    visualStrategy: ["dense scanning", "restrained contrast", "semantic status hierarchy"],
    requiredPatterns: ["metrics have labels and units", "exceptions are actionable"],
    forbiddenPatterns: ["decorative hero", "unexplained random KPIs"],
  }),
  surface("calendar", "custom-product-surface", {
    intent: "Planejar eventos em relacao a datas, duracoes e conflitos.",
    informationArchitecture: ["date navigation", "time grid", "event editor", "conflict state"],
    componentInventory: ["calendar grid", "event chip", "date picker", "event form"],
    requiredStates: ["empty", "loading", "success", "error", "selected", "overflow", "mobile"],
    visualStrategy: ["time-first layout", "category colors as utility", "clear today/selected affordance"],
    requiredPatterns: ["visible date context", "event create/edit path"],
    forbiddenPatterns: ["dashboard cards replacing the calendar"],
  }),
  surface("kanban", "custom-product-surface", {
    intent: "Mover itens entre estados de trabalho com visibilidade de fluxo.",
    informationArchitecture: ["columns by status", "cards", "WIP/filters", "detail drawer"],
    componentInventory: ["kanban column", "draggable card", "status badge", "empty column"],
    requiredStates: ["empty", "loading", "success", "error", "selected", "overflow", "mobile"],
    visualStrategy: ["column contrast", "compact cards", "status color discipline"],
    requiredPatterns: ["clear status columns", "card actions available"],
    forbiddenPatterns: ["single flat list when kanban was requested"],
  }),
  surface("editor-canvas", "custom-product-surface", {
    intent: "Criar ou manipular conteudo visual/textual com ferramentas persistentes.",
    informationArchitecture: ["toolbar", "canvas", "properties panel", "layer/history controls"],
    componentInventory: ["tool button", "canvas", "inspector", "selection handles"],
    requiredStates: ["empty", "loading", "success", "error", "selected", "disabled", "mobile"],
    visualStrategy: ["workspace-first density", "icon controls", "non-card canvas"],
    requiredPatterns: ["stable canvas dimensions", "visible selected state"],
    forbiddenPatterns: ["marketing hero instead of usable editor"],
  }),
  surface("chat-preview", "chat-preview-workbench", {
    intent: "Conversar, executar mudancas e inspecionar preview/output em paralelo.",
    informationArchitecture: ["conversation rail", "preview canvas", "execution console", "file/activity context"],
    componentInventory: ["message composer", "preview frame", "run controls", "event timeline"],
    requiredStates: ["empty", "loading", "success", "error", "selected", "disabled", "overflow", "mobile"],
    visualStrategy: ["workbench layout", "high signal console", "clear running/blocked states"],
    requiredPatterns: ["preview controls", "live execution feedback"],
    forbiddenPatterns: ["chat-only surface without preview state"],
  }),
  surface("workflow-map", "workflow-map", {
    intent: "Entender dependencias, etapas e transicoes de um processo.",
    informationArchitecture: ["graph canvas", "node details", "filters", "run/event status"],
    componentInventory: ["node", "edge", "legend", "detail panel"],
    requiredStates: ["empty", "loading", "success", "error", "selected", "overflow", "mobile"],
    visualStrategy: ["topology-first canvas", "semantic edge/status colors", "minimal chrome"],
    requiredPatterns: ["nodes and edges are distinguishable", "selected node has details"],
    forbiddenPatterns: ["table-only replacement for graph intent"],
  }),
  surface("auth", "custom-product-surface", {
    intent: "Autenticar ou recuperar acesso com baixo atrito e feedback claro.",
    informationArchitecture: ["auth form", "provider/actions", "validation", "recovery path"],
    componentInventory: ["credential field", "submit button", "provider button", "error message"],
    requiredStates: ["loading", "success", "error", "disabled", "validation", "mobile"],
    visualStrategy: ["focused form", "trustworthy contrast", "minimal distractions"],
    requiredPatterns: ["accessible labels", "recoverable errors"],
    forbiddenPatterns: ["dashboard shell around login"],
  }),
  surface("onboarding", "custom-product-surface", {
    intent: "Conduzir configuracao inicial ou coleta progressiva de contexto.",
    informationArchitecture: ["stepper", "current task", "progress", "back/next controls"],
    componentInventory: ["step indicator", "choice card", "form step", "progress control"],
    requiredStates: ["empty", "loading", "success", "error", "selected", "disabled", "mobile"],
    visualStrategy: ["guided focus", "clear progress", "friendly but restrained tone"],
    requiredPatterns: ["current step visible", "safe back/next behavior"],
    forbiddenPatterns: ["static landing page with no setup workflow"],
  }),
  surface("settings", "form-crud-tool", {
    intent: "Configurar preferencias, tokens ou opcoes persistentes com seguranca.",
    informationArchitecture: ["settings groups", "controls", "save/reset actions", "validation"],
    componentInventory: ["field group", "switch", "select", "save bar", "danger zone"],
    requiredStates: ["loading", "success", "error", "selected", "disabled", "validation", "mobile"],
    visualStrategy: ["quiet utility", "clear grouping", "strong destructive affordance"],
    requiredPatterns: ["explicit save state", "validation near controls"],
    forbiddenPatterns: ["analytics dashboard instead of settings controls"],
  }),
  surface("file-browser", "operational-dashboard", {
    intent: "Navegar, selecionar e agir sobre arquivos/pastas.",
    informationArchitecture: ["tree/list", "breadcrumb", "preview/details", "actions"],
    componentInventory: ["file tree", "breadcrumb", "file row", "details panel"],
    requiredStates: ["empty", "loading", "success", "error", "selected", "overflow", "mobile"],
    visualStrategy: ["dense rows", "stable icons", "clear selection"],
    requiredPatterns: ["visible hierarchy", "selection state"],
    forbiddenPatterns: ["decorative cards for every file"],
  }),
  surface("report", "operational-dashboard", {
    intent: "Ler, comparar e exportar informacao estruturada.",
    informationArchitecture: ["report header", "sections", "tables/charts", "export/share controls"],
    componentInventory: ["section heading", "data table", "chart", "summary callout"],
    requiredStates: ["loading", "success", "error", "overflow", "mobile"],
    visualStrategy: ["readable hierarchy", "print/export aware spacing", "conservative color"],
    requiredPatterns: ["source/date context", "scannable sections"],
    forbiddenPatterns: ["marketing hero replacing report content"],
  }),
  surface("checkout", "custom-product-surface", {
    intent: "Concluir compra ou pagamento com revisao, validacao e confianca.",
    informationArchitecture: ["cart summary", "customer/payment form", "review", "confirmation"],
    componentInventory: ["order summary", "payment form", "validation message", "trust indicator"],
    requiredStates: ["loading", "success", "error", "disabled", "validation", "mobile"],
    visualStrategy: ["trust-first hierarchy", "clear totals", "semantic payment errors"],
    requiredPatterns: ["total always visible", "recoverable payment errors"],
    forbiddenPatterns: ["hidden fees or unclear primary action"],
  }),
  surface("media-gallery", "custom-product-surface", {
    intent: "Explorar, filtrar e inspecionar midias visualmente.",
    informationArchitecture: ["media grid", "filters", "preview/detail viewer", "metadata/actions"],
    componentInventory: ["media tile", "filter bar", "lightbox/detail", "metadata panel"],
    requiredStates: ["empty", "loading", "success", "error", "selected", "overflow", "mobile"],
    visualStrategy: ["asset-first grid", "minimal chrome", "selection clarity"],
    requiredPatterns: ["stable aspect ratios", "detail preview"],
    forbiddenPatterns: ["text-only list for visual media"],
  }),
  surface("form", "form-crud-tool", {
    intent: "Coletar dados estruturados com validacao e envio claro.",
    informationArchitecture: ["field groups", "validation", "submit/cancel", "confirmation"],
    componentInventory: ["input", "select", "checkbox/switch", "submit button", "error summary"],
    requiredStates: ["loading", "success", "error", "disabled", "validation", "mobile"],
    visualStrategy: ["field-first clarity", "accessible labels", "semantic validation"],
    requiredPatterns: ["submit disabled when invalid", "inline error messages"],
    forbiddenPatterns: ["dashboard metrics around a simple form"],
  }),
  surface("search-results", "operational-dashboard", {
    intent: "Buscar, filtrar e comparar resultados rapidamente.",
    informationArchitecture: ["search box", "filters", "result list", "sorting/pagination"],
    componentInventory: ["search input", "facet filter", "result row", "empty state"],
    requiredStates: ["empty", "loading", "success", "error", "selected", "overflow", "mobile"],
    visualStrategy: ["high scan density", "clear query context", "subtle ranking cues"],
    requiredPatterns: ["query visible", "empty result recovery"],
    forbiddenPatterns: ["hero page instead of results"],
  }),
  surface("detail-view", "custom-product-surface", {
    intent: "Inspecionar uma entidade e executar acoes contextuais.",
    informationArchitecture: ["entity header", "key attributes", "related sections", "actions"],
    componentInventory: ["detail header", "attribute list", "related table", "action menu"],
    requiredStates: ["loading", "success", "error", "selected", "overflow", "mobile"],
    visualStrategy: ["entity-first hierarchy", "compact facts", "clear action priority"],
    requiredPatterns: ["identity/title visible", "related data grouped"],
    forbiddenPatterns: ["anonymous dashboard without entity focus"],
  }),
  surface("data-table", "operational-dashboard", {
    intent: "Comparar registros tabulares e agir em linhas selecionadas.",
    informationArchitecture: ["toolbar", "table", "filters/sort", "bulk actions", "pagination"],
    componentInventory: ["data table", "column header", "row action", "bulk action bar"],
    requiredStates: ["empty", "loading", "success", "error", "selected", "overflow", "mobile"],
    visualStrategy: ["dense but legible rows", "sticky context", "clear selected state"],
    requiredPatterns: ["sortable/filterable columns", "horizontal overflow handled"],
    forbiddenPatterns: ["cards only when tabular comparison is requested"],
  }),
  surface("custom", "custom-product-surface", {
    intent: "Resolver uma intencao de produto que nao cabe em patterns padrao.",
    informationArchitecture: ["domain-specific primary region", "supporting controls", "feedback states"],
    componentInventory: ["domain component", "primary action", "state feedback"],
    requiredStates: ["empty", "loading", "success", "error", "mobile"],
    visualStrategy: ["derive from domain", "justify deviations", "preserve real design system"],
    requiredPatterns: ["explicit domain rationale", "testable state behavior"],
    forbiddenPatterns: ["generic dashboard or landing page by default"],
  }),
];

export function getSurfacePattern(
  surfaceType: DesignSurfaceType
): SurfacePatternDefinition {
  const pattern = SURFACE_PATTERN_LIBRARY.find(
    (item) => item.surfaceType === surfaceType
  );
  if (!pattern) {
    throw new Error(`No surface pattern registered for ${surfaceType}.`);
  }
  return pattern;
}

export function formatSurfacePatternLibraryForPrompt(): string {
  return [
    `version: ${SURFACE_PATTERN_LIBRARY_VERSION}`,
    "Use surfaceType para escolher o pattern e preencher DesignBrief/VisualContract.",
    ...SURFACE_PATTERN_LIBRARY.map((item) =>
      [
        `- ${item.surfaceType} -> ${item.patternId}`,
        `  intent: ${item.intent}`,
        `  IA: ${item.informationArchitecture.join("; ")}`,
        `  components: ${item.componentInventory.join("; ")}`,
        `  states: ${item.requiredStates.join(", ")}`,
        `  visual: ${item.visualStrategy.join("; ")}`,
        `  requiredPatterns: ${item.requiredPatterns.join("; ")}`,
        `  forbiddenPatterns: ${item.forbiddenPatterns.join("; ")}`,
        `  antiPatterns: ${item.antiPatterns.join("; ")}`,
      ].join("\n")
    ),
  ].join("\n");
}

function surface(
  surfaceType: DesignSurfaceType,
  patternId: FrontendPatternId,
  input: Omit<
    SurfacePatternDefinition,
    "surfaceType" | "patternId" | "antiPatterns"
  > & {
    readonly antiPatterns?: readonly string[];
  }
): SurfacePatternDefinition {
  return {
    surfaceType,
    patternId,
    ...input,
    antiPatterns: [
      "visible SDD/workflow metadata",
      "mock/fake runtime data",
      "unexplained one-note palette",
      "unhandled overflow",
      ...(input.antiPatterns ?? []),
    ],
  };
}
