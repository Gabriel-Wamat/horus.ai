import express from "express";
import type { IEventStream } from "@u-build/shared";
import type { HorusRunFlowSnapshotBuilder } from "../../../application/services/HorusRunFlowSnapshotBuilder.js";
import { mapWorkflowEvent } from "../../../application/services/horusRunFlowMapping.js";

interface AgentRunFlowRouterOptions {
  snapshotBuilder: HorusRunFlowSnapshotBuilder;
  eventStream: IEventStream;
}

export function createAgentRunFlowRouter({
  snapshotBuilder,
  eventStream,
}: AgentRunFlowRouterOptions): express.Router {
  const router = express.Router();

  router.get("/", async (_req, res, next) => {
    try {
      res.json(await snapshotBuilder.listRuns());
    } catch (err) {
      next(err);
    }
  });

  router.get("/:threadId", async (req, res, next) => {
    try {
      const run = await snapshotBuilder.getRun(req.params.threadId);
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      res.json(run);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:threadId/events", async (req, res, next) => {
    try {
      res.json(await snapshotBuilder.listEvents(req.params.threadId));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:threadId/events/stream", async (req, res, next) => {
    const threadId = req.params.threadId;
    const sinceSequence = Number(req.query.since_sequence ?? 0);
    const since = Number.isFinite(sinceSequence) ? Math.max(0, sinceSequence) : 0;
    try {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });

      const send = (type: string, data: unknown) => {
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const replay = await snapshotBuilder.listEventsAfter(threadId, since);
      for (const event of replay) send(event.type, event);

      let liveSequence = replay.reduce(
        (max, event) => Math.max(max, event.sequence),
        since
      );
      const unsubscribe = eventStream.subscribe(threadId, (event) => {
        liveSequence += 1;
        send(event.type, mapWorkflowEvent(event, liveSequence));
      });
      req.on("close", unsubscribe);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
