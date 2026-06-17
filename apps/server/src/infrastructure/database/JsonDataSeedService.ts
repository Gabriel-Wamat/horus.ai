import { promises as fs } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  FrontendProjectSchema,
  PreviewEventSchema,
  PreviewSessionSchema,
  ProjectCommandRunSchema,
  ProjectConstructionRunSchema,
  ProjectQualityGateSchema,
  ProjectWorkspaceSchema,
  SpecSchema,
  UserStorySchema,
  VisualInstructionDraftSchema,
  WorkspaceFolderSchema,
  type FrontendProject,
  type PreviewEvent,
  type PreviewSession,
  type ProjectCommandRun,
  type ProjectConstructionRun,
  type ProjectQualityGate,
  type ProjectWorkspace,
  type Spec,
  type UserStory,
  type VisualInstructionDraft,
  type WorkspaceFolder,
} from "@u-build/shared";
import type {
  FrontendProjectRepository,
  PreviewSessionRepository,
  ProjectConstructionRepository,
  WorkspaceRepository,
} from "../../application/ports/RepositoryPorts.js";
import { readJsonFileRaw } from "../storage/JsonFileStore.js";

export interface JsonDataSeedRepositories {
  workspaceStore: WorkspaceRepository;
  frontendProjects: FrontendProjectRepository;
  previewSessions: PreviewSessionRepository;
  projectConstruction: ProjectConstructionRepository;
}

export interface JsonDataSeedServiceOptions {
  sourceDataDir: string;
  targetDataDir: string;
  repositoryRoot: string;
}

export interface JsonDataSeedSummary {
  folders: number;
  userStories: number;
  specs: number;
  frontendProjects: number;
  projectWorkspaces: number;
  constructionRuns: number;
  commandRuns: number;
  qualityGates: number;
  previewSessions: number;
  previewEvents: number;
  previewDrafts: number;
  skippedPreviewEvents: number;
  skippedPreviewDrafts: number;
}

interface WorkspaceSeedRecord {
  folder: WorkspaceFolder;
  stories: Array<{
    story: UserStory;
    specs: Spec[];
  }>;
}

interface PreviewSessionSeedRecord {
  session: PreviewSession;
  events: PreviewEvent[];
  drafts: VisualInstructionDraft[];
}

interface JsonDataSeedPlan {
  workspaces: WorkspaceSeedRecord[];
  frontendProjects: FrontendProject[];
  projectWorkspaces: ProjectWorkspace[];
  constructionRuns: ProjectConstructionRun[];
  commandRuns: ProjectCommandRun[];
  qualityGates: ProjectQualityGate[];
  previewSessions: PreviewSessionSeedRecord[];
}

const EMPTY_SUMMARY: JsonDataSeedSummary = {
  folders: 0,
  userStories: 0,
  specs: 0,
  frontendProjects: 0,
  projectWorkspaces: 0,
  constructionRuns: 0,
  commandRuns: 0,
  qualityGates: 0,
  previewSessions: 0,
  previewEvents: 0,
  previewDrafts: 0,
  skippedPreviewEvents: 0,
  skippedPreviewDrafts: 0,
};

const LOCAL_PREVIEW_HOSTS = new Set([
  ["local", "host"].join(""),
  ["127", "0", "0", "1"].join("."),
  ["0", "0", "0", "0"].join("."),
  "::1",
  "[::1]",
]);

export class JsonDataSeedService {
  private readonly sourceDataDir: string;
  private readonly targetDataDir: string;
  private readonly repositoryRoot: string;

  constructor(options: JsonDataSeedServiceOptions) {
    this.sourceDataDir = resolve(options.sourceDataDir);
    this.targetDataDir = resolve(options.targetDataDir);
    this.repositoryRoot = resolve(options.repositoryRoot);
  }

  async inspect(): Promise<JsonDataSeedSummary> {
    return summarizeSeedPlan(await this.loadPlan());
  }

