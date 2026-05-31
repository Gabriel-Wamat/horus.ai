import type {
  CodeChangeSet,
  CodeContextBundle,
  DesignContextBundle,
  AgentContextEnvelope,
  LlmSettings,
  OperationalMemorySummary,
  ProjectContextSnapshot,
  PromptContextBundle,
  SpecTraceabilityReport,
  Spec,
  StructuralPatchIntent,
  VisualGateResult,
  UserStory,
  WorkspaceArtifactContext,
  WorkflowEvent,
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
  type CodeChangeSetPreflightInput,
  type CodeChangeSetPreflightResult,
} from "../code/CodeChangeSetPreflightService.js";
import { DesignContextService } from "../design/DesignContextService.js";
import { VisualDesignGateService } from "../visual/VisualDesignGateService.js";
import { ReadOnlyCodeContextService } from "../../application/services/ReadOnlyCodeContextService.js";
import { RepositoryScanner } from "../../application/coding/RepositoryScanner.js";
import { TextRepositoryRetriever } from "../../application/coding/TextRepositoryRetriever.js";
import { AstPatchPlanner } from "../../application/coding/AstPatchPlanner.js";
import { TreeSitterAstAnalyzer } from "../ast/TreeSitterAstAnalyzer.js";
import { buildStructuralPatchCodeChangeSet } from "../code/buildStructuralPatchCodeChangeSet.js";
import { createKeyValueCacheFromEnv } from "../cache/createKeyValueCacheFromEnv.js";
import { createSemanticRepositoryRetrieval } from "../semantic/createSemanticRepositoryRetrieval.js";
import {
  AgentToolRegistry,
  defaultAgentToolRegistry,
} from "../../application/services/AgentToolRegistry.js";
import {
  AgentToolRuntime,
  type AgentToolRuntimeContext,
} from "../../application/services/AgentToolRuntime.js";
import { getCurrentAgentAbortSignal } from "./AgentRuntimeIsolationContext.js";
import { AgentToolLoop } from "../../application/services/AgentToolLoop.js";
import { z } from "zod";
import type { BuildPromptContextInput } from "../prompt/PromptContextAssembler.js";
import type { AgentOperationalSessionRepository } from "../../application/ports/RepositoryPorts.js";
import {
  OperationalMemoryProjector,
  type BuildOperationalMemoryInput,
} from "../../application/services/OperationalMemoryProjector.js";
import {
  SpecTraceabilityService,
  type BuildSpecTraceabilityInput,
} from "../../application/services/SpecTraceabilityService.js";
import {
  AgentContextProfileService,
  type BuildAgentContextProfileInput,
} from "../../application/services/AgentContextProfileService.js";
import {
  ProjectContextEngine,
  type BuildProjectContextSnapshotInput,
} from "../../application/services/ProjectContextEngine.js";
import { ProjectInspectionService } from "../../application/services/ProjectInspectionService.js";
import { ValidationStrategyRegistry } from "../../application/services/ValidationStrategyRegistry.js";
import { ProjectIndexManifestStore } from "../../application/services/ProjectIndexManifestStore.js";
import { RuntimeEvidenceAggregator } from "../../application/services/RuntimeEvidenceAggregator.js";
import {
  AgentDebugTraceCollector,
  type RecordAgentDebugTraceInput,
} from "../../application/services/AgentDebugTraceCollector.js";
import {
  WorkflowRunIsolation,
} from "../../application/services/WorkflowRunIsolation.js";
import { SpecTraceabilityAutoMapper } from "../../application/services/SpecTraceabilityAutoMapper.js";
import { MultiFilePatchPlanner } from "../../application/services/MultiFilePatchPlanner.js";
import type {
  MultiFilePatchPlan,
  MultiFilePatchPlannerInput,
} from "../../application/services/MultiFilePatchPlanner.js";

export interface GenerateSpecInput {
  skill: string;
  llmSettings?: LlmSettings | undefined;
  designContext?: DesignContextBundle | undefined;
  promptContext?: PromptContextBundle | undefined;
}

