import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type {
  IEventStream,
  IStorageProvider,
  WorkflowEvent,
} from "@u-build/shared";

interface EventRouterOptions {
  storage?: Pick<IStorageProvider, "load">;
}

export function createEventRouter(
  events: IEventStream,
  options: EventRouterOptions = {}
): Router {
  const router = Router();

  router.get("/:threadId", async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { threadId } = req.params;

    if (!threadId) {
      res.status(400).json({ error: "Missing threadId" });
      return;
    }

    try {
      if (options.storage && !(await options.storage.load(threadId))) {
        res.status(404).json({ error: "Workflow thread not found" });
        return;
      }
    } catch (err) {
      next(err);
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event: WorkflowEvent): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = events.subscribe(threadId, sendEvent);

    sendEvent({
      type: "status_changed",
      threadId,
      status: "idle",
      timestamp: new Date().toISOString(),
    });

    req.on("close", () => {
      unsubscribe();
    });
  });

  return router;
}
