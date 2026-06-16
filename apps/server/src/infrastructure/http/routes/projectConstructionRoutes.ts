import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import {
  ProjectConstructionRunNotFoundError,
  ProjectWorkspaceNotFoundError,
} from "../../repositories/FileProjectConstructionRepository.js";
import type { ProjectConstructionRepository } from "../../repositories/contracts.js";
import {
  ProjectConstructionValidationError,
  type StartProjectConstructionUseCase,
} from "../../../application/usecases/StartProjectConstructionUseCase.js";

interface ProjectConstructionRouteDeps {
  startUseCase: StartProjectConstructionUseCase;
  projectConstruction: ProjectConstructionRepository;
}

export function createProjectConstructionRouter(
  deps: ProjectConstructionRouteDeps
): Router {
  const router = Router();

  router.get("/workspaces", async (_req: Request, res: Response) => {
    try {
      res.json({
        projectWorkspaces: await deps.projectConstruction.listProjectWorkspaces(),
      });
    } catch (err) {
      handleProjectConstructionError(res, err);
    }
  });

  router.post("/runs", async (req: Request, res: Response) => {
    try {
      const result = await deps.startUseCase.execute(req.body);
      res.status(202).json(result);
    } catch (err) {
      handleProjectConstructionError(res, err);
    }
  });

  router.get("/runs/:runId", async (req: Request, res: Response) => {
    try {
      const run = await deps.projectConstruction.getConstructionRun(
        req.params["runId"] ?? ""
      );
      const commandRuns = await deps.projectConstruction.listCommandRuns(run.id);
      const qualityGates = await deps.projectConstruction.listQualityGates(run.id);
      res.json({ constructionRun: run, commandRuns, qualityGates });
    } catch (err) {
      handleProjectConstructionError(res, err);
    }
  });

  return router;
}

function handleProjectConstructionError(res: Response, err: unknown): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  if (err instanceof ProjectConstructionValidationError) {
    res.status(409).json({ error: "Project construction rejected", message: err.message });
    return;
  }
  if (
    err instanceof ProjectWorkspaceNotFoundError ||
    err instanceof ProjectConstructionRunNotFoundError
  ) {
    res.status(404).json({ error: "Not found", message: err.message });
    return;
  }
  res.status(500).json({
    error: "Internal server error",
    message: err instanceof Error ? err.message : String(err),
  });
}
