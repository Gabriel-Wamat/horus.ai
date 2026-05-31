import {
  AgentMemoryItemSchema,
  AgentMemoryLinkSchema,
  AgentMemorySummarySchema,
  type AgentMemoryItem,
  type AgentMemoryLink,
  type AgentMemoryScope,
  type AgentMemorySummary,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import type { AgentMemoryRepository } from "./contracts.js";
import { json, toIso } from "./postgresUtils.js";

type AgentMemoryItemRow = {
  id: string;
  kind: AgentMemoryItem["kind"];
  scope: unknown;
  content: string;
  confidence: number;
  source_refs: unknown;
  tags: unknown;
  stale_at: Date | null;
  superseded_by_memory_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type AgentMemorySummaryRow = {
  id: string;
  scope: unknown;
  summary: string;
  source_refs: unknown;
  source_message_sequence_min: number | null;
  source_message_sequence_max: number | null;
  created_at: Date;
  updated_at: Date;
};

type AgentMemoryLinkRow = {
  id: string;
  from_memory_id: string;
  to_memory_id: string;
  relation: AgentMemoryLink["relation"];
  created_at: Date;
};

export class PostgresAgentMemoryRepository implements AgentMemoryRepository {
  constructor(private readonly pool: PgPool) {}

  async appendItem(item: AgentMemoryItem): Promise<AgentMemoryItem> {
    const validated = AgentMemoryItemSchema.parse(item);
    await this.pool.query(
      `
      INSERT INTO agent_memory_items (
        id, kind, scope, content, confidence, source_refs, tags, stale_at,
        superseded_by_memory_id, created_at, updated_at
      )
      VALUES ($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind,
        scope = EXCLUDED.scope,
        content = EXCLUDED.content,
        confidence = EXCLUDED.confidence,
        source_refs = EXCLUDED.source_refs,
        tags = EXCLUDED.tags,
        stale_at = EXCLUDED.stale_at,
        superseded_by_memory_id = EXCLUDED.superseded_by_memory_id,
        updated_at = EXCLUDED.updated_at
      `,
      [
        validated.id,
        validated.kind,
        json(validated.scope),
        validated.content,
        validated.confidence,
        json(validated.sourceRefs),
        json(validated.tags),
        validated.staleAt,
        validated.supersededByMemoryId,
        validated.createdAt,
        validated.updatedAt,
      ]
    );
    return validated;
  }

  async listItems(
    filter: Parameters<AgentMemoryRepository["listItems"]>[0] = {}
  ): Promise<AgentMemoryItem[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (filter.kind) {
      values.push(filter.kind);
      clauses.push(`kind = $${values.length}`);
    }
    if (filter.agentProfileId) {
      values.push(filter.agentProfileId);
      clauses.push(`scope->>'agentProfileId' = $${values.length}`);
    }
    if (!filter.includeStale) {
      clauses.push(`superseded_by_memory_id IS NULL`);
      clauses.push(`(stale_at IS NULL OR stale_at > now())`);
    }
    addScopeClauses(clauses, values, filter.scope);
    values.push(filter.limit ?? 20);
    const result = await this.pool.query<AgentMemoryItemRow>(
      `
      SELECT *
      FROM agent_memory_items
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY updated_at DESC
      LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map(itemFromRow);
  }

  async upsertSummary(
    summary: AgentMemorySummary
  ): Promise<AgentMemorySummary> {
    const validated = AgentMemorySummarySchema.parse(summary);
    await this.pool.query(
      `
      INSERT INTO agent_memory_summaries (
        id, scope, summary, source_refs, source_message_sequence_min,
        source_message_sequence_max, created_at, updated_at
      )
      VALUES ($1,$2::jsonb,$3,$4::jsonb,$5,$6,$7,$8)
      ON CONFLICT (id) DO UPDATE SET
        scope = EXCLUDED.scope,
        summary = EXCLUDED.summary,
        source_refs = EXCLUDED.source_refs,
        source_message_sequence_min = EXCLUDED.source_message_sequence_min,
        source_message_sequence_max = EXCLUDED.source_message_sequence_max,
        updated_at = EXCLUDED.updated_at
      `,
      [
        validated.id,
        json(validated.scope),
        validated.summary,
        json(validated.sourceRefs),
        validated.sourceMessageSequenceMin,
        validated.sourceMessageSequenceMax,
        validated.createdAt,
        validated.updatedAt,
      ]
    );
    return validated;
  }

  async listSummaries(
    filter: Parameters<AgentMemoryRepository["listSummaries"]>[0] = {}
  ): Promise<AgentMemorySummary[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (filter.agentProfileId) {
      values.push(filter.agentProfileId);
      clauses.push(`scope->>'agentProfileId' = $${values.length}`);
    }
    addScopeClauses(clauses, values, filter.scope);
    values.push(filter.limit ?? 4);
    const result = await this.pool.query<AgentMemorySummaryRow>(
      `
      SELECT *
      FROM agent_memory_summaries
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY updated_at DESC
      LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map(summaryFromRow);
  }

  async appendLink(link: AgentMemoryLink): Promise<AgentMemoryLink> {
    const validated = AgentMemoryLinkSchema.parse(link);
    await this.pool.query(
      `
      INSERT INTO agent_memory_links (
        id, from_memory_id, to_memory_id, relation, created_at
      )
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        validated.id,
        validated.fromMemoryId,
        validated.toMemoryId,
        validated.relation,
        validated.createdAt,
      ]
    );
    return validated;
  }

  async listLinks(memoryId: string): Promise<AgentMemoryLink[]> {
    const result = await this.pool.query<AgentMemoryLinkRow>(
      `
      SELECT *
      FROM agent_memory_links
      WHERE from_memory_id = $1 OR to_memory_id = $1
      ORDER BY created_at DESC
      `,
      [memoryId]
    );
    return result.rows.map(linkFromRow);
  }
}

function addScopeClauses(
  clauses: string[],
  values: unknown[],
  scope: Partial<AgentMemoryScope> | undefined
) {
  if (!scope) return;
  for (const [key, value] of Object.entries(scope)) {
    if (value === undefined) continue;
    values.push(value);
    clauses.push(`scope->>'${key}' IS NOT DISTINCT FROM $${values.length}`);
  }
}

function itemFromRow(row: AgentMemoryItemRow): AgentMemoryItem {
  return AgentMemoryItemSchema.parse({
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    content: row.content,
    confidence: row.confidence,
    sourceRefs: row.source_refs,
    tags: row.tags,
    staleAt: row.stale_at ? toIso(row.stale_at) : null,
    supersededByMemoryId: row.superseded_by_memory_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function summaryFromRow(row: AgentMemorySummaryRow): AgentMemorySummary {
  return AgentMemorySummarySchema.parse({
    id: row.id,
    scope: row.scope,
    summary: row.summary,
    sourceRefs: row.source_refs,
    sourceMessageSequenceMin: row.source_message_sequence_min,
    sourceMessageSequenceMax: row.source_message_sequence_max,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function linkFromRow(row: AgentMemoryLinkRow): AgentMemoryLink {
  return AgentMemoryLinkSchema.parse({
    id: row.id,
    fromMemoryId: row.from_memory_id,
    toMemoryId: row.to_memory_id,
    relation: row.relation,
    createdAt: toIso(row.created_at),
  });
}
