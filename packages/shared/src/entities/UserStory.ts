import { z } from "zod";

export const UserStorySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  priority: z.enum(["low", "medium", "high", "critical"]),
  labels: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
});

export type UserStory = z.infer<typeof UserStorySchema>;

export const CreateUserStoryInputSchema = UserStorySchema.omit({
  id: true,
  createdAt: true,
});

export type CreateUserStoryInput = z.infer<typeof CreateUserStoryInputSchema>;
