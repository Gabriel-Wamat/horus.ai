import { StateGraph, END, START, Send } from "@langchain/langgraph";
import { UBuildStateAnnotation } from "./state.js";
import { checkpointer } from "./checkpointer.js";
import { specAgentNode } from "./nodes/specAgentNode.js";
import { hitlCheckpointNode } from "./nodes/hitlCheckpointNode.js";
import { odinAgentNode } from "./nodes/odinAgentNode.js";
import { frontAgentNode } from "./nodes/frontAgentNode.js";
import { qaAgentNode } from "./nodes/qaAgentNode.js";
import { curatorAgentNode } from "./nodes/curatorAgentNode.js";
import { retryCheckpointNode } from "./nodes/retryCheckpointNode.js";

const SPEC_AGENT = "specAgent" as const;
const HITL_CHECKPOINT = "hitlCheckpoint" as const;
const ODIN_AGENT = "odinAgent" as const;
const FRONT_AGENT = "frontAgent" as const;
const QA_AGENT = "qaAgent" as const;
const CURATOR_AGENT = "curatorAgent" as const;
const RETRY_CHECKPOINT = "retryCheckpoint" as const;

/**
 * Routing pattern: Odin sets routingDecision; this function reads it
 * to create the correct parallel Send objects.
 */
function routeToParallelAgents(
  state: typeof UBuildStateAnnotation.State
): Send[] {
  const decision = state.routingDecision;

  if (decision.length === 0) {
    return [new Send(FRONT_AGENT, state), new Send(QA_AGENT, state)];
  }

  const sends: Send[] = [];
  if (decision.includes("frontAgent")) sends.push(new Send(FRONT_AGENT, state));
  if (decision.includes("qaAgent")) sends.push(new Send(QA_AGENT, state));
  return sends;
}

function routeAfterHitlCheckpoint(
  state: typeof UBuildStateAnnotation.State
): typeof ODIN_AGENT | typeof END {
  if (state.status === "cancelled") return END;
  return ODIN_AGENT;
}

/**
 * Reflection loop routing after curator:
 * - passed → advance to next user story (or END)
 * - failed, retries remaining → back to odinAgent (self-correction)
 * - failed, max retries exceeded → retryCheckpoint (HITL escalation)
 */
function routeAfterCurator(
  state: typeof UBuildStateAnnotation.State
): typeof SPEC_AGENT | typeof ODIN_AGENT | typeof RETRY_CHECKPOINT | typeof END {
  if (state.status === "completed" || state.status === "cancelled") return END;

  const curStory = state.userStories[state.currentUSIndex];
  if (!curStory) return END;

  const feedback = state.curatorFeedback[curStory.id];

  // No feedback yet, or curator passed → proceed to next story
  if (!feedback || feedback.passed) return SPEC_AGENT;

  // Max retries exceeded → escalate to human
  if (state.pendingRetryApproval !== null) return RETRY_CHECKPOINT;

  // Retry available → back to odinAgent (reflection loop)
  return ODIN_AGENT;
}

/**
 * After retryCheckpoint: user chose to continue (→ odinAgent) or stop (→ END).
 */
function routeAfterRetryCheckpoint(
  state: typeof UBuildStateAnnotation.State
): typeof ODIN_AGENT | typeof END {
  if (state.status === "completed") return END;
  return ODIN_AGENT;
}

const workflow = new StateGraph(UBuildStateAnnotation)
  .addNode(SPEC_AGENT, specAgentNode)
  .addNode(HITL_CHECKPOINT, hitlCheckpointNode)
  .addNode(ODIN_AGENT, odinAgentNode)
  .addNode(FRONT_AGENT, frontAgentNode)
  .addNode(QA_AGENT, qaAgentNode)
  .addNode(CURATOR_AGENT, curatorAgentNode)
  .addNode(RETRY_CHECKPOINT, retryCheckpointNode)

  // Main pipeline
  .addEdge(START, SPEC_AGENT)
  .addEdge(SPEC_AGENT, HITL_CHECKPOINT)
  .addConditionalEdges(HITL_CHECKPOINT, routeAfterHitlCheckpoint, [
    ODIN_AGENT,
    END,
  ])

  // Fan-out: odinAgent routes to front ∥ qa based on routingDecision
  .addConditionalEdges(ODIN_AGENT, routeToParallelAgents, [FRONT_AGENT, QA_AGENT])
  .addEdge(FRONT_AGENT, CURATOR_AGENT)
  .addEdge(QA_AGENT, CURATOR_AGENT)

  // Reflection loop: curator decides retry / escalate / advance
  .addConditionalEdges(CURATOR_AGENT, routeAfterCurator, [
    SPEC_AGENT,
    ODIN_AGENT,
    RETRY_CHECKPOINT,
    END,
  ])

  // HITL escalation: user decides whether to continue retrying
  .addConditionalEdges(RETRY_CHECKPOINT, routeAfterRetryCheckpoint, [
    ODIN_AGENT,
    END,
  ]);

export const graph = workflow.compile({ checkpointer });

export type { UBuildState } from "./state.js";
