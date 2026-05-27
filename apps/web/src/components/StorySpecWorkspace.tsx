import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent, type Ref } from "react";
import type { Spec, UserStory, WorkflowState, WorkspaceFolder } from "@u-build/shared";
import { SpecReview, VisualContractSummary } from "./SpecReview.js";
import { useFolderExpansionState } from "./story-spec/useFolderExpansionState.js";

type DetailTab = "story" | "spec";
type SpecMode = "view" | "edit";

interface PendingSpec {
  userStoryId: string;
  spec: Spec;
}

interface WorkspaceFolderArtifacts {
  userStories: UserStory[];
  specsByStoryId: Record<string, Spec>;
}

interface StorySpecWorkspaceProps {
  stories: UserStory[];
  workflowState: WorkflowState | null;
  pendingSpec: PendingSpec | null;
  workspaceFolders: WorkspaceFolder[];
  workspaceFolderArtifactsById?: Record<string, WorkspaceFolderArtifacts>;
  loadingWorkspaceFolderIds?: string[];
  selectedWorkspaceFolderId: string;
  selectedStoryId: string | null;
  activeTab: DetailTab;
  onCreateStory: () => void;
  onGenerateSpecs: () => void;
  onGenerateSpecsAndBuild: () => void;
  onSelectWorkspaceFolder: (folderId: string) => void;
  onLoadWorkspaceFolder?: (folderId: string) => void;
  onSelectStory: (storyId: string, folderId?: string) => void;
  onUpdateStory: (story: UserStory) => Promise<void>;
  onDeleteStory: (storyId: string) => Promise<void>;
  onUpdateSpec: (storyId: string, spec: Spec) => Promise<void>;
  onChangeTab: (tab: DetailTab) => void;
  onApproveSpec: (editedSpec?: Spec) => void;
  onRejectSpec: () => void;
  createStoryButtonRef?: Ref<HTMLButtonElement>;
  isGeneratingSpecs?: boolean;
  isLoadingStories?: boolean;
  constructionNotice?: string | null;
  constructionError?: string | null;
}

const PRIORITY_LABELS: Record<UserStory["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

function createStorySlug(story: UserStory, index: number): string {
  const base = story.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 34);

  return `US-${String(index + 1).padStart(2, "0")}-${base || story.id.slice(0, 8)}.md`;
}

function createDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function getSpecMap(
  workflowState: WorkflowState | null,
  pendingSpec: PendingSpec | null
): Record<string, Spec> {
  return {
    ...(workflowState?.specs ?? {}),
    ...(pendingSpec ? { [pendingSpec.userStoryId]: pendingSpec.spec } : {}),
  };
}

function formatFolderA11yLabel({
  folder,
  expanded,
  storyCount,
  specCount,
  pendingCount,
  loaded,
  loading,
}: {
  folder: WorkspaceFolder;
  expanded: boolean;
  storyCount: number;
  specCount: number;
  pendingCount: number;
  loaded: boolean;
  loading: boolean;
}): string {
  const base = `Pasta ${folder.name}, ${storyCount} ${
    storyCount === 1 ? "história" : "histórias"
  }`;

  if (!expanded) {
    return `${base}. ${storyCount === 0 ? "Vazia" : "Recolhida"}.`;
  }

  if (loading && !loaded) {
    return `${base}. Expandida e carregando conteúdo.`;
  }

  if (!loaded) {
    return `${base}. Expandida, conteúdo ainda não carregado.`;
  }

  return `${base}, ${specCount} ${specCount === 1 ? "spec pronta" : "specs prontas"}, ${pendingCount} ${
    pendingCount === 1 ? "pendente" : "pendentes"
  }. Expandida.`;
}

function formatStoryA11yLabel({
  story,
  index,
  total,
  slug,
  status,
  selected,
}: {
  story: UserStory;
  index: number;
  total: number;
  slug: string;
  status: string;
  selected: boolean;
}): string {
  return `User story ${index + 1} de ${total}: ${story.title}. Arquivo ${slug}. Status: ${status}.${
    selected ? " Selecionada." : ""
  }`;
}

