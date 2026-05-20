import type { UserStory } from "../entities/UserStory.js";
import type { Spec } from "../entities/Spec.js";
import type { AgentResult, AgentName } from "../entities/AgentResult.js";

export interface AgentRunContext {
  readonly threadId: string;
  readonly userStory: UserStory;
  readonly spec?: Spec;
  readonly signal?: AbortSignal;
}

export interface IAgentProvider {
  readonly agentName: AgentName;

  run(context: AgentRunContext): Promise<AgentResult>;
}
