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
      if (!(await sendRunNotFoundIfMissing(snapshotBuilder, req.params.threadId, res))) {
        return;
      }
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
      if (!(await sendRunNotFoundIfMissing(snapshotBuilder, threadId, res))) {
        return;
      }
      const replay = await snapshotBuilder.listEventsAfter(threadId, since);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });

      const send = (type: string, data: unknown) => {
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      for (const event of replay) send(event.type, event);

      let liveSequence = replay.reduce(
        (max, event) => Math.max(max, event.sequence),
        since
      );
      let unsubscribe: (() => void) | undefined;
      try {
        unsubscribe = eventStream.subscribe(threadId, (event) => {
          liveSequence += 1;
          send(event.type, mapWorkflowEvent(event, liveSequence));
        });
      } catch (err) {
        liveSequence += 1;
        send(
          "error",
          mapWorkflowEvent(
            {
              type: "error",
              threadId,
              message: errorMessage(err),
              timestamp: new Date().toISOString(),
            },
            liveSequence
          )
        );
        res.end();
        return;
      }
      req.on("close", unsubscribe);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:threadId/file-operations", async (req, res, next) => {
    try {
      if (!(await sendRunNotFoundIfMissing(snapshotBuilder, req.params.threadId, res))) {
        return;
      }
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
      if (!(await sendRunNotFoundIfMissing(snapshotBuilder, threadId, res))) {
        return;
      }
      const replay = await snapshotBuilder.listFileOperationsAfter(threadId, since);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });

      const send = (data: unknown) => {
        res.write("event: file_operation\n");
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      for (const operation of replay) send(operation);

      let liveSequence = replay.reduce(
        (max, operation) => Math.max(max, operation.sequence),
        since
      );
      let unsubscribe: (() => void) | undefined;
      try {
        unsubscribe = eventStream.subscribe(threadId, (event) => {
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
      } catch (err) {
        liveSequence += 1;
        send(buildFileOperationStreamError(threadId, liveSequence, err));
        res.end();
        return;
      }
      req.on("close", unsubscribe);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

async function sendRunNotFoundIfMissing(
  snapshotBuilder: HorusRunFlowSnapshotBuilder,
  threadId: string,
  res: express.Response
): Promise<boolean> {
  if (await snapshotBuilder.hasRun(threadId)) return true;
  res.status(404).json({ error: "Run not found" });
  return false;
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

function buildFileOperationStreamError(
  threadId: string,
  sequence: number,
  err: unknown
): ReturnType<typeof AgentFileOperationTelemetrySchema.parse> {
  const message = errorMessage(err);
  return AgentFileOperationTelemetrySchema.parse({
    id: `${threadId}:${sequence}:file_operation_stream_error`,
    threadId,
    sequence,
    workflowSequence: null,
    operationalSequence: null,
    sourceEventId: null,
    path: "<agent-run-file-operation-stream>",
    operationType: "unknown",
    status: "failed",
    errorMessage: message,
    summary: "Agent file-operation stream failed.",
    timestamp: new Date().toISOString(),
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
