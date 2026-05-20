import { Router } from "express";
import type { Request, Response } from "express";
import type { IEventStream, WorkflowEvent } from "@u-build/shared";

export function createEventRouter(events: IEventStream): Router {
  const router = Router();

  router.get("/:threadId", (req: Request, res: Response) => {
    const { threadId } = req.params;

    if (!threadId) {
      res.status(400).json({ error: "Missing threadId" });
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
