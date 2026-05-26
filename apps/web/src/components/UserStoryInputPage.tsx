import { useState, type JSX } from "react";
import type { UserStory, WorkspaceFolder } from "@u-build/shared";

interface StoryDraft {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: "low" | "medium" | "high" | "critical";
}

function createDraft(): StoryDraft {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    acceptanceCriteria: [""],
    priority: "medium",
  };
}

const PRIORITY_LABELS: Record<StoryDraft["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

const PRIORITY_COLORS: Record<StoryDraft["priority"], string> = {
  low: "priority-low",
  medium: "priority-medium",
  high: "priority-high",
  critical: "priority-critical",
};

interface Props {
  onSubmit: (stories: UserStory[], workspaceFolderId: string) => Promise<void>;
  initialStories?: UserStory[];
  workspaceFolders: WorkspaceFolder[];
  selectedWorkspaceFolderId: string;
  isLoadingWorkspaceFolders?: boolean;
  workspaceFolderError?: string | null;
  onSelectWorkspaceFolder: (folderId: string) => void;
  onCreateWorkspaceFolder: (name: string) => Promise<void>;
}

export function UserStoryInputPage({
  onSubmit,
  initialStories,
  workspaceFolders,
  selectedWorkspaceFolderId,
  isLoadingWorkspaceFolders = false,
  workspaceFolderError,
  onSelectWorkspaceFolder,
  onCreateWorkspaceFolder,
}: Props): JSX.Element {
  const [drafts, setDrafts] = useState<StoryDraft[]>(() =>
    initialStories && initialStories.length > 0
      ? initialStories.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          acceptanceCriteria: s.acceptanceCriteria,
          priority: s.priority,
        }))
      : [createDraft()]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updateDraft = <K extends keyof StoryDraft>(
    id: string,
    field: K,
    value: StoryDraft[K]
  ) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: value } : d))
    );
  };

  const updateCriteria = (draftId: string, index: number, value: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== draftId) return d;
        const criteria = [...d.acceptanceCriteria];
        criteria[index] = value;
        return { ...d, acceptanceCriteria: criteria };
      })
    );
  };

  const addCriteria = (draftId: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftId
          ? { ...d, acceptanceCriteria: [...d.acceptanceCriteria, ""] }
          : d
      )
    );
  };

  const removeCriteria = (draftId: string, index: number) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== draftId) return d;
        return {
          ...d,
          acceptanceCriteria: d.acceptanceCriteria.filter((_, i) => i !== index),
        };
      })
    );
  };

  const addStory = () => setDrafts((prev) => [...prev, createDraft()]);

  const removeStory = (id: string) => {
    if (drafts.length === 1) return;
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSubmit = async () => {
    if (!selectedWorkspaceFolderId) {
      setError("Selecione ou crie uma pasta do workspace antes de gerar specs.");
      return;
    }

    for (const draft of drafts) {
      if (!draft.title.trim()) {
        setError("Todas as histórias precisam de um título.");
        return;
      }
      if (!draft.description.trim()) {
        setError("Todas as histórias precisam de uma descrição.");
        return;
      }
      if (draft.acceptanceCriteria.some((c) => !c.trim())) {
        setError("Remova os critérios de aceite vazios antes de continuar.");
        return;
      }
      if (draft.acceptanceCriteria.length === 0) {
        setError("Cada história precisa de ao menos um critério de aceite.");
        return;
      }
    }

    setError(null);
    setIsSubmitting(true);

    const stories: UserStory[] = drafts.map((d) => ({
      id: d.id,
      title: d.title.trim(),
      description: d.description.trim(),
      acceptanceCriteria: d.acceptanceCriteria.map((c) => c.trim()),
      priority: d.priority,
      labels: [],
      createdAt: new Date().toISOString(),
    }));

    try {
      await onSubmit(stories, selectedWorkspaceFolderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar o workflow.");
      setIsSubmitting(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setError("Informe um nome para iniciar uma pasta do workspace.");
      return;
    }

    setIsCreatingFolder(true);
    setError(null);
    try {
      await onCreateWorkspaceFolder(name);
      setNewFolderName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar pasta.");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  return (
    <section className="chat-panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Briefing</p>
          <h2 className="panel-title">Histórias para especificação</h2>
        </div>
        <span className="status-chip">
          <span className="status-chip-label">queue</span>
          <span className="status-chip-value">{drafts.length}</span>
        </span>
      </div>

      <div className="panel-body">
        <div className="form-grid">
          <div className="story-card">
            <div className="story-card-head">
              <span className="story-index">Workspace</span>
              <span className="status-chip">
                <span className="status-chip-label">pastas</span>
                <span className="status-chip-value">{workspaceFolders.length}</span>
              </span>
            </div>

            <div className="field-row workspace-folder-row">
              <div>
                <label className="field-label">
                  Pasta de destino *
                </label>
                <select
                  value={selectedWorkspaceFolderId}
                  onChange={(e) => onSelectWorkspaceFolder(e.target.value)}
                  className="select"
                  disabled={isLoadingWorkspaceFolders || workspaceFolders.length === 0}
                >
                  <option value="">
                    {isLoadingWorkspaceFolders
                      ? "Carregando pastas..."
                      : "Selecione uma pasta"}
                  </option>
                  {workspaceFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">
                  Nova pasta
                </label>
                <div className="workspace-folder-create">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Nome da pasta"
                    className="input"
                  />
                  <button
                    type="button"
                    className="panel-action"
                    onClick={handleCreateFolder}
                    disabled={isCreatingFolder}
                  >
                    {isCreatingFolder ? "Criando..." : "Iniciar"}
                  </button>
                </div>
              </div>
            </div>

            {(workspaceFolderError || workspaceFolders.length === 0) && (
              <p className="workflow-meta" style={{ marginTop: 10 }}>
                {workspaceFolderError ??
                  "Nenhuma pasta encontrada. Inicie uma pasta para direcionar estas user stories."}
              </p>
            )}
          </div>

          {drafts.map((draft, storyIndex) => (
            <div
              key={draft.id}
              className="story-card"
            >
              <div className="story-card-head">
                <span className="story-index">
                  História #{storyIndex + 1}
                </span>
                {drafts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStory(draft.id)}
                    className="panel-action danger"
                    title="Remover história"
                    aria-label="Remover história"
                  >
                    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="form-grid">
                <div className="field-row">
                  <div>
                    <label className="field-label">
                      Título *
                    </label>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => updateDraft(draft.id, "title", e.target.value)}
                      placeholder="Como usuário, quero…"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="field-label">
                      Prioridade
                    </label>
                    <select
                      value={draft.priority}
                      onChange={(e) =>
                        updateDraft(draft.id, "priority", e.target.value as StoryDraft["priority"])
                      }
                      className={`select ${PRIORITY_COLORS[draft.priority]}`}
                    >
                      {(["low", "medium", "high", "critical"] as const).map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="field-label">
                    Descrição *
                  </label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => updateDraft(draft.id, "description", e.target.value)}
                    placeholder="Descreva o contexto, motivação e comportamento esperado…"
                    rows={3}
                    className="textarea"
                  />
                </div>

                <div>
                  <label className="field-label">
                    Critérios de aceite *
                  </label>
                  <div>
                    {draft.acceptanceCriteria.map((criterion, criterionIndex) => (
                      <div key={criterionIndex} className="criteria-row">
                        <span className="criteria-index">
                          {String(criterionIndex + 1).padStart(2, "0")}
                        </span>
                        <input
                          type="text"
                          value={criterion}
                          onChange={(e) =>
                            updateCriteria(draft.id, criterionIndex, e.target.value)
                          }
                          placeholder="Dado que… quando… então…"
                          className="input"
                        />
                        {draft.acceptanceCriteria.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeCriteria(draft.id, criterionIndex)}
                            className="panel-action danger"
                            aria-label="Remover critério"
                          >
                            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {draft.acceptanceCriteria.length === 1 && (
                          <span aria-hidden="true" />
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addCriteria(draft.id)}
                    className="ghost-button"
                    style={{ marginTop: 10 }}
                  >
                    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Adicionar critério
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addStory}
          className="ghost-button"
          style={{ width: "100%", marginTop: 14 }}
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Adicionar história
        </button>

        {error && (
          <div className="error-banner" style={{ marginTop: 14, marginBottom: 0 }}>
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18 }}>
          <span className="status-chip">
            <span className="status-chip-label">total</span>
            <span className="status-chip-value">
            {drafts.length} {drafts.length === 1 ? "história" : "histórias"}
            </span>
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedWorkspaceFolderId}
            className="primary-button"
          >
            {isSubmitting ? (
              <>
                <svg className="icon animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Iniciando…
              </>
            ) : (
              <>
                Gerar Specs
                <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
