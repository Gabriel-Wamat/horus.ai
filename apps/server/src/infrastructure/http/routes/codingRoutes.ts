import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import {
  CancelCodingTaskRequestSchema,
  CodingTaskEventsQuerySchema,
  CodingTaskParamsSchema,
  CreateCodingTaskRequestSchema,
} from "@u-build/shared";
import {
  CodingTaskNotFoundError,
  CodingRuntimeOrchestrator,
} from "../../../application/coding/CodingRuntimeOrchestrator.js";
import { CodingRuntimeIllegalTransitionError } from "../../../application/coding/CodingWorkflowStateMachine.js";

interface CodingRouteDeps {
  orchestrator: CodingRuntimeOrchestrator;
}

export function createCodingRouter(deps: CodingRouteDeps): Router {
  const router = Router();

  router.post("/tasks", async (req: Request, res: Response) => {
    const abortController = createRequestAbortController(req, res);
    try {
      const input = CreateCodingTaskRequestSchema.parse(req.body);
      const snapshot = await deps.orchestrator.createTask(input);
      if (!input.autoRun) {
        res.status(201).json(snapshot);
        return;
      }
      const completed = await deps.orchestrator.runTask(snapshot.task.id, {
        signal: abortController.signal,
      });
      res.status(201).json(completed);
    } catch (err) {
      handleCodingRouteError(err, res);
    } finally {
      abortController.cleanup();
    }
  });

  router.get("/tasks/:taskId", async (req: Request, res: Response) => {
    try {
      const { taskId } = CodingTaskParamsSchema.parse(req.params);
      res.json(await deps.orchestrator.getSnapshot(taskId));
    } catch (err) {
      handleCodingRouteError(err, res);
    }
  });

  router.get("/tasks/:taskId/events", async (req: Request, res: Response) => {
    try {
      const { taskId } = CodingTaskParamsSchema.parse(req.params);
      const query = CodingTaskEventsQuerySchema.parse(req.query);
      res.json({
        taskId,
        events: await deps.orchestrator.listEvents(
          taskId,
          query.afterSequence === undefined
            ? {}
            : { afterSequence: query.afterSequence }
        ),
      });
    } catch (err) {
      handleCodingRouteError(err, res);
    }
  });

  router.post("/tasks/:taskId/run", async (req: Request, res: Response) => {
    const abortController = createRequestAbortController(req, res);
    try {
      const { taskId } = CodingTaskParamsSchema.parse(req.params);
      res.json(
        await deps.orchestrator.runTask(taskId, {
          signal: abortController.signal,
        })
      );
    } catch (err) {
      handleCodingRouteError(err, res);
    } finally {
      abortController.cleanup();
    }
  });

  router.post("/tasks/:taskId/cancel", async (req: Request, res: Response) => {
    try {
      const { taskId } = CodingTaskParamsSchema.parse(req.params);
      const input = CancelCodingTaskRequestSchema.parse(req.body ?? {});
      res.json(
        await deps.orchestrator.cancelTask(
          input.reason === undefined ? { taskId } : { taskId, reason: input.reason }
        )
      );
    } catch (err) {
      handleCodingRouteError(err, res);
    }
  });

  return router;
}

function createRequestAbortController(
  req: Request,
  res: Response
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableEnded) {
      controller.abort(new Error("client_disconnected"));
    }
  };
  req.on("aborted", abort);
  res.on("close", abort);
  return {
    signal: controller.signal,
    cleanup: () => {
      req.off("aborted", abort);
      res.off("close", abort);
    },
  };
}

function handleCodingRouteError(err: unknown, res: Response): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  if (err instanceof CodingTaskNotFoundError) {
    res.status(404).json({ error: "Coding task not found", message: err.message });
    return;
  }
  if (err instanceof CodingRuntimeIllegalTransitionError) {
    res.status(409).json({
      error: "Illegal coding task transition",
      message: err.message,
    });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}