  async seed(repositories: JsonDataSeedRepositories): Promise<JsonDataSeedSummary> {
    const plan = await this.loadPlan();
    const summary = { ...EMPTY_SUMMARY };

    for (const workspace of plan.workspaces) {
      await repositories.workspaceStore.saveFolder(workspace.folder);
      summary.folders += 1;
      for (const record of workspace.stories) {
        await repositories.workspaceStore.saveUserStories(workspace.folder.id, [
          record.story,
        ]);
        summary.userStories += 1;
        for (const spec of record.specs) {
          await repositories.workspaceStore.saveSpec(
            workspace.folder.id,
            record.story.id,
            spec
          );
          summary.specs += 1;
        }
      }
    }

    for (const project of plan.frontendProjects) {
      if (repositories.frontendProjects.saveProject) {
        await repositories.frontendProjects.saveProject(project);
      } else if (repositories.frontendProjects.registerProject) {
        await repositories.frontendProjects.registerProject(project);
      } else {
        throw new Error("FrontendProjectRepository cannot save seed projects.");
      }
      summary.frontendProjects += 1;
    }

    for (const projectWorkspace of plan.projectWorkspaces) {
      await repositories.projectConstruction.saveProjectWorkspace(projectWorkspace);
      summary.projectWorkspaces += 1;
    }
    for (const run of plan.constructionRuns) {
      await repositories.projectConstruction.saveConstructionRun(run);
      summary.constructionRuns += 1;
    }
    for (const commandRun of plan.commandRuns) {
      const existing = await repositories.projectConstruction.listCommandRuns(
        commandRun.constructionRunId
      );
      if (!existing.some((item) => item.id === commandRun.id)) {
        await repositories.projectConstruction.appendCommandRun(commandRun);
        summary.commandRuns += 1;
      }
    }
    for (const qualityGate of plan.qualityGates) {
      const existing = await repositories.projectConstruction.listQualityGates(
        qualityGate.constructionRunId
      );
      if (!existing.some((item) => item.id === qualityGate.id)) {
        await repositories.projectConstruction.appendQualityGate(qualityGate);
        summary.qualityGates += 1;
      }
    }

    for (const preview of plan.previewSessions) {
      await repositories.previewSessions.saveSession(preview.session);
      summary.previewSessions += 1;

      const existingEvents = await repositories.previewSessions
        .listEvents(preview.session.id)
        .catch(() => []);
      const eventIds = new Set(existingEvents.map((event) => event.id));
      for (const event of preview.events) {
        if (eventIds.has(event.id)) {
          summary.skippedPreviewEvents += 1;
          continue;
        }
        await repositories.previewSessions.appendEvent(event);
        eventIds.add(event.id);
        summary.previewEvents += 1;
      }

      const existingDrafts = await repositories.previewSessions
        .listDrafts(preview.session.id)
        .catch(() => []);
      const draftIds = new Set(existingDrafts.map((draft) => draft.id));
      for (const draft of preview.drafts) {
        if (draftIds.has(draft.id)) {
          summary.skippedPreviewDrafts += 1;
          continue;
        }
        await repositories.previewSessions.saveDraft(draft);
        draftIds.add(draft.id);
        summary.previewDrafts += 1;
      }
    }

    return summary;
  }

  private async loadPlan(): Promise<JsonDataSeedPlan> {
    return {
      workspaces: await this.readWorkspaceSeeds(),
      frontendProjects: await this.readFrontendProjects(),
      projectWorkspaces: await this.readArray(
        join("project-construction", "project-workspaces.json"),
        ProjectWorkspaceSchema
      ).then((items) =>
        items.map((item) =>
          ProjectWorkspaceSchema.parse({
            ...item,
            rootPath: this.remapRuntimePath(item.rootPath),
            configPath: this.remapRuntimePath(item.configPath),
            gitRepositoryPath: this.remapRuntimePath(item.gitRepositoryPath),
          })
        )
      ),
      constructionRuns: await this.readArray(
        join("project-construction", "project-construction-runs.json"),
        ProjectConstructionRunSchema
      ).then((items) =>
        items.map((item) =>
          ProjectConstructionRunSchema.parse({
            ...item,
            workspacePath: this.remapRuntimePath(item.workspacePath),
          })
        )
      ),
      commandRuns: await this.readArray(
        join("project-construction", "project-command-runs.json"),
        ProjectCommandRunSchema
      ).then((items) =>
        items.map((item) =>
          ProjectCommandRunSchema.parse({
            ...item,
            cwd: this.remapRuntimePath(item.cwd),
            stdoutPath: this.remapRuntimePath(item.stdoutPath),
            stderrPath: this.remapRuntimePath(item.stderrPath),
          })
        )
      ),
      qualityGates: await this.readArray(
        join("project-construction", "project-quality-gates.json"),
        ProjectQualityGateSchema
      ),
      previewSessions: await this.readPreviewSessionSeeds(),
    };
  }

