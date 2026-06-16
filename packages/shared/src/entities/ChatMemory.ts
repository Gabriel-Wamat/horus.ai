import { z } from "zod";
import { AgentResultSchema } from "./AgentResult.js";
import { SpecSchema } from "./Spec.js";
import { UserStorySchema } from "./UserStory.js";
import { WorkspaceArtifactContextSchema } from "./WorkflowState.js";

export const ChatRoleSchema = z.enum(["user", "agent", "system"]);

export const ChatMessageEventTypeSchema = z.enum([
  "message",
  "progress",
  "evidence",
  "warning",
  "error",
  "action_state",
  "trace",
]);

export const ChatMessageVisibilitySchema = z.enum([
  "user",
  "developer",
  "hidden",
]);

export const ChatMessageDeliveryStatusSchema = z.enum([
  "pending",
  "streaming",
  "persisted",
  "failed",
  "superseded",
]);

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
  sequence: z.number().int().nonnegative().default(0),
  role: ChatRoleSchema,
  eventType: ChatMessageEventTypeSchema.default("message"),
  visibility: ChatMessageVisibilitySchema.default("user"),
  deliveryStatus: ChatMessageDeliveryStatusSchema.default("persisted"),
  body: z.string().trim().min(1),
  compactBody: z.string().trim().min(1).optional(),
  turnId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  attemptId: z.string().uuid().optional(),
  contextSnapshot: ChatContextSnapshotSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
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
  eventType: ChatMessageEventTypeSchema.default("message"),
  visibility: ChatMessageVisibilitySchema.default("user"),
  deliveryStatus: ChatMessageDeliveryStatusSchema.default("persisted"),
  compactBody: z.string().trim().min(1).optional(),
  turnId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  attemptId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
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

export const ChatSessionsResponseSchema = z.object({
  sessions: z.array(ChatSessionSchema),
});

export const ChatSessionResponseSchema = z.object({
  session: ChatSessionSchema,
});

export const ChatMessagesResponseSchema = z.object({
  messages: z.array(ChatMessageSchema),
});

export const ChatMessageResponseSchema = z.object({
  message: ChatMessageSchema,
});

export const ChatContextResponseSchema = z.object({
  context: ChatAgentContextBundleSchema,
});

export type ChatRole = z.infer<typeof ChatRoleSchema>;
export type ChatMessageEventType = z.infer<typeof ChatMessageEventTypeSchema>;
export type ChatMessageVisibility = z.infer<typeof ChatMessageVisibilitySchema>;
export type ChatMessageDeliveryStatus = z.infer<
  typeof ChatMessageDeliveryStatusSchema
>;
export type ChatContextSnapshot = z.infer<typeof ChatContextSnapshotSchema>;
export type ChatSession = z.infer<typeof ChatSessionSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CreateChatSessionInput = z.infer<
  typeof CreateChatSessionInputSchema
>;
export type AppendChatMessageInput = z.input<
  typeof AppendChatMessageInputSchema
>;
export type ChatAgentContextBundle = z.infer<
  typeof ChatAgentContextBundleSchema
>;
export type ChatSessionsResponse = z.infer<typeof ChatSessionsResponseSchema>;
export type ChatSessionResponse = z.infer<typeof ChatSessionResponseSchema>;
export type ChatMessagesResponse = z.infer<typeof ChatMessagesResponseSchema>;
export type ChatMessageResponse = z.infer<typeof ChatMessageResponseSchema>;
export type ChatContextResponse = z.infer<typeof ChatContextResponseSchema>;