export interface LangGraphDependencies {
  loadAgentSkill(skillId: string): string;
  getRuntimeLlmSettings(
    threadId: string
  ): LlmSettings | undefined | Promise<LlmSettings | undefined>;
  buildPromptContext?(
    input: BuildPromptContextInput
  ): Promise<PromptContextBundle>;
  buildOperationalMemory?(
    input: BuildOperationalMemoryInput
  ): OperationalMemorySummary | Promise<OperationalMemorySummary>;
  buildSpecTraceability?(
    input: BuildSpecTraceabilityInput
  ): SpecTraceabilityReport | Promise<SpecTraceabilityReport>;
  // Deterministic traceability mapping driven by ProjectContextSnapshot
  // symbol/file evidence. Curator prefers this over the LLM-based path when
  // a snapshot is available — same SpecTraceabilityReport shape, but the
  // coverage signal is reproducible (item 5 of the agenda).
  buildAutoTraceabilityFromSnapshot?(input: {
    spec: Spec;
    userStoryId: string;
    snapshot: ProjectContextSnapshot;
  }): SpecTraceabilityReport;
  // Expands a high-level multi-file intent (rename/create/delete) into the
  // dependent structural patch intents required to keep the project
  // compiling. Front node calls this *before* buildStructuralCodeChangeSet
  // when the LLM emits a primary multi-file intent. Returns the plan so the
  // node can emit the per-file intents in order and surface diagnostics.
  planMultiFilePatch?(input: MultiFilePatchPlannerInput): MultiFilePatchPlan;
  buildAgentContextProfile?(
    input: BuildAgentContextProfileInput
  ): AgentContextEnvelope | Promise<AgentContextEnvelope>;
  // Canonical entry point for "project context for an agent". Wraps inspection,
  // code retrieval, validation policy, and edit restrictions into one
  // ProjectContextSnapshot. Downstream callers (Front/QA/Curator) should prefer
  // this over wiring ProjectInspectionService + ReadOnlyCodeContextService
  // separately. Backwards-compatible: legacy buildFrontendCodeContext still
  // exists and continues to return only the CodeContextBundle slice.
  buildProjectContextSnapshot?(
    input: BuildProjectContextSnapshotInput
  ): Promise<ProjectContextSnapshot>;
  // Live runtime evidence aggregator — preview adapters and validation
  // runners record() runtime hints here as they happen, and the Engine
  // automatically drains them on the next snapshot build.
  runtimeEvidence?: RuntimeEvidenceAggregator;
  // Per-turn debug trace collector. Workflow nodes call recordAgentDebugTrace
  // once per turn to power the "why did the agent choose this?" UI panel
  // (item 10 of the architectural agenda). Optional — when absent, nodes
  // silently skip recording.
  recordAgentDebugTrace?(input: RecordAgentDebugTraceInput): void;
  // Coordinator for git-worktree-isolated execution (item 9). Use cases that
  // start a run wrap their work in workflowRunIsolation.runIsolated() to get
  // an ephemeral worktree path when the HORUS_RUN_WORKTREE flag is on. Falls
  // through to the operator's main tree when off.
  workflowRunIsolation?: WorkflowRunIsolation;
  generateSpec(userStory: UserStory, input: GenerateSpecInput): Promise<Spec>;
  decideRouting(spec: Spec, feedback?: CuratorFeedback): string[];
  generateFrontend(
    userStory: UserStory,
    spec: Spec,
    feedback: CuratorFeedback | undefined,
    llmSettings: LlmSettings | undefined,
    executionBrief: string | undefined,
    codeContext: CodeContextBundle | undefined,
    designContext: DesignContextBundle | undefined,
    promptContext?: PromptContextBundle | undefined
  ): Promise<{
    html: string;
    operations?: Array<
      | {
          operation?: "write";
          targetPath: string;
          afterContent: string;
          rationale: string;
        }
      | {
          operation: "delete";
          targetPath: string;
          rationale: string;
        }
    >;
    structuralPatchIntents?: StructuralPatchIntent[];
    // Higher-level multi-file mutations (rename/create/delete whole files).
    // When present, Front node routes them through deps.planMultiFilePatch
    // to expand into per-file structural intents that update dependent
    // imports atomically (item 8 of the agenda). Backwards-compatible:
    // generators that do not emit this field keep producing only
    // structuralPatchIntents and the planner is not invoked.
    multiFilePrimaryIntents?: import("../../application/services/MultiFilePatchPlanner.js").MultiFilePatchPrimaryIntent[];
    inspectedFiles?: string[];
  }>;
  buildStructuralCodeChangeSet?(input: {
    workflowThreadId: string;
    userStory: UserStory;
    codeContext: CodeContextBundle;
    structuralPatchIntents: readonly StructuralPatchIntent[];
    artifactContext?: WorkspaceArtifactContext;
  }): Promise<CodeChangeSet>;
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
    designContext: DesignContextBundle | undefined,
    promptContext?: PromptContextBundle | undefined
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
    designContext: DesignContextBundle | undefined,
    promptContext?: PromptContextBundle | undefined
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
  preflightCodeChangeSet?(
    input: CodeChangeSetPreflightInput
  ): Promise<CodeChangeSetPreflightResult>;
  agentToolRegistry?: AgentToolRegistry;
  createAgentToolRuntime?(context: AgentToolRuntimeContext): AgentToolRuntime;
  agentToolLoop?: AgentToolLoop;
  agentOperationalSessions?: AgentOperationalSessionRepository;
  emitWorkflowEvent?(event: WorkflowEvent): Promise<void> | void;
}

