import express from "express";
import type {
  AgentDebugTraceCollector,
  ListAgentDebugTraceInput,
} from "../../../application/services/AgentDebugTraceCollector.js";
import type { AgentName } from "@u-build/shared";

// Read-only HTTP surface for the "why did the agent choose this?" UI panel.
// Powers item 10 of the architectural agenda. Filters are optional and can be
// composed: typically the UI fetches by workflowThreadId + userStoryId and
// renders the most-recent N entries grouped by agentName.

const KNOWN_AGENT_NAMES = new Set<AgentName>([
  "spec",
  "odin",
  "front",
  "qa",
  "curator",
]);

interface AgentDebugTraceRouterOptions {
  collector: AgentDebugTraceCollector;
}

export function createAgentDebugTraceRouter({
  collector,
}: AgentDebugTraceRouterOptions): express.Router {
  const router = express.Router();

  router.get("/", (req, res, next) => {
    try {
      const filter = parseFilter(req.query);
      res.json({
        entries: collector.list(filter),
        filter,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/", (req, res, next) => {
    try {
      const filter = parseFilter(req.query);
      // Require at least one scoping field on delete so operators can't
      // accidentally wipe the whole buffer with a bare DELETE.
      if (
        !filter.projectId &&
        !filter.workflowThreadId &&
        !filter.userStoryId &&
        !filter.agentName
      ) {
        res
          .status(400)
          .json({ error: "At least one filter (project_id, thread_id, user_story_id, agent_name) is required." });
        return;
      }
      collector.clear(filter);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function parseFilter(query: unknown): ListAgentDebugTraceInput {
  const record = (query as Record<string, unknown> | undefined) ?? {};
  const projectId = stringQuery(record["project_id"]);
  const workflowThreadId = stringQuery(record["thread_id"]);
  const userStoryId = stringQuery(record["user_story_id"]);
  const agentName = parseAgentName(record["agent_name"]);
  const limit = positiveIntegerQuery(record["limit"], 64, 256);
  return {
    ...(projectId ? { projectId } : {}),
    ...(workflowThreadId ? { workflowThreadId } : {}),
    ...(userStoryId ? { userStoryId } : {}),
    ...(agentName ? { agentName } : {}),
    limit,
  };
}

function stringQuery(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseAgentName(value: unknown): AgentName | undefined {
  const name = stringQuery(value);
  if (!name) return undefined;
  return KNOWN_AGENT_NAMES.has(name as AgentName) ? (name as AgentName) : undefined;
}

function positiveIntegerQuery(
  value: unknown,
  fallback: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), max);
}