function getStoryStatus(
  story: UserStory,
  index: number,
  workflowState: WorkflowState | null,
  pendingSpec: PendingSpec | null,
  hasSpec: boolean
): { label: string; tone: "neutral" | "active" | "done" | "warn" | "danger" } {
  if (pendingSpec?.userStoryId === story.id) {
    return { label: "revisão", tone: "warn" };
  }

  if (!workflowState) {
    return hasSpec
      ? { label: "ok", tone: "done" }
      : { label: "rascunho", tone: "neutral" };
  }

  if (workflowState.status === "idle") {
    return hasSpec
      ? { label: "ok", tone: "done" }
      : { label: "rascunho", tone: "neutral" };
  }

  if (workflowState.status === "cancelled") {
    return { label: "off", tone: "danger" };
  }

  if (workflowState.status === "error") {
    return { label: "erro", tone: "danger" };
  }

  if (workflowState.status === "completed") {
    return { label: "feito", tone: "done" };
  }

  if (index < workflowState.currentUSIndex) {
    return { label: "feito", tone: "done" };
  }

  if (index === workflowState.currentUSIndex) {
    return workflowState.status === "awaiting_human"
      ? { label: "revisão", tone: "warn" }
      : { label: "gerando", tone: "active" };
  }

  return { label: "fila", tone: "neutral" };
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "active" | "done" | "warn" | "danger";
}): JSX.Element {
  return (
    <span className={`story-status-pill ${tone}`}>
      {label}
    </span>
  );
}

function FolderIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h6l1.5 2.25h9v8.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6.75Z" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {expanded ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
      )}
    </svg>
  );
}

function PlusIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function StoryIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 4.5h10.5A1.5 1.5 0 0 1 18.75 6v12a1.5 1.5 0 0 1-1.5 1.5H6.75A1.5 1.5 0 0 1 5.25 18V6a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 8.25h7.5M8.25 12h7.5M8.25 15.75h4.5" />
    </svg>
  );
}

function SpecIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75h6L18 8.25v12H7.5a1.5 1.5 0 0 1-1.5-1.5V5.25a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3.75v4.5H18M9 12h6M9 15h6M9 18h3" />
    </svg>
  );
}

function RocketIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 4.5c2.25-.75 4.5-.75 5.25 0 .75.75.75 3 0 5.25-.64 1.92-2.08 4.06-4.02 6L12 12.27l-3.48-3.48c1.94-1.94 4.08-3.38 5.73-4.29Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9H5.25L3.75 12l3 1.5M15 15v3.75l-3 1.5-1.5-3M9.75 14.25l-3 3M15 8.25h.008" />
    </svg>
  );
}

function LockIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 10.5V7.875a3.75 3.75 0 1 1 7.5 0V10.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 10.5h10.5A1.5 1.5 0 0 1 18.75 12v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  );
}

function EditIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function EyeIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
    </svg>
  );
}

function TrashIcon(): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916A2.25 2.25 0 0 0 13.5 2.25h-3A2.25 2.25 0 0 0 8.25 4.5v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function createStoryDraft(story: UserStory): UserStory {
  return {
    ...story,
    acceptanceCriteria: [...story.acceptanceCriteria],
    labels: [...story.labels],
  };
}

function createSpecDraft(spec: Spec): Spec {
  return {
    ...spec,
    components: spec.components.map((component) => ({
      ...component,
      dependencies: [...component.dependencies],
      ...(component.props ? { props: { ...component.props } } : {}),
    })),
    apiEndpoints: spec.apiEndpoints.map((endpoint) => ({ ...endpoint })),
    dataModels: [...spec.dataModels],
    acceptanceCriteria: [...spec.acceptanceCriteria],
  };
}

function EmptySpecsState({ onCreateStory }: { onCreateStory: () => void }): JSX.Element {
  return (
    <section className="panel spec-empty-panel">
      <div className="panel-body">
        <p className="panel-kicker">Specs</p>
        <h2 className="panel-title">Nenhuma história enviada</h2>
        <p className="workflow-meta">
          Crie user stories na interface de criação e gere as specs para visualizar o par história/SDD aqui.
        </p>
        <button
          type="button"
          className="primary-button"
          style={{ marginTop: 14 }}
          onClick={onCreateStory}
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Criar user-stories
        </button>
      </div>
    </section>
  );
}

