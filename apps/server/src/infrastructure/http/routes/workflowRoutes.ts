import { createRequire } from "node:module";
import { Router } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import type { AgentResult } from "@u-build/shared";

// archiver is CJS — use createRequire for ESM interop
const _require = createRequire(import.meta.url);
const archiver = _require("archiver") as typeof import("archiver");
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

  router.get("/download/:threadId", async (req: Request, res: Response) => {
    try {
      const state = await deps.statusUseCase.execute({
        threadId: req.params["threadId"] ?? "",
      });
      if (!state) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      const slugify = (text: string) =>
        text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || "story";

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="horus-artifacts-${state.threadId.slice(0, 8)}.zip"`
      );

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      for (const story of state.userStories) {
        const folder = slugify(story.title);
        const results = state.agentResults[story.id] ?? [];

        const frontResult = results.find(
          (r: AgentResult) => r.status === "success" && r.agentName === "front"
        );
        const frontHtml =
          frontResult?.status === "success"
            ? (frontResult.output["html"] as string | undefined)
            : undefined;
        if (frontHtml) {
          archive.append(frontHtml, { name: `${folder}/page.html` });
        }

        const qaResult = results.find(
          (r: AgentResult) => r.status === "success" && r.agentName === "qa"
        );
        const testCases =
          qaResult?.status === "success" ? qaResult.output["testCases"] : undefined;
        if (testCases) {
          archive.append(JSON.stringify(testCases, null, 2), {
            name: `${folder}/test-cases.json`,
          });
        }
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