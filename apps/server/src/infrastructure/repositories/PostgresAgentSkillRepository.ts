import {
  AgentSkillBindingSchema,
  AgentSkillFileSchema,
  AgentSkillRevisionSchema,
  AgentSkillSchema,
  AgentSkillUsageEventSchema,
  AgentSkillValidationReportSchema,
  type AgentSkill,
  type AgentSkillBinding,
  type AgentSkillFile,
  type AgentSkillRevision,
  type AgentSkillUsageEvent,
  type AgentSkillValidationReport,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import {
  AgentSkillNotFoundError,
  AgentSkillRevisionNotFoundError,
} from "./FileAgentSkillRepository.js";
import type { AgentSkillRepository } from "./contracts.js";
import { json, toIso } from "./postgresUtils.js";

type AgentSkillRow = {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  scope: AgentSkill["scope"];
  source_type: AgentSkill["sourceType"];
  source_path: string | null;
  status: AgentSkill["status"];
  active_revision_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

type AgentSkillRevisionRow = {
  id: string;
  skill_id: string;
  revision_number: number;
  status: AgentSkillRevision["status"];
  skill_md: string;
  frontmatter: unknown;
  content_hash: string;
  validation_status: AgentSkillRevision["validationStatus"];
  created_at: Date;
  published_at: Date | null;
};

type AgentSkillFileRow = {
  id: string;
  revision_id: string;
  relative_path: string;
  media_type: string;
  size_bytes: number;
  content_text: string | null;
  content_sha256: string;
};

type AgentSkillBindingRow = {
  id: string;
  skill_id: string;
  agent_profile_id: string;
  trigger_mode: AgentSkillBinding["triggerMode"];
  priority: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

type AgentSkillValidationReportRow = {
  id: string;
  revision_id: string;
  status: AgentSkillValidationReport["status"];
  checks: unknown;
  issues: unknown;
  created_at: Date;
};

type AgentSkillUsageEventRow = {
  id: string;
  skill_id: string;
  revision_id: string;
  workflow_thread_id: string | null;
  run_id: string | null;
  attempt_id: string | null;
  agent_profile_id: string;
  trigger_mode: AgentSkillUsageEvent["triggerMode"];
  trigger_reason: string | null;
  created_at: Date;
};

export class PostgresAgentSkillRepository implements AgentSkillRepository {
  constructor(private readonly pool: PgPool) {}

  async saveSkill(skill: AgentSkill): Promise<AgentSkill> {
    return this.updateSkill(skill);
  }

  async updateSkill(skill: AgentSkill): Promise<AgentSkill> {
    const validated = AgentSkillSchema.parse(skill);
    await this.pool.query(
      `
      INSERT INTO agent_skills (
        id, slug, display_name, description, scope, source_type, source_path,
        status, active_revision_id, created_by, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        scope = EXCLUDED.scope,
        source_type = EXCLUDED.source_type,
        source_path = EXCLUDED.source_path,
        status = EXCLUDED.status,
        active_revision_id = EXCLUDED.active_revision_id,
        created_by = EXCLUDED.created_by,
        updated_at = EXCLUDED.updated_at
      `,
      [
        validated.id,
        validated.slug,
        validated.displayName,
        validated.description,
        validated.scope,
        validated.sourceType,
        validated.sourcePath,
        validated.status,
        validated.activeRevisionId,
        validated.createdBy,
        validated.createdAt,
        validated.updatedAt,
      ]
    );
    return validated;
  }

  async getSkill(skillId: string): Promise<AgentSkill> {
    const result = await this.pool.query<AgentSkillRow>(
      "SELECT * FROM agent_skills WHERE id = $1",
      [skillId]
    );
    const row = result.rows[0];
    if (!row) throw new AgentSkillNotFoundError(skillId);
    return skillFromRow(row);
  }

  async findSkillBySlug(slug: string): Promise<AgentSkill | null> {
    const result = await this.pool.query<AgentSkillRow>(
      "SELECT * FROM agent_skills WHERE slug = $1",
      [slug]
    );
    return result.rows[0] ? skillFromRow(result.rows[0]) : null;
  }

  async listSkills(filter: Parameters<AgentSkillRepository["listSkills"]>[0] = {}) {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filter.status) {
      values.push(filter.status);
      clauses.push(`s.status = $${values.length}`);
    }
    if (filter.sourceType) {
      values.push(filter.sourceType);
      clauses.push(`s.source_type = $${values.length}`);
    }
    if (filter.search) {
      values.push(`%${filter.search.toLowerCase()}%`);
      clauses.push(
        `(lower(s.slug) LIKE $${values.length} OR lower(s.display_name) LIKE $${values.length} OR lower(s.description) LIKE $${values.length})`
      );
    }
    if (filter.agentProfileId) {
      values.push(filter.agentProfileId);
      clauses.push(
        `EXISTS (SELECT 1 FROM agent_skill_bindings b WHERE b.skill_id = s.id AND b.enabled = true AND b.agent_profile_id = $${values.length})`
      );
    }
    const result = await this.pool.query<AgentSkillRow>(
      `
      SELECT s.*
      FROM agent_skills s
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY s.updated_at DESC
      `,
      values
    );
    return result.rows.map(skillFromRow);
  }

  async saveRevision(
    revision: AgentSkillRevision
  ): Promise<AgentSkillRevision> {
    const validated = AgentSkillRevisionSchema.parse(revision);
    await this.pool.query(
      `
      INSERT INTO agent_skill_revisions (
        id, skill_id, revision_number, status, skill_md, frontmatter, content_hash,
        validation_status, created_at, published_at
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        skill_md = EXCLUDED.skill_md,
        frontmatter = EXCLUDED.frontmatter,
        content_hash = EXCLUDED.content_hash,
        validation_status = EXCLUDED.validation_status,
        published_at = EXCLUDED.published_at
      `,
      [
        validated.id,
        validated.skillId,
        validated.revisionNumber,
        validated.status,
        validated.skillMd,
        json(validated.frontmatter),
        validated.contentHash,
        validated.validationStatus,
        validated.createdAt,
        validated.publishedAt,
      ]
    );
    return validated;
  }

  async getRevision(revisionId: string): Promise<AgentSkillRevision> {
    const result = await this.pool.query<AgentSkillRevisionRow>(
      "SELECT * FROM agent_skill_revisions WHERE id = $1",
      [revisionId]
    );
    const row = result.rows[0];
    if (!row) throw new AgentSkillRevisionNotFoundError(revisionId);
    return revisionFromRow(row);
  }

  async listRevisions(skillId: string): Promise<AgentSkillRevision[]> {
    const result = await this.pool.query<AgentSkillRevisionRow>(
      "SELECT * FROM agent_skill_revisions WHERE skill_id = $1 ORDER BY revision_number DESC",
      [skillId]
    );
    return result.rows.map(revisionFromRow);
  }

  async saveFile(file: AgentSkillFile): Promise<AgentSkillFile> {
    const validated = AgentSkillFileSchema.parse(file);
    await this.pool.query(
      `
      INSERT INTO agent_skill_files (
        id, revision_id, relative_path, media_type, size_bytes, content_text, content_sha256
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO UPDATE SET
        relative_path = EXCLUDED.relative_path,
        media_type = EXCLUDED.media_type,
        size_bytes = EXCLUDED.size_bytes,
        content_text = EXCLUDED.content_text,
        content_sha256 = EXCLUDED.content_sha256
      `,
      [
        validated.id,
        validated.revisionId,
        validated.relativePath,
        validated.mediaType,
        validated.sizeBytes,
        validated.contentText,
        validated.contentSha256,
      ]
    );
    return validated;
  }

  async listFiles(revisionId: string): Promise<AgentSkillFile[]> {
    const result = await this.pool.query<AgentSkillFileRow>(
      "SELECT * FROM agent_skill_files WHERE revision_id = $1 ORDER BY relative_path",
      [revisionId]
    );
    return result.rows.map(fileFromRow);
  }

  async saveBinding(binding: AgentSkillBinding): Promise<AgentSkillBinding> {
    const validated = AgentSkillBindingSchema.parse(binding);
    await this.pool.query(
      `
      INSERT INTO agent_skill_bindings (
        id, skill_id, agent_profile_id, trigger_mode, priority, enabled, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO UPDATE SET
        agent_profile_id = EXCLUDED.agent_profile_id,
        trigger_mode = EXCLUDED.trigger_mode,
        priority = EXCLUDED.priority,
        enabled = EXCLUDED.enabled,
        updated_at = EXCLUDED.updated_at
      `,
      [
        validated.id,
        validated.skillId,
        validated.agentProfileId,
        validated.triggerMode,
        validated.priority,
        validated.enabled,
        validated.createdAt,
        validated.updatedAt,
      ]
    );
    return validated;
  }

  async listBindings(skillId?: string): Promise<AgentSkillBinding[]> {
    const result =
      skillId === undefined
        ? await this.pool.query<AgentSkillBindingRow>(
            "SELECT * FROM agent_skill_bindings ORDER BY priority, created_at"
          )
        : await this.pool.query<AgentSkillBindingRow>(
            "SELECT * FROM agent_skill_bindings WHERE skill_id = $1 ORDER BY priority, created_at",
            [skillId]
          );
    return result.rows.map(bindingFromRow);
  }

  async replaceBindings(
    skillId: string,
    bindings: AgentSkillBinding[]
  ): Promise<AgentSkillBinding[]> {
    const validated = bindings.map((binding) => AgentSkillBindingSchema.parse(binding));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM agent_skill_bindings WHERE skill_id = $1", [
        skillId,
      ]);
      for (const binding of validated) {
        await client.query(
          `
          INSERT INTO agent_skill_bindings (
            id, skill_id, agent_profile_id, trigger_mode, priority, enabled, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            binding.id,
            binding.skillId,
            binding.agentProfileId,
            binding.triggerMode,
            binding.priority,
            binding.enabled,
            binding.createdAt,
            binding.updatedAt,
          ]
        );
      }
      await client.query("COMMIT");
      return validated;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async saveValidationReport(
    report: AgentSkillValidationReport
  ): Promise<AgentSkillValidationReport> {
    const validated = AgentSkillValidationReportSchema.parse(report);
    await this.pool.query(
      `
      INSERT INTO agent_skill_validation_reports (
        id, revision_id, status, checks, issues, created_at
      )
      VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        checks = EXCLUDED.checks,
        issues = EXCLUDED.issues
      `,
      [
        validated.id,
        validated.revisionId,
        validated.status,
        json(validated.checks),
        json(validated.issues),
        validated.createdAt,
      ]
    );
    return validated;
  }

  async listValidationReports(
    revisionId: string
  ): Promise<AgentSkillValidationReport[]> {
    const result = await this.pool.query<AgentSkillValidationReportRow>(
      "SELECT * FROM agent_skill_validation_reports WHERE revision_id = $1 ORDER BY created_at DESC",
      [revisionId]
    );
    return result.rows.map(validationReportFromRow);
  }

  async appendUsageEvent(
    event: AgentSkillUsageEvent
  ): Promise<AgentSkillUsageEvent> {
    return AgentSkillUsageEventSchema.parse(event);
  }

  async listUsageEvents(
    filter: Parameters<AgentSkillRepository["listUsageEvents"]>[0] = {}
  ): Promise<AgentSkillUsageEvent[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filter.skillId) {
      values.push(filter.skillId);
      clauses.push(`skill_id = $${values.length}`);
    }
    if (filter.workflowThreadId) {
      values.push(filter.workflowThreadId);
      clauses.push(`workflow_thread_id = $${values.length}`);
    }
    const result = await this.pool.query<AgentSkillUsageEventRow>(
      `
      SELECT *
      FROM agent_skill_usage_events
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      `,
      values
    );
    return result.rows.map(usageEventFromRow);
  }
}

function skillFromRow(row: AgentSkillRow): AgentSkill {
  return AgentSkillSchema.parse({
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    description: row.description,
    scope: row.scope,
    sourceType: row.source_type,
    sourcePath: row.source_path,
    status: row.status,
    activeRevisionId: row.active_revision_id,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function revisionFromRow(row: AgentSkillRevisionRow): AgentSkillRevision {
  return AgentSkillRevisionSchema.parse({
    id: row.id,
    skillId: row.skill_id,
    revisionNumber: row.revision_number,
    status: row.status,
    skillMd: row.skill_md,
    frontmatter: row.frontmatter,
    contentHash: row.content_hash,
    validationStatus: row.validation_status,
    createdAt: toIso(row.created_at),
    publishedAt: row.published_at ? toIso(row.published_at) : null,
  });
}

function fileFromRow(row: AgentSkillFileRow): AgentSkillFile {
  return AgentSkillFileSchema.parse({
    id: row.id,
    revisionId: row.revision_id,
    relativePath: row.relative_path,
    mediaType: row.media_type,
    sizeBytes: row.size_bytes,
    contentText: row.content_text,
    contentSha256: row.content_sha256,
  });
}

function bindingFromRow(row: AgentSkillBindingRow): AgentSkillBinding {
  return AgentSkillBindingSchema.parse({
    id: row.id,
    skillId: row.skill_id,
    agentProfileId: row.agent_profile_id,
    triggerMode: row.trigger_mode,
    priority: row.priority,
    enabled: row.enabled,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function validationReportFromRow(
  row: AgentSkillValidationReportRow
): AgentSkillValidationReport {
  return AgentSkillValidationReportSchema.parse({
    id: row.id,
    revisionId: row.revision_id,
    status: row.status,
    checks: row.checks,
    issues: row.issues,
    createdAt: toIso(row.created_at),
  });
}

function usageEventFromRow(row: AgentSkillUsageEventRow): AgentSkillUsageEvent {
  return AgentSkillUsageEventSchema.parse({
    id: row.id,
    skillId: row.skill_id,
    revisionId: row.revision_id,
    workflowThreadId: row.workflow_thread_id,
    runId: row.run_id,
    attemptId: row.attempt_id,
    agentProfileId: row.agent_profile_id,
    triggerMode: row.trigger_mode,
    triggerReason: row.trigger_reason,
    createdAt: toIso(row.created_at),
  });
}
