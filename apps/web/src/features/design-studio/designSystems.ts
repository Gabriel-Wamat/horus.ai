export type DesignSystemSource = "official" | "team" | "custom";
export type DesignSystemCategory =
  | "saas"
  | "enterprise"
  | "finance"
  | "developer"
  | "commerce"
  | "healthcare";
export type DesignSystemDensity = "compact" | "balanced" | "airy";
export type DesignSystemTone = "dark" | "light" | "hybrid";

export interface DesignSystemTemplate {
  readonly id: string;
  readonly name: string;
  readonly source: DesignSystemSource;
  readonly category: DesignSystemCategory;
  readonly density: DesignSystemDensity;
  readonly tone: DesignSystemTone;
  readonly status: "ready" | "draft" | "active";
  readonly description: string;
  readonly bestFor: readonly string[];
  readonly tags: readonly string[];
  readonly palette: readonly string[];
  readonly accent: string;
  readonly surface: string;
  readonly canvas: string;
  readonly text: string;
  readonly muted: string;
  readonly border: string;
  readonly radius: string;
  readonly usageCount: number;
  readonly updatedLabel: string;
  readonly previewMetrics: readonly {
    readonly label: string;
    readonly value: string;
    readonly trend: string;
  }[];
}

export const designSystemTemplates: readonly DesignSystemTemplate[] = [
  {
    id: "saas-ops",
    name: "SaaS Ops",
    source: "official",
    category: "saas",
    density: "balanced",
    tone: "dark",
    status: "active",
    description: "Operacional, limpo e pronto para dashboards de produto.",
    bestFor: ["Project managers", "Customer success", "B2B SaaS"],
    tags: ["dashboard", "forms", "tables"],
    palette: ["#0b0e0c", "#14181a", "#14c77b", "#a4adb3"],
    accent: "#14c77b",
    surface: "#151a1c",
    canvas: "#0b0e0c",
    text: "#f1f4f2",
    muted: "#93a0a8",
    border: "rgba(148, 163, 184, 0.18)",
    radius: "10px",
    usageCount: 38,
    updatedLabel: "hoje",
    previewMetrics: [
      { label: "Projetos", value: "128", trend: "+12%" },
      { label: "Ciclos", value: "42", trend: "+8%" },
      { label: "Risco", value: "baixo", trend: "estável" },
    ],
  },
  {
    id: "enterprise-dense",
    name: "Enterprise Dense",
    source: "official",
    category: "enterprise",
    density: "compact",
    tone: "dark",
    status: "ready",
    description: "Alta densidade para times que vivem em tabelas e filas.",
    bestFor: ["Backoffice", "Operações", "Auditoria"],
    tags: ["dense", "queues", "audit"],
    palette: ["#101216", "#1a2027", "#5aa3f0", "#cbd5e1"],
    accent: "#5aa3f0",
    surface: "#121820",
    canvas: "#0a0d11",
    text: "#eef4ff",
    muted: "#8f9dad",
    border: "rgba(148, 163, 184, 0.2)",
    radius: "7px",
    usageCount: 24,
    updatedLabel: "2 dias",
    previewMetrics: [
      { label: "Filas", value: "19", trend: "SLA ok" },
      { label: "Revisões", value: "304", trend: "+4%" },
      { label: "Bloqueios", value: "3", trend: "-2" },
    ],
  },
  {
    id: "finance-console",
    name: "Finance Console",
    source: "official",
    category: "finance",
    density: "compact",
    tone: "hybrid",
    status: "ready",
    description: "Precisão visual para métricas, aprovações e conciliação.",
    bestFor: ["Financeiro", "Controladoria", "Relatórios"],
    tags: ["metrics", "approval", "risk"],
    palette: ["#10120f", "#182018", "#d8b45f", "#e8efe7"],
    accent: "#d8b45f",
    surface: "#151a15",
    canvas: "#0c100c",
    text: "#f3f0e7",
    muted: "#a8aa9e",
    border: "rgba(216, 180, 95, 0.18)",
    radius: "8px",
    usageCount: 16,
    updatedLabel: "1 sem",
    previewMetrics: [
      { label: "Receita", value: "R$ 2.4M", trend: "+6%" },
      { label: "Margem", value: "31%", trend: "+1.8" },
      { label: "Alertas", value: "7", trend: "atenção" },
    ],
  },
  {
    id: "devtools-dark",
    name: "DevTools Dark",
    source: "official",
    category: "developer",
    density: "balanced",
    tone: "dark",
    status: "ready",
    description: "Técnico, direto e confortável para ferramentas de engenharia.",
    bestFor: ["DevTools", "Observabilidade", "CI/CD"],
    tags: ["terminal", "logs", "code"],
    palette: ["#090b10", "#151925", "#8b5cf6", "#23d18b"],
    accent: "#8b5cf6",
    surface: "#111622",
    canvas: "#090b10",
    text: "#f4f7fb",
    muted: "#8d9aaf",
    border: "rgba(139, 92, 246, 0.2)",
    radius: "9px",
    usageCount: 29,
    updatedLabel: "ontem",
    previewMetrics: [
      { label: "Deploys", value: "86", trend: "+18%" },
      { label: "Erros", value: "2", trend: "-5" },
      { label: "Build", value: "1m42s", trend: "-12s" },
    ],
  },
  {
    id: "startup-clean",
    name: "Startup Clean",
    source: "official",
    category: "saas",
    density: "airy",
    tone: "light",
    status: "ready",
    description: "Leve, comercial e bom para produtos em validação.",
    bestFor: ["MVP", "Onboarding", "Self-service"],
    tags: ["clean", "onboarding", "growth"],
    palette: ["#f7faf8", "#ffffff", "#0ea5a3", "#334155"],
    accent: "#0ea5a3",
    surface: "#ffffff",
    canvas: "#f6f9f7",
    text: "#15201d",
    muted: "#66746f",
    border: "rgba(15, 23, 42, 0.12)",
    radius: "12px",
    usageCount: 21,
    updatedLabel: "3 dias",
    previewMetrics: [
      { label: "Ativação", value: "64%", trend: "+9%" },
      { label: "Leads", value: "1.2k", trend: "+14%" },
      { label: "Trial", value: "18d", trend: "médio" },
    ],
  },
  {
    id: "commerce-manager",
    name: "Commerce Manager",
    source: "team",
    category: "commerce",
    density: "balanced",
    tone: "hybrid",
    status: "ready",
    description: "Catálogo, pedidos e campanhas em um visual operacional.",
    bestFor: ["Marketplace", "Pedidos", "Catálogo"],
    tags: ["orders", "catalog", "campaigns"],
    palette: ["#111312", "#18221e", "#ff7a59", "#f5f7f4"],
    accent: "#ff7a59",
    surface: "#151b18",
    canvas: "#0d100f",
    text: "#f6f8f3",
    muted: "#9ba69f",
    border: "rgba(255, 122, 89, 0.18)",
    radius: "11px",
    usageCount: 12,
    updatedLabel: "5 dias",
    previewMetrics: [
      { label: "Pedidos", value: "764", trend: "+11%" },
      { label: "Ticket", value: "R$ 184", trend: "+3%" },
      { label: "Ruptura", value: "4", trend: "-1" },
    ],
  },
  {
    id: "healthcare-admin",
    name: "Healthcare Admin",
    source: "team",
    category: "healthcare",
    density: "balanced",
    tone: "light",
    status: "draft",
    description: "Claro, confiável e pensado para fluxos sensíveis.",
    bestFor: ["Clínicas", "Triagem", "Atendimento"],
    tags: ["records", "care", "safe"],
    palette: ["#f4f8fb", "#ffffff", "#2563eb", "#475569"],
    accent: "#2563eb",
    surface: "#ffffff",
    canvas: "#f4f8fb",
    text: "#172033",
    muted: "#64748b",
    border: "rgba(37, 99, 235, 0.14)",
    radius: "10px",
    usageCount: 9,
    updatedLabel: "1 sem",
    previewMetrics: [
      { label: "Pacientes", value: "312", trend: "+5%" },
      { label: "Triagem", value: "22", trend: "ativa" },
      { label: "SLA", value: "96%", trend: "+2" },
    ],
  },
  {
    id: "custom-brand",
    name: "Custom Brand",
    source: "custom",
    category: "enterprise",
    density: "balanced",
    tone: "hybrid",
    status: "draft",
    description: "Espaço para importar ou montar a identidade visual do cliente.",
    bestFor: ["Marca própria", "Design tokens", "Componentes internos"],
    tags: ["custom", "tokens", "private"],
    palette: ["#0f1314", "#20262a", "#14c77b", "#f1f4f2"],
    accent: "#14c77b",
    surface: "#14181a",
    canvas: "#0b0e0c",
    text: "#f1f4f2",
    muted: "#a4adb3",
    border: "rgba(148, 163, 184, 0.16)",
    radius: "10px",
    usageCount: 0,
    updatedLabel: "novo",
    previewMetrics: [
      { label: "Tokens", value: "0", trend: "vazio" },
      { label: "Componentes", value: "0", trend: "vazio" },
      { label: "Status", value: "draft", trend: "setup" },
    ],
  },
];

export const categoryLabels: Record<DesignSystemCategory | "all", string> = {
  all: "Todos",
  saas: "SaaS",
  enterprise: "Enterprise",
  finance: "Finance",
  developer: "DevTools",
  commerce: "Commerce",
  healthcare: "Healthcare",
};

export const sourceLabels: Record<DesignSystemSource | "all" | "favorites", string> = {
  all: "Todos",
  official: "Oficiais",
  team: "Time",
  custom: "Custom",
  favorites: "Favoritos",
};

export const densityLabels: Record<DesignSystemDensity | "all", string> = {
  all: "Todas",
  compact: "Compacta",
  balanced: "Balanceada",
  airy: "Aberta",
};
