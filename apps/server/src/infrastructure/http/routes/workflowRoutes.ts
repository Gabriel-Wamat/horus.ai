import { createRequire } from "node:module";
import { Router } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { WorkflowResumeUnavailableError } from "../../../domain/services/resumeCheckpoint.js";
import { buildWorkflowArtifactFiles } from "../artifacts.js";
import { WorkspaceFolderNotFoundError } from "../../workspace/FileWorkspaceStore.js";

// archiver is CJS — use createRequire for ESM interop
const _require = createRequire(import.meta.url);
const archiver = _require("archiver") as typeof import("archiver");
import type { StartWorkflowUseCase } from "../../../application/usecases/StartWorkflowUseCase.js";
import type { ResumeWorkflowUseCase } from "../../../application/usecases/ResumeWorkflowUseCase.js";
import type { GetWorkflowStatusUseCase } from "../../../application/usecases/GetWorkflowStatusUseCase.js";
import type { RetryDecisionUseCase } from "../../../application/usecases/RetryDecisionUseCase.js";
import type { CuratorReviewDecisionUseCase } from "../../../application/usecases/CuratorReviewDecisionUseCase.js";
import type { WorkflowFolderLookup } from "../../repositories/createRepositories.js";

interface WorkflowRouteDeps {
  startUseCase: StartWorkflowUseCase;
  resumeUseCase: ResumeWorkflowUseCase;
  statusUseCase: GetWorkflowStatusUseCase;
  retryDecisionUseCase: RetryDecisionUseCase;
  curatorReviewDecisionUseCase: CuratorReviewDecisionUseCase;
  folderLookup: WorkflowFolderLookup;
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
      if (err instanceof WorkspaceFolderNotFoundError) {
        res.status(404).json({ error: "Workspace folder not found", message: err.message });
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
      if (err instanceof WorkflowResumeUnavailableError) {
        res.status(409).json({
          error: "Workflow checkpoint unavailable",
          message: err.message,
        });
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
      if (err instanceof WorkflowResumeUnavailableError) {
        res.status(409).json({
          error: "Workflow checkpoint unavailable",
          message: err.message,
        });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/curator-review-decision", async (req: Request, res: Response) => {
    try {
      await deps.curatorReviewDecisionUseCase.execute(req.body);
      res.status(204).send();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", issues: err.issues });
        return;
      }
      if (err instanceof WorkflowResumeUnavailableError) {
        res.status(409).json({
          error: "Workflow checkpoint unavailable",
          message: err.message,
        });
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

  router.get("/folder/:folderId/thread", async (req: Request, res: Response) => {
    try {
      const folderId = req.params["folderId"] ?? "";
      if (!folderId) {
        res.status(400).json({ error: "Missing folderId" });
        return;
      }
      const threadId = await deps.folderLookup.loadLatestByFolder(folderId);
      if (!threadId) {
        res.status(404).json({ error: "No thread found for folder" });
        return;
      }
      res.json({ threadId });
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/download/:threadId", async (req: Request, res: Response) => {
    try {
      const state = await deps.statusUseCase.execute({
        threadId: req.params["threadId"] ?? "",
      });
      if (!state) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="horus-artifacts-${state.threadId.slice(0, 8)}.zip"`
      );

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      for (const file of buildWorkflowArtifactFiles(state)) {
        archive.append(file.content, { name: file.name });
      }

      await archive.finalize();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "Validation failed", issues: err.issues });
        return;
      }
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  return router;
}
