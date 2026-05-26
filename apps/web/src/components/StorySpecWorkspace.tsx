import { useEffect, useState, type JSX } from "react";
import type { Spec, UserStory, WorkflowState, WorkspaceFolder } from "@u-build/shared";
import { SpecReview } from "./SpecReview.js";

type DetailTab = "story" | "spec";
type SpecMode = "view" | "edit";

interface PendingSpec {
  userStoryId: string;
  spec: Spec;
}

interface StorySpecWorkspaceProps {
  stories: UserStory[];
  workflowState: WorkflowState | null;
  pendingSpec: PendingSpec | null;
  workspaceFolders: WorkspaceFolder[];
  selectedWorkspaceFolderId: string;
  selectedStoryId: string | null;
  activeTab: DetailTab;
  onCreateStory: () => void;
  onGenerateSpecs: () => void;
  onGenerateSpecsAndBuild: () => void;
  onSelectWorkspaceFolder: (folderId: string) => void;
  onSelectStory: (storyId: string) => void;
  onUpdateStory: (story: UserStory) => Promise<void>;
  onDeleteStory: (storyId: string) => Promise<void>;
  onUpdateSpec: (storyId: string, spec: Spec) => Promise<void>;
  onChangeTab: (tab: DetailTab) => void;
  onApproveSpec: (editedSpec?: Spec) => void;
  onRejectSpec: () => void;
  isGeneratingSpecs?: boolean;
  isLoadingStories?: boolean;
}

