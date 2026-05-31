import { useMemo, useState, type CSSProperties, type JSX } from "react";
import {
  Check,
  LayoutDashboard,
  Monitor,
  Plus,
  Search,
  SlidersHorizontal,
  Smartphone,
  Star,
  Table2,
  Tablet,
} from "lucide-react";
import {
  categoryLabels,
  densityLabels,
  designSystemTemplates,
  sourceLabels,
  type DesignSystemCategory,
  type DesignSystemDensity,
  type DesignSystemSource,
  type DesignSystemTemplate,
} from "./designSystems.js";
import "./styles/design-studio.css";

type SourceFilter = DesignSystemSource | "all" | "favorites";
type CategoryFilter = DesignSystemCategory | "all";
type DensityFilter = DesignSystemDensity | "all";
type PreviewSurface = "dashboard" | "form" | "table";
type PreviewViewport = "desktop" | "tablet" | "mobile";

interface DesignStudioFilters {
  readonly search: string;
  readonly source: SourceFilter;
  readonly category: CategoryFilter;
  readonly density: DensityFilter;
}

const initialFavorites = new Set(["saas-ops", "devtools-dark"]);

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matchesSearch(template: DesignSystemTemplate, query: string): boolean {
  if (!query) return true;
  const haystack = [
    template.name,
    template.description,
    template.category,
    template.density,
    template.source,
    ...template.tags,
    ...template.bestFor,
  ]
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
}

function templateStyle(template: DesignSystemTemplate): CSSProperties {
  return {
    "--ds-accent": template.accent,
    "--ds-surface": template.surface,
    "--ds-canvas": template.canvas,
    "--ds-text": template.text,
    "--ds-muted": template.muted,
    "--ds-border": template.border,
    "--ds-radius": template.radius,
  } as CSSProperties;
}