const codeContextCache = createKeyValueCacheFromEnv(process.env);
const codeContextService = new ReadOnlyCodeContextService(
  undefined,
  undefined,
  undefined,
  new RepositoryScanner(),
  new TextRepositoryRetriever(),
  new TreeSitterAstAnalyzer(),
  createSemanticRepositoryRetrieval(process.env),
  codeContextCache
);
const designContextService = new DesignContextService();
const visualDesignGateService = new VisualDesignGateService();
const codeChangeSetPreflightService = new CodeChangeSetPreflightService();
const operationalMemoryProjector = new OperationalMemoryProjector();
const specTraceabilityService = new SpecTraceabilityService();
const agentContextProfileService = new AgentContextProfileService();
// Single canonical context engine — reuses the already-configured
// ReadOnlyCodeContextService so cache, semantic retrieval and AST analyzer are
// shared with the legacy code-context tool path.
const projectInspectionService = new ProjectInspectionService(new RepositoryScanner());
const validationStrategyRegistry = new ValidationStrategyRegistry();
const projectIndexManifestStore = new ProjectIndexManifestStore();
const runtimeEvidenceAggregator = new RuntimeEvidenceAggregator();
const agentDebugTraceCollector = new AgentDebugTraceCollector();
const workflowRunIsolation = new WorkflowRunIsolation();
const specTraceabilityAutoMapper = new SpecTraceabilityAutoMapper();
const multiFilePatchPlanner = new MultiFilePatchPlanner();
// Exported so the HTTP layer (and use cases) can mount over the same
// instances the workflow nodes write to / read from.
export const sharedAgentDebugTraceCollector = agentDebugTraceCollector;
export const sharedRuntimeEvidenceAggregator = runtimeEvidenceAggregator;
export const sharedWorkflowRunIsolation = workflowRunIsolation;
const projectContextEngine = new ProjectContextEngine({
  inspector: projectInspectionService,
  codeContext: codeContextService,
  validationStrategy: validationStrategyRegistry,
  manifestStore: projectIndexManifestStore,
  runtimeEvidence: runtimeEvidenceAggregator,
  // Reuse the same KV cache the code-context layer already uses. Snapshot
  // invalidation is keyed by mtime of editable roots, so cache stays warm
  // across consecutive turns and goes cold the moment an agent edits the
  // project. Disk manifest (.horus/index-manifest.json) records hit/miss
  // stats that survive server restarts — item 2 of the architectural agenda.
  ...(codeContextCache ? { cache: codeContextCache } : {}),
});
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
  buildOperationalMemory: (input) => operationalMemoryProjector.build(input),
  buildSpecTraceability: (input) => specTraceabilityService.build(input),
  buildAgentContextProfile: (input) => agentContextProfileService.build(input),
  buildProjectContextSnapshot: (input) => projectContextEngine.buildSnapshot(input),
  runtimeEvidence: runtimeEvidenceAggregator,
  recordAgentDebugTrace: (input) => {
    agentDebugTraceCollector.record(input);
  },
  workflowRunIsolation,
  buildAutoTraceabilityFromSnapshot: (input) =>
    specTraceabilityAutoMapper.build(input),
  planMultiFilePatch: (input) => multiFilePatchPlanner.plan(input),
  generateSpec: (userStory, input) =>
    defaultGenerateSpec(userStory, { ...input, env: process.env }),
  decideRouting: defaultDecideRouting,
  generateFrontend: defaultGenerateFrontend,
  buildFrontendCodeContext: (input) => {
    const signal = getCurrentAgentAbortSignal();
    return defaultAgentToolRegistry.execute<CodeContextBundle>({
      agentProfileId: "front_agent",
      toolName: "search_code_readonly",
      input,
      ...(signal ? { signal } : {}),
    });
  },
  buildStructuralCodeChangeSet: (input) =>
    buildStructuralPatchCodeChangeSet({
      ...input,
      astAnalyzer: new TreeSitterAstAnalyzer(),
      planner: new AstPatchPlanner(),
    }),
  buildDesignContext: (input) => designContextService.build(input),
  generateQaTests: defaultGenerateQaTests,
  validateOutput: defaultValidateOutput,
  validateVisualGate: (input) => visualDesignGateService.validate(input),
  preflightCodeChangeSet: (input) => codeChangeSetPreflightService.validate(input),
  agentToolRegistry: defaultAgentToolRegistry,
  createAgentToolRuntime: (context) =>
    new AgentToolRuntime(defaultAgentToolRegistry, withCurrentAbortSignal(context)),
  agentToolLoop: new AgentToolLoop(),
};

function withCurrentAbortSignal(
  context: AgentToolRuntimeContext
): AgentToolRuntimeContext {
  const signal = getCurrentAgentAbortSignal();
  return signal ? { ...context, signal } : context;
}
