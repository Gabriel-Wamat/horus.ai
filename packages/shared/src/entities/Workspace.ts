import { z } from "zod";
import { SpecSchema } from "./Spec.js";
import { UserStorySchema } from "./UserStory.js";

export const WorkspaceFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  createdAt: z.string().datetime(),
  storyCount: z.number().int().min(0).default(0),
});

export const CreateWorkspaceFolderInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const WorkspaceArtifactRevisionSchema = z.object({
  activeRevision: z.number().int().positive(),
  revisions: z.array(
    z.object({
      revision: z.number().int().positive(),
      file: z.string().trim().min(1),
      createdAt: z.string().datetime(),
    })
  ),
});

export const WorkspaceSpecArtifactSchema = z.object({
  specId: z.string().trim().min(1),
  spec: SpecSchema.optional(),
  revision: WorkspaceArtifactRevisionSchema,
});

export const WorkspaceUserStoryArtifactSchema = z.object({
  story: UserStorySchema,
  revision: WorkspaceArtifactRevisionSchema,
  specs: z.array(WorkspaceSpecArtifactSchema),
});

export const WorkspaceFoldersResponseSchema = z.object({
  folders: z.array(WorkspaceFolderSchema),
});

export const WorkspaceFolderResponseSchema = z.object({
  folder: WorkspaceFolderSchema,
});

export const WorkspaceUserStoriesResponseSchema = z.object({
  userStories: z.array(UserStorySchema),
  artifacts: z.array(WorkspaceUserStoryArtifactSchema).optional(),
});

export const WorkspaceArtifactsResponseSchema = z.object({
  artifacts: z.array(WorkspaceUserStoryArtifactSchema),
});

export const WorkspaceUserStoryResponseSchema = z.object({
  userStory: UserStorySchema,
});

export const WorkspaceSpecResponseSchema = z.object({
  spec: SpecSchema,
});

export type WorkspaceFolder = z.infer<typeof WorkspaceFolderSchema>;
export type CreateWorkspaceFolderInput = z.infer<
  typeof CreateWorkspaceFolderInputSchema
>;
export type WorkspaceArtifactRevision = z.infer<
  typeof WorkspaceArtifactRevisionSchema
>;
export type WorkspaceSpecArtifact = z.infer<typeof WorkspaceSpecArtifactSchema>;
export type WorkspaceUserStoryArtifact = z.infer<
  typeof WorkspaceUserStoryArtifactSchema
>;
export type WorkspaceFoldersResponse = z.infer<
  typeof WorkspaceFoldersResponseSchema
>;
export type WorkspaceFolderResponse = z.infer<
  typeof WorkspaceFolderResponseSchema
>;
export type WorkspaceUserStoriesResponse = z.infer<
  typeof WorkspaceUserStoriesResponseSchema
>;
export type WorkspaceArtifactsResponse = z.infer<
  typeof WorkspaceArtifactsResponseSchema
>;
export type WorkspaceUserStoryResponse = z.infer<
  typeof WorkspaceUserStoryResponseSchema
>;
export type WorkspaceSpecResponse = z.infer<typeof WorkspaceSpecResponseSchema>;
