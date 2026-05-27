import { Router } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  CreatePreviewSessionInputSchema,
  CreateVisualInstructionDraftInputSchema,
  SetPreviewDeviceInputSchema,
  type IPreviewEventStream,
} from "@u-build/shared";
import type { ListFrontendProjectsUseCase } from "../../../application/usecases/ListFrontendProjectsUseCase.js";
import type { CreatePreviewSessionUseCase } from "../../../application/usecases/CreatePreviewSessionUseCase.js";
import type { StartPreviewSessionUseCase } from "../../../application/usecases/StartPreviewSessionUseCase.js";
import type { StopPreviewSessionUseCase } from "../../../application/usecases/StopPreviewSessionUseCase.js";
import type { ReloadPreviewSessionUseCase } from "../../../application/usecases/ReloadPreviewSessionUseCase.js";
import type { GetPreviewSessionUseCase } from "../../../application/usecases/GetPreviewSessionUseCase.js";
import type { SetPreviewDeviceUseCase } from "../../../application/usecases/SetPreviewDeviceUseCase.js";
import type { ListPreviewTimelineUseCase } from "../../../application/usecases/ListPreviewTimelineUseCase.js";
import type { CreateVisualInstructionDraftUseCase } from "../../../application/usecases/CreateVisualInstructionDraftUseCase.js";
import {
  FrontendProjectNotFoundError,
  FrontendProjectRootError,
} from "../../preview/FileFrontendProjectRegistry.js";
import { PreviewSessionNotFoundError } from "../../preview/FilePreviewSessionStore.js";

interface PreviewRouteDeps {
  listProjectsUseCase: ListFrontendProjectsUseCase;
  createSessionUseCase: CreatePreviewSessionUseCase;
  startSessionUseCase: StartPreviewSessionUseCase;
  stopSessionUseCase: StopPreviewSessionUseCase;
  reloadSessionUseCase: ReloadPreviewSessionUseCase;
  getSessionUseCase: GetPreviewSessionUseCase;
  setDeviceUseCase: SetPreviewDeviceUseCase;
  listTimelineUseCase: ListPreviewTimelineUseCase;
  createInstructionDraftUseCase: CreateVisualInstructionDraftUseCase;
  eventStream: IPreviewEventStream;
}

export function createPreviewRouter(deps: PreviewRouteDeps): Router {
  const router = Router();

  router.get("/projects", async (_req: Request, res: Response) => {
    try {
      const projects = await deps.listProjectsUseCase.execute();
      res.json({ projects });
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.post("/sessions", async (req: Request, res: Response) => {
    try {
      const input = CreatePreviewSessionInputSchema.parse(req.body);
      const result = await deps.createSessionUseCase.execute(input);
      res.status(201).json(result);
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.get("/sessions/:sessionId", async (req: Request, res: Response) => {
    try {
      const session = await deps.getSessionUseCase.execute(req.params["sessionId"] ?? "");
      res.json({ session });
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.post("/sessions/:sessionId/start", async (req: Request, res: Response) => {
    try {
      const result = await deps.startSessionUseCase.execute(req.params["sessionId"] ?? "");
      res.json(result);
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.post("/sessions/:sessionId/stop", async (req: Request, res: Response) => {
    try {
      const result = await deps.stopSessionUseCase.execute(req.params["sessionId"] ?? "");
      res.json(result);
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.post("/sessions/:sessionId/reload", async (req: Request, res: Response) => {
    try {
      const result = await deps.reloadSessionUseCase.execute(req.params["sessionId"] ?? "");
      res.json(result);
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.patch("/sessions/:sessionId/device", async (req: Request, res: Response) => {
    try {
      const input = SetPreviewDeviceInputSchema.parse(req.body);
      const result = await deps.setDeviceUseCase.execute(
        req.params["sessionId"] ?? "",
        input
      );
      res.json(result);
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.get("/sessions/:sessionId/timeline", async (req: Request, res: Response) => {
    try {
      const events = await deps.listTimelineUseCase.execute(req.params["sessionId"] ?? "");
      res.json({ events });
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.get("/events/:sessionId", async (req: Request, res: Response) => {
    const sessionId = req.params["sessionId"] ?? "";
    try {
      await deps.getSessionUseCase.execute(sessionId);
    } catch (err) {
      handlePreviewRouteError(err, res);
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const unsubscribe = deps.eventStream.subscribe(sessionId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", () => {
      unsubscribe();
      res.end();
    });
  });

  router.post("/instructions/draft", async (req: Request, res: Response) => {
    try {
      const input = CreateVisualInstructionDraftInputSchema.parse(req.body);
      const result = await deps.createInstructionDraftUseCase.execute(input);
      res.status(201).json(result);
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  return router;
}

function handlePreviewRouteError(err: unknown, res: Response): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  if (err instanceof FrontendProjectNotFoundError) {
    res.status(404).json({ error: "Frontend project not found", message: err.message });
    return;
  }
  if (err instanceof PreviewSessionNotFoundError) {
    res.status(404).json({ error: "Preview session not found", message: err.message });
    return;
  }
  if (err instanceof FrontendProjectRootError) {
    res.status(400).json({ error: "Invalid frontend project root", message: err.message });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}