export function DesignStudioPage(): JSX.Element {
  const [filters, setFilters] = useState<DesignStudioFilters>({
    search: "",
    source: "all",
    category: "all",
    density: "all",
  });
  const [favoriteIds, setFavoriteIds] = useState(initialFavorites);
  const [selectedTemplateId, setSelectedTemplateId] = useState("saas-ops");
  const [previewSurface, setPreviewSurface] = useState<PreviewSurface>("dashboard");
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>("desktop");

  const fallbackTemplate = designSystemTemplates[0];
  if (!fallbackTemplate) {
    return (
      <div className="design-studio-page">
        <div className="design-studio-empty">
          <strong>Biblioteca vazia</strong>
          <span>Cadastre um template visual para começar.</span>
        </div>
      </div>
    );
  }

  const selectedTemplate =
    designSystemTemplates.find((template) => template.id === selectedTemplateId) ??
    fallbackTemplate;

  const query = normalized(filters.search);
  const filteredTemplates = useMemo(
    () =>
      designSystemTemplates.filter((template) => {
        if (!matchesSearch(template, query)) return false;
        if (filters.category !== "all" && template.category !== filters.category) return false;
        if (filters.density !== "all" && template.density !== filters.density) return false;
        if (filters.source === "favorites") return favoriteIds.has(template.id);
        if (filters.source !== "all" && template.source !== filters.source) return false;
        return true;
      }),
    [favoriteIds, filters.category, filters.density, filters.source, query]
  );

  const activeCount = designSystemTemplates.filter(
    (template) => template.status === "active"
  ).length;
  const officialCount = designSystemTemplates.filter(
    (template) => template.source === "official"
  ).length;

  const toggleFavorite = (templateId: string): void => {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  };

  return (
    <div className="design-studio-page">
      <header className="design-studio-hero">
        <div className="design-studio-hero-copy">
          <p className="panel-kicker">Design Studio</p>
          <div className="design-studio-title-row">
            <h1>Design systems</h1>
            <span className="design-studio-chip active">
              <Check size={13} aria-hidden="true" />
              {activeCount} em uso
            </span>
          </div>
          <p>
            Escolha uma linguagem visual, veja o produto mocado e use como direção
            para as próximas gerações.
          </p>
        </div>
        <div className="design-studio-stats" aria-label="Resumo da biblioteca visual">
          <div>
            <span>{designSystemTemplates.length}</span>
            <p>Templates</p>
          </div>
          <div>
            <span>{officialCount}</span>
            <p>Oficiais</p>
          </div>
          <div>
            <span>{favoriteIds.size}</span>
            <p>Favoritos</p>
          </div>
        </div>
      </header>

      <section className="design-studio-workspace">
        <aside className="design-studio-discovery" aria-label="Filtros de design system">
          <div className="design-studio-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={filters.search}
              placeholder="Buscar por estilo, uso ou tag"
              onChange={(event) =>
                setFilters((current) => ({ ...current, search: event.target.value }))
              }
            />
          </div>

          <FilterGroup
            title="Origem"
            value={filters.source}
            options={["all", "official", "team", "custom", "favorites"]}
            labels={sourceLabels}
            onChange={(source) => setFilters((current) => ({ ...current, source }))}
          />
          <FilterGroup
            title="Produto"
            value={filters.category}
            options={["all", "saas", "enterprise", "finance", "developer", "commerce", "healthcare"]}
            labels={categoryLabels}
            onChange={(category) => setFilters((current) => ({ ...current, category }))}
          />
          <FilterGroup
            title="Densidade"
            value={filters.density}
            options={["all", "compact", "balanced", "airy"]}
            labels={densityLabels}
            onChange={(density) => setFilters((current) => ({ ...current, density }))}
          />

          <button
            type="button"
            className="design-studio-custom-entry"
            onClick={() => setSelectedTemplateId("custom-brand")}
          >
            <Plus size={16} aria-hidden="true" />
            <span>
              <strong>Adicionar meu design</strong>
              <small>Tokens, componentes e preview privado</small>
            </span>
          </button>
        </aside>

        <main className="design-studio-gallery" aria-label="Galeria de design systems">
          <div className="design-studio-gallery-head">
            <div>
              <p className="panel-kicker">Biblioteca</p>
              <h2>{filteredTemplates.length} opções encontradas</h2>
            </div>
            <span className="design-studio-filter-pill">
              <SlidersHorizontal size={14} aria-hidden="true" />
              {sourceLabels[filters.source]} · {categoryLabels[filters.category]}
            </span>
          </div>

          {filteredTemplates.length > 0 ? (
            <div className="design-system-grid">
              {filteredTemplates.map((template) => (
                <DesignSystemCard
                  key={template.id}
                  template={template}
                  isSelected={template.id === selectedTemplate.id}
                  isFavorite={favoriteIds.has(template.id)}
                  onSelect={() => setSelectedTemplateId(template.id)}
                  onToggleFavorite={() => toggleFavorite(template.id)}
                />
              ))}
            </div>
          ) : (
            <div className="design-studio-empty">
              <Search size={18} aria-hidden="true" />
              <strong>Nenhum template encontrado</strong>
              <span>Ajuste busca, origem, produto ou densidade.</span>
            </div>
          )}
        </main>

        <DesignPreviewPanel
          template={selectedTemplate}
          isFavorite={favoriteIds.has(selectedTemplate.id)}
          previewSurface={previewSurface}
          previewViewport={previewViewport}
          onToggleFavorite={() => toggleFavorite(selectedTemplate.id)}
          onChangePreviewSurface={setPreviewSurface}
          onChangePreviewViewport={setPreviewViewport}
        />
      </section>
    </div>
  );
}

