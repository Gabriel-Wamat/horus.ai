import { Router, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import type {
  AgentExecutionLedgerRepository,
  ProjectConstructionRepository,
} from "../../../application/ports/index.js";

interface OpsControlPlaneDeps {
  ledger: AgentExecutionLedgerRepository;
  projectConstruction: ProjectConstructionRepository;
  recoverPendingExecutions: () => Promise<void>;
  persistenceDriver: "file" | "postgres";
}

const QuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export function createOpsControlPlaneRouter(
  deps: OpsControlPlaneDeps
): Router {
  const router = Router();

  router.get("/control-plane", async (req: Request, res: Response) => {
    try {
      const query = QuerySchema.parse(req.query);
      res.json(await buildSnapshot(deps, query.limit));
    } catch (err) {
      handleOpsError(err, res);
    }
  });

  router.post("/control-plane/recover", async (req: Request, res: Response) => {
    try {
      const query = QuerySchema.parse(req.query);
      await deps.recoverPendingExecutions();
      res.status(202).json({
        recoveredAt: new Date().toISOString(),
        snapshot: await buildSnapshot(deps, query.limit),
      });
    } catch (err) {
      handleOpsError(err, res);
    }
  });

  return router;
}

async function buildSnapshot(
  deps: OpsControlPlaneDeps,
  limit: number
): Promise<Record<string, unknown>> {
  const [runs, recoverableRuns, deadLetters, failedOutbox, constructionRuns] =
    await Promise.all([
      deps.ledger.listRuns({ limit }),
      deps.ledger.listRecoverableRuns(),
      deps.ledger.listOutbox({ status: "dead_letter", limit: 25 }),
      deps.ledger.listOutbox({ status: "failed", limit: 25 }),
      deps.projectConstruction.listConstructionRuns(),
    ]);

  const recentConstructionRuns = constructionRuns
    .sort((left, right) =>
      (right.startedAt ?? "").localeCompare(left.startedAt ?? "")
    )
    .slice(0, limit);
  const diagnostics = [
    ...(deadLetters.length > 0
      ? [
          {
            severity: "high",
            code: "dead_letter_outbox",
            message: `${deadLetters.length} outbox event(s) are dead-lettered.`,
          },
        ]
      : []),
    ...(recoverableRuns.length > 0
      ? [
          {
            severity: "medium",
            code: "recoverable_runs",
            message: `${recoverableRuns.length} workflow run(s) are recoverable or stale-running.`,
          },
        ]
      : []),
    ...(failedOutbox.length > 0
      ? [
          {
            severity: "medium",
            code: "failed_outbox",
            message: `${failedOutbox.length} outbox event(s) are failed and retryable by recovery.`,
          },
        ]
      : []),
  ];

  return {
    generatedAt: new Date().toISOString(),
    persistenceDriver: deps.persistenceDriver,
    metrics: {
      workflowRuns: countBy(runs, (run) => run.status),
      constructionRuns: countBy(recentConstructionRuns, (run) => run.status),
      outbox: {
        deadLetter: deadLetters.length,
        failed: failedOutbox.length,
      },
      recoverableRuns: recoverableRuns.length,
    },
    actions: {
      recoverPendingExecutions: "POST /api/ops/control-plane/recover",
      retryExecutionTask:
        "POST /api/projects/:projectId/execution-tasks/:taskId/retry",
      cancelExecutionTask:
        "POST /api/projects/:projectId/execution-tasks/:taskId/kill",
      continueOrStopCuratorRetry: "POST /api/workflow/retry-decision",
    },
    diagnostics,
    runHistory: runs,
    recoverableRuns,
    deadLetters,
    failedOutbox,
    constructionRuns: recentConstructionRuns,
  };
}

function countBy<T>(
  items: readonly T[],
  selectKey: (item: T) => string | null | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = selectKey(item) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function handleOpsError(err: unknown, res: Response): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  res.status(500).json({
    error: "Internal server error",
    message: err instanceof Error ? err.message : String(err),
  });
}
