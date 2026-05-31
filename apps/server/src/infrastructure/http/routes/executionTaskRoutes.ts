import { Router, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import type { ProjectConstructionRepository } from "../../../application/ports/index.js";
import { CliCommandPolicy } from "../../tools/CliCommandPolicy.js";
import { ExecutionTaskRuntime } from "../../tools/ExecutionTaskRuntime.js";

interface ExecutionTaskRouteDeps {
  projectConstruction: ProjectConstructionRepository;
}

const executionTaskRuntimeByWorkspaceRoot = new Map<string, ExecutionTaskRuntime>();

const ExecutionTaskParamsSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !value.includes("/") && !value.includes("\\") && !value.includes(".."), {
      message: "taskId must not contain path traversal segments",
    }),
});

const ExecutionTaskOutputQuerySchema = z.object({
  stream: z.enum(["stdout", "stderr"]).default("stdout"),
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(64_000).default(8_192),
});

const ExecutionTaskListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const ExecutionTaskApprovalBodySchema = z.object({
  approvedBy: z.string().trim().min(1).default("operator"),
  approvalReason: z.string().trim().min(1).optional(),
});

export function createExecutionTaskRouter(deps: ExecutionTaskRouteDeps): Router {
  const router = Router();

  router.get(
    "/projects/:projectId/execution-tasks",
    async (req: Request, res: Response) => {
      try {
        const { projectId } = z.object({ projectId: z.string().uuid() }).parse(req.params);
        const query = ExecutionTaskListQuerySchema.parse(req.query);
        const runtime = await runtimeForProject(deps, projectId);
        res.json({ tasks: await runtime.listTasks({ limit: query.limit }) });
      } catch (err) {
        handleExecutionTaskRouteError(err, res);
      }
    }
  );

  router.get(
    "/projects/:projectId/execution-tasks/:taskId",
    async (req: Request, res: Response) => {
      try {
        const { projectId, taskId } = ExecutionTaskParamsSchema.parse(req.params);
        const runtime = await runtimeForProject(deps, projectId);
        const task = await runtime.getTask(taskId);
        if (!task) {
          res.status(404).json({ error: "Execution task not found" });
          return;
        }
        res.json(task);
      } catch (err) {
        handleExecutionTaskRouteError(err, res);
      }
    }
  );

  router.get(
    "/projects/:projectId/execution-tasks/:taskId/output",
    async (req: Request, res: Response) => {
      try {
        const { projectId, taskId } = ExecutionTaskParamsSchema.parse(req.params);
        const query = ExecutionTaskOutputQuerySchema.parse(req.query);
        const runtime = await runtimeForProject(deps, projectId);
        res.json(
          await runtime.readOutput({
            taskId,
            stream: query.stream,
            offset: query.offset,
            limit: query.limit,
          })
        );
      } catch (err) {
        handleExecutionTaskRouteError(err, res);
      }
    }
  );

  router.post(
    "/projects/:projectId/execution-tasks/:taskId/kill",
    async (req: Request, res: Response) => {
      try {
        const { projectId, taskId } = ExecutionTaskParamsSchema.parse(req.params);
        const runtime = await runtimeForProject(deps, projectId);
        res.json(await runtime.kill(taskId));
      } catch (err) {
        handleExecutionTaskRouteError(err, res);
      }
    }
  );

  router.post(
    "/projects/:projectId/execution-tasks/:taskId/retry",
    async (req: Request, res: Response) => {
      try {
        const { projectId, taskId } = ExecutionTaskParamsSchema.parse(req.params);
        const runtime = await runtimeForProject(deps, projectId);
        const handle = await runtime.retry(taskId);
        res.status(202).json(handle.task);
      } catch (err) {
        handleExecutionTaskRouteError(err, res);
      }
    }
  );

  router.post(
    "/projects/:projectId/execution-tasks/:taskId/approve",
    async (req: Request, res: Response) => {
      try {
        const { projectId, taskId } = ExecutionTaskParamsSchema.parse(req.params);
        const body = ExecutionTaskApprovalBodySchema.parse(req.body ?? {});
        const runtime = await runtimeForProject(deps, projectId);
        const handle = await runtime.approve(taskId, body);
        res.status(202).json(handle.task);
      } catch (err) {
        handleExecutionTaskRouteError(err, res);
      }
    }
  );

  return router;
}

async function runtimeForProject(
  deps: ExecutionTaskRouteDeps,
  projectId: string
): Promise<ExecutionTaskRuntime> {
  const project = await deps.projectConstruction.getProjectWorkspace(projectId);
  const existing = executionTaskRuntimeByWorkspaceRoot.get(project.rootPath);
  if (existing) return existing;
  const runtime = new ExecutionTaskRuntime({
    policy: new CliCommandPolicy({
      allowedRoot: project.rootPath,
    }),
    outputBaseDir: `${project.rootPath}/.horus/execution-tasks`,
  });
  executionTaskRuntimeByWorkspaceRoot.set(project.rootPath, runtime);
  return runtime;
}

function handleExecutionTaskRouteError(err: unknown, res: Response): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  if (err instanceof Error && err.message.includes("Project workspace not found")) {
    res.status(404).json({ error: "Project not found", message: err.message });
    return;
  }
  if (err instanceof Error && err.message.includes("Execution task not found")) {
    res.status(404).json({ error: "Execution task not found", message: err.message });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}
