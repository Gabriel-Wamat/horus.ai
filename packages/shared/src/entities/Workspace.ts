import { z } from "zod";

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

export type WorkspaceFolder = z.infer<typeof WorkspaceFolderSchema>;
export type CreateWorkspaceFolderInput = z.infer<
  typeof CreateWorkspaceFolderInputSchema
>;
