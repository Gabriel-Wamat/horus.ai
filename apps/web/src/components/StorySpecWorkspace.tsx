import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent, type Ref } from "react";
import type { Spec, UserStory, WorkflowState, WorkspaceFolder } from "@u-build/shared";
import { SpecReview } from "./SpecReview.js";
import { useFolderExpansionState } from "./story-spec/useFolderExpansionState.js";
import {
  ChevronIcon,
  EditIcon,
  EyeIcon,
  FolderIcon,
  LockIcon,
  PlusIcon,
  RocketIcon,
  SpecIcon,
  StoryIcon,
  TrashIcon,
} from "./story-spec/StorySpecIcons.js";
import {
  EditableSpecDetail,
  EditableUserStoryDetail,
  ReadOnlySpecDetail,
  UserStoryDetail,
  WaitingForSpec,
} from "./story-spec/StorySpecDetails.js";
import {
  createDomId,
  createStorySlug,
  formatFolderA11yLabel,
  formatStoryA11yLabel,
  getSpecMap,
  getStoryStatus,
  type DetailTab,
  type PendingSpec,
  type SpecMode,
  type WorkspaceFolderArtifacts,
} from "./story-spec/StorySpecFormatters.js";

interface StorySpecWorkspaceProps {
  stories: UserStory[];
  workflowState: WorkflowState | null;
  pendingSpec: PendingSpec | null;
  persistedSpecsByStoryId?: Record<string, Spec>;
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

export function StorySpecWorkspace({
  stories,
  workflowState,
  pendingSpec,
  persistedSpecsByStoryId = {},
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

  const specByStoryId = getSpecMap(
    workflowState,
    pendingSpec,
    persistedSpecsByStoryId
  );
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
