import type {
  CodeChangeSet,
  CodeContextBundle,
  LlmSettings,
  Spec,
  UserStory,
} from "@u-build/shared";
import type { CuratorFeedback } from "./state.js";
import type { QaOutput } from "../agents/QaAgentImpl.js";
import type { QaPreviewSmokeResult } from "../preview/QaPreviewSmokeValidationService.js";
import { generateSpec as defaultGenerateSpec } from "../agents/SpecAgentImpl.js";
import { loadAgentSkill as defaultLoadAgentSkill } from "../agentSkills/loadAgentSkill.js";
import { getRuntimeLlmSettings as defaultGetRuntimeLlmSettings } from "../llm/runtimeLlmSettings.js";
import { decideRouting as defaultDecideRouting } from "../agents/OdinAgentImpl.js";
import { generateFrontend as defaultGenerateFrontend } from "../agents/FrontAgentImpl.js";
import { generateQaTests as defaultGenerateQaTests } from "../agents/QaAgentImpl.js";
import { validateOutput as defaultValidateOutput } from "../agents/CuratorAgentImpl.js";
import {
  CodeChangeSetPreflightService,
  type CodeChangeSetPreflightResult,
} from "../code/CodeChangeSetPreflightService.js";
import { ReadOnlyCodeContextService } from "../../application/services/ReadOnlyCodeContextService.js";
import {
  AgentToolRegistry,
  defaultAgentToolRegistry,
} from "../../application/services/AgentToolRegistry.js";
import { z } from "zod";

export interface GenerateSpecInput {
  skill: string;
  llmSettings?: LlmSettings | undefined;
}

export interface LangGraphDependencies {
  loadAgentSkill(skillId: string): string;
  getRuntimeLlmSettings(
    threadId: string
  ): LlmSettings | undefined | Promise<LlmSettings | undefined>;
  generateSpec(userStory: UserStory, input: GenerateSpecInput): Promise<Spec>;
  decideRouting(spec: Spec, feedback?: CuratorFeedback): string[];
  generateFrontend(
    userStory: UserStory,
    spec: Spec,
    feedback: CuratorFeedback | undefined,
    llmSettings: LlmSettings | undefined,
    executionBrief: string | undefined,
    codeContext: CodeContextBundle | undefined
  ): Promise<{
    html: string;
    operations?: Array<{
      targetPath: string;
      afterContent: string;
      rationale: string;
    }>;
    inspectedFiles?: string[];
  }>;
  buildFrontendCodeContext(input: {
    projectId: string;
    projectRootPath: string;
    query: string;
  }): Promise<CodeContextBundle>;
  generateQaTests(
    userStory: UserStory,
    spec: Spec,
    feedback: CuratorFeedback | undefined,
    llmSettings: LlmSettings | undefined,
    executionBrief: string | undefined
  ): Promise<QaOutput>;
  validatePreviewSmoke?(
    previewSessionId: string
  ): Promise<QaPreviewSmokeResult>;
  validateOutput(
    spec: Spec,
    html: string,
    qaOutput: QaOutput,
    codeChangeSet: CodeChangeSet | undefined,
    llmSettings: LlmSettings | undefined,
    executionBrief: string | undefined
  ): Promise<{
    passed: boolean;
    score: number;
    notes: string;
    missingItems: string[];
    fixTarget: "front" | "qa" | "both";
  }>;
  preflightCodeChangeSet?(input: {
    changeSet: CodeChangeSet;
    projectRootPath: string;
    workflowThreadId?: string | null;
    userStoryId?: string | null;
    projectId?: string | null;
  }): Promise<CodeChangeSetPreflightResult>;
  agentToolRegistry?: AgentToolRegistry;
}

const codeContextService = new ReadOnlyCodeContextService();
const codeChangeSetPreflightService = new CodeChangeSetPreflightService();
defaultAgentToolRegistry.register({
  toolName: "search_code_readonly",
  mutatesState: false,
  inputSchema: z.object({
    projectId: z.string().uuid(),
    projectRootPath: z.string().trim().min(1),
    query: z.string().trim().min(1),
  }),
  outputSchema: z.custom<CodeContextBundle>(),
  handler: (input) => codeContextService.buildContextFromProjectRoot(input),
});

export const defaultLangGraphDependencies: LangGraphDependencies = {
  loadAgentSkill: defaultLoadAgentSkill,
  getRuntimeLlmSettings: defaultGetRuntimeLlmSettings,
  generateSpec: (userStory, input) =>
    defaultGenerateSpec(userStory, { ...input, env: process.env }),
  decideRouting: defaultDecideRouting,
  generateFrontend: defaultGenerateFrontend,
  buildFrontendCodeContext: (input) =>
    defaultAgentToolRegistry.execute<CodeContextBundle>({
      agentProfileId: "front_agent",
      toolName: "search_code_readonly",
      input,
    }),
  generateQaTests: defaultGenerateQaTests,
  validateOutput: defaultValidateOutput,
  preflightCodeChangeSet: (input) => codeChangeSetPreflightService.validate(input),
  agentToolRegistry: defaultAgentToolRegistry,
};
