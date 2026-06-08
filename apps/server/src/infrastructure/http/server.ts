import express from "express";
import cors from "cors";
import { readCorsOrigin } from "./corsPolicy.js";
import {
  createSecurityBoundaryMiddleware,
  resolveSecurityBoundaryPolicy,
} from "./securityBoundary.js";
import { SseEventStreamAdapter } from "../adapters/SseEventStreamAdapter.js";
import {
  WorkflowOrchestrator,
  type WorkflowCodeChangeSetApplier,
} from "../../domain/services/WorkflowOrchestrator.js";
import { StartWorkflowUseCase } from "../../application/usecases/StartWorkflowUseCase.js";
import { ResumeWorkflowUseCase } from "../../application/usecases/ResumeWorkflowUseCase.js";
import { GetWorkflowStatusUseCase } from "../../application/usecases/GetWorkflowStatusUseCase.js";
import { RetryDecisionUseCase } from "../../application/usecases/RetryDecisionUseCase.js";
import { ListFrontendProjectsUseCase } from "../../application/usecases/ListFrontendProjectsUseCase.js";
import { CreatePreviewSessionUseCase } from "../../application/usecases/CreatePreviewSessionUseCase.js";
import { StartPreviewSessionUseCase } from "../../application/usecases/StartPreviewSessionUseCase.js";
import { StopPreviewSessionUseCase } from "../../application/usecases/StopPreviewSessionUseCase.js";
import { ReloadPreviewSessionUseCase } from "../../application/usecases/ReloadPreviewSessionUseCase.js";
import { GetPreviewSessionUseCase } from "../../application/usecases/GetPreviewSessionUseCase.js";
import { SetPreviewDeviceUseCase } from "../../application/usecases/SetPreviewDeviceUseCase.js";
import { ListPreviewTimelineUseCase } from "../../application/usecases/ListPreviewTimelineUseCase.js";
import { CreateVisualInstructionDraftUseCase } from "../../application/usecases/CreateVisualInstructionDraftUseCase.js";
import { StartProjectConstructionUseCase } from "../../application/usecases/StartProjectConstructionUseCase.js";
import {
  type CodeContextReader,
  type HorusChatResponder,
  type SpecGenerationExecutor,
  SubmitHorusChatTurnUseCase,
} from "../../application/usecases/SubmitHorusChatTurnUseCase.js";
import {
  HorusOdinIntentRouter,
  LlmHorusIntentClassifier,
} from "../../application/services/HorusOdinIntentRouter.js";
import { ReadOnlyCodeContextService } from "../../application/services/ReadOnlyCodeContextService.js";
import { createWorkflowRouter } from "./routes/workflowRoutes.js";
import { createEventRouter } from "./routes/eventRoutes.js";
import { createWorkspaceRouter } from "./routes/workspaceRoutes.js";
import { createChatRouter } from "./routes/chatRoutes.js";
import { createPreviewRouter } from "./routes/previewRoutes.js";
import { createHorusChatRouter } from "./routes/horusChatRoutes.js";
import { createAgentRunFlowRouter } from "./routes/agentRunFlowRoutes.js";
import { createAgentDebugTraceRouter } from "./routes/agentDebugTraceRoutes.js";
import { sharedAgentDebugTraceCollector } from "../langgraph/dependencies.js";
import { createProjectConstructionRouter } from "./routes/projectConstructionRoutes.js";
import { createProjectFileRouter } from "./routes/projectFileRoutes.js";
import { createLlmSettingsRouter } from "./routes/llmSettingsRoutes.js";
import { createAgentSkillRouter } from "./routes/agentSkillRoutes.js";
import { createCodingRouter } from "./routes/codingRoutes.js";
import { createExecutionTaskRouter } from "./routes/executionTaskRoutes.js";
import { ProcessBrowserPreviewAdapter } from "../preview/ProcessBrowserPreviewAdapter.js";
import type { BrowserPreviewAdapter } from "../preview/NoopBrowserPreviewAdapter.js";
import { PreviewRuntimeManager } from "../preview/PreviewRuntimeManager.js";
import { QaPreviewSmokeValidationService } from "../preview/QaPreviewSmokeValidationService.js";
import { PreviewEventStreamAdapter } from "../preview/PreviewEventStreamAdapter.js";
import { HorusChatAgentImpl } from "../agents/HorusChatAgentImpl.js";
import { HorusChatToolAgent } from "../agents/HorusChatToolAgent.js";
import { createWorkflowGraph } from "../langgraph/graph.js";
import { createWorkflowCheckpointer } from "../langgraph/checkpointer.js";
import { FileMutationPreflightApplier } from "../code/FileMutationPreflightApplier.js";
import { ProjectCodeChangeSetApplier } from "../code/ProjectCodeChangeSetApplier.js";
import { PersistentWorkflowEventStream } from "../events/PersistentWorkflowEventStream.js";
import { HorusRunFlowSnapshotBuilder } from "../../application/services/HorusRunFlowSnapshotBuilder.js";
import { AgentRunbookService } from "../../application/services/AgentRunbookService.js";
import { ProjectArchiveService } from "../project/ProjectArchiveService.js";
import { ProjectConfigService } from "../project/ProjectConfigService.js";
import { ProjectDiffAnalyzer } from "../project/ProjectDiffAnalyzer.js";
import { ProjectExecutionService } from "../project/ProjectExecutionService.js";
import { ProjectFileBrowserService } from "../project/ProjectFileBrowserService.js";
import { ProjectWorkspaceService } from "../project/ProjectWorkspaceService.js";
import {
  defaultLangGraphDependencies,
  sharedRuntimeEvidenceAggregator,
  type LangGraphDependencies,
} from "../langgraph/dependencies.js";
import {
  createRepositories,
  type PersistenceRepositories,
} from "../repositories/createRepositories.js";
import { FileLlmCredentialStore } from "../llm/LlmCredentialStore.js";
import { LlmSettingsResolver } from "../llm/LlmSettingsResolver.js";
import { LangChainLlmModelProvider } from "../llm/LangChainLlmModelProvider.js";
import { RuntimeLlmSettingsStoreAdapter } from "../llm/RuntimeLlmSettingsStoreAdapter.js";
import { getRuntimeLlmSettings } from "../llm/runtimeLlmSettings.js";
import { AgentSkillValidationService } from "../agentSkills/AgentSkillValidationService.js";
import { AgentSkillRegistryService } from "../agentSkills/AgentSkillRegistryService.js";
import { AgentMemoryService } from "../../application/services/AgentMemoryService.js";
import { ArtifactCandidateService } from "../../application/services/ArtifactCandidateService.js";
import { PromptContextAssembler } from "../prompt/PromptContextAssembler.js";
import { registerProjectAgentTools } from "../../application/tools/registerProjectAgentTools.js";
import {
  AgentToolRuntime,
  type AgentToolRuntimeContext,
} from "../../application/services/AgentToolRuntime.js";
import { AgentToolLoop } from "../../application/services/AgentToolLoop.js";
import { defaultAgentProfileRegistry } from "../../application/services/AgentProfileRegistry.js";
import { ProjectInspectionService } from "../../application/services/ProjectInspectionService.js";
import { getCurrentAgentAbortSignal } from "../langgraph/AgentRuntimeIsolationContext.js";
import { CodingRuntimeOrchestrator } from "../../application/coding/CodingRuntimeOrchestrator.js";
import { RepositoryScanner } from "../../application/coding/RepositoryScanner.js";
import { TextRepositoryRetriever } from "../../application/coding/TextRepositoryRetriever.js";
import { AstAnalysisService } from "../../application/coding/AstAnalysisService.js";
import { AstPatchPlanner } from "../../application/coding/AstPatchPlanner.js";
import { AstPatchValidationGate } from "../../application/coding/AstPatchValidationGate.js";
import { CodingPatchApplier } from "../../application/coding/CodingPatchApplier.js";
import { CodingValidationRunner } from "../../application/coding/CodingValidationRunner.js";
import { TreeSitterAstAnalyzer } from "../ast/TreeSitterAstAnalyzer.js";
import { createSemanticRepositoryRetrieval } from "../semantic/createSemanticRepositoryRetrieval.js";
import { CodeChangeSetValidationWorkspace } from "../code/CodeChangeSetValidationWorkspace.js";
import { SafeCliValidationCommandRunner } from "../tools/SafeCliValidationCommandRunner.js";
import { ShellCommandRuntime } from "../tools/ShellCommandRuntime.js";

