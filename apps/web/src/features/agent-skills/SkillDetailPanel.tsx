import { useMemo, useState, type JSX } from "react";
import {
  Archive,
  CheckCircle2,
  Copy,
  FileText,
  GitCommitHorizontal,
  ShieldCheck,
} from "lucide-react";
import type {
  AgentProfile,
  AgentSkillDetail,
  AgentSkillSummary,
  AgentSkillValidationReport,
} from "@u-build/shared";

type DetailTab = "overview" | "skill" | "files" | "revisions" | "validation";

interface SkillDetailPanelProps {
  readonly skill: AgentSkillSummary | undefined;
  readonly detail: AgentSkillDetail | undefined;
  readonly profiles: AgentProfile[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly isPublishing: boolean;
  readonly isArchiving: boolean;
  readonly onPublishRevision: (revisionId: string, expectedRevisionHash: string) => void;
  readonly onArchiveSkill: (skillId: string) => void;
}

const TAB_LABELS: Record<DetailTab, string> = {
  overview: "Resumo",
  skill: "SKILL.md",
  files: "Arquivos",
  revisions: "Revisões",
  validation: "Validação",
};

export function SkillDetailPanel({
  skill,
  detail,
  profiles,
  isLoading,
  error,
  isPublishing,
  isArchiving,
  onPublishRevision,
  onArchiveSkill,
}: SkillDetailPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const latestRevision = detail?.revisions[0] ?? null;
  const publishableRevision =
    latestRevision &&
    latestRevision.status !== "published" &&
    latestRevision.validationStatus === "passed"
      ? latestRevision
      : null;
  const latestReport = useMemo(
    () => selectLatestReport(detail?.validationReports ?? []),
    [detail?.validationReports]
  );

  if (!skill) {
    return (
      <aside className="agent-skill-detail empty">
        <div className="agent-skills-state">
          Selecione uma skill para ver conteúdo, revisões e bindings.
        </div>
      </aside>
    );
  }

  return (
    <aside className="agent-skill-detail" aria-label="Detalhe da skill">
      <header className="agent-skill-detail-head">
        <div>
          <p className="panel-kicker">Skill</p>
          <h2>{skill.displayName}</h2>
          <p>{skill.slug}</p>
        </div>
        <div className="agent-skill-detail-actions">
          {publishableRevision ? (
            <button
              type="button"
              className="panel-action"
              disabled={isPublishing}
              title="Publicar revisão validada"
              onClick={() =>
                onPublishRevision(
                  publishableRevision.id,
                  publishableRevision.contentHash
                )
              }
            >
              <CheckCircle2 size={15} aria-hidden="true" />
              Publicar
            </button>
          ) : null}
          <button
            type="button"
            className="panel-action danger"
            disabled={isArchiving || skill.status === "archived"}
            title="Arquivar skill"
            onClick={() => onArchiveSkill(skill.id)}
          >
            <Archive size={15} aria-hidden="true" />
            Arquivar
          </button>
        </div>
      </header>

      <nav className="agent-skill-tabs" aria-label="Seções da skill">
        {(Object.keys(TAB_LABELS) as DetailTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      {error ? <div className="agent-skills-state error">{error}</div> : null}
      {isLoading ? <div className="agent-skills-state">Carregando detalhe...</div> : null}

      {!isLoading && !error ? (
        <div className="agent-skill-detail-body">
          {activeTab === "overview" && (
            <OverviewTab
              skill={skill}
              detail={detail}
              profiles={profiles}
              latestReport={latestReport}
            />
          )}
          {activeTab === "skill" && (
            <SkillMdTab skillMd={detail?.activeRevision?.skillMd ?? ""} />
          )}
          {activeTab === "files" && <FilesTab detail={detail} />}
          {activeTab === "revisions" && <RevisionsTab detail={detail} />}
          {activeTab === "validation" && (
            <ValidationReport report={latestReport} compact={false} />
          )}
        </div>
      ) : null}
    </aside>
  );
}

function OverviewTab({
  skill,
  detail,
  profiles,
  latestReport,
}: {
  skill: AgentSkillSummary;
  detail: AgentSkillDetail | undefined;
  profiles: AgentProfile[];
  latestReport: AgentSkillValidationReport | null;
}): JSX.Element {
  const profileById = new Map<string, AgentProfile>(
    profiles.map((profile) => [profile.id, profile])
  );
  return (
    <div className="agent-skill-overview">
      <p className="agent-skill-description">{skill.description}</p>
      <div className="agent-skill-facts">
        <Fact label="Origem" value={skill.sourceType.replace("_", " ")} />
        <Fact label="Status" value={skill.status} />
        <Fact
          label="Revisão ativa"
          value={
            detail?.activeRevision
              ? `r${detail.activeRevision.revisionNumber}`
              : "nenhuma"
          }
        />
        <Fact label="Atualizada" value={formatDate(skill.updatedAt)} />
      </div>
      <section>
        <h3>
          <ShieldCheck size={16} aria-hidden="true" />
          Agentes vinculados
        </h3>
        <div className="agent-skill-binding-list">
          {(detail?.bindings ?? skill.bindings).length === 0 ? (
            <span className="agent-skill-muted">Sem bindings ativos.</span>
          ) : (
            (detail?.bindings ?? skill.bindings).map((binding) => (
              <span key={binding.id} className="agent-skill-binding-pill">
                {profileById.get(binding.agentProfileId)?.label ??
                  binding.agentProfileId}
                <small>{binding.triggerMode}</small>
              </span>
            ))
          )}
        </div>
      </section>
      <ValidationReport report={latestReport} compact />
    </div>
  );
}

function SkillMdTab({ skillMd }: { skillMd: string }): JSX.Element {
  return (
    <div className="agent-skill-code-wrap">
      <button
        type="button"
        className="panel-action agent-skill-copy"
        title="Copiar SKILL.md"
        onClick={() => void navigator.clipboard?.writeText(skillMd)}
      >
        <Copy size={14} aria-hidden="true" />
        Copiar
      </button>
      <pre className="agent-skill-code">
        <code>{skillMd || "Sem conteúdo publicado."}</code>
      </pre>
    </div>
  );
}

function FilesTab({ detail }: { detail: AgentSkillDetail | undefined }): JSX.Element {
  const files = detail?.files ?? [];
  if (files.length === 0) {
    return <div className="agent-skills-state">Sem arquivos de apoio.</div>;
  }
  return (
    <div className="agent-skill-file-list">
      {files.map((file) => (
        <article key={file.id} className="agent-skill-file-row">
          <FileText size={16} aria-hidden="true" />
          <span>
            <strong>{file.relativePath}</strong>
            <small>
              {file.mediaType} · {file.sizeBytes} bytes
            </small>
          </span>
        </article>
      ))}
    </div>
  );
}

function RevisionsTab({
  detail,
}: {
  detail: AgentSkillDetail | undefined;
}): JSX.Element {
  const revisions = detail?.revisions ?? [];
  if (revisions.length === 0) {
    return <div className="agent-skills-state">Nenhuma revisão registrada.</div>;
  }
  return (
    <div className="agent-skill-revision-list">
      {revisions.map((revision) => (
        <article key={revision.id} className="agent-skill-revision-row">
          <GitCommitHorizontal size={16} aria-hidden="true" />
          <span>
            <strong>r{revision.revisionNumber}</strong>
            <small>
              {revision.status} · {revision.validationStatus} ·{" "}
              {formatDate(revision.createdAt)}
            </small>
          </span>
          <code>{revision.contentHash.slice(0, 10)}</code>
        </article>
      ))}
    </div>
  );
}

export function ValidationReport({
  report,
  compact,
}: {
  report: AgentSkillValidationReport | null;
  compact: boolean;
}): JSX.Element {
  if (!report) {
    return <div className="agent-skills-state compact">Sem validação registrada.</div>;
  }
  return (
    <section className={`agent-skill-validation ${compact ? "compact" : ""}`}>
      <h3>
        <ShieldCheck size={16} aria-hidden="true" />
        Validação {report.status === "passed" ? "passou" : "falhou"}
      </h3>
      <div className="agent-skill-checks">
        {report.checks.map((check) => (
          <span key={check.code} className={`agent-skill-check ${check.status}`}>
            {check.code}
          </span>
        ))}
      </div>
      {report.issues.length > 0 ? (
        <ul className="agent-skill-issues">
          {report.issues.map((issue) => (
            <li key={`${issue.code}-${issue.path ?? "root"}`}>
              <strong>{issue.code}</strong>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="agent-skill-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function selectLatestReport(
  reports: AgentSkillValidationReport[]
): AgentSkillValidationReport | null {
  return [...reports].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  )[0] ?? null;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
