import { promises as fs } from "node:fs";
import { join } from "node:path";
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
import {
  readJsonFileRaw,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";
import type { AgentSkillRepository } from "./contracts.js";

const SKILLS_FILE = "agent-skills.json";
const REVISIONS_FILE = "agent-skill-revisions.json";
const FILES_FILE = "agent-skill-files.json";
const BINDINGS_FILE = "agent-skill-bindings.json";
const VALIDATION_REPORTS_FILE = "agent-skill-validation-reports.json";
const USAGE_EVENTS_FILE = "agent-skill-usage-events.json";

export class AgentSkillNotFoundError extends Error {
  constructor(id: string) {
    super(`Agent skill not found: ${id}`);
    this.name = "AgentSkillNotFoundError";
  }
}

export class AgentSkillRevisionNotFoundError extends Error {
  constructor(id: string) {
    super(`Agent skill revision not found: ${id}`);
    this.name = "AgentSkillRevisionNotFoundError";
  }
}

export class FileAgentSkillRepository implements AgentSkillRepository {
  constructor(private readonly baseDir = "./data/agent-skills") {}

  async saveSkill(skill: AgentSkill): Promise<AgentSkill> {
    return this.updateSkill(skill);
  }

  async updateSkill(skill: AgentSkill): Promise<AgentSkill> {
    const validated = AgentSkillSchema.parse(skill);
    const skills = await this.readArray(SKILLS_FILE, AgentSkillSchema);
    await this.writeArray(SKILLS_FILE, [
      ...skills.filter((item) => item.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async getSkill(skillId: string): Promise<AgentSkill> {
    const skill = (await this.readArray(SKILLS_FILE, AgentSkillSchema)).find(
      (item) => item.id === skillId
    );
    if (!skill) throw new AgentSkillNotFoundError(skillId);
    return skill;
  }

  async findSkillBySlug(slug: string): Promise<AgentSkill | null> {
    return (
      (await this.readArray(SKILLS_FILE, AgentSkillSchema)).find(
        (item) => item.slug === slug
      ) ?? null
    );
  }

  async listSkills(filter: Parameters<AgentSkillRepository["listSkills"]>[0] = {}) {
    let skills = await this.readArray(SKILLS_FILE, AgentSkillSchema);
    if (filter.status) {
      skills = skills.filter((skill) => skill.status === filter.status);
    }
    if (filter.sourceType) {
      skills = skills.filter((skill) => skill.sourceType === filter.sourceType);
    }
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      skills = skills.filter(
        (skill) =>
          skill.slug.toLowerCase().includes(needle) ||
          skill.displayName.toLowerCase().includes(needle) ||
          skill.description.toLowerCase().includes(needle)
      );
    }
    if (filter.agentProfileId) {
      const boundIds = new Set(
        (await this.listBindings()).flatMap((binding) =>
          binding.enabled && binding.agentProfileId === filter.agentProfileId
            ? [binding.skillId]
            : []
        )
      );
      skills = skills.filter((skill) => boundIds.has(skill.id));
    }
    return skills.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  async saveRevision(
    revision: AgentSkillRevision
  ): Promise<AgentSkillRevision> {
    const validated = AgentSkillRevisionSchema.parse(revision);
    const revisions = await this.readArray(REVISIONS_FILE, AgentSkillRevisionSchema);
    await this.writeArray(REVISIONS_FILE, [
      ...revisions.filter((item) => item.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async getRevision(revisionId: string): Promise<AgentSkillRevision> {
    const revision = (
      await this.readArray(REVISIONS_FILE, AgentSkillRevisionSchema)
    ).find((item) => item.id === revisionId);
    if (!revision) throw new AgentSkillRevisionNotFoundError(revisionId);
    return revision;
  }

  async listRevisions(skillId: string): Promise<AgentSkillRevision[]> {
    return (await this.readArray(REVISIONS_FILE, AgentSkillRevisionSchema))
      .filter((revision) => revision.skillId === skillId)
      .sort((left, right) => right.revisionNumber - left.revisionNumber);
  }

  async saveFile(file: AgentSkillFile): Promise<AgentSkillFile> {
    const validated = AgentSkillFileSchema.parse(file);
    const files = await this.readArray(FILES_FILE, AgentSkillFileSchema);
    await this.writeArray(FILES_FILE, [
      ...files.filter((item) => item.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async listFiles(revisionId: string): Promise<AgentSkillFile[]> {
    return (await this.readArray(FILES_FILE, AgentSkillFileSchema))
      .filter((file) => file.revisionId === revisionId)
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  async saveBinding(binding: AgentSkillBinding): Promise<AgentSkillBinding> {
    const validated = AgentSkillBindingSchema.parse(binding);
    const bindings = await this.readArray(BINDINGS_FILE, AgentSkillBindingSchema);
    await this.writeArray(BINDINGS_FILE, [
      ...bindings.filter((item) => item.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async listBindings(skillId?: string): Promise<AgentSkillBinding[]> {
    return (await this.readArray(BINDINGS_FILE, AgentSkillBindingSchema))
      .filter((binding) => skillId === undefined || binding.skillId === skillId)
      .sort((left, right) => left.priority - right.priority);
  }

  async replaceBindings(
    skillId: string,
    bindings: AgentSkillBinding[]
  ): Promise<AgentSkillBinding[]> {
    const validated = bindings.map((binding) => AgentSkillBindingSchema.parse(binding));
    const existing = await this.readArray(BINDINGS_FILE, AgentSkillBindingSchema);
    await this.writeArray(BINDINGS_FILE, [
      ...existing.filter((binding) => binding.skillId !== skillId),
      ...validated,
    ]);
    return validated;
  }

  async saveValidationReport(
    report: AgentSkillValidationReport
  ): Promise<AgentSkillValidationReport> {
    const validated = AgentSkillValidationReportSchema.parse(report);
    const reports = await this.readArray(
      VALIDATION_REPORTS_FILE,
      AgentSkillValidationReportSchema
    );
    await this.writeArray(VALIDATION_REPORTS_FILE, [
      ...reports.filter((item) => item.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async listValidationReports(
    revisionId: string
  ): Promise<AgentSkillValidationReport[]> {
    return (
      await this.readArray(
        VALIDATION_REPORTS_FILE,
        AgentSkillValidationReportSchema
      )
    )
      .filter((report) => report.revisionId === revisionId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async appendUsageEvent(
    event: AgentSkillUsageEvent
  ): Promise<AgentSkillUsageEvent> {
    return AgentSkillUsageEventSchema.parse(event);
  }

  async listUsageEvents(
    filter: Parameters<AgentSkillRepository["listUsageEvents"]>[0] = {}
  ): Promise<AgentSkillUsageEvent[]> {
    return (await this.readArray(USAGE_EVENTS_FILE, AgentSkillUsageEventSchema))
      .filter(
        (event) =>
          (filter.skillId === undefined || event.skillId === filter.skillId) &&
          (filter.workflowThreadId === undefined ||
            event.workflowThreadId === filter.workflowThreadId)
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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
