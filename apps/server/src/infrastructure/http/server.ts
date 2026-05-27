import express from "express";
import cors from "cors";
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
  type ChatCodeChangeExecutor,
  type CodeContextReader,
  type HorusChatResponder,
  type SpecGenerationExecutor,
  SubmitHorusChatTurnUseCase,
} from "../../application/usecases/SubmitHorusChatTurnUseCase.js";
import { HorusOdinIntentRouter } from "../../application/services/HorusOdinIntentRouter.js";
import { ReadOnlyCodeContextService } from "../../application/services/ReadOnlyCodeContextService.js";
import { createWorkflowRouter } from "./routes/workflowRoutes.js";
import { createEventRouter } from "./routes/eventRoutes.js";
import { createWorkspaceRouter } from "./routes/workspaceRoutes.js";
import { createChatRouter } from "./routes/chatRoutes.js";
import { createPreviewRouter } from "./routes/previewRoutes.js";
import { createHorusChatRouter } from "./routes/horusChatRoutes.js";
import { createAgentRunFlowRouter } from "./routes/agentRunFlowRoutes.js";
import { createProjectConstructionRouter } from "./routes/projectConstructionRoutes.js";
import { createProjectFileRouter } from "./routes/projectFileRoutes.js";
import { createLlmSettingsRouter } from "./routes/llmSettingsRoutes.js";
import { ProcessBrowserPreviewAdapter } from "../preview/ProcessBrowserPreviewAdapter.js";
import type { BrowserPreviewAdapter } from "../preview/NoopBrowserPreviewAdapter.js";
import { PreviewRuntimeManager } from "../preview/PreviewRuntimeManager.js";
import { QaPreviewSmokeValidationService } from "../preview/QaPreviewSmokeValidationService.js";
import { PreviewEventStreamAdapter } from "../preview/PreviewEventStreamAdapter.js";
import { HorusChatAgentImpl } from "../agents/HorusChatAgentImpl.js";
import { createWorkflowGraph } from "../langgraph/graph.js";
import { createWorkflowCheckpointer } from "../langgraph/checkpointer.js";
import { ProjectCodeChangeSetApplier } from "../code/ProjectCodeChangeSetApplier.js";
import { PersistentWorkflowEventStream } from "../events/PersistentWorkflowEventStream.js";
import { HorusRunFlowSnapshotBuilder } from "../../application/services/HorusRunFlowSnapshotBuilder.js";
import { ProjectArchiveService } from "../project/ProjectArchiveService.js";
import { ProjectFileBrowserService } from "../project/ProjectFileBrowserService.js";
import {
  defaultLangGraphDependencies,
  type LangGraphDependencies,
} from "../langgraph/dependencies.js";
import {
  createRepositories,
  type PersistenceRepositories,
} from "../repositories/createRepositories.js";
import { FileLlmCredentialStore } from "../llm/LlmCredentialStore.js";
import { LlmSettingsResolver } from "../llm/LlmSettingsResolver.js";
import { getRuntimeLlmSettings } from "../llm/runtimeLlmSettings.js";

export interface CreateAppOptions {
  env?: Record<string, string | undefined>;
  repositories?: PersistenceRepositories;
  previewAdapter?: BrowserPreviewAdapter;
  workflowGraph?: ReturnType<typeof createWorkflowGraph>;
  langGraphDependencies?: LangGraphDependencies;
  horusIntentRouter?: HorusOdinIntentRouter;
  horusChatAgent?: HorusChatResponder;
  codeContextReader?: CodeContextReader;
  chatCodeChangeExecutor?: ChatCodeChangeExecutor;
  specGenerationExecutor?: SpecGenerationExecutor;
  codeChangeSetApplier?: WorkflowCodeChangeSetApplier;
}

function readCorsOrigin(
  env: Record<string, string | undefined>
): boolean | string[] {
  const raw = env["CORS_ORIGIN"]?.trim();
  if (!raw || raw === "*") return true;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export async function createApp(
  options: CreateAppOptions = {}
): Promise<express.Application> {
  const env = options.env ?? process.env;
  const repositories = options.repositories ?? (await createRepositories(env));
  const llmCredentials = new FileLlmCredentialStore(env);
  const llmSettingsResolver = new LlmSettingsResolver(llmCredentials);
  const eventStream = new PersistentWorkflowEventStream(
    new SseEventStreamAdapter(),
    repositories.workflowEvents
  );
  const previewEventStream = new PreviewEventStreamAdapter();
  const runFlowSnapshotBuilder = new HorusRunFlowSnapshotBuilder(
    repositories.storage,
    repositories.workflowEvents
  );
  const projectFileBrowser = new ProjectFileBrowserService(
    repositories.projectConstruction
  );
  const projectArchiveService = new ProjectArchiveService(projectFileBrowser);
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
  const langGraphDependencies =
    options.langGraphDependencies ??
    ({
      ...defaultLangGraphDependencies,
      getRuntimeLlmSettings: async (threadId: string) =>
        getRuntimeLlmSettings(threadId) ??
        (await llmSettingsResolver.resolveReference()),
      validatePreviewSmoke: (previewSessionId: string) =>
        qaPreviewSmokeValidation.validate(previewSessionId),
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
      })
    );

  const orchestrator = new WorkflowOrchestrator(
    repositories.storage,
    eventStream,
    workflowGraph,
    repositories.workspaceStore,
    repositories.chatMemoryStore,
    repositories.codeChangeSets,
    options.codeChangeSetApplier ?? new ProjectCodeChangeSetApplier()
  );

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
    undefined,
    undefined,
    undefined,
    env,
    orchestrator,
    llmSettingsResolver
  );
  const horusOdinIntentRouter =
    options.horusIntentRouter ?? new HorusOdinIntentRouter();
  const horusChatAgent = options.horusChatAgent ?? new HorusChatAgentImpl();
  const submitHorusChatTurnUseCase = new SubmitHorusChatTurnUseCase(
    repositories.chatMemoryStore,
    previewRuntime,
    horusOdinIntentRouter,
    options.codeContextReader ?? new ReadOnlyCodeContextService(),
    horusChatAgent,
    options.chatCodeChangeExecutor ?? orchestrator,
    options.specGenerationExecutor ?? orchestrator,
    llmSettingsResolver
  );

  const app = express();

  app.use(cors({ origin: readCorsOrigin(env), credentials: true }));
  app.use(express.json({ limit: "2mb" }));

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
  app.use("/api/events", createEventRouter(eventStream));

  app.get("/health", (_, res) => res.json({ status: "ok" }));

  return app;
}
