import { Router } from "express";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import {
  CreatePreviewSessionInputSchema,
  CreateVisualInstructionDraftInputSchema,
  PreviewActionResponseSchema,
  PreviewProjectsResponseSchema,
  PreviewSessionResponseSchema,
  PreviewTimelineResponseSchema,
  SetPreviewDeviceInputSchema,
  VisualInstructionDraftResponseSchema,
  type PreviewSession,
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

  router.get("/projects", async (req: Request, res: Response) => {
    try {
      const rawVisibility = String(req.query["visibility"] ?? "visible");
      const visibility =
        rawVisibility === "all" || rawVisibility === "archived"
          ? rawVisibility
          : "visible";
      const projects = await deps.listProjectsUseCase.execute({ visibility });
      res.json(
        parsePreviewRouteResponse("GET /preview/projects", PreviewProjectsResponseSchema, {
          projects,
        })
      );
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.post("/sessions", async (req: Request, res: Response) => {
    try {
      const input = CreatePreviewSessionInputSchema.parse(req.body);
      const result = await deps.createSessionUseCase.execute(input);
      res
        .status(201)
        .json(
          parsePreviewRouteResponse(
            "POST /preview/sessions",
            PreviewActionResponseSchema,
            result
          )
        );
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.get("/sessions/:sessionId", async (req: Request, res: Response) => {
    try {
      const session = await deps.getSessionUseCase.execute(req.params["sessionId"] ?? "");
      res.json(
        parsePreviewRouteResponse(
          "GET /preview/sessions/:sessionId",
          PreviewSessionResponseSchema,
          { session }
        )
      );
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.post("/sessions/:sessionId/start", async (req: Request, res: Response) => {
    try {
      const result = await deps.startSessionUseCase.execute(req.params["sessionId"] ?? "");
      res.json(
        parsePreviewRouteResponse(
          "POST /preview/sessions/:sessionId/start",
          PreviewActionResponseSchema,
          result
        )
      );
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.post("/sessions/:sessionId/stop", async (req: Request, res: Response) => {
    try {
      const result = await deps.stopSessionUseCase.execute(req.params["sessionId"] ?? "");
      res.json(
        parsePreviewRouteResponse(
          "POST /preview/sessions/:sessionId/stop",
          PreviewActionResponseSchema,
          result
        )
      );
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.post("/sessions/:sessionId/reload", async (req: Request, res: Response) => {
    try {
      const result = await deps.reloadSessionUseCase.execute(req.params["sessionId"] ?? "");
      res.json(
        parsePreviewRouteResponse(
          "POST /preview/sessions/:sessionId/reload",
          PreviewActionResponseSchema,
          result
        )
      );
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
      res.json(
        parsePreviewRouteResponse(
          "PATCH /preview/sessions/:sessionId/device",
          PreviewActionResponseSchema,
          result
        )
      );
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.get("/sessions/:sessionId/timeline", async (req: Request, res: Response) => {
    try {
      const events = await deps.listTimelineUseCase.execute(req.params["sessionId"] ?? "");
      res.json(
        parsePreviewRouteResponse(
          "GET /preview/sessions/:sessionId/timeline",
          PreviewTimelineResponseSchema,
          { events }
        )
      );
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  router.get("/events/:sessionId", async (req: Request, res: Response) => {
    const sessionId = req.params["sessionId"] ?? "";
    let session: PreviewSession;
    try {
      session = await deps.getSessionUseCase.execute(sessionId);
    } catch (err) {
      handlePreviewRouteError(err, res);
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = deps.eventStream.subscribe(sessionId, (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });
    } catch (err) {
      writePreviewStreamError(res, session, err);
      res.end();
      return;
    }

    req.on("close", () => {
      unsubscribe?.();
      res.end();
    });
  });

  router.post("/instructions/draft", async (req: Request, res: Response) => {
    try {
      const input = CreateVisualInstructionDraftInputSchema.parse(req.body);
      const result = await deps.createInstructionDraftUseCase.execute(input);
      res
        .status(201)
        .json(
          parsePreviewRouteResponse(
            "POST /preview/instructions/draft",
            VisualInstructionDraftResponseSchema,
            result
          )
        );
    } catch (err) {
      handlePreviewRouteError(err, res);
    }
  });

  return router;
}

interface PreviewRouteContract<T> {
  parse(input: unknown): T;
}

class PreviewRouteResponseContractError extends Error {
  constructor(route: string, cause: unknown) {
    super(`Preview route response contract violated at ${route}`, { cause });
    this.name = "PreviewRouteResponseContractError";
  }
}

function parsePreviewRouteResponse<T>(
  route: string,
  contract: PreviewRouteContract<T>,
  payload: unknown
): T {
  try {
    return contract.parse(payload);
  } catch (err) {
    throw new PreviewRouteResponseContractError(route, err);
  }
}

function handlePreviewRouteError(err: unknown, res: Response): void {
  if (err instanceof PreviewRouteResponseContractError) {
    res.status(500).json({ error: "Internal server error", message: err.message });
    return;
  }
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
  res.status(500).json({
    error: "Internal server error",
    message: err instanceof Error ? err.message : String(err),
  });
}

function writePreviewStreamError(
  res: Response,
  session: PreviewSession,
  err: unknown
): void {
  res.write(
    `data: ${JSON.stringify({
      id: randomUUID(),
      type: "preview_error",
      sessionId: session.id,
      projectId: session.projectId,
      timestamp: new Date().toISOString(),
      status: "error",
      message: err instanceof Error ? err.message : String(err),
      data: {
        errorCode: "preview_event_stream_subscribe_failed",
      },
    })}\n\n`
  );
}