  private async readWorkspaceSeeds(): Promise<WorkspaceSeedRecord[]> {
    const folders = await this.readArray(
      join("workspace", "folders.json"),
      WorkspaceFolderSchema
    );
    const result: WorkspaceSeedRecord[] = [];
    for (const folder of folders) {
      const folderDir = join(this.sourceDataDir, "workspace", folder.slug);
      const stories = await this.readStories(folderDir);
      result.push({ folder, stories });
    }
    return result;
  }

  private async readStories(
    folderDir: string
  ): Promise<WorkspaceSeedRecord["stories"]> {
    const result: WorkspaceSeedRecord["stories"] = [];
    for (const entry of await listDirectories(folderDir)) {
      const storyDir = join(folderDir, entry);
      const story = await this.readStory(storyDir);
      if (!story) continue;
      result.push({
        story,
        specs: await this.readSpecs(storyDir),
      });
    }
    return result.sort((left, right) =>
      left.story.createdAt.localeCompare(right.story.createdAt)
    );
  }

  private async readStory(storyDir: string): Promise<UserStory | null> {
    const active = await readOptionalJson(join(storyDir, "active.json"));
    if (active && typeof active === "object" && "story" in active) {
      return UserStorySchema.parse((active as { story: unknown }).story);
    }

    const legacy = await readOptionalJson(join(storyDir, "user-story.json"));
    if (legacy && typeof legacy === "object" && "story" in legacy) {
      return UserStorySchema.parse((legacy as { story: unknown }).story);
    }
    return null;
  }

  private async readSpecs(storyDir: string): Promise<Spec[]> {
    const specsDir = join(storyDir, "specs");
    const result: Spec[] = [];
    for (const entry of await listDirectories(specsDir)) {
      const payload = await readOptionalJson(join(specsDir, entry, "active.json"));
      if (payload && typeof payload === "object" && "spec" in payload) {
        result.push(SpecSchema.parse((payload as { spec: unknown }).spec));
      }
    }
    return result.sort((left, right) => left.id.localeCompare(right.id));
  }

  private async readFrontendProjects(): Promise<FrontendProject[]> {
    const projects = await this.readArray(
      join("frontend-projects", "projects.json"),
      FrontendProjectSchema
    );
    return projects.map((project) =>
      FrontendProjectSchema.parse({
        ...project,
        rootPath: this.remapRuntimePath(project.rootPath),
        previewUrl: sanitizePreviewUrl(project.previewUrl),
      })
    );
  }

  private async readPreviewSessionSeeds(): Promise<PreviewSessionSeedRecord[]> {
    const previewRoot = join(this.sourceDataDir, "preview-sessions");
    const result: PreviewSessionSeedRecord[] = [];
    for (const entry of await listDirectories(previewRoot)) {
      const sessionDir = join(previewRoot, entry);
      const sessionPayload = await readOptionalJson(join(sessionDir, "session.json"));
      if (!sessionPayload) continue;
      const session = sanitizePreviewSession(
        PreviewSessionSchema.parse(sessionPayload)
      );
      const events = await readOptionalJson(join(sessionDir, "timeline.json")).then(
        (payload) =>
          PreviewEventSchema.array()
            .parse(Array.isArray(payload) ? payload : [])
            .map(sanitizePreviewEvent)
      );
      const drafts = await readOptionalJson(join(sessionDir, "drafts.json")).then(
        (payload) =>
          VisualInstructionDraftSchema.array().parse(
            Array.isArray(payload) ? payload : []
          )
      );
      result.push({ session, events, drafts });
    }
    return result.sort((left, right) =>
      left.session.updatedAt.localeCompare(right.session.updatedAt)
    );
  }