function UserStoryDetail({ story }: { story: UserStory }): JSX.Element {
  return (
    <article className="document-preview">
      <header className="document-preview-title">
        <h1>{story.title}</h1>
        <div className="document-preview-meta" aria-label="Metadados da user story">
          <span>{PRIORITY_LABELS[story.priority]}</span>
          <span>{story.acceptanceCriteria.length} critérios</span>
        </div>
      </header>

      <section className="document-preview-section">
        <p className="document-body">{story.description}</p>
      </section>

      <section className="document-preview-section">
        <h2>Critérios de aceite</h2>
        <div className="document-checklist">
          {story.acceptanceCriteria.map((criterion, index) => (
            <div key={`${story.id}-criterion-${index}`} className="document-check-row">
              <span className="document-checkbox" aria-hidden="true" />
              <p>{criterion}</p>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function EditableUserStoryDetail({
  story,
  onCancel,
  onSave,
}: {
  story: UserStory;
  onCancel: () => void;
  onSave: (story: UserStory) => Promise<void>;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createStoryDraft(story));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleInputId = `edit-story-title-${createDomId(story.id)}`;
  const descriptionInputId = `edit-story-description-${createDomId(story.id)}`;
  const priorityInputId = `edit-story-priority-${createDomId(story.id)}`;
  const criteriaLabelId = `edit-story-criteria-${createDomId(story.id)}`;

  useEffect(() => {
    setDraft(createStoryDraft(story));
  }, [story]);

  const updateCriterion = (index: number, value: string): void => {
    setDraft((current) => {
      const criteria = [...current.acceptanceCriteria];
      criteria[index] = value;
      return { ...current, acceptanceCriteria: criteria };
    });
  };

  const removeCriterion = (index: number): void => {
    setDraft((current) => ({
      ...current,
      acceptanceCriteria: current.acceptanceCriteria.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleSave = async (): Promise<void> => {
    const normalized: UserStory = {
      ...draft,
      title: draft.title.trim(),
      description: draft.description.trim(),
      acceptanceCriteria: draft.acceptanceCriteria.map((criterion) => criterion.trim()),
    };

    if (!normalized.title || !normalized.description) {
      setError("Título e descrição são obrigatórios.");
      return;
    }
    if (normalized.acceptanceCriteria.length === 0 || normalized.acceptanceCriteria.some((criterion) => !criterion)) {
      setError("Cada user story precisa de ao menos um critério preenchido.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(normalized);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar user story.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="story-detail-grid">
      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className="story-detail-block">
        <label className="field-label" htmlFor={titleInputId}>Título</label>
        <input
          id={titleInputId}
          className="input"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
        />
      </div>

      <div className="story-detail-block">
        <label className="field-label" htmlFor={descriptionInputId}>Descrição</label>
        <textarea
          id={descriptionInputId}
          className="textarea"
          rows={4}
          value={draft.description}
          onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
        />
      </div>

      <div className="story-detail-block">
        <label className="field-label" htmlFor={priorityInputId}>Prioridade</label>
        <select
          id={priorityInputId}
          className="select"
          value={draft.priority}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              priority: event.target.value as UserStory["priority"],
            }))
          }
        >
          {(["low", "medium", "high", "critical"] as const).map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
      </div>

      <div className="story-detail-block">
        <div className="story-edit-section-head">
          <p className="panel-kicker" id={criteriaLabelId}>Critérios de aceite</p>
          <button
            type="button"
            className="panel-action"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                acceptanceCriteria: [...current.acceptanceCriteria, ""],
              }))
            }
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Critério
          </button>
        </div>
        <div className="form-grid">
          {draft.acceptanceCriteria.map((criterion, index) => (
            <div key={index} className="criteria-row">
              <span className="criteria-index">{String(index + 1).padStart(2, "0")}</span>
              <input
                id={`edit-story-criterion-${createDomId(story.id)}-${index}`}
                aria-label={`Critério de aceite ${index + 1}`}
                className="input"
                value={criterion}
                onChange={(event) => updateCriterion(index, event.target.value)}
              />
              {draft.acceptanceCriteria.length > 1 && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remover critério"
                  onClick={() => removeCriterion(index)}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="story-edit-actions">
        <button type="button" className="ghost-button" onClick={onCancel} disabled={isSaving}>
          Cancelar
        </button>
        <button type="button" className="primary-button" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}

function ReadOnlySpecDetail({ spec }: { spec: Spec }): JSX.Element {
  return (
    <article className="document-preview">
      <header className="document-preview-title">
        <h1>{spec.summary}</h1>
      </header>

      <section className="document-preview-section">
        <h2>Abordagem técnica</h2>
        <p className="document-body">{spec.technicalApproach}</p>
      </section>

      <VisualContractSummary visualContract={spec.visualContract} />

      {spec.components.length > 0 && (
        <section className="document-preview-section">
          <h2>Componentes</h2>
          <div className="document-card-grid">
            {spec.components.map((component) => (
              <div key={component.name} className="document-mini-card">
                <span>{component.type}</span>
                <strong>{component.name}</strong>
                <p>{component.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {spec.apiEndpoints.length > 0 && (
        <section className="document-preview-section">
          <h2>Endpoints</h2>
          <div className="document-list">
            {spec.apiEndpoints.map((endpoint) => (
              <div key={`${endpoint.method}-${endpoint.path}`} className="document-list-row">
                <span>{endpoint.method}</span>
                <div>
                  <strong>{endpoint.path}</strong>
                  <p>{endpoint.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {spec.dataModels.length > 0 && (
        <section className="document-preview-section">
          <h2>Modelos de dados</h2>
          <div className="document-token-row">
            {spec.dataModels.map((model) => (
              <span key={model}>{model}</span>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function EditableSpecDetail({
  spec,
  onCancel,
  onSave,
}: {
  spec: Spec;
  onCancel: () => void;
  onSave: (spec: Spec) => Promise<void>;
}): JSX.Element {
  const [draft, setDraft] = useState(() => createSpecDraft(spec));
  const [criteriaText, setCriteriaText] = useState(() => spec.acceptanceCriteria.join("\n"));
  const [dataModelsText, setDataModelsText] = useState(() => spec.dataModels.join("\n"));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const specId = createDomId(spec.id);
  const summaryInputId = `edit-spec-summary-${specId}`;
  const approachInputId = `edit-spec-approach-${specId}`;
  const criteriaInputId = `edit-spec-criteria-${specId}`;
  const dataModelsInputId = `edit-spec-data-models-${specId}`;

  useEffect(() => {
    setDraft(createSpecDraft(spec));
    setCriteriaText(spec.acceptanceCriteria.join("\n"));
    setDataModelsText(spec.dataModels.join("\n"));
  }, [spec]);

  const handleSave = async (): Promise<void> => {
    const acceptanceCriteria = criteriaText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const dataModels = dataModelsText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const normalized: Spec = {
      ...draft,
      summary: draft.summary.trim(),
      technicalApproach: draft.technicalApproach.trim(),
      acceptanceCriteria,
      dataModels,
    };

    if (!normalized.summary || !normalized.technicalApproach) {
      setError("Resumo e abordagem técnica são obrigatórios.");
      return;
    }
    if (normalized.acceptanceCriteria.length === 0) {
      setError("A spec precisa de ao menos um critério de aceite.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(normalized);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar spec.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="story-detail-grid">
      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className="story-detail-block">
        <label className="field-label" htmlFor={summaryInputId}>Resumo</label>
        <textarea
          id={summaryInputId}
          className="textarea"
          rows={4}
          value={draft.summary}
          onChange={(event) =>
            setDraft((current) => ({ ...current, summary: event.target.value }))
          }
        />
      </div>

      <div className="story-detail-block">
        <label className="field-label" htmlFor={approachInputId}>Abordagem técnica</label>
        <textarea
          id={approachInputId}
          className="textarea"
          rows={5}
          value={draft.technicalApproach}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              technicalApproach: event.target.value,
            }))
          }
        />
      </div>

      <div className="story-detail-block">
        <label className="field-label" htmlFor={criteriaInputId}>Critérios da spec</label>
        <textarea
          id={criteriaInputId}
          className="textarea"
          rows={5}
          value={criteriaText}
          onChange={(event) => setCriteriaText(event.target.value)}
        />
      </div>

      <div className="story-detail-block">
        <label className="field-label" htmlFor={dataModelsInputId}>Modelos de dados</label>
        <textarea
          id={dataModelsInputId}
          className="textarea"
          rows={3}
          value={dataModelsText}
          onChange={(event) => setDataModelsText(event.target.value)}
          placeholder="Um modelo por linha"
        />
      </div>

      <div className="story-edit-actions">
        <button type="button" className="ghost-button" onClick={onCancel} disabled={isSaving}>
          Cancelar
        </button>
        <button type="button" className="primary-button" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Salvando..." : "Salvar spec"}
        </button>
      </div>
    </div>
  );
}

function WaitingForSpec({ story }: { story: UserStory }): JSX.Element {
  return (
    <div className="spec-waiting">
      <span className="step-dot running" aria-hidden="true" />
      <div>
        <p className="workflow-title">SPEC ainda não disponível</p>
        <p className="workflow-meta">
          A história "{story.title}" está aguardando geração ou sincronização do workflow.
        </p>
      </div>
    </div>
  );
}

export function StorySpecWorkspace({
  stories,
  workflowState,
  pendingSpec,
  workspaceFolders,
  workspaceFolderArtifactsById = {},
  loadingWorkspaceFolderIds = [],
  selectedWorkspaceFolderId,
  selectedStoryId,
  activeTab,
  onCreateStory,
  onGenerateSpecs,
  onGenerateSpecsAndBuild,
  onSelectWorkspaceFolder,
  onLoadWorkspaceFolder,
  onSelectStory,
  onUpdateStory,
  onDeleteStory,
  onUpdateSpec,
  onChangeTab,
  onApproveSpec,
  onRejectSpec,
  createStoryButtonRef,
  isGeneratingSpecs = false,
  isLoadingStories = false,
  constructionNotice = null,
  constructionError = null,
}: StorySpecWorkspaceProps): JSX.Element {
  const idPrefix = createDomId(useId());
  const storyTabRef = useRef<HTMLButtonElement>(null);
  const specTabRef = useRef<HTMLButtonElement>(null);
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [specMode, setSpecMode] = useState<SpecMode>("view");
  const [isDeletingStory, setIsDeletingStory] = useState(false);
  const folderExpansion = useFolderExpansionState({
    selectedWorkspaceFolderId,
    hasLoadedFolder: (folderId) => Boolean(workspaceFolderArtifactsById[folderId]),
    onLoadFolder: onLoadWorkspaceFolder,
  });

  useEffect(() => {
    setSpecMode("view");
  }, [selectedStoryId, activeTab]);

  const specByStoryId = getSpecMap(workflowState, pendingSpec);
  const firstStory = stories[0];

  const selectedStory =
    stories.find((story) => story.id === selectedStoryId) ?? firstStory ?? null;
  const safeSelectedStory = selectedStory ?? null;
  const selectedIndex = safeSelectedStory
    ? stories.findIndex((story) => story.id === safeSelectedStory.id)
    : -1;
  const selectedSpec = safeSelectedStory
    ? specByStoryId[safeSelectedStory.id] ?? null
    : null;
  const isSelectedPendingSpec = safeSelectedStory
    ? pendingSpec?.userStoryId === safeSelectedStory.id
    : false;
  const selectedFolder =
    workspaceFolders.find((folder) => folder.id === selectedWorkspaceFolderId) ??
    null;
  const selectedFolderSpecCount = stories.filter((story) =>
    Boolean(specByStoryId[story.id])
  ).length;
  const selectedFolderPendingCount = Math.max(
    0,
    stories.length - selectedFolderSpecCount
  );
  const selectedFolderProgress =
    stories.length > 0 ? Math.round((selectedFolderSpecCount / stories.length) * 100) : 0;
  const canGenerateSpecs =
    stories.length > 0 &&
    selectedFolderPendingCount > 0 &&
    Boolean(selectedWorkspaceFolderId);
  const canStartBuild =
    stories.length > 0 &&
    selectedFolderPendingCount === 0 &&
    Boolean(selectedWorkspaceFolderId);
  const workflowActionLabel =
    selectedFolderPendingCount > 0
      ? `${selectedFolderPendingCount} ${selectedFolderPendingCount === 1 ? "spec pendente" : "specs pendentes"}`
      : "pronto para construir";

  const isEditingSelectedStory = Boolean(safeSelectedStory && editingStoryId === safeSelectedStory.id);
  const isEditingSelectedSpec = Boolean(
    selectedSpec && !isSelectedPendingSpec && activeTab === "spec" && specMode === "edit"
  );
  const storyTabId = `${idPrefix}-story-tab`;
  const specTabId = `${idPrefix}-spec-tab`;
  const storyPanelId = `${idPrefix}-story-panel`;
  const specPanelId = `${idPrefix}-spec-panel`;
  const activePanelId = activeTab === "story" ? storyPanelId : specPanelId;
  const activeTabId = activeTab === "story" ? storyTabId : specTabId;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextTab = activeTab === "story" ? "spec" : "story";
    onChangeTab(nextTab);
    window.requestAnimationFrame(() => {
      if (nextTab === "story") {
        storyTabRef.current?.focus();
      } else {
        specTabRef.current?.focus();
      }
    });
  };

  const handleDeleteSelectedStory = async (): Promise<void> => {
    if (!safeSelectedStory) return;
    if (!window.confirm(`Excluir "${safeSelectedStory.title}" desta pasta?`)) return;
    setIsDeletingStory(true);
    try {
      await onDeleteStory(safeSelectedStory.id);
    } finally {
      setIsDeletingStory(false);
    }
  };

  const handleToggleFolder = (folderId: string): void => {
    folderExpansion.toggleFolder(folderId);
  };

  const handleSelectFolder = (folderId: string): void => {
    if (folderExpansion.isFolderExpanded(folderId)) {
      folderExpansion.toggleFolder(folderId);
      return;
    }

    folderExpansion.selectFolder(folderId, onSelectWorkspaceFolder);
  };

  return (
    <section className="spec-workspace panel">
      <aside className="spec-rail" aria-label="User stories">
        <div className="spec-rail-head">
          <div>
            <p className="panel-kicker">User stories</p>
            <h2 className="panel-title">Histórias</h2>
          </div>
          <div className="spec-rail-actions">
          <span className="status-chip">
            <span className="status-chip-label">total</span>
            <span className="status-chip-value">{stories.length}</span>
          </span>
          {isLoadingStories && (
            <span className="status-chip loading-chip" role="status" aria-live="polite">
              <span className="status-chip-label">pasta</span>
              <span className="status-chip-value">carregando</span>
            </span>
          )}
            <button
              ref={createStoryButtonRef}
              type="button"
              className="panel-action create-story-action"
              aria-label="Criar nova user story"
              onClick={onCreateStory}
            >
              <PlusIcon />
              Nova história
            </button>
            <div className="workflow-action-group" aria-label="Ações do orquestrador">
              <span className={`workflow-action-hint ${canStartBuild ? "ready" : ""}`}>
                {workflowActionLabel}
              </span>
              <button
                type="button"
                className={`workflow-action-button spec ${canGenerateSpecs ? "active" : "complete"}`}
                onClick={onGenerateSpecs}
                disabled={isGeneratingSpecs || !canGenerateSpecs}
                title={
                  canGenerateSpecs
                    ? "Gerar as specs pendentes para revisão antes da construção"
                    : "Todas as specs desta pasta já foram geradas"
                }
              >
                <SpecIcon />
                {isGeneratingSpecs
                  ? "Gerando"
                  : canGenerateSpecs
                  ? "Gerar specs"
                  : "Specs prontas"}
              </button>
              <button
                type="button"
                className={`workflow-action-button ${canStartBuild ? "build" : "locked"}`}
                onClick={onGenerateSpecsAndBuild}
                disabled={isGeneratingSpecs || !canStartBuild}
                title={
                  canStartBuild
                    ? "Autorizar e iniciar os agentes de construção"
                    : "Gere as specs pendentes antes de iniciar a construção"
                }
              >
                {canStartBuild ? <RocketIcon /> : <LockIcon />}
                {isGeneratingSpecs
                  ? "Rodando"
                  : canStartBuild
                  ? "Construir"
                  : "Aguardando specs"}
              </button>
            </div>
          </div>
        </div>

        {(constructionNotice || constructionError) && (
          <div
            className={constructionError ? "error-banner" : "success-banner"}
            role={constructionError ? "alert" : "status"}
            aria-live={constructionError ? "assertive" : "polite"}
          >
            {constructionError ?? constructionNotice}
          </div>
        )}

        <div className="spec-folder-list">
          {workspaceFolders.map((folder) => {
            const folderSelected = folder.id === selectedWorkspaceFolderId;
            const folderExpanded = folderExpansion.isFolderExpanded(folder.id);
            const folderPending = loadingWorkspaceFolderIds.includes(folder.id) || (folderSelected && isLoadingStories);
            const cachedArtifacts = workspaceFolderArtifactsById[folder.id] ?? null;
            const folderHasLoadedArtifacts = folderSelected
              ? Boolean(cachedArtifacts) || !isLoadingStories
              : Boolean(cachedArtifacts);
            const folderStories = folderSelected && !isLoadingStories
              ? stories
              : cachedArtifacts?.userStories ?? [];
            const folderSpecs = folderSelected && !isLoadingStories
              ? specByStoryId
              : cachedArtifacts?.specsByStoryId ?? {};
            const folderSpecCount = folderStories.filter((story) => Boolean(folderSpecs[story.id])).length;
            const folderPendingCount = Math.max(0, folderStories.length - folderSpecCount);
            const folderProgress =
              folderStories.length > 0 ? Math.round((folderSpecCount / folderStories.length) * 100) : 0;
            const folderStoriesId = `${idPrefix}-folder-${createDomId(folder.id)}-stories`;
            return (
              <div
                key={folder.id}
                className={`spec-folder-group ${folderSelected ? "active" : ""} ${folderExpanded ? "expanded" : ""} ${folderPending ? "pending" : ""}`}
              >
                <div className="spec-folder-row">
                  <button
                    type="button"
                    className="spec-folder-chevron"
                    onClick={() => handleToggleFolder(folder.id)}
                    aria-expanded={folderExpanded}
                    aria-controls={folderStoriesId}
                    aria-label={`${folderExpanded ? "Recolher" : "Expandir"} pasta ${folder.name}`}
                  >
                    <ChevronIcon expanded={folderExpanded} />
                  </button>
                  <button
                    type="button"
                    className="spec-folder-item"
                    onClick={() => handleSelectFolder(folder.id)}
                    aria-expanded={folderExpanded}
                    aria-controls={folderStoriesId}
                    aria-current={folderSelected ? "true" : undefined}
                    aria-label={formatFolderA11yLabel({
                      folder,
                      expanded: folderExpanded,
                      storyCount: folder.storyCount,
                      specCount: folderSpecCount,
                      pendingCount: folderPendingCount,
                      loaded: folderHasLoadedArtifacts,
                      loading: folderPending,
                    })}
                  >
                    <span className="spec-folder-icon">
                      <FolderIcon />
                    </span>
                    <span className="spec-folder-copy">
                      <span className="spec-folder-title-row">
                        <span className="workflow-title" title={folder.name}>{folder.name}</span>
                        <span className="folder-count" aria-hidden="true">{folder.storyCount}</span>
                      </span>
                      <span className="spec-folder-metrics" aria-hidden="true">
                        <span>{folder.storyCount} stories</span>
                        {folderPending && <span>carregando</span>}
                        {folderExpanded && folderHasLoadedArtifacts && (
                          <>
                            <span>{folderSpecCount} specs</span>
                            <span>{folderPendingCount} pendentes</span>
                          </>
                        )}
                      </span>
                      {folderExpanded && folderHasLoadedArtifacts && (
                        <span
                          className="spec-folder-progress"
                          role="progressbar"
                          aria-label={`${folderProgress}% das specs prontas`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={folderProgress}
                        >
                          <span style={{ width: `${folderProgress}%` }} />
                        </span>
                      )}
                    </span>
                  </button>
                </div>

                {folderExpanded && (
                  <div
                    id={folderStoriesId}
                    className={`spec-story-list nested ${isLoadingStories ? "is-loading" : ""}`}
                    aria-label={`Histórias da pasta ${folder.name}`}
                  >
                    {folderPending && !folderHasLoadedArtifacts && (
                      <div className="spec-story-loading" role="status">
                        <span className="loading-spinner" aria-hidden="true" />
                        Carregando
                      </div>
                    )}
                    {!folderPending && folderHasLoadedArtifacts && folderStories.length === 0 && (
                      <div className="spec-story-empty" role="status">
                        Pasta vazia
                      </div>
                    )}
                    {!folderPending && !folderHasLoadedArtifacts && (
                      <button
                        type="button"
                        className="spec-story-empty action"
                        onClick={() => handleSelectFolder(folder.id)}
                      >
                        Carregar
                      </button>
                    )}
                    {folderStories.map((story, index) => {
                      const hasSpec = Boolean(folderSpecs[story.id]);
                      const status = getStoryStatus(
                        story,
                        index,
                        folderSelected ? workflowState : null,
                        folderSelected ? pendingSpec : null,
                        hasSpec
                      );
                      const selected = safeSelectedStory ? story.id === safeSelectedStory.id : false;
                      const storySlug = createStorySlug(story, index);

                      return (
                        <button
                          key={story.id}
                          type="button"
                          className={`spec-story-item ${selected ? "active" : ""}`}
                          onClick={() => onSelectStory(story.id, folder.id)}
                          aria-current={selected ? "true" : undefined}
                          aria-label={formatStoryA11yLabel({
                            story,
                            index,
                            total: folderStories.length,
                            slug: storySlug,
                            status: status.label,
                            selected,
                          })}
                        >
                          <span
                            className={`step-dot ${
                              status.tone === "done"
                                ? "completed"
                                : status.tone === "active" || status.tone === "warn"
                                ? "running"
                                : status.tone === "danger"
                                ? "failed"
                                : ""
                            }`}
                            aria-hidden="true"
                          />
                          <span className="spec-story-copy">
                            <span className="workflow-title" title={story.title}>{story.title}</span>
                          </span>
                          <StatusPill label={status.label} tone={status.tone} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {workspaceFolders.length === 0 && (
            <div className="spec-story-list">
              {stories.map((story, index) => {
                const hasSpec = Boolean(specByStoryId[story.id]);
                const status = getStoryStatus(story, index, workflowState, pendingSpec, hasSpec);
                const selected = safeSelectedStory ? story.id === safeSelectedStory.id : false;
                const storySlug = createStorySlug(story, index);

                return (
                  <button
                    key={story.id}
                    type="button"
                    className={`spec-story-item ${selected ? "active" : ""}`}
                    onClick={() => onSelectStory(story.id)}
                    aria-current={selected ? "true" : undefined}
                    aria-label={formatStoryA11yLabel({
                      story,
                      index,
                      total: stories.length,
                      slug: storySlug,
                      status: status.label,
                      selected,
                    })}
                  >
                    <span className="step-dot" aria-hidden="true" />
                    <span className="spec-story-copy">
                      <span className="workflow-title" title={story.title}>{story.title}</span>
                    </span>
                    <StatusPill label={status.label} tone={status.tone} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <div className={`spec-detail ${isLoadingStories ? "is-loading" : ""}`}>
        {isLoadingStories && (
          <div className="spec-detail-loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            Sincronizando pasta selecionada
          </div>
        )}
        <div className="spec-detail-head">
          <div className="spec-detail-title">
            <p className="panel-kicker">Selecionada</p>
            <h2 className="panel-title">{safeSelectedStory?.title ?? "Carregando histórias"}</h2>
            <p className="workflow-meta">
              {selectedFolder ? `${selectedFolder.name} / ` : ""}
              {safeSelectedStory ? createStorySlug(safeSelectedStory, selectedIndex) : "aguarde a pasta atualizar"}
            </p>
          </div>

          <div
            className="story-spec-tabs"
            role="tablist"
            aria-label="Detalhe da história"
            onKeyDown={handleTabKeyDown}
          >
            <button
              ref={storyTabRef}
              id={storyTabId}
              type="button"
              role="tab"
              aria-selected={activeTab === "story"}
              aria-controls={storyPanelId}
              tabIndex={activeTab === "story" ? 0 : -1}
              className={`story-spec-tab ${activeTab === "story" ? "active" : ""}`}
              onClick={() => onChangeTab("story")}
            >
              <StoryIcon />
              User Story
            </button>
            <button
              ref={specTabRef}
              id={specTabId}
              type="button"
              role="tab"
              aria-selected={activeTab === "spec"}
              aria-controls={specPanelId}
              tabIndex={activeTab === "spec" ? 0 : -1}
              className={`story-spec-tab ${activeTab === "spec" ? "active" : ""}`}
              onClick={() => onChangeTab("spec")}
            >
              <SpecIcon />
              SPEC (SDD)
              {selectedSpec && (
                <span className="tab-dot" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="story-detail-actions" aria-label="Ações da user story">
            {activeTab === "spec" && selectedSpec && !isSelectedPendingSpec ? (
              <div className="spec-mode-toggle" role="group" aria-label="Modo da spec">
                <button
                  type="button"
                  className={`spec-mode-button ${specMode === "view" ? "active" : ""}`}
                  aria-pressed={specMode === "view"}
                  onClick={() => setSpecMode("view")}
                >
                  <EyeIcon />
                  Visualização
                </button>
                <button
                  type="button"
                  className={`spec-mode-button ${specMode === "edit" ? "active" : ""}`}
                  aria-pressed={specMode === "edit"}
                  onClick={() => setSpecMode("edit")}
                >
                  <EditIcon />
                  Editar
                </button>
              </div>
            ) : (
              <>
                {safeSelectedStory && (
                  <>
                    <button
                      type="button"
                      className="panel-action"
                      onClick={() => setEditingStoryId(safeSelectedStory.id)}
                    >
                      <EditIcon />
                      Editar
                    </button>
                    <button
                      type="button"
                      className="panel-action danger"
                      onClick={handleDeleteSelectedStory}
                      disabled={isDeletingStory}
                    >
                      <TrashIcon />
                      {isDeletingStory ? "Excluindo" : "Excluir"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div
          id={activePanelId}
          className="spec-detail-body"
          role="tabpanel"
          aria-labelledby={activeTabId}
        >
          {activeTab === "story" && safeSelectedStory && !isEditingSelectedStory && (
            <UserStoryDetail story={safeSelectedStory} />
          )}

          {activeTab === "story" && safeSelectedStory && isEditingSelectedStory && (
            <EditableUserStoryDetail
              story={safeSelectedStory}
              onCancel={() => setEditingStoryId(null)}
              onSave={onUpdateStory}
            />
          )}

          {activeTab === "spec" && isSelectedPendingSpec && selectedSpec && (
            <SpecReview
              spec={selectedSpec}
              onApprove={onApproveSpec}
              onReject={onRejectSpec}
            />
          )}

          {activeTab === "spec" && !isSelectedPendingSpec && selectedSpec && !isEditingSelectedSpec && (
            <ReadOnlySpecDetail spec={selectedSpec} />
          )}

          {activeTab === "spec" && !isSelectedPendingSpec && selectedSpec && isEditingSelectedSpec && (
            <EditableSpecDetail
              spec={selectedSpec}
              onCancel={() => setSpecMode("view")}
              onSave={async (spec) => {
                if (!safeSelectedStory) return;
                await onUpdateSpec(safeSelectedStory.id, spec);
                setSpecMode("view");
              }}
            />
          )}

          {activeTab === "spec" && safeSelectedStory && !selectedSpec && (
            <WaitingForSpec story={safeSelectedStory} />
          )}

          {!safeSelectedStory && (
            <div className="spec-waiting">
              {isLoadingStories ? (
                <span className="loading-spinner" aria-hidden="true" />
              ) : (
                <span className="step-dot" aria-hidden="true" />
              )}
              <div>
                <p className="workflow-title">
                  {isLoadingStories ? "Carregando histórias" : "Nenhuma história nesta pasta"}
                </p>
                <p className="workflow-meta">
                  {isLoadingStories
                    ? "A lista será preenchida assim que a pasta selecionada responder."
                    : "Crie user stories nesta pasta para gerar specs e revisar o SDD."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
