import type { JSX } from "react";
import { Search } from "lucide-react";
import type {
  AgentProfile,
  AgentSkillSourceType,
  AgentSkillStatus,
  AgentSkillSummary,
} from "@u-build/shared";
import type { AgentSkillFilters } from "./useAgentSkills.js";

interface SkillCatalogProps {
  readonly skills: AgentSkillSummary[];
  readonly profiles: AgentProfile[];
  readonly filters: AgentSkillFilters;
  readonly selectedSkillId: string | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly onChangeFilters: (filters: AgentSkillFilters) => void;
  readonly onSelectSkill: (skillId: string) => void;
  readonly onRetry: () => void;
}

const SOURCE_LABELS: Record<AgentSkillSourceType, string> = {
  filesystem_seed: "seed",
  database: "local",
  imported_bundle: "import",
};

const STATUS_LABELS: Record<AgentSkillStatus, string> = {
  active: "ativa",
  draft: "draft",
  archived: "arquivada",
};

export function SkillCatalog({
  skills,
  profiles,
  filters,
  selectedSkillId,
  isLoading,
  error,
  onChangeFilters,
  onSelectSkill,
  onRetry,
}: SkillCatalogProps): JSX.Element {
  const profileLabels = new Map(profiles.map((profile) => [profile.id, profile.label]));

  return (
    <section className="agent-skills-catalog" aria-label="Catálogo de skills">
      <div className="agent-skills-toolbar">
        <label className="agent-skills-search">
          <Search size={15} aria-hidden="true" />
          <input
            value={filters.search}
            onChange={(event) =>
              onChangeFilters({ ...filters, search: event.target.value })
            }
            placeholder="Buscar skill"
            aria-label="Buscar skill"
          />
        </label>
        <select
          className="agent-skills-filter"
          value={filters.agentProfileId}
          aria-label="Filtrar por agente"
          onChange={(event) =>
            onChangeFilters({ ...filters, agentProfileId: event.target.value })
          }
        >
          <option value="all">Todos agentes</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
        <select
          className="agent-skills-filter"
          value={filters.sourceType}
          aria-label="Filtrar por origem"
          onChange={(event) =>
            onChangeFilters({
              ...filters,
              sourceType: event.target.value as AgentSkillFilters["sourceType"],
            })
          }
        >
          <option value="all">Todas origens</option>
          <option value="filesystem_seed">Seed</option>
          <option value="database">Local</option>
          <option value="imported_bundle">Import</option>
        </select>
        <select
          className="agent-skills-filter"
          value={filters.status}
          aria-label="Filtrar por status"
          onChange={(event) =>
            onChangeFilters({
              ...filters,
              status: event.target.value as AgentSkillFilters["status"],
            })
          }
        >
          <option value="all">Todos status</option>
          <option value="active">Ativas</option>
          <option value="draft">Drafts</option>
          <option value="archived">Arquivadas</option>
        </select>
      </div>

      {error ? (
        <div className="agent-skills-state error">
          <strong>Não foi possível carregar as skills.</strong>
          <span>{error}</span>
          <button type="button" className="panel-action" onClick={onRetry}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {!error && isLoading ? (
        <div className="agent-skills-state">Carregando catálogo...</div>
      ) : null}

      {!error && !isLoading && skills.length === 0 ? (
        <div className="agent-skills-state">
          Nenhuma skill encontrada para os filtros atuais.
        </div>
      ) : null}

      <div className="agent-skills-list">
        {skills.map((skill) => (
          <SkillCatalogRow
            key={skill.id}
            skill={skill}
            profileLabels={profileLabels}
            isSelected={selectedSkillId === skill.id}
            onSelect={() => onSelectSkill(skill.id)}
          />
        ))}
      </div>
    </section>
  );
}

function SkillCatalogRow({
  skill,
  profileLabels,
  isSelected,
  onSelect,
}: {
  readonly skill: AgentSkillSummary;
  readonly profileLabels: Map<string, string>;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}): JSX.Element {
  const agentLabels = skill.bindings
    .filter((binding) => binding.enabled)
    .map((binding) => profileLabels.get(binding.agentProfileId) ?? binding.agentProfileId);
  const validationStatus = skill.latestValidationReport?.status;

  return (
    <button
      type="button"
      className={`agent-skill-row ${isSelected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <span className="agent-skill-row-main">
        <span className="agent-skill-row-title">{skill.displayName}</span>
        <span className="agent-skill-row-description">{skill.description}</span>
        <span className="agent-skill-row-agents">
          {agentLabels.length > 0 ? agentLabels.join(", ") : "Sem agentes vinculados"}
        </span>
      </span>
      <span className="agent-skill-row-meta">
        <span className={`agent-skill-badge status-${skill.status}`}>
          {STATUS_LABELS[skill.status]}
        </span>
        {validationStatus ? (
          <span className={`agent-skill-check ${validationStatus}`}>
            {validationStatus === "passed" ? "validada" : "falhou"}
          </span>
        ) : null}
        <span className="agent-skill-badge">
          {SOURCE_LABELS[skill.sourceType]}
        </span>
        <span className="agent-skill-revision">
          r{skill.activeRevision?.revisionNumber ?? "0"}
        </span>
      </span>
    </button>
  );
}
