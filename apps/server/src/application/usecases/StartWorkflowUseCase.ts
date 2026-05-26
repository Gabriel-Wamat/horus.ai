import { z } from "zod";
import { LlmSettingsSchema, UserStorySchema } from "@u-build/shared";
import type {
  Spec,
  UserStory,
  WorkflowMode,
  WorkspaceArtifactContext,
} from "@u-build/shared";
import type { WorkflowOrchestrator } from "../../domain/services/WorkflowOrchestrator.js";

export const StartWorkflowInputSchema = z.object({
  workspaceFolderId: z.string().uuid(),
  userStories: z.array(UserStorySchema).min(1).max(50),
  workflowMode: z.enum(["standard", "spec_generation"]).optional(),
  llmSettings: LlmSettingsSchema.optional(),
});

export type StartWorkflowInput = z.infer<typeof StartWorkflowInputSchema>;

export interface WorkspaceStoryStore {
  saveUserStories(folderId: string, userStories: UserStory[]): Promise<void>;
  resolveUserStoriesForWorkflow(
    folderId: string,
    userStories: UserStory[]
  ): Promise<{
    userStories: UserStory[];
    artifactContext: Record<string, WorkspaceArtifactContext>;
    initialSpecs: Record<string, Spec>;
  }>;
}

export class StartWorkflowUseCase {
  constructor(
    private readonly orchestrator: WorkflowOrchestrator,
    private readonly workspaceStore: WorkspaceStoryStore
  ) {}

  async execute(input: unknown): Promise<{ threadId: string }> {
    const validated = StartWorkflowInputSchema.parse(input);
    const resolved = await this.workspaceStore.resolveUserStoriesForWorkflow(
      validated.workspaceFolderId,
      validated.userStories
    );
    return this.orchestrator.start({
      workspaceFolderId: validated.workspaceFolderId,
      userStories: resolved.userStories,
      workspaceArtifactContext: resolved.artifactContext,
      initialSpecs: resolved.initialSpecs,
      workflowMode: (validated.workflowMode ?? "standard") as WorkflowMode,
      ...(validated.llmSettings ? { llmSettings: validated.llmSettings } : {}),
    });
  }
}
