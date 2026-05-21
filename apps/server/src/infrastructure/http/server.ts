import express from "express";
import cors from "cors";
import { JsonStorageAdapter } from "../adapters/JsonStorageAdapter.js";
import { SseEventStreamAdapter } from "../adapters/SseEventStreamAdapter.js";
import { WorkflowOrchestrator } from "../../domain/services/WorkflowOrchestrator.js";
import { StartWorkflowUseCase } from "../../application/usecases/StartWorkflowUseCase.js";
import { ResumeWorkflowUseCase } from "../../application/usecases/ResumeWorkflowUseCase.js";
import { GetWorkflowStatusUseCase } from "../../application/usecases/GetWorkflowStatusUseCase.js";
import { RetryDecisionUseCase } from "../../application/usecases/RetryDecisionUseCase.js";
import { createWorkflowRouter } from "./routes/workflowRoutes.js";
import { createEventRouter } from "./routes/eventRoutes.js";

export function createApp(): express.Application {
  const storage = new JsonStorageAdapter();
  const eventStream = new SseEventStreamAdapter();

  const orchestrator = new WorkflowOrchestrator(storage, eventStream);

  const startUseCase = new StartWorkflowUseCase(orchestrator);
  const resumeUseCase = new ResumeWorkflowUseCase(orchestrator);
  const statusUseCase = new GetWorkflowStatusUseCase(orchestrator);
  const retryDecisionUseCase = new RetryDecisionUseCase(orchestrator);

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
  app.use("/api/events", createEventRouter(eventStream));

  app.get("/health", (_, res) => res.json({ status: "ok" }));

  return app;
}