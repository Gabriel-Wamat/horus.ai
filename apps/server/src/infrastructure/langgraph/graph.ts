import { StateGraph, END, START, Send } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { UBuildStateAnnotation } from "./state.js";
import { checkpointer } from "./checkpointer.js";
import { createSpecAgentNode } from "./nodes/specAgentNode.js";
import { hitlCheckpointNode } from "./nodes/hitlCheckpointNode.js";
import { createOdinAgentNode } from "./nodes/odinAgentNode.js";
import { createFrontAgentNode } from "./nodes/frontAgentNode.js";
import { createQaAgentNode } from "./nodes/qaAgentNode.js";
import { createCuratorAgentNode } from "./nodes/curatorAgentNode.js";
import { retryCheckpointNode } from "./nodes/retryCheckpointNode.js";
import {
  defaultLangGraphDependencies,
  type LangGraphDependencies,
} from "./dependencies.js";
import { AgentNodeIsolationController } from "./AgentNodeIsolation.js";
import type { AgentCircuitBreakerStore } from "../../application/services/AgentCircuitBreakerStore.js";

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
): Send[] | typeof END {
  if (
    state.status === "completed" ||
    state.status === "cancelled" ||
    state.status === "blocked" ||
    state.status === "failed_validation" ||
    state.status === "error" ||
    !state.userStories[state.currentUSIndex]
  ) {
    return END;
  }

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
  if (
    state.status === "blocked" ||
    state.status === "failed_validation" ||
    state.status === "error"
  ) {
    return END;
  }
  return ODIN_AGENT;
}

function routeAfterSpecAgent(
  state: typeof UBuildStateAnnotation.State
): typeof SPEC_AGENT | typeof HITL_CHECKPOINT | typeof END {
  if (state.workflowMode !== "spec_generation") return HITL_CHECKPOINT;
  if (
    state.status === "completed" ||
    state.status === "blocked" ||
    state.status === "failed_validation" ||
    state.status === "error"
  ) {
    return END;
  }
  return SPEC_AGENT;
}

function routeFromStart(
  state: typeof UBuildStateAnnotation.State
): typeof SPEC_AGENT | typeof ODIN_AGENT {
  if (
    state.workflowMode === "chat_code_change" ||
    state.workflowMode === "project_construction"
  ) {
    return ODIN_AGENT;
  }
  return SPEC_AGENT;
}

/**
 * Reflection loop routing after curator:
 * - passed → advance to next user story through Odin (or Odin terminates)
 * - failed, retries remaining → back to odinAgent (self-correction)
 * - failed, max retries exceeded → retryCheckpoint (HITL escalation)
 */
function routeAfterCurator(
  state: typeof UBuildStateAnnotation.State
): typeof SPEC_AGENT | typeof ODIN_AGENT | typeof RETRY_CHECKPOINT | typeof END {
  if (state.status === "completed") return ODIN_AGENT;
  if (
    state.status === "cancelled" ||
    state.status === "blocked" ||
    state.status === "failed_validation" ||
    state.status === "error"
  ) {
    return END;
  }

  const curStory = state.userStories[state.currentUSIndex];
  if (!curStory) return END;

  const feedback = state.curatorFeedback[curStory.id];

  // No feedback yet, or curator passed → proceed to next story
  if (!feedback || feedback.passed) {
    return state.workflowMode === "project_construction" ? ODIN_AGENT : SPEC_AGENT;
  }

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
  if (
    state.status === "completed" ||
    state.status === "blocked" ||
    state.status === "failed_validation" ||
    state.status === "error"
  ) {
    return END;
  }
  return ODIN_AGENT;
}

export function createWorkflowGraph(
  dependencies: LangGraphDependencies = defaultLangGraphDependencies,
  workflowCheckpointer: BaseCheckpointSaver = checkpointer,
  options: { circuitBreakerStore?: AgentCircuitBreakerStore } = {}
) {
  const nodeIsolation = new AgentNodeIsolationController(
    options.circuitBreakerStore
      ? { circuitBreakerStore: options.circuitBreakerStore }
      : {}
  );
  const workflow = new StateGraph(UBuildStateAnnotation)
    .addNode(
      SPEC_AGENT,
      nodeIsolation.wrap("spec_agent", createSpecAgentNode(dependencies))
    )
    .addNode(HITL_CHECKPOINT, hitlCheckpointNode)
    .addNode(
      ODIN_AGENT,
      nodeIsolation.wrap("odin_agent", createOdinAgentNode(dependencies))
    )
    .addNode(
      FRONT_AGENT,
      nodeIsolation.wrap("front_agent", createFrontAgentNode(dependencies))
    )
    .addNode(
      QA_AGENT,
      nodeIsolation.wrap("qa_agent", createQaAgentNode(dependencies))
    )
    .addNode(
      CURATOR_AGENT,
      nodeIsolation.wrap("curator_agent", createCuratorAgentNode(dependencies))
    )
    .addNode(RETRY_CHECKPOINT, retryCheckpointNode)

    // Main pipeline
    .addConditionalEdges(START, routeFromStart, [SPEC_AGENT, ODIN_AGENT])
    .addConditionalEdges(SPEC_AGENT, routeAfterSpecAgent, [
      SPEC_AGENT,
      HITL_CHECKPOINT,
      END,
    ])
    .addConditionalEdges(HITL_CHECKPOINT, routeAfterHitlCheckpoint, [
      ODIN_AGENT,
      END,
    ])

    // Fan-out: odinAgent routes to front ∥ qa based on routingDecision
    .addConditionalEdges(ODIN_AGENT, routeToParallelAgents, [
      FRONT_AGENT,
      QA_AGENT,
      END,
    ])
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

  return workflow.compile({ checkpointer: workflowCheckpointer });
}

export type { UBuildState } from "./state.js";