function FilterGroup<TValue extends string>({
  title,
  value,
  options,
  labels,
  onChange,
}: {
  readonly title: string;
  readonly value: TValue;
  readonly options: readonly TValue[];
  readonly labels: Record<TValue, string>;
  readonly onChange: (value: TValue) => void;
}): JSX.Element {
  return (
    <div className="design-studio-filter-group">
      <span>{title}</span>
      <div className="design-studio-filter-options">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={option === value ? "selected" : ""}
            onClick={() => onChange(option)}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

function DesignSystemCard({
  template,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: {
  readonly template: DesignSystemTemplate;
  readonly isSelected: boolean;
  readonly isFavorite: boolean;
  readonly onSelect: () => void;
  readonly onToggleFavorite: () => void;
}): JSX.Element {
  return (
    <article
      className={`design-system-card ${isSelected ? "selected" : ""}`}
      style={templateStyle(template)}
    >
      <button type="button" className="design-system-card-select" onClick={onSelect}>
        <MiniPreview template={template} />
        <span className="design-system-card-body">
          <span className="design-system-card-title-row">
            <strong>{template.name}</strong>
            <small>{template.status === "active" ? "em uso" : sourceLabels[template.source]}</small>
          </span>
          <span className="design-system-card-description">{template.description}</span>
          <span className="design-system-card-tags">
            {template.tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </span>
        </span>
      </button>
      <div className="design-system-card-footer">
        <div className="design-system-palette" aria-label={`Paleta de ${template.name}`}>
          {template.palette.map((color) => (
            <span key={color} style={{ background: color }} />
          ))}
        </div>
        <button
          type="button"
          className={`design-system-favorite ${isFavorite ? "selected" : ""}`}
          title={isFavorite ? "Remover dos favoritos" : "Favoritar"}
          aria-label={isFavorite ? "Remover dos favoritos" : "Favoritar"}
          onClick={onToggleFavorite}
        >
          <Star size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function MiniPreview({ template }: { readonly template: DesignSystemTemplate }): JSX.Element {
  return (
    <span className="design-system-mini-preview" style={templateStyle(template)}>
      <span className="mini-preview-sidebar" />
      <span className="mini-preview-content">
        <span className="mini-preview-line wide" />
        <span className="mini-preview-metrics">
          <span />
          <span />
          <span />
        </span>
        <span className="mini-preview-table">
          <span />
          <span />
          <span />
        </span>
      </span>
    </span>
  );
}

function DesignPreviewPanel({
  template,
  isFavorite,
  previewSurface,
  previewViewport,
  onToggleFavorite,
  onChangePreviewSurface,
  onChangePreviewViewport,
}: {
  readonly template: DesignSystemTemplate;
  readonly isFavorite: boolean;
  readonly previewSurface: PreviewSurface;
  readonly previewViewport: PreviewViewport;
  readonly onToggleFavorite: () => void;
  readonly onChangePreviewSurface: (surface: PreviewSurface) => void;
  readonly onChangePreviewViewport: (viewport: PreviewViewport) => void;
}): JSX.Element {
  return (
    <aside className="design-preview-panel" aria-label="Preview do design system">
      <div className="design-preview-head">
        <div>
          <p className="panel-kicker">Preview</p>
          <h2>{template.name}</h2>
          <span>{template.description}</span>
        </div>
        <button
          type="button"
          className={`design-system-favorite preview ${isFavorite ? "selected" : ""}`}
          title={isFavorite ? "Remover dos favoritos" : "Favoritar"}
          aria-label={isFavorite ? "Remover dos favoritos" : "Favoritar"}
          onClick={onToggleFavorite}
        >
          <Star size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="design-preview-actions">
        <button type="button" className="design-preview-apply">
          <Check size={15} aria-hidden="true" />
          Usar neste projeto
        </button>
        <button type="button" className="design-preview-secondary">
          Duplicar
        </button>
      </div>

      <SegmentedControl
        value={previewSurface}
        options={[
          { value: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={14} /> },
          { value: "form", label: "Form", icon: <SlidersHorizontal size={14} /> },
          { value: "table", label: "Tabela", icon: <Table2 size={14} /> },
        ]}
        onChange={onChangePreviewSurface}
      />

      <SegmentedControl
        value={previewViewport}
        options={[
          { value: "desktop", label: "PC", icon: <Monitor size={14} /> },
          { value: "tablet", label: "Tablet", icon: <Tablet size={14} /> },
          { value: "mobile", label: "Phone", icon: <Smartphone size={14} /> },
        ]}
        onChange={onChangePreviewViewport}
      />

      <div className={`design-preview-device ${previewViewport}`} style={templateStyle(template)}>
        <MockProductPreview template={template} surface={previewSurface} />
      </div>

      <div className="design-preview-meta">
        <div>
          <span>Indicado para</span>
          <p>{template.bestFor.join(" · ")}</p>
        </div>
        <div>
          <span>Governança</span>
          <p>{template.status === "draft" ? "Rascunho visual" : "Pronto para agentes"}</p>
        </div>
        <div>
          <span>Atualizado</span>
          <p>{template.updatedLabel}</p>
        </div>
      </div>
    </aside>
  );
}

function SegmentedControl<TValue extends string>({
  value,
  options,
  onChange,
}: {
  readonly value: TValue;
  readonly options: readonly {
    readonly value: TValue;
    readonly label: string;
    readonly icon: JSX.Element;
  }[];
  readonly onChange: (value: TValue) => void;
}): JSX.Element {
  return (
    <div className="design-preview-segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "selected" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MockProductPreview({
  template,
  surface,
}: {
  readonly template: DesignSystemTemplate;
  readonly surface: PreviewSurface;
}): JSX.Element {
  return (
    <div className="mock-product-preview">
      <div className="mock-product-sidebar">
        <span className="mock-product-mark">H</span>
        <span className="selected" />
        <span />
        <span />
        <span />
      </div>
      <div className="mock-product-main">
        <header>
          <div>
            <small>Project OS</small>
            <strong>{template.name}</strong>
          </div>
          <button type="button">Deploy</button>
        </header>
        {surface === "dashboard" && <MockDashboard template={template} />}
        {surface === "form" && <MockForm template={template} />}
        {surface === "table" && <MockTable />}
      </div>
    </div>
  );
}

function MockDashboard({
  template,
}: {
  readonly template: DesignSystemTemplate;
}): JSX.Element {
  return (
    <>
      <div className="mock-metric-grid">
        {template.previewMetrics.map((metric) => (
          <div key={metric.label} className="mock-metric-card">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.trend}</small>
          </div>
        ))}
      </div>
      <div className="mock-chart-panel">
        <div className="mock-chart-bars">
          <span style={{ height: "42%" }} />
          <span style={{ height: "64%" }} />
          <span style={{ height: "52%" }} />
          <span style={{ height: "78%" }} />
          <span style={{ height: "58%" }} />
          <span style={{ height: "86%" }} />
        </div>
      </div>
    </>
  );
}

function MockForm({
  template,
}: {
  readonly template: DesignSystemTemplate;
}): JSX.Element {
  return (
    <div className="mock-form-panel">
      <label>
        Nome do projeto
        <span>{template.name} workspace</span>
      </label>
      <label>
        Densidade
        <span>{densityLabels[template.density]}</span>
      </label>
      <label>
        Componentes
        <span>Botões · Inputs · Tabelas · Estados vazios</span>
      </label>
      <div className="mock-form-actions">
        <button type="button">Salvar</button>
        <button type="button">Cancelar</button>
      </div>
    </div>
  );
}

function MockTable(): JSX.Element {
  const rows = [
    ["Dashboard", "Pronto", "Alta"],
    ["Formulários", "Revisão", "Média"],
    ["Tabelas", "Pronto", "Alta"],
    ["Empty states", "Draft", "Baixa"],
  ];

  return (
    <div className="mock-table-panel">
      <div className="mock-table-head">
        <span>Componente</span>
        <span>Status</span>
        <span>Fit</span>
      </div>
      {rows.map((row) => (
        <div className="mock-table-row" key={row[0]}>
          <span>{row[0]}</span>
          <span>{row[1]}</span>
          <span>{row[2]}</span>
        </div>
      ))}
    </div>
  );
}
