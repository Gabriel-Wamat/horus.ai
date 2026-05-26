import { z } from "zod";
import { AgentResultSchema } from "./AgentResult.js";
import { SpecSchema } from "./Spec.js";
import { UserStorySchema } from "./UserStory.js";
import { WorkspaceArtifactContextSchema } from "./WorkflowState.js";

export const ChatRoleSchema = z.enum(["user", "agent", "system"]);

export const ChatContextSnapshotSchema = z.object({
  workspaceFolderId: z.string().uuid(),
  userStoryId: z.string().uuid(),
  userStoryRevisionId: z.string().optional(),
  specRevisionId: z.string().optional(),
  workflowThreadId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  previewSessionId: z.string().uuid().optional(),
});

export const ChatSessionSchema = z.object({
  id: z.string().uuid(),
  workspaceFolderId: z.string().uuid(),
  userStoryId: z.string().uuid(),
  activeUserStoryRevisionId: z.string().optional(),
  activeSpecRevisionId: z.string().optional(),
  workflowThreadId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: ChatRoleSchema,
  body: z.string().trim().min(1),
  contextSnapshot: ChatContextSnapshotSchema,
  createdAt: z.string().datetime(),
});

export const CreateChatSessionInputSchema = z.object({
  workspaceFolderId: z.string().uuid(),
  userStoryId: z.string().uuid(),
  workflowThreadId: z.string().uuid().optional(),
});

export const AppendChatMessageInputSchema = z.object({
  role: ChatRoleSchema,
  body: z.string().trim().min(1),
  workflowThreadId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  previewSessionId: z.string().uuid().optional(),
});

export const ChatAgentContextBundleSchema = z.object({
  session: ChatSessionSchema,
  messages: z.array(ChatMessageSchema),
  activeUserStory: UserStorySchema,
  activeSpec: SpecSchema.optional(),
  artifactContext: WorkspaceArtifactContextSchema,
  previousAgentResults: z.array(AgentResultSchema),
});

export type ChatRole = z.infer<typeof ChatRoleSchema>;
export type ChatContextSnapshot = z.infer<typeof ChatContextSnapshotSchema>;
export type ChatSession = z.infer<typeof ChatSessionSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CreateChatSessionInput = z.infer<
  typeof CreateChatSessionInputSchema
>;
export type AppendChatMessageInput = z.infer<
  typeof AppendChatMessageInputSchema
>;
export type ChatAgentContextBundle = z.infer<
  typeof ChatAgentContextBundleSchema
>;
