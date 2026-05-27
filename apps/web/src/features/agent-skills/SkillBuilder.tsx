import { useMemo, useState, type JSX } from "react";
import {
  CheckCircle2,
  FilePlus2,
  Plus,
  Rocket,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type {
  AgentProfile,
  AgentSkillBindingTriggerMode,
  AgentSkillValidationReport,
  CreateAgentSkillFileInput,
  CreateAgentSkillInput,
  ValidateAgentSkillInput,
} from "@u-build/shared";
import type {
  CreateAgentSkillResponse,
  PublishAgentSkillResponse,
  ValidateAgentSkillResponse,
} from "../../api/agentSkillsApi.js";
import { ValidationReport } from "./SkillDetailPanel.js";

interface SkillBuilderProps {
  readonly isOpen: boolean;
  readonly profiles: AgentProfile[];
  readonly isCreating: boolean;
  readonly isValidating: boolean;
  readonly isPublishing: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onValidate: (
    input: ValidateAgentSkillInput
  ) => Promise<ValidateAgentSkillResponse>;
  readonly onCreate: (
    input: CreateAgentSkillInput
  ) => Promise<CreateAgentSkillResponse>;
  readonly onPublish: (
    skillId: string,
    revisionId: string,
    expectedRevisionHash: string
  ) => Promise<PublishAgentSkillResponse>;
}

const STARTER_SKILL_MD = `---
name: project-skill
description: Describe quando Horus deve carregar esta skill.
---

# Project Skill

## Purpose

Use esta skill quando o agente precisar seguir um fluxo reutilizável específico deste projeto.

## Inputs

- Contexto da user story
- Spec ativa
- Arquivos relevantes do projeto

## Workflow

1. Leia a intenção e confirme o escopo.
2. Consulte os arquivos necessários antes de propor mudanças.
3. Execute as validações aplicáveis.
4. Responda com evidência objetiva do que foi feito.

## Quality Checks

- Não inventar arquivos, rotas ou estados.
- Não solicitar permissões além do perfil do agente.
- Não entregar sem validação quando houver comando disponível.
`;

export function SkillBuilder({
  isOpen,
  profiles,
  isCreating,
  isValidating,
  isPublishing,
  error,
  onClose,
  onValidate,
  onCreate,
  onPublish,
}: SkillBuilderProps): JSX.Element | null {
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [skillMd, setSkillMd] = useState(STARTER_SKILL_MD);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(["front_agent"]);
  const [triggerMode, setTriggerMode] =
    useState<AgentSkillBindingTriggerMode>("manual");
  const [files, setFiles] = useState<CreateAgentSkillFileInput[]>([]);
  const [validationReport, setValidationReport] =
    useState<AgentSkillValidationReport | null>(null);
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);

  const canValidate =
    displayName.trim().length > 0 &&
    description.trim().length > 0 &&
    skillMd.trim().length > 0 &&
    selectedAgentIds.length > 0;
  const canPublish =
    canValidate && validationReport?.status === "passed" && !isCreating && !isPublishing;
  const selectedProfiles = useMemo(
    () => profiles.filter((profile) => selectedAgentIds.includes(profile.id)),
    [profiles, selectedAgentIds]
  );

  if (!isOpen) return null;

  const validate = async (): Promise<ValidateAgentSkillResponse> => {
    const result = await onValidate({
      skillMd,
      files,
      bindingAgentProfileIds: selectedAgentIds,
    });
    setValidationReport(result.validationReport);
    setCreatedMessage(null);
    return result;
  };

  const buildCreateInput = (): CreateAgentSkillInput => ({
    displayName: displayName.trim(),
    description: description.trim(),
    skillMd,
    files,
    bindings: selectedAgentIds.map((agentProfileId) => ({
      agentProfileId,
      triggerMode,
      priority: 100,
      enabled: true,
    })),
    scope: "project",
    createdBy: "horus-ui",
  });

  const saveDraft = async (): Promise<void> => {
    const created = await onCreate(buildCreateInput());
    setValidationReport(created.validationReport);
    setCreatedMessage(
      created.validationReport.status === "passed"
        ? "Draft salvo e validado."
        : "Draft salvo com pendências de validação."
    );
  };

  const createAndPublish = async (): Promise<void> => {
    const validation = await validate();
    if (validation.validationReport.status !== "passed") return;
    const created = await onCreate(buildCreateInput());
    if (created.validationReport.status !== "passed") {
      setValidationReport(created.validationReport);
      return;
    }
    await onPublish(
      created.skill.id,
      created.draftRevision.id,
      created.draftRevision.contentHash
    );
    setCreatedMessage("Skill publicada e disponível para os agentes selecionados.");
  };

  return (
    <div className="agent-skill-builder-backdrop" role="presentation">
      <aside className="agent-skill-builder" aria-label="Criar nova skill">
        <header className="agent-skill-builder-head">
          <div>
            <p className="panel-kicker">Nova skill</p>
            <h2>Criar skill de agente</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar builder"
            title="Fechar"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="agent-skill-builder-body">
          <section className="agent-skill-builder-section">
            <h3>Base</h3>
            <div className="agent-skill-builder-grid">
              <label>
                Nome
                <input
                  className="input"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Ex: Frontend visual polish"
                />
              </label>
              <label>
                Modo
                <select
                  className="select"
                  value={triggerMode}
                  onChange={(event) =>
                    setTriggerMode(event.target.value as AgentSkillBindingTriggerMode)
                  }
                >
                  <option value="manual">Manual</option>
                  <option value="automatic">Automático</option>
                  <option value="disabled">Desativado</option>
                </select>
              </label>
            </div>
            <label>
              Descrição
              <textarea
                className="textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Quando esta skill deve ser usada?"
              />
            </label>
          </section>

          <section className="agent-skill-builder-section">
            <h3>Agentes</h3>
            <div className="agent-skill-profile-grid">
              {profiles.map((profile) => (
                <label key={profile.id} className="agent-skill-profile-option">
                  <input
                    type="checkbox"
                    checked={selectedAgentIds.includes(profile.id)}
                    onChange={(event) => {
                      setSelectedAgentIds((current) =>
                        event.target.checked
                          ? [...current, profile.id]
                          : current.filter((id) => id !== profile.id)
                      );
                    }}
                  />
                  <span>
                    <strong>{profile.label}</strong>
                    <small>{profile.purpose}</small>
                  </span>
                </label>
              ))}
            </div>
            <p className="agent-skill-hint">
              Selecionados:{" "}
              {selectedProfiles.map((profile) => profile.label).join(", ") ||
                "nenhum"}
            </p>
          </section>

          <section className="agent-skill-builder-section">
            <h3>SKILL.md</h3>
            <textarea
              className="agent-skill-editor"
              value={skillMd}
              onChange={(event) => {
                setSkillMd(event.target.value);
                setValidationReport(null);
              }}
              spellCheck={false}
            />
          </section>

          <section className="agent-skill-builder-section">
            <div className="agent-skill-section-title-row">
              <h3>Referências</h3>
              <button
                type="button"
                className="panel-action"
                onClick={() =>
                  setFiles((current) => [
                    ...current,
                    {
                      relativePath: `references/note-${current.length + 1}.md`,
                      mediaType: "text/markdown",
                      contentText: "",
                    },
                  ])
                }
              >
                <FilePlus2 size={15} aria-hidden="true" />
                Adicionar
              </button>
            </div>
            {files.length === 0 ? (
              <p className="agent-skill-hint">Opcional. Use para regras ou exemplos longos.</p>
            ) : (
              <div className="agent-skill-support-files">
                {files.map((file, index) => (
                  <article key={`${file.relativePath}-${index}`}>
                    <div className="agent-skill-support-file-head">
                      <input
                        className="input"
                        value={file.relativePath}
                        onChange={(event) => {
                          const value = event.target.value;
                          setFiles((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, relativePath: value }
                                : item
                            )
                          );
                        }}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Remover referência"
                        title="Remover"
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                    <textarea
                      className="textarea"
                      value={file.contentText ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFiles((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, contentText: value }
                              : item
                          )
                        );
                      }}
                    />
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="agent-skill-builder-section">
            <div className="agent-skill-builder-actions">
              <button
                type="button"
                className="panel-action"
                disabled={!canValidate || isValidating}
                onClick={() => void validate()}
              >
                <ShieldCheck size={15} aria-hidden="true" />
                Validar
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={!canValidate || isCreating}
                onClick={() => void saveDraft()}
              >
                <Plus size={15} aria-hidden="true" />
                Salvar draft
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!canPublish}
                onClick={() => void createAndPublish()}
              >
                <Rocket size={16} aria-hidden="true" />
                Criar e publicar
              </button>
            </div>
            {createdMessage ? (
              <div className="agent-skill-inline-success">
                <CheckCircle2 size={16} aria-hidden="true" />
                {createdMessage}
              </div>
            ) : null}
            {error ? <div className="agent-skills-state error">{error}</div> : null}
            <ValidationReport report={validationReport} compact={false} />
          </section>
        </div>
      </aside>
    </div>
  );
}
