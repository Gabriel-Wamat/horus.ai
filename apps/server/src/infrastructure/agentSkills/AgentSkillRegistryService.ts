import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import {
  type AgentSkill,
  type AgentSkillBinding,
  type AgentSkillDetail,
  type AgentSkillFile,
  type AgentSkillListQuery,
  type AgentSkillRevision,
  type AgentSkillSummary,
  type AgentSkillValidationReport,
  type CreateAgentSkillBindingInput,
  type CreateAgentSkillFileInput,
  type CreateAgentSkillInput,
  type RuntimeAgentSkill,
  type ValidateAgentSkillInput,
} from "@u-build/shared";
import {
  type AgentProfileRegistry,
  defaultAgentProfileRegistry,
} from "../../application/services/AgentProfileRegistry.js";
import type { AgentSkillRepository } from "../repositories/contracts.js";
import { newId, slugify } from "../repositories/postgresUtils.js";
import {
  AgentSkillValidationService,
  parseSkillFrontmatter,
} from "./AgentSkillValidationService.js";

const DEFAULT_SEED_BINDINGS: Record<string, string> = {
  "spec-frontend-sdd": "spec_agent",
  "front-design-frontend": "front_agent",
  "qa-frontend-testing": "qa_agent",
  "curator-quality-gate": "curator_agent",
};

export class AgentSkillRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentSkillRegistryError";
  }
}

export class AgentSkillPublishRejectedError extends AgentSkillRegistryError {
  constructor(message: string) {
    super(message);
    this.name = "AgentSkillPublishRejectedError";
  }
}

export class AgentSkillStaleRevisionError extends AgentSkillRegistryError {
  constructor(message: string) {
    super(message);
    this.name = "AgentSkillStaleRevisionError";
  }
}

export interface ResolveRuntimeSkillOptions {
  workflowThreadId?: string | null;
  triggerReason?: string | null;
  auditUsage?: boolean;
}

export class AgentSkillRegistryService {
  private seedPromise: Promise<void> | null = null;

  constructor(
    private readonly repository: AgentSkillRepository,
    private readonly validation: AgentSkillValidationService,
    private readonly options: {
      repositoryRoot: string;
      skillsRoot?: string;
      profiles?: AgentProfileRegistry;
    }
  ) {}

  async ensureSeeded(): Promise<void> {
    if (!this.seedPromise) {
      this.seedPromise = this.seedFilesystemSkills();
    }
    await this.seedPromise;
  }

