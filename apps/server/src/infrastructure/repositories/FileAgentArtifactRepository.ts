import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  AgentArtifactCandidateSchema,
  AgentTraceSpanSchema,
  AgentValidationEvidenceRecordSchema,
  type AgentArtifactCandidate,
  type AgentTraceSpan,
  type AgentValidationEvidenceRecord,
} from "@u-build/shared";
import {
  readJsonFileRaw,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";
import type { AgentArtifactRepository } from "./contracts.js";

const CANDIDATES_FILE = "artifact-candidates.json";
const EVIDENCE_FILE = "validation-evidence.json";
const TRACE_SPANS_FILE = "trace-spans.json";

export class FileAgentArtifactRepository implements AgentArtifactRepository {
  constructor(private readonly baseDir = "./data/agent-artifacts") {}

  async saveCandidate(
    candidate: AgentArtifactCandidate
  ): Promise<AgentArtifactCandidate> {
    const validated = AgentArtifactCandidateSchema.parse(candidate);
    const existing = await this.readArray(
      CANDIDATES_FILE,
      AgentArtifactCandidateSchema
    );
    await this.writeArray(CANDIDATES_FILE, [
      ...existing.filter((entry) => entry.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async getCandidate(candidateId: string): Promise<AgentArtifactCandidate | null> {
    const candidates = await this.readArray(
      CANDIDATES_FILE,
      AgentArtifactCandidateSchema
    );
    return candidates.find((candidate) => candidate.id === candidateId) ?? null;
  }

  async listCandidates(
    filter: Parameters<AgentArtifactRepository["listCandidates"]>[0] = {}
  ): Promise<AgentArtifactCandidate[]> {
    const candidates = await this.readArray(
      CANDIDATES_FILE,
      AgentArtifactCandidateSchema
    );
    return candidates
      .filter((candidate) => {
        if (
          filter.workflowThreadId &&
          candidate.workflowThreadId !== filter.workflowThreadId
        ) {
          return false;
        }
        if (filter.userStoryId && candidate.userStoryId !== filter.userStoryId) {
          return false;
        }
        if (filter.status && candidate.status !== filter.status) return false;
        if (filter.artifactType && candidate.artifactType !== filter.artifactType) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveEvidence(
    evidence: AgentValidationEvidenceRecord
  ): Promise<AgentValidationEvidenceRecord> {
    const validated = AgentValidationEvidenceRecordSchema.parse(evidence);
    const existing = await this.readArray(
      EVIDENCE_FILE,
      AgentValidationEvidenceRecordSchema
    );
    await this.writeArray(EVIDENCE_FILE, [
      ...existing.filter((entry) => entry.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async listEvidence(
    filter: Parameters<AgentArtifactRepository["listEvidence"]>[0] = {}
  ): Promise<AgentValidationEvidenceRecord[]> {
    const evidence = await this.readArray(
      EVIDENCE_FILE,
      AgentValidationEvidenceRecordSchema
    );
    return evidence
      .filter((entry) => {
        if (filter.candidateId && entry.candidateId !== filter.candidateId) {
          return false;
        }
        if (
          filter.workflowThreadId &&
          entry.workflowThreadId !== filter.workflowThreadId
        ) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveTraceSpan(span: AgentTraceSpan): Promise<AgentTraceSpan> {
    const validated = AgentTraceSpanSchema.parse(span);
    const existing = await this.readArray(TRACE_SPANS_FILE, AgentTraceSpanSchema);
    await this.writeArray(TRACE_SPANS_FILE, [
      ...existing.filter((entry) => entry.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async listTraceSpans(
    filter: Parameters<AgentArtifactRepository["listTraceSpans"]>[0] = {}
  ): Promise<AgentTraceSpan[]> {
    const spans = await this.readArray(TRACE_SPANS_FILE, AgentTraceSpanSchema);
    return spans
      .filter((span) => {
        if (filter.candidateId && span.candidateId !== filter.candidateId) {
          return false;
        }
        if (
          filter.workflowThreadId &&
          span.workflowThreadId !== filter.workflowThreadId
        ) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private async readArray<T>(
    filename: string,
    schema: { parse(value: unknown): T }
  ): Promise<T[]> {
    await this.ensureBaseDir();
    try {
      const parsed = await readJsonFileRaw(join(this.baseDir, filename));
      return Array.isArray(parsed) ? parsed.map((item) => schema.parse(item)) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return [];
    }
  }

  private async writeArray(filename: string, value: unknown[]): Promise<void> {
    await writeJsonFileAtomic(join(this.baseDir, filename), value, {
      trailingNewline: true,
    });
  }
}