const PRIORITY_LABELS: Record<UserStory["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

const PRIORITY_COLORS: Record<UserStory["priority"], string> = {
  low: "var(--p)",
  medium: "var(--info)",
  high: "var(--warn)",
  critical: "var(--danger)",
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

function getSpecMap(
  workflowState: WorkflowState | null,
  pendingSpec: PendingSpec | null
): Record<string, Spec> {
  return {
    ...(workflowState?.specs ?? {}),
    ...(pendingSpec ? { [pendingSpec.userStoryId]: pendingSpec.spec } : {}),
  };
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
      ? { label: "spec pronta", tone: "done" }
      : { label: "rascunho", tone: "neutral" };
  }

  if (workflowState.status === "idle") {
    return hasSpec
      ? { label: "spec pronta", tone: "done" }
      : { label: "rascunho", tone: "neutral" };
  }

  if (workflowState.status === "cancelled") {
    return { label: "cancelado", tone: "danger" };
  }

  if (workflowState.status === "error") {
    return { label: "erro", tone: "danger" };
  }

  if (workflowState.status === "completed") {
    return { label: "concluído", tone: "done" };
  }

  if (index < workflowState.currentUSIndex) {
    return { label: "concluído", tone: "done" };
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
    <div className="story-detail-grid">
      <div className="story-detail-block">
        <p className="panel-kicker">Descrição</p>
        <p className="message-body">{story.description}</p>
      </div>

      <div className="story-detail-block">
        <div className="story-detail-meta-row">
          <span className="status-chip">
            <span className="status-chip-label">prioridade</span>
            <span
              className="status-chip-value"
              style={{ color: PRIORITY_COLORS[story.priority] }}
            >
              {PRIORITY_LABELS[story.priority]}
            </span>
          </span>
          <span className="status-chip">
            <span className="status-chip-label">critérios</span>
            <span className="status-chip-value">{story.acceptanceCriteria.length}</span>
          </span>
        </div>
      </div>

      <div className="story-detail-block">
        <p className="panel-kicker">Critérios de aceite</p>
        <div className="spec-list">
          {story.acceptanceCriteria.map((criterion, index) => (
            <div key={`${story.id}-criterion-${index}`} className="spec-list-row">
              <span className="criteria-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="message-body">{criterion}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
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
      {error && <div className="error-banner">{error}</div>}

      <div className="story-detail-block">
        <label className="field-label">Título</label>
        <input
          className="input"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
        />
      </div>

      <div className="story-detail-block">
        <label className="field-label">Descrição</label>
        <textarea
          className="textarea"
          rows={4}
          value={draft.description}
          onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
        />
      </div>

      <div className="story-detail-block">
        <label className="field-label">Prioridade</label>
        <select
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
          <p className="panel-kicker">Critérios de aceite</p>
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
    <div className="story-detail-grid">
      <div className="story-detail-block">
        <p className="panel-kicker">Resumo</p>
        <p className="message-body">{spec.summary}</p>
      </div>

      <div className="story-detail-block">
        <p className="panel-kicker">Abordagem técnica</p>
        <p className="message-body">{spec.technicalApproach}</p>
      </div>

      {spec.components.length > 0 && (
        <div className="story-detail-block">
          <p className="panel-kicker">Componentes</p>
          <div className="spec-component-grid">
            {spec.components.map((component) => (
              <div key={component.name} className="spec-component">
                <span className="status-chip-value">{component.type}</span>
                <p className="workflow-title">{component.name}</p>
                <p className="workflow-meta">{component.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {spec.apiEndpoints.length > 0 && (
        <div className="story-detail-block">
          <p className="panel-kicker">Endpoints</p>
          <div className="spec-list">
            {spec.apiEndpoints.map((endpoint) => (
              <div key={`${endpoint.method}-${endpoint.path}`} className="spec-list-row">
                <span className="status-chip-value" style={{ color: "var(--info)" }}>
                  {endpoint.method}
                </span>
                <div>
                  <p className="workflow-title">{endpoint.path}</p>
                  <p className="workflow-meta">{endpoint.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {spec.dataModels.length > 0 && (
        <div className="story-detail-block">
          <p className="panel-kicker">Modelos de dados</p>
          <div className="spec-token-row">
            {spec.dataModels.map((model) => (
              <span key={model} className="status-chip-value">
                {model}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
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
      {error && <div className="error-banner">{error}</div>}

      <div className="story-detail-block">
        <label className="field-label">Resumo</label>
        <textarea
          className="textarea"
          rows={4}
          value={draft.summary}
          onChange={(event) =>
            setDraft((current) => ({ ...current, summary: event.target.value }))
          }
        />
      </div>

      <div className="story-detail-block">
        <label className="field-label">Abordagem técnica</label>
        <textarea
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
        <label className="field-label">Critérios da spec</label>
        <textarea
          className="textarea"
          rows={5}
          value={criteriaText}
          onChange={(event) => setCriteriaText(event.target.value)}
        />
      </div>

      <div className="story-detail-block">
        <label className="field-label">Modelos de dados</label>
        <textarea
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
  selectedWorkspaceFolderId,
  selectedStoryId,
  activeTab,
  onCreateStory,
  onGenerateSpecs,
  onGenerateSpecsAndBuild,
  onSelectWorkspaceFolder,
  onSelectStory,
  onUpdateStory,
  onDeleteStory,
  onUpdateSpec,
  onChangeTab,
  onApproveSpec,
  onRejectSpec,
  isGeneratingSpecs = false,
  isLoadingStories = false,
}: StorySpecWorkspaceProps): JSX.Element {
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [specMode, setSpecMode] = useState<SpecMode>("view");
  const [isDeletingStory, setIsDeletingStory] = useState(false);
  const [expandedFolderId, setExpandedFolderId] = useState(selectedWorkspaceFolderId);

  useEffect(() => {
    setSpecMode("view");
  }, [selectedStoryId, activeTab]);

  useEffect(() => {
    if (!selectedWorkspaceFolderId) {
      setExpandedFolderId("");
      return;
    }

    if (!isLoadingStories) {
      setExpandedFolderId(selectedWorkspaceFolderId);
    }
  }, [isLoadingStories, selectedWorkspaceFolderId]);

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
    workspaceFolders.find((folder) => folder.id === (isLoadingStories ? expandedFolderId : selectedWorkspaceFolderId)) ??
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

  return (
    <section className="spec-workspace panel">
      <aside className="spec-rail" aria-label="User stories">
        <div className="spec-rail-head">
          <div>
            <p className="panel-kicker">User stories</p>
            <h2 className="panel-title">Histórias e specs</h2>
          </div>
          <div className="spec-rail-actions">
          <span className="status-chip">
            <span className="status-chip-label">total</span>
            <span className="status-chip-value">{stories.length}</span>
          </span>
          {isLoadingStories && (
            <span className="status-chip loading-chip" role="status">
              <span className="status-chip-label">pasta</span>
              <span className="status-chip-value">carregando</span>
            </span>
          )}
            <button
              type="button"
              className="panel-action"
              onClick={onCreateStory}
            >
              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Criar
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
                {isGeneratingSpecs ? "Gerando" : canGenerateSpecs ? "Gerar specs" : "Specs geradas"}
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
                  ? "Construindo"
                  : canStartBuild
                  ? "Iniciar projeto"
                  : "Aguardando specs"}
              </button>
            </div>
          </div>
        </div>

        <div className="spec-folder-list">
          {workspaceFolders.map((folder) => {
            const folderSelected = folder.id === selectedWorkspaceFolderId;
            const folderExpanded = folder.id === expandedFolderId;
            const folderPending = folderSelected && isLoadingStories && !folderExpanded;
            return (
              <div
                key={folder.id}
                className={`spec-folder-group ${folderExpanded ? "active" : ""} ${folderPending ? "pending" : ""}`}
              >
                <button
                  type="button"
                  className="spec-folder-item"
                  onClick={() => onSelectWorkspaceFolder(folder.id)}
                  aria-expanded={folderExpanded}
                >
                  <span className="spec-folder-icon">
                    <FolderIcon />
                  </span>
                  <span className="spec-folder-copy">
                    <span className="spec-folder-title-row">
                      <span className="workflow-title">{folder.name}</span>
                      <span className="status-chip-value">{folder.storyCount}</span>
                    </span>
                    <span className="spec-folder-metrics">
                      <span>{folder.storyCount} stories</span>
                      {folderPending && <span>carregando</span>}
                      {folderExpanded && (
                        <>
                          <span>{selectedFolderSpecCount} specs</span>
                          <span>{selectedFolderPendingCount} pendentes</span>
                        </>
                      )}
                    </span>
                    {folderExpanded && (
                      <span className="spec-folder-progress" aria-label={`${selectedFolderProgress}% das specs prontas`}>
                        <span style={{ width: `${selectedFolderProgress}%` }} />
                      </span>
                    )}
                  </span>
                </button>

                {folderExpanded && (
                  <div className={`spec-story-list nested ${isLoadingStories ? "is-loading" : ""}`}>
                    {isLoadingStories && selectedWorkspaceFolderId !== expandedFolderId && (
                      <div className="spec-story-loading" role="status">
                        <span className="loading-spinner" aria-hidden="true" />
                        Mantendo esta pasta aberta enquanto a próxima carrega
                      </div>
                    )}
                    {stories.map((story, index) => {
                      const hasSpec = Boolean(specByStoryId[story.id]);
                      const status = getStoryStatus(story, index, workflowState, pendingSpec, hasSpec);
                      const selected = safeSelectedStory ? story.id === safeSelectedStory.id : false;

                      return (
                        <button
                          key={story.id}
                          type="button"
                          className={`spec-story-item ${selected ? "active" : ""}`}
                          onClick={() => onSelectStory(story.id)}
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
                            <span className="workflow-title">{story.title}</span>
                            <span className="workflow-meta">{createStorySlug(story, index)}</span>
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

                return (
                  <button
                    key={story.id}
                    type="button"
                    className={`spec-story-item ${selected ? "active" : ""}`}
                    onClick={() => onSelectStory(story.id)}
                  >
                    <span className="step-dot" aria-hidden="true" />
                    <span className="spec-story-copy">
                      <span className="workflow-title">{story.title}</span>
                      <span className="workflow-meta">{createStorySlug(story, index)}</span>
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

          <div className="story-spec-tabs" role="tablist" aria-label="Detalhe da história">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "story"}
              className={`story-spec-tab ${activeTab === "story" ? "active" : ""}`}
              onClick={() => onChangeTab("story")}
            >
              User Story
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "spec"}
              className={`story-spec-tab ${activeTab === "spec" ? "active" : ""}`}
              onClick={() => onChangeTab("spec")}
            >
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
                  Visualização
                </button>
                <button
                  type="button"
                  className={`spec-mode-button ${specMode === "edit" ? "active" : ""}`}
                  aria-pressed={specMode === "edit"}
                  onClick={() => setSpecMode("edit")}
                >
                  <EditIcon />
                  Edit
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

        <div className="spec-detail-body">
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