  private async readArray<T>(
    relativePath: string,
    schema: { parse(value: unknown): T }
  ): Promise<T[]> {
    const payload = await readOptionalJson(join(this.sourceDataDir, relativePath));
    if (!payload) return [];
    return Array.isArray(payload) ? payload.map((item) => schema.parse(item)) : [];
  }

  private remapRuntimePath(path: string | null): string | null {
    if (path === null) return null;
    const normalized = path.trim();
    if (!normalized) return path;
    if (normalized === ".") return this.targetDataDir;
    if (isAbsolute(normalized)) {
      const sourceRelation = relative(this.sourceDataDir, normalized);
      if (isInside(sourceRelation)) {
        return resolve(this.targetDataDir, sourceRelation);
      }
      return normalized;
    }
    if (normalized === "apps" || normalized.startsWith("apps/")) {
      return resolve(this.repositoryRoot, normalized);
    }
    if (normalized === "packages" || normalized.startsWith("packages/")) {
      return resolve(this.repositoryRoot, normalized);
    }
    return resolve(this.targetDataDir, normalized);
  }
}

function summarizeSeedPlan(plan: JsonDataSeedPlan): JsonDataSeedSummary {
  return {
    ...EMPTY_SUMMARY,
    folders: plan.workspaces.length,
    userStories: plan.workspaces.reduce(
      (sum, workspace) => sum + workspace.stories.length,
      0
    ),
    specs: plan.workspaces.reduce(
      (sum, workspace) =>
        sum + workspace.stories.reduce((storySum, story) => storySum + story.specs.length, 0),
      0
    ),
    frontendProjects: plan.frontendProjects.length,
    projectWorkspaces: plan.projectWorkspaces.length,
    constructionRuns: plan.constructionRuns.length,
    commandRuns: plan.commandRuns.length,
    qualityGates: plan.qualityGates.length,
    previewSessions: plan.previewSessions.length,
    previewEvents: plan.previewSessions.reduce(
      (sum, preview) => sum + preview.events.length,
      0
    ),
    previewDrafts: plan.previewSessions.reduce(
      (sum, preview) => sum + preview.drafts.length,
      0
    ),
  };
}

function sanitizePreviewSession(session: PreviewSession): PreviewSession {
  const transientStatuses = new Set(["starting", "running", "inspecting", "applying"]);
  const status = transientStatuses.has(session.status) ? "stopped" : session.status;
  return PreviewSessionSchema.parse({
    ...session,
    status,
    previewUrl: sanitizePreviewUrl(session.previewUrl),
    processId: null,
    stoppedAt:
      status === "stopped" ? session.stoppedAt ?? session.updatedAt : session.stoppedAt,
  });
}

function sanitizePreviewEvent(event: PreviewEvent): PreviewEvent {
  return PreviewEventSchema.parse({
    ...event,
    data: sanitizePortablePayload(event.data),
  });
}

function sanitizePortablePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePortablePayload);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? sanitizePortableString(value) : value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sanitizePortablePayload(item),
    ])
  );
}

function sanitizePortableString(value: string): string {
  const localUrl = sanitizePreviewUrl(value);
  if (localUrl === null && value.includes("://")) return "[local-runtime-url]";
  return value;
}

function sanitizePreviewUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (LOCAL_PREVIEW_HOSTS.has(host)) {
      return null;
    }
    return value;
  } catch {
    return value;
  }
}

function isInside(relation: string): boolean {
  return relation === "" || (!relation.startsWith("..") && !relation.includes(`..${sep}`));
}

async function listDirectories(path: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function readOptionalJson(path: string): Promise<unknown | null> {
  try {
    return await readJsonFileRaw(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
