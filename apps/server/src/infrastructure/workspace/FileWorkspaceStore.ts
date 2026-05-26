import { promises as fs } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  SpecSchema,
  WorkspaceFolderSchema,
  UserStorySchema,
  type Spec,
  type UserStory,
  type WorkspaceFolder,
  type WorkspaceArtifactContext,
} from "@u-build/shared";

const INDEX_FILE = "folders.json";
const USER_STORY_FILE = "user-story.json";
const ACTIVE_FILE = "active.json";
const MANIFEST_FILE = "manifest.json";
const REVISIONS_DIR = "revisions";
const SPECS_DIR = "specs";

interface StoryRevisionEntry {
  revision: number;
  file: string;
  createdAt: string;
}

interface StoryManifest {
  folderId: string;
  storyId: string;
  createdAt: string;
  updatedAt: string;
  activeRevision: number;
  revisions: StoryRevisionEntry[];
}

interface ActiveStoryFile {
  folderId: string;
  storyId: string;
  activeRevision: number;
  updatedAt: string;
  story: UserStory;
}

interface StoryRevisionFile {
  folderId: string;
  storyId: string;
  revision: number;
  savedAt: string;
  story: UserStory;
}

interface SpecRevisionEntry {
  revision: number;
  file: string;
  createdAt: string;
}

interface SpecManifest {
  folderId: string;
  storyId: string;
  specId: string;
  createdAt: string;
  updatedAt: string;
  activeRevision: number;
  revisions: SpecRevisionEntry[];
}

interface ActiveSpecFile {
  folderId: string;
  storyId: string;
  specId: string;
  activeRevision: number;
  updatedAt: string;
  spec: Spec;
}

interface SpecRevisionFile {
  folderId: string;
  storyId: string;
  specId: string;
  revision: number;
  savedAt: string;
  spec: Spec;
}

export interface WorkspaceArtifactRevisionMetadata {
  activeRevision: number;
  revisions: Array<{
    revision: number;
    file: string;
    createdAt: string;
  }>;
}

export interface WorkspaceSpecArtifactMetadata {
  specId: string;
  spec?: Spec;
  revision: WorkspaceArtifactRevisionMetadata;
}

export interface WorkspaceUserStoryArtifactMetadata {
  story: UserStory;
  revision: WorkspaceArtifactRevisionMetadata;
  specs: WorkspaceSpecArtifactMetadata[];
}

export interface ResolvedWorkspaceStories {
  userStories: UserStory[];
  artifactContext: Record<string, WorkspaceArtifactContext>;
  initialSpecs: Record<string, Spec>;
}

export interface ActiveWorkspaceStoryContext {
  story: UserStory;
  spec?: Spec;
  artifactContext: WorkspaceArtifactContext;
}

export class WorkspaceFolderNotFoundError extends Error {
  constructor(folderId: string) {
    super(`Workspace folder not found: ${folderId}`);
    this.name = "WorkspaceFolderNotFoundError";
  }
}

export class WorkspaceUserStoryNotFoundError extends Error {
  constructor(storyId: string) {
    super(`Workspace user story not found: ${storyId}`);
    this.name = "WorkspaceUserStoryNotFoundError";
  }
}

export class WorkspaceSpecNotFoundError extends Error {
  constructor(specId: string) {
    super(`Workspace spec not found: ${specId}`);
    this.name = "WorkspaceSpecNotFoundError";
  }
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return slug || "workspace";
}

function storyDirectoryName(story: UserStory): string {
  return `${slugify(story.title)}-${story.id.slice(0, 8)}`;
}

function revisionFileName(revision: number): string {
  return `${revision.toString().padStart(4, "0")}-user-story.json`;
}

function specRevisionFileName(revision: number): string {
  return `${revision.toString().padStart(4, "0")}-spec.json`;
}

