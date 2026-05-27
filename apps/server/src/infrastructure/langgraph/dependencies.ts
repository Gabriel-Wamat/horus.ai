import type {
  CodeChangeSet,
  CodeContextBundle,
  DesignContextBundle,
  LlmSettings,
  Spec,
  VisualGateResult,
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
import { DesignContextService } from "../design/DesignContextService.js";
import { VisualDesignGateService } from "../visual/VisualDesignGateService.js";
import { ReadOnlyCodeContextService } from "../../application/services/ReadOnlyCodeContextService.js";
import {
  AgentToolRegistry,
  defaultAgentToolRegistry,
} from "../../application/services/AgentToolRegistry.js";
import { z } from "zod";

export interface GenerateSpecInput {
  skill: string;
  llmSettings?: LlmSettings | undefined;
  designContext?: DesignContextBundle | undefined;
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
    codeContext: CodeContextBundle | undefined,
    designContext: DesignContextBundle | undefined
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
  buildDesignContext?(input: {
    projectId?: string | undefined;
    projectRootPath: string;
  }): Promise<DesignContextBundle>;
  generateQaTests(
    userStory: UserStory,
    spec: Spec,
    feedback: CuratorFeedback | undefined,
    llmSettings: LlmSettings | undefined,
    executionBrief: string | undefined,
    designContext: DesignContextBundle | undefined
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
    executionBrief: string | undefined,
    designContext: DesignContextBundle | undefined
  ): Promise<{
    passed: boolean;
    score: number;
    notes: string;
    missingItems: string[];
    fixTarget: "front" | "qa" | "both";
  }>;
  validateVisualGate?(input: {
    spec: Spec;
    html: string;
    codeChangeSet?: CodeChangeSet | undefined;
    projectRootPath?: string | undefined;
    workflowThreadId?: string | undefined;
    userStoryId?: string | undefined;
    projectId?: string | undefined;
    designContext?: DesignContextBundle | undefined;
  }): Promise<VisualGateResult>;
  preflightCodeChangeSet?(input: {
    changeSet: CodeChangeSet;
    projectRootPath: string;
    constructionRunId?: string | null;
    workflowThreadId?: string | null;
    userStoryId?: string | null;
    projectId?: string | null;
  }): Promise<CodeChangeSetPreflightResult>;
  agentToolRegistry?: AgentToolRegistry;
}

const codeContextService = new ReadOnlyCodeContextService();
const designContextService = new DesignContextService();
const visualDesignGateService = new VisualDesignGateService();
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
  buildDesignContext: (input) => designContextService.build(input),
  generateQaTests: defaultGenerateQaTests,
  validateOutput: defaultValidateOutput,
  validateVisualGate: (input) => visualDesignGateService.validate(input),
  preflightCodeChangeSet: (input) => codeChangeSetPreflightService.validate(input),
  agentToolRegistry: defaultAgentToolRegistry,
};
