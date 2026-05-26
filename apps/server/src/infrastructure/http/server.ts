import express from "express";
import cors from "cors";
import { JsonStorageAdapter } from "../adapters/JsonStorageAdapter.js";
import { SseEventStreamAdapter } from "../adapters/SseEventStreamAdapter.js";
import { WorkflowOrchestrator } from "../../domain/services/WorkflowOrchestrator.js";
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
import { SubmitHorusChatTurnUseCase } from "../../application/usecases/SubmitHorusChatTurnUseCase.js";
import { HorusOdinIntentRouter } from "../../application/services/HorusOdinIntentRouter.js";
import { createWorkflowRouter } from "./routes/workflowRoutes.js";
import { createEventRouter } from "./routes/eventRoutes.js";
import { createWorkspaceRouter } from "./routes/workspaceRoutes.js";
import { createChatRouter } from "./routes/chatRoutes.js";
import { createPreviewRouter } from "./routes/previewRoutes.js";
import { createHorusChatRouter } from "./routes/horusChatRoutes.js";
import { FileWorkspaceStore } from "../workspace/FileWorkspaceStore.js";
import { FileChatMemoryStore } from "../chat/FileChatMemoryStore.js";
import { FileFrontendProjectRegistry } from "../preview/FileFrontendProjectRegistry.js";
import { FilePreviewSessionStore } from "../preview/FilePreviewSessionStore.js";
import { ProcessBrowserPreviewAdapter } from "../preview/ProcessBrowserPreviewAdapter.js";
import { PreviewRuntimeManager } from "../preview/PreviewRuntimeManager.js";
import { PreviewEventStreamAdapter } from "../preview/PreviewEventStreamAdapter.js";
import { HorusChatAgentImpl } from "../agents/HorusChatAgentImpl.js";

export function createApp(): express.Application {
  const storage = new JsonStorageAdapter();
  const workspaceStore = new FileWorkspaceStore();
  const chatMemoryStore = new FileChatMemoryStore(workspaceStore, storage);
  const eventStream = new SseEventStreamAdapter();
  const previewEventStream = new PreviewEventStreamAdapter();
  const previewRuntime = new PreviewRuntimeManager(
    new FileFrontendProjectRegistry(),
    new FilePreviewSessionStore(),
    new ProcessBrowserPreviewAdapter(),
    previewEventStream
  );

  const orchestrator = new WorkflowOrchestrator(
    storage,
    eventStream,
    workspaceStore,
    chatMemoryStore
  );

  const startUseCase = new StartWorkflowUseCase(orchestrator, workspaceStore);
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
  const horusOdinIntentRouter = new HorusOdinIntentRouter();
  const horusChatAgent = new HorusChatAgentImpl();
  const submitHorusChatTurnUseCase = new SubmitHorusChatTurnUseCase(
    chatMemoryStore,
    previewRuntime,
    horusOdinIntentRouter,
    undefined,
    horusChatAgent,
    orchestrator
  );

  const app = express();

  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  app.use(
    "/api/workflow",
    createWorkflowRouter({
      startUseCase,
      resumeUseCase,
      statusUseCase,
      retryDecisionUseCase,
    })
  );
  app.use("/api/workspace", createWorkspaceRouter({ workspaceStore }));
  app.use("/api/chat", createChatRouter({ chatMemoryStore }));
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
  app.use("/api/events", createEventRouter(eventStream));

  app.get("/health", (_, res) => res.json({ status: "ok" }));

  return app;
}
