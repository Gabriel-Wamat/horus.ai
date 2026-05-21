import { Router } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import type { StartWorkflowUseCase } from "../../../application/usecases/StartWorkflowUseCase.js";
import type { ResumeWorkflowUseCase } from "../../../application/usecases/ResumeWorkflowUseCase.js";
import type { GetWorkflowStatusUseCase } from "../../../application/usecases/GetWorkflowStatusUseCase.js";
import type { RetryDecisionUseCase } from "../../../application/usecases/RetryDecisionUseCase.js";

interface WorkflowRouteDeps {
  startUseCase: StartWorkflowUseCase;
  resumeUseCase: ResumeWorkflowUseCase;
  statusUseCase: GetWorkflowStatusUseCase;
  retryDecisionUseCase: RetryDecisionUseCase;
}

export function createWorkflowRouter(deps: WorkflowRouteDeps): Router {
  const router = Router();

  router.post("/start", async (req: Request, res: Response) => {
    try {
      const result = await deps.startUseCase.execute(req.body);
      res.status(202).json(result);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", issues: err.issues });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/resume", async (req: Request, res: Response) => {
    try {
      await deps.resumeUseCase.execute(req.body);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", issues: err.issues });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // HITL escalation: user decides whether to continue retrying after max attempts
  router.post("/retry-decision", async (req: Request, res: Response) => {
    try {
      await deps.retryDecisionUseCase.execute(req.body);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", issues: err.issues });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/status/:threadId", async (req: Request, res: Response) => {
    try {
      const state = await deps.statusUseCase.execute({
        threadId: req.params["threadId"] ?? "",
      });
      if (!state) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }
      res.json(state);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", issues: err.issues });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}