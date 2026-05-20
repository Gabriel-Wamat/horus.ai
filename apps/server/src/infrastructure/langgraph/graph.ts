import { StateGraph, END, START, Send } from "@langchain/langgraph";
import { UBuildStateAnnotation } from "./state.js";
import { checkpointer } from "./checkpointer.js";
import { specAgentNode } from "./nodes/specAgentNode.js";
import { hitlCheckpointNode } from "./nodes/hitlCheckpointNode.js";
import { odinAgentNode } from "./nodes/odinAgentNode.js";
import { frontAgentNode } from "./nodes/frontAgentNode.js";
import { qaAgentNode } from "./nodes/qaAgentNode.js";
import { curatorAgentNode } from "./nodes/curatorAgentNode.js";

const SPEC_AGENT = "specAgent" as const;
const HITL_CHECKPOINT = "hitlCheckpoint" as const;
const ODIN_AGENT = "odinAgent" as const;
const FRONT_AGENT = "frontAgent" as const;
const QA_AGENT = "qaAgent" as const;
const CURATOR_AGENT = "curatorAgent" as const;

function routeAfterCurator(
  state: typeof UBuildStateAnnotation.State
): typeof SPEC_AGENT | typeof END {
  if (state.currentUSIndex < state.userStories.length) {
    return SPEC_AGENT;
  }
  return END;
}

function routeToParallelAgents(
  state: typeof UBuildStateAnnotation.State
): [Send, Send] {
  return [
    new Send(FRONT_AGENT, state),
    new Send(QA_AGENT, state),
  ];
}

const workflow = new StateGraph(UBuildStateAnnotation)
  .addNode(SPEC_AGENT, specAgentNode)
  .addNode(HITL_CHECKPOINT, hitlCheckpointNode)
  .addNode(ODIN_AGENT, odinAgentNode)
  .addNode(FRONT_AGENT, frontAgentNode)
  .addNode(QA_AGENT, qaAgentNode)
  .addNode(CURATOR_AGENT, curatorAgentNode)
  .addEdge(START, SPEC_AGENT)
  .addEdge(SPEC_AGENT, HITL_CHECKPOINT)
  .addEdge(HITL_CHECKPOINT, ODIN_AGENT)
  .addConditionalEdges(ODIN_AGENT, routeToParallelAgents, [
    FRONT_AGENT,
    QA_AGENT,
  ])
  .addEdge(FRONT_AGENT, CURATOR_AGENT)
  .addEdge(QA_AGENT, CURATOR_AGENT)
  .addConditionalEdges(CURATOR_AGENT, routeAfterCurator, [SPEC_AGENT, END]);

export const graph = workflow.compile({ checkpointer });

export type { UBuildState } from "./state.js";