  async seedFilesystemSkills(): Promise<void> {
    const skillsRoot =
      this.options.skillsRoot ?? join(this.options.repositoryRoot, "skills", "agents");
    const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch((err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      const skillDir = join(skillsRoot, slug);
      const skillMdPath = join(skillDir, "SKILL.md");
      const skillMd = await fs.readFile(skillMdPath, "utf8").catch((err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      });
      if (!skillMd) continue;
      const frontmatter = parseSkillFrontmatter(skillMd);
      const files = await readSeedSupportFiles(skillDir);
      const displayName = readString(frontmatter["name"]) ?? slug;
      const description =
        readString(frontmatter["description"]) ??
        `Repository skill bundle seeded from ${relative(
          this.options.repositoryRoot,
          skillDir
        )}.`;
      const existing = await this.repository.findSkillBySlug(slug);
      const skill = existing ?? {
        id: newId(),
        slug,
        displayName,
        description,
        scope: "system",
        sourceType: "filesystem_seed",
        sourcePath: relative(this.options.repositoryRoot, skillDir),
        status: "active",
        activeRevisionId: null,
        createdBy: "filesystem_seed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const nextRevisionId = newId();
      const validationResult = this.validation.validateDraft(
        {
          skillMd,
          files,
          bindingAgentProfileIds: seedBindingForSlug(slug)
            ? [seedBindingForSlug(slug) as string]
            : [],
        },
        { revisionId: nextRevisionId }
      );
      const revisions = existing ? await this.repository.listRevisions(skill.id) : [];
      if (revisions.some((revision) => revision.contentHash === validationResult.contentHash)) {
        continue;
      }
      const now = new Date().toISOString();
      const revision: AgentSkillRevision = {
        id: nextRevisionId,
        skillId: skill.id,
        revisionNumber: revisions.length + 1,
        status: validationResult.report.status === "passed" ? "published" : "rejected",
        skillMd,
        frontmatter: validationResult.frontmatter,
        contentHash: validationResult.contentHash,
        validationStatus: validationResult.report.status,
        createdAt: now,
        publishedAt: validationResult.report.status === "passed" ? now : null,
      };
      await this.repository.saveSkill({
        ...skill,
        displayName,
        description,
        updatedAt: now,
      });
      await this.repository.saveRevision(revision);
      for (const fileInput of files) {
        await this.repository.saveFile(
          this.validation.buildFile(revision.id, fileInput)
        );
      }
      await this.repository.saveValidationReport(validationResult.report);
      const bindingProfileId = seedBindingForSlug(slug);
      const bindings =
        bindingProfileId && validationResult.report.status === "passed"
          ? [
              createBinding(skill.id, {
                agentProfileId: bindingProfileId,
                triggerMode: "automatic",
                priority: 10,
                enabled: true,
              }),
            ]
          : [];
      if (bindings.length > 0) {
        await this.repository.replaceBindings(skill.id, bindings);
      }
      await this.repository.updateSkill({
        ...skill,
        displayName,
        description,
        status: validationResult.report.status === "passed" ? "active" : "draft",
        activeRevisionId:
          validationResult.report.status === "passed" ? revision.id : null,
        updatedAt: now,
      });
    }
  }

  async listSummaries(filter?: AgentSkillListQuery): Promise<AgentSkillSummary[]> {
    await this.ensureSeeded();
    const skills = await this.repository.listSkills(filter);
    return Promise.all(skills.map((skill) => this.toSummary(skill)));
  }

  async getDetail(skillId: string): Promise<AgentSkillDetail> {
    await this.ensureSeeded();
    const skill = await this.repository.getSkill(skillId);
    const summary = await this.toSummary(skill);
    const revisions = await this.repository.listRevisions(skill.id);
    const files = skill.activeRevisionId
      ? await this.repository.listFiles(skill.activeRevisionId)
      : [];
    const validationReports = (
      await Promise.all(
        revisions.map((revision) =>
          this.repository.listValidationReports(revision.id)
        )
      )
    ).flat();
    return {
      ...summary,
      revisions,
      files,
      validationReports,
    };
  }

  async createSkill(input: CreateAgentSkillInput): Promise<{
    skill: AgentSkill;
    draftRevision: AgentSkillRevision;
    files: AgentSkillFile[];
    validationReport: AgentSkillValidationReport;
    bindings: AgentSkillBinding[];
  }> {
    await this.ensureSeeded();
    const now = new Date().toISOString();
    const skillId = newId();
    const revisionId = newId();
    const slug = await this.uniqueSlug(input.slug ?? input.displayName);
    const validationResult = this.validation.validateDraft(
      {
        skillMd: input.skillMd,
        files: input.files,
        bindingAgentProfileIds: input.bindings.map(
          (binding) => binding.agentProfileId
        ),
      },
      { revisionId }
    );
    const skill: AgentSkill = {
      id: skillId,
      slug,
      displayName: input.displayName,
      description: input.description,
      scope: input.scope,
      sourceType: "database",
      sourcePath: null,
      status: "draft",
      activeRevisionId: null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const draftRevision: AgentSkillRevision = {
      id: revisionId,
      skillId,
      revisionNumber: 1,
      status:
        validationResult.report.status === "passed" ? "validated" : "rejected",
      skillMd: input.skillMd,
      frontmatter: validationResult.frontmatter,
      contentHash: validationResult.contentHash,
      validationStatus: validationResult.report.status,
      createdAt: now,
      publishedAt: null,
    };
    await this.repository.saveSkill(skill);
    await this.repository.saveRevision(draftRevision);
    const files: AgentSkillFile[] = [];
    for (const fileInput of input.files) {
      const file = this.validation.buildFile(revisionId, fileInput);
      files.push(await this.repository.saveFile(file));
    }
    await this.repository.saveValidationReport(validationResult.report);
    const bindings =
      input.bindings.length > 0
        ? await this.repository.replaceBindings(
            skill.id,
            input.bindings.map((binding) => createBinding(skill.id, binding))
          )
        : [];
    return {
      skill,
      draftRevision,
      files,
      validationReport: validationResult.report,
      bindings,
    };
  }

  async validateDraft(
    input: ValidateAgentSkillInput
  ): Promise<{ validationReport: AgentSkillValidationReport; contentHash: string }> {
    const result = this.validation.validateDraft(input);
    return {
      validationReport: result.report,
      contentHash: result.contentHash,
    };
  }

  async publishRevision(
    skillId: string,
    revisionId: string,
    input: {
      expectedRevisionHash: string;
      bindingUpdates?: CreateAgentSkillBindingInput[] | undefined;
    }
  ): Promise<{
    skill: AgentSkill;
    activeRevision: AgentSkillRevision;
    bindings: AgentSkillBinding[];
  }> {
    await this.ensureSeeded();
    const skill = await this.repository.getSkill(skillId);
    const revision = await this.repository.getRevision(revisionId);
    if (revision.skillId !== skill.id) {
      throw new AgentSkillPublishRejectedError(
        "Revision does not belong to the requested skill."
      );
    }
    if (revision.contentHash !== input.expectedRevisionHash) {
      throw new AgentSkillStaleRevisionError(
        "Revision hash changed. Refresh before publishing."
      );
    }
    const validationReports = await this.repository.listValidationReports(revision.id);
    const latestReport = validationReports[0];
    if (revision.validationStatus !== "passed" || latestReport?.status !== "passed") {
      throw new AgentSkillPublishRejectedError(
        "Only validated skill revisions can be published."
      );
    }

    const now = new Date().toISOString();
    const activeRevision: AgentSkillRevision = {
      ...revision,
      status: "published",
      validationStatus: "passed",
      publishedAt: now,
    };
    await this.repository.saveRevision(activeRevision);
    const updatedSkill: AgentSkill = {
      ...skill,
      status: "active",
      activeRevisionId: activeRevision.id,
      updatedAt: now,
    };
    await this.repository.updateSkill(updatedSkill);
    const bindings =
      input.bindingUpdates !== undefined
        ? await this.repository.replaceBindings(
            skill.id,
            input.bindingUpdates.map((binding) => createBinding(skill.id, binding))
          )
        : await this.repository.listBindings(skill.id);
    return { skill: updatedSkill, activeRevision, bindings };
  }

  async replaceBindings(
    skillId: string,
    inputs: CreateAgentSkillBindingInput[]
  ): Promise<AgentSkillBinding[]> {
    await this.ensureSeeded();
    const profiles = this.options.profiles ?? defaultAgentProfileRegistry;
    for (const input of inputs) {
      profiles.getProfile(input.agentProfileId as never);
    }
    return this.repository.replaceBindings(
      skillId,
      inputs.map((input) => createBinding(skillId, input))
    );
  }

  async archiveSkill(skillId: string): Promise<AgentSkill> {
    await this.ensureSeeded();
    const skill = await this.repository.getSkill(skillId);
    const archived = {
      ...skill,
      status: "archived" as const,
      updatedAt: new Date().toISOString(),
    };
    return this.repository.updateSkill(archived);
  }

  async resolveRuntimeSkillsForAgent(
    agentNameOrProfileId: string,
    options: ResolveRuntimeSkillOptions = {}
  ): Promise<RuntimeAgentSkill[]> {
    await this.ensureSeeded();
    const profile = tryGetProfileForAgent(
      agentNameOrProfileId,
      this.options.profiles ?? defaultAgentProfileRegistry
    );
    const agentProfileId = profile?.id ?? agentNameOrProfileId;
    const skills = await this.repository.listSkills({
      status: "active",
      agentProfileId,
    });
    const runtimeSkills: RuntimeAgentSkill[] = [];
    for (const skill of skills) {
      if (!skill.activeRevisionId) continue;
      const revision = await this.repository.getRevision(skill.activeRevisionId);
      if (
        revision.status !== "published" ||
        revision.validationStatus !== "passed"
      ) {
        continue;
      }
      const bindings = (await this.repository.listBindings(skill.id)).filter(
        (binding) =>
          binding.enabled &&
          binding.agentProfileId === agentProfileId &&
          binding.triggerMode !== "disabled"
      );
      if (bindings.length === 0) continue;
      const files = await this.repository.listFiles(revision.id);
      for (const binding of bindings) {
        runtimeSkills.push({
          skillId: skill.id,
          slug: skill.slug,
          displayName: skill.displayName,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          contentHash: revision.contentHash,
          triggerMode: binding.triggerMode,
          agentProfileId,
          skillMd: revision.skillMd,
          files,
        });
        if (options.auditUsage && options.workflowThreadId) {
          await this.repository.appendUsageEvent({
            id: newId(),
            skillId: skill.id,
            revisionId: revision.id,
            workflowThreadId: options.workflowThreadId,
            agentProfileId,
            triggerMode: binding.triggerMode,
            triggerReason: options.triggerReason ?? null,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
    return runtimeSkills.sort((left, right) =>
      left.displayName.localeCompare(right.displayName)
    );
  }

  private async toSummary(skill: AgentSkill): Promise<AgentSkillSummary> {
    const activeRevision = skill.activeRevisionId
      ? await this.repository.getRevision(skill.activeRevisionId).catch(() => null)
      : null;
    const bindings = await this.repository.listBindings(skill.id);
    const latestValidationReport = activeRevision
      ? (await this.repository.listValidationReports(activeRevision.id))[0] ?? null
      : null;
    return {
      ...skill,
      activeRevision,
      bindings,
      latestValidationReport,
    };
  }

  private async uniqueSlug(input: string): Promise<string> {
    const base = slugify(input, "skill");
    let candidate = base;
    let suffix = 2;
    while (await this.repository.findSkillBySlug(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}

async function readSeedSupportFiles(
  skillDir: string
): Promise<CreateAgentSkillFileInput[]> {
  const referencesDir = join(skillDir, "references");
  const entries = await fs.readdir(referencesDir, { withFileTypes: true }).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  });
  const files: CreateAgentSkillFileInput[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const absolutePath = join(referencesDir, entry.name);
    const contentText = await fs.readFile(absolutePath, "utf8");
    files.push({
      relativePath: `references/${entry.name}`,
      mediaType: "text/markdown",
      contentText,
    });
  }
  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function seedBindingForSlug(slug: string): string | null {
  return DEFAULT_SEED_BINDINGS[slug] ?? null;
}

function createBinding(
  skillId: string,
  input: CreateAgentSkillBindingInput
): AgentSkillBinding {
  const now = new Date().toISOString();
  return {
    id: newId(),
    skillId,
    agentProfileId: input.agentProfileId,
    triggerMode: input.triggerMode,
    priority: input.priority,
    enabled: input.enabled,
    createdAt: now,
    updatedAt: now,
  };
}

function tryGetProfileForAgent(
  agentName: string,
  profiles: AgentProfileRegistry = defaultAgentProfileRegistry
) {
  try {
    return profiles.getProfileForAgent(agentName as never);
  } catch {
    return null;
  }
}
