import { useEffect, useState, type JSX } from "react";
import type { Spec, UserStory } from "@u-build/shared";
import { DesignBriefSummary, VisualContractSummary } from "../SpecReview.js";
import { createDomId, PRIORITY_LABELS } from "./StorySpecFormatters.js";
import { PlusIcon, TrashIcon } from "./StorySpecIcons.js";

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

export function EmptySpecsState({
  onCreateStory,
}: {
  onCreateStory: () => void;
}): JSX.Element {
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
          <PlusIcon />
          Criar user-stories
        </button>
      </div>
    </section>
  );
}

export function UserStoryDetail({
  story,
}: {
  story: UserStory;
}): JSX.Element {
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

export function EditableUserStoryDetail({
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
            <PlusIcon />
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

export function ReadOnlySpecDetail({ spec }: { spec: Spec }): JSX.Element {
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
      <DesignBriefSummary designBrief={spec.designBrief} />

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

export function EditableSpecDetail({
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

export function WaitingForSpec({ story }: { story: UserStory }): JSX.Element {
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