export interface CreateAppOptions {
  env?: Record<string, string | undefined>;
  repositories?: PersistenceRepositories;
  previewAdapter?: BrowserPreviewAdapter;
  workflowGraph?: ReturnType<typeof createWorkflowGraph>;
  langGraphDependencies?: LangGraphDependencies;
  horusIntentRouter?: HorusOdinIntentRouter;
  horusChatAgent?: HorusChatResponder;
  codeContextReader?: CodeContextReader;
  specGenerationExecutor?: SpecGenerationExecutor;
  codeChangeSetApplier?: WorkflowCodeChangeSetApplier;
  codingRuntimeOrchestrator?: CodingRuntimeOrchestrator;
}

export async function createApp(
  options: CreateAppOptions = {}
): Promise<express.Application> {
  const env = options.env ?? process.env;
  const corsOrigin = readCorsOrigin(env);
  const securityPolicy = resolveSecurityBoundaryPolicy(env);
  const repositories = options.repositories ?? (await createRepositories(env));
  const llmCredentials = new FileLlmCredentialStore(env);
  const llmSettingsResolver = new LlmSettingsResolver(llmCredentials);
  const llmModelProvider = new LangChainLlmModelProvider();
  const runtimeLlmSettingsStore = new RuntimeLlmSettingsStoreAdapter();
  const eventStream = new PersistentWorkflowEventStream(
    new SseEventStreamAdapter(),
    repositories.workflowEvents
  );
  const previewEventStream = new PreviewEventStreamAdapter();
  const runFlowSnapshotBuilder = new HorusRunFlowSnapshotBuilder(
    repositories.storage,
    repositories.workflowEvents,
    repositories.agentOperationalSessions,
    new AgentRunbookService()
  );
  const projectFileBrowser = new ProjectFileBrowserService(
    repositories.projectConstruction
  );
  const projectConfigService = new ProjectConfigService();
  const projectExecutionService = new ProjectExecutionService();
  const projectWorkspaceService = new ProjectWorkspaceService({
    env,
    repositoryRoot: repositories.runtimeConfig.repositoryRoot,
  });
  const projectDiffAnalyzer = new ProjectDiffAnalyzer();
  const projectArchiveService = new ProjectArchiveService(projectFileBrowser);
  const agentSkillRegistry = new AgentSkillRegistryService(
    repositories.agentSkills,
    new AgentSkillValidationService(),
    { repositoryRoot: repositories.runtimeConfig.repositoryRoot }
  );
  await agentSkillRegistry.ensureSeeded();
  const agentMemoryService = new AgentMemoryService(repositories.agentMemory);
  const artifactCandidateService = new ArtifactCandidateService(
    repositories.agentArtifacts,
    eventStream
  );
  const promptContextAssembler = new PromptContextAssembler({
    memoryService: agentMemoryService,
    skillRegistry: agentSkillRegistry,
  });
  const previewRuntime = new PreviewRuntimeManager(
    repositories.frontendProjects,
    repositories.previewSessions,
    options.previewAdapter ?? new ProcessBrowserPreviewAdapter(),
    previewEventStream
  );
  await previewRuntime.recoverStaleRuntimeSessions();
  const qaPreviewSmokeValidation = new QaPreviewSmokeValidationService(
    previewRuntime
  );
  const codeChangeSetApplier =
    options.codeChangeSetApplier ?? new ProjectCodeChangeSetApplier();
  const fileMutationApplier = new FileMutationPreflightApplier();
  const repositoryScanner = new RepositoryScanner();
  const textRepositoryRetriever = new TextRepositoryRetriever();
  const treeSitterAstAnalyzer = new TreeSitterAstAnalyzer();
  const semanticRepositoryRetrieval = createSemanticRepositoryRetrieval(env);
  const codeContextService = new ReadOnlyCodeContextService(
    undefined,
    undefined,
    undefined,
    repositoryScanner,
    textRepositoryRetriever,
    treeSitterAstAnalyzer,
    semanticRepositoryRetrieval
  );
  const projectInspector = new ProjectInspectionService(repositoryScanner);
  const activeAgentToolRegistry =
    options.langGraphDependencies?.agentToolRegistry ??
    defaultLangGraphDependencies.agentToolRegistry;
  if (activeAgentToolRegistry) {
    registerProjectAgentTools({
      registry: activeAgentToolRegistry,
      fileBrowser: projectFileBrowser,
      codeContext: codeContextService,
      projectConstruction: repositories.projectConstruction,
      codeChangeSets: repositories.codeChangeSets,
      codeChangeSetApplier,
      configService: projectConfigService,
      executionService: projectExecutionService,
      diffAnalyzer: projectDiffAnalyzer,
      fileMutationApplier,
      projectInspector,
      shellRuntime: new ShellCommandRuntime(),
      previewSmokeValidator: qaPreviewSmokeValidation,
      runtimeEvidence: sharedRuntimeEvidenceAggregator,
    });
    defaultAgentProfileRegistry.validateRegisteredToolReferences({
      registeredTools: activeAgentToolRegistry.listRegisteredTools(),
      profileIds: [
        "front_agent",
        "qa_agent",
        "curator_agent",
        "horus_chat_executor",
      ],
    });
  }
  const langGraphDependencies =
    options.langGraphDependencies ??
    ({
      ...defaultLangGraphDependencies,
      ...(activeAgentToolRegistry
        ? {
            agentToolRegistry: activeAgentToolRegistry,
            createAgentToolRuntime: (context) =>
              new AgentToolRuntime(
                activeAgentToolRegistry,
                withCurrentAbortSignal(context)
              ),
            agentToolLoop: new AgentToolLoop(),
            agentOperationalSessions: repositories.agentOperationalSessions,
            emitWorkflowEvent: (event) => eventStream.emit(event),
          }
        : {}),
      getRuntimeLlmSettings: async (threadId: string) =>
        getRuntimeLlmSettings(threadId) ??
        (await llmSettingsResolver.resolveReference()),
      validatePreviewSmoke: (previewSessionId: string) =>
        qaPreviewSmokeValidation.validate(previewSessionId),
      buildPromptContext: async (input) => {
        const run = input.workflowThreadId
          ? await repositories.agentExecutionLedger
              .getRunByThreadId(input.workflowThreadId)
              .catch(() => null)
          : null;
        return promptContextAssembler.assemble({
          ...input,
          ...(run?.id ? { runId: run.id } : {}),
        });
      },
    } satisfies LangGraphDependencies);
  const workflowGraph =
    options.workflowGraph ??
    createWorkflowGraph(
      langGraphDependencies,
      await createWorkflowCheckpointer({
        driver: repositories.driver,
        ...(repositories.driver === "file"
          ? {
              checkpointsDir:
                repositories.runtimeConfig.paths.langgraphCheckpointsDir,
            }
          : {}),
        ...(repositories.pool ? { pool: repositories.pool } : {}),
      }),
      { circuitBreakerStore: repositories.agentCircuitBreakers }
    );

  const orchestrator = new WorkflowOrchestrator(
    repositories.storage,
    eventStream,
    workflowGraph,
    repositories.workspaceStore,
    repositories.chatMemoryStore,
    repositories.codeChangeSets,
    codeChangeSetApplier,
    repositories.projectConstruction,
    repositories.agentExecutionLedger,
    agentMemoryService,
    artifactCandidateService,
    repositories.workflowEvents,
    runtimeLlmSettingsStore
  );
  void orchestrator.recoverPendingExecutions().catch((err) => {
    console.error("Failed to recover pending agent executions", err);
  });

  const startUseCase = new StartWorkflowUseCase(
    orchestrator,
    repositories.workspaceStore,
    repositories.frontendProjects,
    llmSettingsResolver
  );
  const resumeUseCase = new ResumeWorkflowUseCase(orchestrator);
  const statusUseCase = new GetWorkflowStatusUseCase(orchestrator);
  const retryDecisionUseCase = new RetryDecisionUseCase(orchestrator);
  const listProjectsUseCase = new ListFrontendProjectsUseCase(previewRuntime);
  const createSessionUseCase = new CreatePreviewSessionUseCase(previewRuntime);
  const startSessionUseCase = new StartPreviewSessionUseCase(previewRuntime);
  const stopSessionUseCase = new StopPreviewSessionUseCase(previewRuntime);
  const reloadSessionUseCase = new ReloadPreviewSessionUseCase(previewRuntime);
  const getSessionUseCase = new GetPreviewSessionUseCase(previewRuntime);
  const setDeviceUseCase = new SetPreviewDeviceUseCase(previewRuntime);
  const listTimelineUseCase = new ListPreviewTimelineUseCase(previewRuntime);
  const createInstructionDraftUseCase = new CreateVisualInstructionDraftUseCase(
    previewRuntime
  );
  const startProjectConstructionUseCase = new StartProjectConstructionUseCase(
    repositories.projectConstruction,
    repositories.workspaceStore,
    repositories.frontendProjects,
    projectWorkspaceService,
    projectConfigService,
    projectExecutionService,
    env,
    orchestrator,
    llmSettingsResolver,
    previewRuntime
  );
  const horusOdinIntentRouter =
    options.horusIntentRouter ??
    new HorusOdinIntentRouter(new LlmHorusIntentClassifier(llmModelProvider));
  const horusChatAgent =
    options.horusChatAgent ??
    (activeAgentToolRegistry
      ? new HorusChatToolAgent(activeAgentToolRegistry)
      : new HorusChatAgentImpl());
  const astAnalysisService = new AstAnalysisService(treeSitterAstAnalyzer);
  const astPatchPlanner = new AstPatchPlanner();
  const astPatchValidationGate = new AstPatchValidationGate(treeSitterAstAnalyzer);
  const codingValidationRunner = new CodingValidationRunner(
    new CodeChangeSetValidationWorkspace(),
    new SafeCliValidationCommandRunner()
  );
  const codingPatchApplier = new CodingPatchApplier(codeChangeSetApplier);
  const codingRuntimeOrchestrator =
    options.codingRuntimeOrchestrator ??
    new CodingRuntimeOrchestrator({
      taskRepository: repositories.codingTasks,
      steps: {
        scanner: repositoryScanner,
        retriever: textRepositoryRetriever,
        astAnalyzer: astAnalysisService,
        patchPlanner: astPatchPlanner,
        astValidator: astPatchValidationGate,
        runtimeValidator: codingValidationRunner,
        patchApplier: codingPatchApplier,
      },
    });
  const submitHorusChatTurnUseCase = new SubmitHorusChatTurnUseCase(
    repositories.chatMemoryStore,
    previewRuntime,
    horusOdinIntentRouter,
    options.codeContextReader ?? codeContextService,
    horusChatAgent,
    options.specGenerationExecutor ?? orchestrator,
    llmSettingsResolver,
    agentMemoryService,
    eventStream
  );

  const app = express();

  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", createSecurityBoundaryMiddleware(securityPolicy));

  app.use(
    "/api/llm",
    createLlmSettingsRouter({
      credentials: llmCredentials,
      resolver: llmSettingsResolver,
    })
  );

  app.use(
    "/api/workflow",
    createWorkflowRouter({
      startUseCase,
      resumeUseCase,
      statusUseCase,
      retryDecisionUseCase,
    })
  );
  app.use(
    "/api/workspace",
    createWorkspaceRouter({ workspaceStore: repositories.workspaceStore })
  );
  app.use(
    "/api/chat",
    createChatRouter({ chatMemoryStore: repositories.chatMemoryStore })
  );
  app.use(
    "/api/horus",
    createHorusChatRouter({ submitChatTurnUseCase: submitHorusChatTurnUseCase })
  );
  app.use(
    "/api/preview",
    createPreviewRouter({
      listProjectsUseCase,
      createSessionUseCase,
      startSessionUseCase,
      stopSessionUseCase,
      reloadSessionUseCase,
      getSessionUseCase,
      setDeviceUseCase,
      listTimelineUseCase,
      createInstructionDraftUseCase,
      eventStream: previewEventStream,
    })
  );
  app.use(
    "/api/agent-runs",
    createAgentRunFlowRouter({
      snapshotBuilder: runFlowSnapshotBuilder,
      eventStream,
    })
  );
  app.use(
    "/api/project-construction",
    createProjectConstructionRouter({
      startUseCase: startProjectConstructionUseCase,
      projectConstruction: repositories.projectConstruction,
    })
  );
  app.use(
    "/api/project-files",
    createProjectFileRouter({
      fileBrowser: projectFileBrowser,
      archiveService: projectArchiveService,
    })
  );
  app.use(
    "/api/agent-skills",
    createAgentSkillRouter({ registry: agentSkillRegistry })
  );
  app.use(
    "/api/coding",
    createCodingRouter({ orchestrator: codingRuntimeOrchestrator })
  );
  app.use(
    "/api",
    createExecutionTaskRouter({
      projectConstruction: repositories.projectConstruction,
    })
  );
  app.use("/api/events", createEventRouter(eventStream));
  // Read-only window into per-turn agent decision traces — powers the
  // "why did the agent choose this?" debug panel (item 10 of the
  // architectural agenda).
  app.use(
    "/api/agent-debug-traces",
    createAgentDebugTraceRouter({ collector: sharedAgentDebugTraceCollector })
  );

  app.get("/health", (_, res) => res.json({ status: "ok" }));
  app.get("/ready", (_, res) =>
    res.json({
      status: "ready",
      persistenceDriver: repositories.driver,
      authEnabled: securityPolicy.enabled,
      tenantBoundary: Boolean(securityPolicy.tenantId),
    })
  );

  return app;
}

function withCurrentAbortSignal(
  context: AgentToolRuntimeContext
): AgentToolRuntimeContext {
  const signal = getCurrentAgentAbortSignal();
  return signal ? { ...context, signal } : context;
}
