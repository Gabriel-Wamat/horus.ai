import {
  AgentArtifactCandidateSchema,
  AgentTraceSpanSchema,
  AgentValidationEvidenceRecordSchema,
  type AgentArtifactCandidate,
  type AgentTraceSpan,
  type AgentValidationEvidenceRecord,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import type { AgentArtifactRepository } from "./contracts.js";
import { json, toIso } from "./postgresUtils.js";

type CandidateRow = {
  id: string;
  run_id: string | null;
  attempt_id: string | null;
  workflow_thread_id: string;
  story_id: string;
  source_agent: AgentArtifactCandidate["sourceAgent"];
  artifact_type: AgentArtifactCandidate["artifactType"];
  status: AgentArtifactCandidate["status"];
  source_result_id: string | null;
  content_hash: string;
  created_at: Date;
  updated_at: Date;
};

type EvidenceRow = {
  id: string;
  candidate_id: string;
  run_id: string | null;
  attempt_id: string | null;
  workflow_thread_id: string;
  story_id: string | null;
  gate_id: string;
  gate_type: AgentValidationEvidenceRecord["gateType"];
  status: AgentValidationEvidenceRecord["status"];
  required: boolean;
  summary: string;
  raw_evidence_ref: unknown;
  created_at: Date;
};

type TraceSpanRow = {
  id: string;
  workflow_thread_id: string;
  run_id: string | null;
  attempt_id: string | null;
  candidate_id: string | null;
  span_type: AgentTraceSpan["spanType"];
  name: string;
  status: AgentTraceSpan["status"];
  redacted_input: unknown;
  redacted_output: unknown;
  started_at: Date;
  ended_at: Date | null;
  duration_ms: number | null;
  error_message: string | null;
};

export class PostgresAgentArtifactRepository implements AgentArtifactRepository {
  constructor(private readonly pool: PgPool) {}

  async saveCandidate(
    candidate: AgentArtifactCandidate
  ): Promise<AgentArtifactCandidate> {
    const validated = AgentArtifactCandidateSchema.parse(candidate);
    await this.pool.query(
      `
      INSERT INTO agent_artifact_candidates (
        id, run_id, attempt_id, workflow_thread_id, story_id, source_agent,
        artifact_type, status, source_result_id, content_hash, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        run_id = EXCLUDED.run_id,
        attempt_id = EXCLUDED.attempt_id,
        workflow_thread_id = EXCLUDED.workflow_thread_id,
        story_id = EXCLUDED.story_id,
        source_agent = EXCLUDED.source_agent,
        artifact_type = EXCLUDED.artifact_type,
        status = EXCLUDED.status,
        source_result_id = EXCLUDED.source_result_id,
        content_hash = EXCLUDED.content_hash,
        updated_at = EXCLUDED.updated_at
      `,
      [
        validated.id,
        validated.runId,
        validated.attemptId,
        validated.workflowThreadId,
        validated.userStoryId,
        validated.sourceAgent,
        validated.artifactType,
        validated.status,
        validated.sourceResultId,
        validated.contentHash,
        validated.createdAt,
        validated.updatedAt,
      ]
    );
    return validated;
  }

  async getCandidate(candidateId: string): Promise<AgentArtifactCandidate | null> {
    const result = await this.pool.query<CandidateRow>(
      "SELECT * FROM agent_artifact_candidates WHERE id = $1",
      [candidateId]
    );
    return result.rows[0] ? candidateFromRow(result.rows[0]) : null;
  }

  async listCandidates(
    filter: Parameters<AgentArtifactRepository["listCandidates"]>[0] = {}
  ): Promise<AgentArtifactCandidate[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (filter.workflowThreadId) {
      values.push(filter.workflowThreadId);
      clauses.push(`workflow_thread_id = $${values.length}`);
    }
    if (filter.userStoryId) {
      values.push(filter.userStoryId);
      clauses.push(`story_id = $${values.length}`);
    }
    if (filter.status) {
      values.push(filter.status);
      clauses.push(`status = $${values.length}`);
    }
    if (filter.artifactType) {
      values.push(filter.artifactType);
      clauses.push(`artifact_type = $${values.length}`);
    }
    const result = await this.pool.query<CandidateRow>(
      `
      SELECT *
      FROM agent_artifact_candidates
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      `,
      values
    );
    return result.rows.map(candidateFromRow);
  }

  async saveEvidence(
    evidence: AgentValidationEvidenceRecord
  ): Promise<AgentValidationEvidenceRecord> {
    const validated = AgentValidationEvidenceRecordSchema.parse(evidence);
    await this.pool.query(
      `
      INSERT INTO agent_validation_evidence (
        id, candidate_id, run_id, attempt_id, workflow_thread_id, story_id,
        gate_id, gate_type, status, required, summary, raw_evidence_ref, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        summary = EXCLUDED.summary,
        raw_evidence_ref = EXCLUDED.raw_evidence_ref
      `,
      [
        validated.id,
        validated.candidateId,
        validated.runId,
        validated.attemptId,
        validated.workflowThreadId,
        validated.userStoryId,
        validated.gateId,
        validated.gateType,
        validated.status,
        validated.required,
        validated.summary,
        json(validated.rawEvidenceRef),
        validated.createdAt,
      ]
    );
    return validated;
  }

  async listEvidence(
    filter: Parameters<AgentArtifactRepository["listEvidence"]>[0] = {}
  ): Promise<AgentValidationEvidenceRecord[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (filter.candidateId) {
      values.push(filter.candidateId);
      clauses.push(`candidate_id = $${values.length}`);
    }
    if (filter.workflowThreadId) {
      values.push(filter.workflowThreadId);
      clauses.push(`workflow_thread_id = $${values.length}`);
    }
    const result = await this.pool.query<EvidenceRow>(
      `
      SELECT *
      FROM agent_validation_evidence
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      `,
      values
    );
    return result.rows.map(evidenceFromRow);
  }

  async saveTraceSpan(span: AgentTraceSpan): Promise<AgentTraceSpan> {
    const validated = AgentTraceSpanSchema.parse(span);
    await this.pool.query(
      `
      INSERT INTO agent_trace_spans (
        id, workflow_thread_id, run_id, attempt_id, candidate_id, span_type,
        name, status, redacted_input, redacted_output, started_at, ended_at,
        duration_ms, error_message
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        redacted_output = EXCLUDED.redacted_output,
        ended_at = EXCLUDED.ended_at,
        duration_ms = EXCLUDED.duration_ms,
        error_message = EXCLUDED.error_message
      `,
      [
        validated.id,
        validated.workflowThreadId,
        validated.runId,
        validated.attemptId,
        validated.candidateId,
        validated.spanType,
        validated.name,
        validated.status,
        json(validated.redactedInput),
        json(validated.redactedOutput),
        validated.startedAt,
        validated.endedAt,
        validated.durationMs,
        validated.errorMessage,
      ]
    );
    return validated;
  }

  async listTraceSpans(
    filter: Parameters<AgentArtifactRepository["listTraceSpans"]>[0] = {}
  ): Promise<AgentTraceSpan[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (filter.candidateId) {
      values.push(filter.candidateId);
      clauses.push(`candidate_id = $${values.length}`);
    }
    if (filter.workflowThreadId) {
      values.push(filter.workflowThreadId);
      clauses.push(`workflow_thread_id = $${values.length}`);
    }
    const result = await this.pool.query<TraceSpanRow>(
      `
      SELECT *
      FROM agent_trace_spans
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY started_at DESC
      `,
      values
    );
    return result.rows.map(traceSpanFromRow);
  }
}

function candidateFromRow(row: CandidateRow): AgentArtifactCandidate {
  return AgentArtifactCandidateSchema.parse({
    id: row.id,
    runId: row.run_id,
    attemptId: row.attempt_id,
    workflowThreadId: row.workflow_thread_id,
    userStoryId: row.story_id,
    sourceAgent: row.source_agent,
    artifactType: row.artifact_type,
    status: row.status,
    sourceResultId: row.source_result_id,
    contentHash: row.content_hash,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function evidenceFromRow(row: EvidenceRow): AgentValidationEvidenceRecord {
  return AgentValidationEvidenceRecordSchema.parse({
    id: row.id,
    candidateId: row.candidate_id,
    runId: row.run_id,
    attemptId: row.attempt_id,
    workflowThreadId: row.workflow_thread_id,
    userStoryId: row.story_id,
    gateId: row.gate_id,
    gateType: row.gate_type,
    status: row.status,
    required: row.required,
    summary: row.summary,
    rawEvidenceRef: row.raw_evidence_ref,
    createdAt: toIso(row.created_at),
  });
}

function traceSpanFromRow(row: TraceSpanRow): AgentTraceSpan {
  return AgentTraceSpanSchema.parse({
    id: row.id,
    workflowThreadId: row.workflow_thread_id,
    runId: row.run_id,
    attemptId: row.attempt_id,
    candidateId: row.candidate_id,
    spanType: row.span_type,
    name: row.name,
    status: row.status,
    redactedInput: row.redacted_input,
    redactedOutput: row.redacted_output,
    startedAt: toIso(row.started_at),
    endedAt: row.ended_at ? toIso(row.ended_at) : null,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
  });
}
