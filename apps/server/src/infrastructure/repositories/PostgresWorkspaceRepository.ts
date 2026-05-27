import {
  SpecSchema,
  UserStorySchema,
  WorkspaceFolderSchema,
  type Spec,
  type UserStory,
  type WorkspaceArtifactContext,
  type WorkspaceFolder,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import {
  WorkspaceFolderNotFoundError,
  WorkspaceSpecNotFoundError,
  WorkspaceUserStoryNotFoundError,
  type ActiveWorkspaceStoryContext,
  type ResolvedWorkspaceStories,
  type WorkspaceSpecArtifactMetadata,
  type WorkspaceUserStoryArtifactMetadata,
} from "../workspace/FileWorkspaceStore.js";
import type { WorkspaceRepository } from "./contracts.js";
import { json, newId, slugify, toIso } from "./postgresUtils.js";

interface FolderRow {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  story_count: number;
}

interface StoryRow {
  id: string;
  folder_id: string;
  title: string;
  description: string;
  acceptance_criteria: unknown;
  priority: UserStory["priority"];
  labels: unknown;
  created_at: Date;
  updated_at: Date;
  active_revision: number;
}

interface SpecRow {
  id: string;
  folder_id: string;
  story_id: string;
  version: number;
  summary: string;
  technical_approach: string;
  components: unknown;
  api_endpoints: unknown;
  data_models: unknown;
  acceptance_criteria: unknown;
  generated_at: Date;
  approved_at: Date | null;
  approved_by: "human" | "auto" | null;
  active_revision: number;
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly pool: PgPool) {}

  async listFolders(): Promise<WorkspaceFolder[]> {
    const result = await this.pool.query<FolderRow>(
      "SELECT * FROM workspace_folders ORDER BY created_at, name"
    );
    return result.rows.map(folderFromRow);
  }

  async createFolder(name: string): Promise<WorkspaceFolder> {
    const folders = await this.listFolders();
    const used = new Set(folders.map((folder) => folder.slug));
    const base = slugify(name, "workspace");
    let slug = base;
    let counter = 2;
    while (used.has(slug)) {
      slug = `${base}-${counter}`;
      counter += 1;
    }

    const folder = WorkspaceFolderSchema.parse({
      id: newId(),
      name: name.trim(),
      slug,
      createdAt: new Date().toISOString(),
      storyCount: 0,
    });

    await this.pool.query(
      `
      INSERT INTO workspace_folders (id, name, slug, created_at, story_count)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [folder.id, folder.name, folder.slug, folder.createdAt, folder.storyCount]
    );
    return folder;
  }

  async listUserStories(folderId: string): Promise<UserStory[]> {
    await this.assertFolder(folderId);
    const result = await this.pool.query<StoryRow>(
      "SELECT * FROM user_stories WHERE folder_id = $1 ORDER BY created_at, title",
      [folderId]
    );
    return result.rows.map(storyFromRow);
  }

  async listUserStoryArtifacts(
    folderId: string
  ): Promise<WorkspaceUserStoryArtifactMetadata[]> {
    await this.assertFolder(folderId);
    const stories = await this.pool.query<StoryRow>(
      "SELECT * FROM user_stories WHERE folder_id = $1 ORDER BY created_at, title",
      [folderId]
    );

    const artifacts: WorkspaceUserStoryArtifactMetadata[] = [];
    for (const row of stories.rows) {
      const story = storyFromRow(row);
      artifacts.push({
        story,
        revision: await this.storyRevisionMetadata(story.id),
        specs: await this.listSpecArtifacts(story.id),
      });
    }
    return artifacts;
  }

  async resolveUserStoriesForWorkflow(
    folderId: string,
    submittedStories: UserStory[]
  ): Promise<ResolvedWorkspaceStories> {
    await this.assertFolder(folderId);
    const userStories: UserStory[] = [];
    const artifactContext: Record<string, WorkspaceArtifactContext> = {};
    const initialSpecs: Record<string, Spec> = {};

    for (const submittedStory of submittedStories) {
      const story = await this.ensureStory(folderId, submittedStory);
      const storyRevision = await this.storyRevisionMetadata(story.id);
      const latestSpec = await this.getLatestActiveSpec(story.id);
      userStories.push(story);
      if (latestSpec) {
        initialSpecs[story.id] = latestSpec.spec;
      }
      artifactContext[story.id] = {
        workspaceFolderId: folderId,
        userStoryRevisionId: `user-story:${storyRevision.activeRevision}`,
        ...(latestSpec ? { specRevisionId: latestSpec.revisionId } : {}),
      };
    }

    await this.refreshStoryCount(folderId);
    return { userStories, artifactContext, initialSpecs };
  }

  async getActiveStoryContext(
    folderId: string,
    storyId: string
  ): Promise<ActiveWorkspaceStoryContext> {
    await this.assertFolder(folderId);
    const story = await this.getStory(folderId, storyId);
    const storyRevision = await this.storyRevisionMetadata(storyId);
    const latestSpec = await this.getLatestActiveSpec(storyId);

    return {
      story,
      ...(latestSpec ? { spec: latestSpec.spec } : {}),
      artifactContext: {
        workspaceFolderId: folderId,
        userStoryRevisionId: `user-story:${storyRevision.activeRevision}`,
        ...(latestSpec ? { specRevisionId: latestSpec.revisionId } : {}),
      },
    };
  }

  async saveUserStories(folderId: string, userStories: UserStory[]): Promise<void> {
    await this.assertFolder(folderId);
    for (const story of userStories) {
      await this.ensureStory(folderId, story);
    }
    await this.refreshStoryCount(folderId);
  }

  async updateUserStory(
    folderId: string,
    storyId: string,
    userStory: UserStory
  ): Promise<UserStory> {
    if (storyId !== userStory.id) throw new WorkspaceUserStoryNotFoundError(storyId);
    await this.getStory(folderId, storyId);
    return this.writeStoryRevision(folderId, UserStorySchema.parse(userStory));
  }

  async saveSpec(folderId: string, storyId: string, spec: Spec): Promise<Spec> {
    await this.getStory(folderId, storyId);
    return this.writeSpecRevision(folderId, storyId, SpecSchema.parse(spec));
  }

  async updateSpec(
    folderId: string,
    storyId: string,
    specId: string,
    spec: Spec
  ): Promise<Spec> {
    const validated = SpecSchema.parse(spec);
    if (validated.id !== specId) throw new WorkspaceSpecNotFoundError(specId);
    await this.getSpec(folderId, storyId, specId);
    return this.writeSpecRevision(folderId, storyId, validated);
  }

  async deleteUserStory(folderId: string, storyId: string): Promise<void> {
    await this.getStory(folderId, storyId);
    await this.pool.query(
      "DELETE FROM user_stories WHERE folder_id = $1 AND id = $2",
      [folderId, storyId]
    );
    await this.refreshStoryCount(folderId);
  }

  private async assertFolder(folderId: string): Promise<void> {
    const result = await this.pool.query("SELECT 1 FROM workspace_folders WHERE id = $1", [
      folderId,
    ]);
    if (result.rowCount === 0) throw new WorkspaceFolderNotFoundError(folderId);
  }

  private async getStory(folderId: string, storyId: string): Promise<UserStory> {
    const result = await this.pool.query<StoryRow>(
      "SELECT * FROM user_stories WHERE folder_id = $1 AND id = $2",
      [folderId, storyId]
    );
    const row = result.rows[0];
    if (!row) throw new WorkspaceUserStoryNotFoundError(storyId);
    return storyFromRow(row);
  }

  private async getSpec(
    folderId: string,
    storyId: string,
    specId: string
  ): Promise<Spec> {
    const result = await this.pool.query<SpecRow>(
      "SELECT * FROM specs WHERE folder_id = $1 AND story_id = $2 AND id = $3",
      [folderId, storyId, specId]
    );
    const row = result.rows[0];
    if (!row) throw new WorkspaceSpecNotFoundError(specId);
    return specFromRow(row);
  }

  private async ensureStory(
    folderId: string,
    submittedStory: UserStory
  ): Promise<UserStory> {
    const existing = await this.pool.query<StoryRow>(
      "SELECT * FROM user_stories WHERE folder_id = $1 AND id = $2",
      [folderId, submittedStory.id]
    );
    if (existing.rows[0]) return storyFromRow(existing.rows[0]);
    return this.writeStoryRevision(folderId, UserStorySchema.parse(submittedStory));
  }

  private async writeStoryRevision(
    folderId: string,
    story: UserStory
  ): Promise<UserStory> {
    const validated = UserStorySchema.parse(story);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ active_revision: number }>(
        "SELECT active_revision FROM user_stories WHERE id = $1 AND folder_id = $2 FOR UPDATE",
        [validated.id, folderId]
      );
      const nextRevision = (existing.rows[0]?.active_revision ?? 0) + 1;
      const now = new Date().toISOString();

      await client.query(
        `
        INSERT INTO user_stories (
          id, folder_id, title, description, acceptance_criteria, priority,
          labels, created_at, updated_at, active_revision
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          acceptance_criteria = EXCLUDED.acceptance_criteria,
          priority = EXCLUDED.priority,
          labels = EXCLUDED.labels,
          updated_at = EXCLUDED.updated_at,
          active_revision = EXCLUDED.active_revision
        `,
        [
          validated.id,
          folderId,
          validated.title,
          validated.description,
          json(validated.acceptanceCriteria),
          validated.priority,
          json(validated.labels),
          validated.createdAt,
          now,
          nextRevision,
        ]
      );

      await client.query(
        `
        INSERT INTO user_story_revisions (id, folder_id, story_id, revision, story, saved_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        `,
        [newId(), folderId, validated.id, nextRevision, json(validated), now]
      );
      await client.query("COMMIT");
      return validated;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async writeSpecRevision(
    folderId: string,
    storyId: string,
    spec: Spec
  ): Promise<Spec> {
    const validated = SpecSchema.parse(spec);
    if (validated.userStoryId !== storyId) {
      throw new WorkspaceUserStoryNotFoundError(storyId);
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ active_revision: number }>(
        "SELECT active_revision FROM specs WHERE id = $1 AND story_id = $2 FOR UPDATE",
        [validated.id, storyId]
      );
      const nextRevision = (existing.rows[0]?.active_revision ?? 0) + 1;
      const approvedAt = validated.approvedAt ?? null;
      const approvedBy = validated.approvedBy ?? null;
      const now = new Date().toISOString();

      await client.query(
        `
        INSERT INTO specs (
          id, folder_id, story_id, version, summary, technical_approach,
          components, api_endpoints, data_models, acceptance_criteria,
          generated_at, approved_at, approved_by, active_revision
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14)
        ON CONFLICT (id) DO UPDATE SET
          version = EXCLUDED.version,
          summary = EXCLUDED.summary,
          technical_approach = EXCLUDED.technical_approach,
          components = EXCLUDED.components,
          api_endpoints = EXCLUDED.api_endpoints,
          data_models = EXCLUDED.data_models,
          acceptance_criteria = EXCLUDED.acceptance_criteria,
          generated_at = EXCLUDED.generated_at,
          approved_at = EXCLUDED.approved_at,
          approved_by = EXCLUDED.approved_by,
          active_revision = EXCLUDED.active_revision
        `,
        [
          validated.id,
          folderId,
          storyId,
          validated.version,
          validated.summary,
          validated.technicalApproach,
          json(validated.components),
          json(validated.apiEndpoints),
          json(validated.dataModels),
          json(validated.acceptanceCriteria),
          validated.generatedAt,
          approvedAt,
          approvedBy,
          nextRevision,
        ]
      );

      await client.query(
        `
        INSERT INTO spec_revisions (id, folder_id, story_id, spec_id, revision, spec, saved_at)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        `,
        [newId(), folderId, storyId, validated.id, nextRevision, json(validated), now]
      );
      await client.query("COMMIT");
      return validated;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async storyRevisionMetadata(storyId: string) {
    const result = await this.pool.query<{
      revision: number;
      saved_at: Date;
    }>(
      "SELECT revision, saved_at FROM user_story_revisions WHERE story_id = $1 ORDER BY revision",
      [storyId]
    );
    return {
      activeRevision: result.rows.at(-1)?.revision ?? 0,
      revisions: result.rows.map((row) => ({
        revision: row.revision,
        file: `postgres:user_story_revisions:${storyId}:${row.revision}`,
        createdAt: toIso(row.saved_at),
      })),
    };
  }

  private async specRevisionMetadata(specId: string) {
    const result = await this.pool.query<{
      revision: number;
      saved_at: Date;
    }>(
      "SELECT revision, saved_at FROM spec_revisions WHERE spec_id = $1 ORDER BY revision",
      [specId]
    );
    return {
      activeRevision: result.rows.at(-1)?.revision ?? 0,
      revisions: result.rows.map((row) => ({
        revision: row.revision,
        file: `postgres:spec_revisions:${specId}:${row.revision}`,
        createdAt: toIso(row.saved_at),
      })),
    };
  }

  private async listSpecArtifacts(
    storyId: string
  ): Promise<WorkspaceSpecArtifactMetadata[]> {
    const result = await this.pool.query<SpecRow>(
      "SELECT * FROM specs WHERE story_id = $1 ORDER BY generated_at, id",
      [storyId]
    );
    const specs: WorkspaceSpecArtifactMetadata[] = [];
    for (const row of result.rows) {
      const spec = specFromRow(row);
      specs.push({
        specId: spec.id,
        spec,
        revision: await this.specRevisionMetadata(spec.id),
      });
    }
    return specs;
  }

  private async getLatestActiveSpec(
    storyId: string
  ): Promise<{ spec: Spec; revisionId: string } | null> {
    const result = await this.pool.query<SpecRow>(
      "SELECT * FROM specs WHERE story_id = $1 ORDER BY generated_at DESC, id DESC LIMIT 1",
      [storyId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      spec: specFromRow(row),
      revisionId: `spec:${row.id}:${row.active_revision}`,
    };
  }

  private async refreshStoryCount(folderId: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE workspace_folders
      SET story_count = (
        SELECT count(*)::integer FROM user_stories WHERE folder_id = $1
      )
      WHERE id = $1
      `,
      [folderId]
    );
  }
}

function folderFromRow(row: FolderRow): WorkspaceFolder {
  return WorkspaceFolderSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: toIso(row.created_at),
    storyCount: row.story_count,
  });
}

function storyFromRow(row: StoryRow): UserStory {
  return UserStorySchema.parse({
    id: row.id,
    title: row.title,
    description: row.description,
    acceptanceCriteria: row.acceptance_criteria,
    priority: row.priority,
    labels: row.labels,
    createdAt: toIso(row.created_at),
  });
}

function specFromRow(row: SpecRow): Spec {
  return SpecSchema.parse({
    id: row.id,
    userStoryId: row.story_id,
    version: row.version,
    summary: row.summary,
    technicalApproach: row.technical_approach,
    components: row.components,
    apiEndpoints: row.api_endpoints,
    dataModels: row.data_models,
    acceptanceCriteria: row.acceptance_criteria,
    generatedAt: toIso(row.generated_at),
    ...(row.approved_at ? { approvedAt: toIso(row.approved_at) } : {}),
    ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
  });
}
