import { z } from "zod";
import {
  LlmSettingsReferenceSchema,
  LlmSettingsSchema,
  UserStorySchema,
} from "@u-build/shared";
import type {
  FrontendProject,
  LlmSettings,
  LlmSettingsReference,
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
  frontendProjectId: z.string().uuid().optional(),
  llmSettings: LlmSettingsSchema.optional(),
  llmSettingsRef: LlmSettingsReferenceSchema.optional(),
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

export interface WorkflowFrontendProjectReader {
  getProject(projectId: string): Promise<FrontendProject>;
}

export interface LlmSettingsResolverPort {
  resolveReference(
    reference?: LlmSettingsReference,
    legacySettings?: LlmSettings
  ): Promise<LlmSettings | undefined>;
}

export class StartWorkflowUseCase {
  constructor(
    private readonly orchestrator: WorkflowOrchestrator,
    private readonly workspaceStore: WorkspaceStoryStore,
    private readonly frontendProjects?: WorkflowFrontendProjectReader,
    private readonly llmSettingsResolver?: LlmSettingsResolverPort
  ) {}

  async execute(input: unknown): Promise<{ threadId: string }> {
    const validated = StartWorkflowInputSchema.parse(input);
    const resolved = await this.workspaceStore.resolveUserStoriesForWorkflow(
      validated.workspaceFolderId,
      validated.userStories
    );
    const frontendProject =
      validated.frontendProjectId && this.frontendProjects
        ? await this.frontendProjects.getProject(validated.frontendProjectId)
        : undefined;
    const llmSettings = this.llmSettingsResolver
      ? await this.llmSettingsResolver.resolveReference(
          validated.llmSettingsRef,
          validated.llmSettings
        )
      : validated.llmSettings;
    return this.orchestrator.start({
      workspaceFolderId: validated.workspaceFolderId,
      userStories: resolved.userStories,
      workspaceArtifactContext: resolved.artifactContext,
      initialSpecs: resolved.initialSpecs,
      workflowMode: (validated.workflowMode ?? "standard") as WorkflowMode,
      ...(frontendProject
        ? {
            frontendProjectId: frontendProject.id,
            frontendProjectRootPath: frontendProject.rootPath,
          }
        : {}),
      ...(llmSettings ? { llmSettings } : {}),
    });
  }
}
