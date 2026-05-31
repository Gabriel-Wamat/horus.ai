import express from "express";
import {
  AgentFileOperationTelemetrySchema,
  mapWorkflowEventToFileOperations,
  type IEventStream,
} from "@u-build/shared";
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

  router.get("/", async (req, res, next) => {
    try {
      const projectId = stringQuery(req.query.project_id);
      const query = stringQuery(req.query.q);
      res.json(
        await snapshotBuilder.listRuns({
          ...(projectId ? { projectId } : {}),
          limit: positiveIntegerQuery(req.query.limit, 12, 50),
          offset: nonnegativeIntegerQuery(req.query.offset, 0),
          ...(query ? { query } : {}),
        })
      );
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

  router.get("/:threadId/file-operations", async (req, res, next) => {
    try {
      res.json({
        threadId: req.params.threadId,
        operations: await snapshotBuilder.listFileOperations(req.params.threadId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:threadId/file-operations/stream", async (req, res, next) => {
    const threadId = req.params.threadId;
    const sinceSequence = Number(req.query.since_sequence ?? 0);
    const since = Number.isFinite(sinceSequence) ? Math.max(0, sinceSequence) : 0;
    try {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });

      const send = (data: unknown) => {
        res.write("event: file_operation\n");
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const replay = await snapshotBuilder.listFileOperationsAfter(threadId, since);
      for (const operation of replay) send(operation);

      let liveSequence = replay.reduce(
        (max, operation) => Math.max(max, operation.sequence),
        since
      );
      const unsubscribe = eventStream.subscribe(threadId, (event) => {
        const operations = mapWorkflowEventToFileOperations(event, liveSequence + 1);
        for (const operation of operations) {
          liveSequence += 1;
          send(
            AgentFileOperationTelemetrySchema.parse({
              ...operation,
              sequence: liveSequence,
            })
          );
        }
      });
      req.on("close", unsubscribe);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function stringQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function positiveIntegerQuery(
  value: unknown,
  fallback: number,
  max: number
): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function nonnegativeIntegerQuery(value: unknown, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}