function sameStory(left: UserStory, right: UserStory): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameSpec(left: Spec, right: Spec): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class FileWorkspaceStore {
  constructor(private readonly baseDir = "./data/workspace") {}

  private indexPath(): string {
    return join(this.baseDir, INDEX_FILE);
  }

  private folderPath(folder: WorkspaceFolder): string {
    return join(this.baseDir, folder.slug);
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private async readFolders(): Promise<WorkspaceFolder[]> {
    await this.ensureBaseDir();
    try {
      const raw = await fs.readFile(this.indexPath(), "utf-8");
      return WorkspaceFolderSchema.array().parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  private async writeFolders(folders: WorkspaceFolder[]): Promise<void> {
    await this.ensureBaseDir();
    const validated = WorkspaceFolderSchema.array().parse(folders);
    await fs.writeFile(
      this.indexPath(),
      JSON.stringify(validated, null, 2),
      "utf-8"
    );
  }

  private async uniqueSlug(name: string, folders: WorkspaceFolder[]): Promise<string> {
    const base = slugify(name);
    const used = new Set(folders.map((folder) => folder.slug));
    if (!used.has(base)) return base;

    let counter = 2;
    while (used.has(`${base}-${counter}`)) {
      counter += 1;
    }
    return `${base}-${counter}`;
  }

  private async getFolder(folderId: string): Promise<WorkspaceFolder> {
    const folders = await this.readFolders();
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) {
      throw new WorkspaceFolderNotFoundError(folderId);
    }
    return folder;
  }

  private async updateFolderStoryCount(folderId: string): Promise<void> {
    const folders = await this.readFolders();
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) {
      throw new WorkspaceFolderNotFoundError(folderId);
    }

    const entries = await fs.readdir(this.folderPath(folder), { withFileTypes: true });
    const storyCount = entries.filter((entry) => entry.isDirectory()).length;
    await this.writeFolders(
      folders.map((item) => (item.id === folderId ? { ...item, storyCount } : item))
    );
  }

  private userStoryPath(storyDir: string): string {
    return join(storyDir, USER_STORY_FILE);
  }

  private activeStoryPath(storyDir: string): string {
    return join(storyDir, ACTIVE_FILE);
  }

  private manifestPath(storyDir: string): string {
    return join(storyDir, MANIFEST_FILE);
  }

  private revisionsPath(storyDir: string): string {
    return join(storyDir, REVISIONS_DIR);
  }

  private specsPath(storyDir: string): string {
    return join(storyDir, SPECS_DIR);
  }

  private specPath(storyDir: string, specId: string): string {
    return join(this.specsPath(storyDir), specId);
  }

  private activeSpecPath(specDir: string): string {
    return join(specDir, ACTIVE_FILE);
  }

  private specManifestPath(specDir: string): string {
    return join(specDir, MANIFEST_FILE);
  }

  private specRevisionsPath(specDir: string): string {
    return join(specDir, REVISIONS_DIR);
  }

  private async readJsonFile(path: string): Promise<unknown> {
    const raw = await fs.readFile(path, "utf-8");
    return JSON.parse(raw);
  }

  private async readActiveStory(storyDir: string): Promise<UserStory> {
    try {
      const active = (await this.readJsonFile(
        this.activeStoryPath(storyDir)
      )) as { story?: unknown };
      return UserStorySchema.parse(active.story);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    const legacy = (await this.readJsonFile(this.userStoryPath(storyDir))) as {
      story?: unknown;
    };
    return UserStorySchema.parse(legacy.story);
  }

  private async readStoryManifest(
    storyDir: string
  ): Promise<StoryManifest | null> {
    try {
      const raw = (await this.readJsonFile(
        this.manifestPath(storyDir)
      )) as StoryManifest;
      return {
        folderId: raw.folderId,
        storyId: raw.storyId,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        activeRevision: raw.activeRevision,
        revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async writeStoryRevision(
    storyDir: string,
    folderId: string,
    story: UserStory
  ): Promise<UserStory> {
    const validated = UserStorySchema.parse(story);
    const manifest = await this.readStoryManifest(storyDir);
    const now = new Date().toISOString();
    const nextRevision = (manifest?.activeRevision ?? 0) + 1;
    const revisionFile = revisionFileName(nextRevision);
    const revisionsDir = this.revisionsPath(storyDir);

    await fs.mkdir(revisionsDir, { recursive: true });

    const revisionPayload: StoryRevisionFile = {
      folderId,
      storyId: validated.id,
      revision: nextRevision,
      savedAt: now,
      story: validated,
    };
    await fs.writeFile(
      join(revisionsDir, revisionFile),
      JSON.stringify(revisionPayload, null, 2),
      "utf-8"
    );

    const activePayload: ActiveStoryFile = {
      folderId,
      storyId: validated.id,
      activeRevision: nextRevision,
      updatedAt: now,
      story: validated,
    };
    await fs.writeFile(
      this.activeStoryPath(storyDir),
      JSON.stringify(activePayload, null, 2),
      "utf-8"
    );

    await fs.writeFile(
      this.userStoryPath(storyDir),
      JSON.stringify({ folderId, savedAt: now, story: validated }, null, 2),
      "utf-8"
    );

    const nextManifest: StoryManifest = {
      folderId,
      storyId: validated.id,
      createdAt: manifest?.createdAt ?? now,
      updatedAt: now,
      activeRevision: nextRevision,
      revisions: [
        ...(manifest?.revisions ?? []),
        { revision: nextRevision, file: join(REVISIONS_DIR, revisionFile), createdAt: now },
      ],
    };
    await fs.writeFile(
      this.manifestPath(storyDir),
      JSON.stringify(nextManifest, null, 2),
      "utf-8"
    );

    return validated;
  }

  private async ensureStoryRevision(
    storyDir: string,
    folderId: string,
    story: UserStory
  ): Promise<void> {
    const manifest = await this.readStoryManifest(storyDir);
    if (manifest && manifest.activeRevision > 0) return;
    await this.writeStoryRevision(storyDir, folderId, story);
  }

  private async readActiveSpec(specDir: string): Promise<Spec> {
    const active = (await this.readJsonFile(this.activeSpecPath(specDir))) as {
      spec?: unknown;
    };
    return SpecSchema.parse(active.spec);
  }

  private async readSpecManifest(
    specDir: string
  ): Promise<SpecManifest | null> {
    try {
      const raw = (await this.readJsonFile(
        this.specManifestPath(specDir)
      )) as SpecManifest;
      return {
        folderId: raw.folderId,
        storyId: raw.storyId,
        specId: raw.specId,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        activeRevision: raw.activeRevision,
        revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private revisionMetadataFromManifest(
    manifest: StoryManifest | SpecManifest | null
  ): WorkspaceArtifactRevisionMetadata {
    return {
      activeRevision: manifest?.activeRevision ?? 0,
      revisions: manifest?.revisions ?? [],
    };
  }

  private async listSpecArtifacts(
    storyDir: string
  ): Promise<WorkspaceSpecArtifactMetadata[]> {
    const specsPath = this.specsPath(storyDir);
    try {
      const entries = await fs.readdir(specsPath, { withFileTypes: true });
      const specs = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const specDir = join(specsPath, entry.name);
            const manifest = await this.readSpecManifest(specDir);
            const spec = await this.readActiveSpec(specDir);
            return {
              specId: manifest?.specId ?? entry.name,
              spec,
              revision: this.revisionMetadataFromManifest(manifest),
            };
          })
      );
      return specs.sort((a, b) => a.specId.localeCompare(b.specId));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  private async getLatestActiveSpec(
    storyDir: string
  ): Promise<{ spec: Spec; revisionId: string } | null> {
    const specsPath = this.specsPath(storyDir);
    try {
      const entries = await fs.readdir(specsPath, { withFileTypes: true });
      const specs = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const specDir = join(specsPath, entry.name);
            const manifest = await this.readSpecManifest(specDir);
            const spec = await this.readActiveSpec(specDir);
            return { manifest, spec };
          })
      );
      const latest = specs
        .filter((item) => item.manifest !== null)
        .sort((a, b) =>
          b.manifest!.updatedAt.localeCompare(a.manifest!.updatedAt)
        )[0];

      if (!latest?.manifest) return null;
      return {
        spec: latest.spec,
        revisionId: `spec:${latest.manifest.specId}:${latest.manifest.activeRevision}`,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async writeSpecRevision(
    specDir: string,
    folderId: string,
    storyId: string,
    spec: Spec
  ): Promise<Spec> {
    const validated = SpecSchema.parse(spec);
    if (validated.userStoryId !== storyId) {
      throw new WorkspaceUserStoryNotFoundError(storyId);
    }

    const manifest = await this.readSpecManifest(specDir);
    const now = new Date().toISOString();
    const nextRevision = (manifest?.activeRevision ?? 0) + 1;
    const revisionFile = specRevisionFileName(nextRevision);
    const revisionsDir = this.specRevisionsPath(specDir);

    await fs.mkdir(revisionsDir, { recursive: true });

    const revisionPayload: SpecRevisionFile = {
      folderId,
      storyId,
      specId: validated.id,
      revision: nextRevision,
      savedAt: now,
      spec: validated,
    };
    await fs.writeFile(
      join(revisionsDir, revisionFile),
      JSON.stringify(revisionPayload, null, 2),
      "utf-8"
    );

    const activePayload: ActiveSpecFile = {
      folderId,
      storyId,
      specId: validated.id,
      activeRevision: nextRevision,
      updatedAt: now,
      spec: validated,
    };
    await fs.writeFile(
      this.activeSpecPath(specDir),
      JSON.stringify(activePayload, null, 2),
      "utf-8"
    );

    const nextManifest: SpecManifest = {
      folderId,
      storyId,
      specId: validated.id,
      createdAt: manifest?.createdAt ?? now,
      updatedAt: now,
      activeRevision: nextRevision,
      revisions: [
        ...(manifest?.revisions ?? []),
        { revision: nextRevision, file: join(REVISIONS_DIR, revisionFile), createdAt: now },
      ],
    };
    await fs.writeFile(
      this.specManifestPath(specDir),
      JSON.stringify(nextManifest, null, 2),
      "utf-8"
    );

    return validated;
  }

  private async findStoryDirectory(
    folder: WorkspaceFolder,
    storyId: string
  ): Promise<string> {
    const folderPath = this.folderPath(folder);
    const entries = await fs.readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const story = await this.readActiveStory(join(folderPath, entry.name));
      if (story.id === storyId) {
        return join(folderPath, entry.name);
      }
    }

    throw new WorkspaceUserStoryNotFoundError(storyId);
  }

  async listFolders(): Promise<WorkspaceFolder[]> {
    return this.readFolders();
  }

  async createFolder(name: string): Promise<WorkspaceFolder> {
    const folders = await this.readFolders();
    const folder: WorkspaceFolder = {
      id: uuidv4(),
      name: name.trim(),
      slug: await this.uniqueSlug(name, folders),
      createdAt: new Date().toISOString(),
      storyCount: 0,
    };

    const validated = WorkspaceFolderSchema.parse(folder);
    await fs.mkdir(this.folderPath(validated), { recursive: true });
    await this.writeFolders([...folders, validated]);
    return validated;
  }

  async listUserStories(folderId: string): Promise<UserStory[]> {
    const folder = await this.getFolder(folderId);

    const folderPath = this.folderPath(folder);
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const stories = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            return this.readActiveStory(join(folderPath, entry.name));
          })
      );

      return stories.sort((a, b) => {
        const byCreatedAt = a.createdAt.localeCompare(b.createdAt);
        if (byCreatedAt !== 0) return byCreatedAt;
        return a.title.localeCompare(b.title);
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async listUserStoryArtifacts(
    folderId: string
  ): Promise<WorkspaceUserStoryArtifactMetadata[]> {
    const folder = await this.getFolder(folderId);
    const folderPath = this.folderPath(folder);

    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const artifacts = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const storyDir = join(folderPath, entry.name);
            const story = await this.readActiveStory(storyDir);
            const manifest = await this.readStoryManifest(storyDir);
            return {
              story,
              revision: this.revisionMetadataFromManifest(manifest),
              specs: await this.listSpecArtifacts(storyDir),
            };
          })
      );

      return artifacts.sort((a, b) => {
        const byCreatedAt = a.story.createdAt.localeCompare(b.story.createdAt);
        if (byCreatedAt !== 0) return byCreatedAt;
        return a.story.title.localeCompare(b.story.title);
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async resolveUserStoriesForWorkflow(
    folderId: string,
    submittedStories: UserStory[]
  ): Promise<ResolvedWorkspaceStories> {
    const folder = await this.getFolder(folderId);
    const folderPath = this.folderPath(folder);
    await fs.mkdir(folderPath, { recursive: true });

    const userStories: UserStory[] = [];
    const artifactContext: Record<string, WorkspaceArtifactContext> = {};
    const initialSpecs: Record<string, Spec> = {};

    for (const submittedStory of submittedStories) {
      let storyDir: string;
      let story: UserStory;

      try {
        storyDir = await this.findStoryDirectory(folder, submittedStory.id);
        story = await this.readActiveStory(storyDir);
        await this.ensureStoryRevision(storyDir, folderId, story);
      } catch (err) {
        if (!(err instanceof WorkspaceUserStoryNotFoundError)) throw err;
        story = UserStorySchema.parse(submittedStory);
        storyDir = join(folderPath, storyDirectoryName(story));
        await fs.mkdir(storyDir, { recursive: true });
        await this.writeStoryRevision(storyDir, folderId, story);
      }

      const manifest = await this.readStoryManifest(storyDir);
      const latestSpec = await this.getLatestActiveSpec(storyDir);
      userStories.push(story);
      if (latestSpec) {
        initialSpecs[story.id] = latestSpec.spec;
      }
      artifactContext[story.id] = {
        workspaceFolderId: folderId,
        ...(manifest && manifest.activeRevision > 0
          ? { userStoryRevisionId: `user-story:${manifest.activeRevision}` }
          : {}),
        ...(latestSpec ? { specRevisionId: latestSpec.revisionId } : {}),
      };
    }

    await this.updateFolderStoryCount(folderId);
    return { userStories, artifactContext, initialSpecs };
  }

  async getActiveStoryContext(
    folderId: string,
    storyId: string
  ): Promise<ActiveWorkspaceStoryContext> {
    const folder = await this.getFolder(folderId);
    const storyDir = await this.findStoryDirectory(folder, storyId);
    const story = await this.readActiveStory(storyDir);
    await this.ensureStoryRevision(storyDir, folderId, story);
    const storyManifest = await this.readStoryManifest(storyDir);
    const latestSpec = await this.getLatestActiveSpec(storyDir);

    return {
      story,
      ...(latestSpec ? { spec: latestSpec.spec } : {}),
      artifactContext: {
        workspaceFolderId: folderId,
        userStoryRevisionId:
          storyManifest && storyManifest.activeRevision > 0
            ? `user-story:${storyManifest.activeRevision}`
            : undefined,
        ...(latestSpec ? { specRevisionId: latestSpec.revisionId } : {}),
      },
    };
  }

  async saveUserStories(
    folderId: string,
    userStories: UserStory[]
  ): Promise<void> {
    const folder = await this.getFolder(folderId);

    const folderPath = this.folderPath(folder);
    await fs.mkdir(folderPath, { recursive: true });

    for (const story of userStories) {
      let storyPath: string;
      try {
        storyPath = await this.findStoryDirectory(folder, story.id);
      } catch (err) {
        if (!(err instanceof WorkspaceUserStoryNotFoundError)) throw err;
        storyPath = join(folderPath, storyDirectoryName(story));
      }

      await fs.mkdir(storyPath, { recursive: true });
      try {
        const activeStory = await this.readActiveStory(storyPath);
        if (sameStory(activeStory, story)) {
          await this.ensureStoryRevision(storyPath, folderId, activeStory);
          continue;
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
      await this.writeStoryRevision(storyPath, folderId, story);
    }

    await this.updateFolderStoryCount(folderId);
  }

  async updateUserStory(
    folderId: string,
    storyId: string,
    userStory: UserStory
  ): Promise<UserStory> {
    if (storyId !== userStory.id) {
      throw new WorkspaceUserStoryNotFoundError(storyId);
    }

    const folder = await this.getFolder(folderId);
    const storyDir = await this.findStoryDirectory(folder, storyId);
    const validated = UserStorySchema.parse(userStory);
    return this.writeStoryRevision(storyDir, folderId, validated);
  }

  async saveSpec(folderId: string, storyId: string, spec: Spec): Promise<Spec> {
    const folder = await this.getFolder(folderId);
    const storyDir = await this.findStoryDirectory(folder, storyId);
    const validated = SpecSchema.parse(spec);
    const specDir = this.specPath(storyDir, validated.id);

    await fs.mkdir(specDir, { recursive: true });

    try {
      const activeSpec = await this.readActiveSpec(specDir);
      if (sameSpec(activeSpec, validated)) {
        return activeSpec;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    return this.writeSpecRevision(specDir, folderId, storyId, validated);
  }

  async updateSpec(
    folderId: string,
    storyId: string,
    specId: string,
    spec: Spec
  ): Promise<Spec> {
    const validated = SpecSchema.parse(spec);
    if (validated.id !== specId) {
      throw new WorkspaceSpecNotFoundError(specId);
    }

    const folder = await this.getFolder(folderId);
    const storyDir = await this.findStoryDirectory(folder, storyId);
    const specDir = this.specPath(storyDir, specId);
    const manifest = await this.readSpecManifest(specDir);
    if (!manifest) {
      throw new WorkspaceSpecNotFoundError(specId);
    }

    let activeSpec: Spec;
    try {
      activeSpec = await this.readActiveSpec(specDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new WorkspaceSpecNotFoundError(specId);
      }
      throw err;
    }

    if (sameSpec(activeSpec, validated)) {
      return activeSpec;
    }

    return this.writeSpecRevision(specDir, folderId, storyId, validated);
  }

  async deleteUserStory(folderId: string, storyId: string): Promise<void> {
    const folder = await this.getFolder(folderId);
    const storyDir = await this.findStoryDirectory(folder, storyId);
    await fs.rm(storyDir, { recursive: true, force: false });
    await this.updateFolderStoryCount(folderId);
  }
}
