import type {
  AgentName,
  AgentProfile,
  AgentProfileId,
  AgentToolName,
} from "@u-build/shared";
import { AgentProfileSchema } from "@u-build/shared";

const PROFILE_DEFINITIONS: AgentProfile[] = [
  {
    id: "chat_agent",
    label: "Chat Agent",
    purpose: "Answer questions and classify intent without mutating project files.",
    allowedTools: [
      "search_code",
      "read_file",
      "list_files",
      "search_code_readonly",
      "read_file_readonly",
      "list_project_files",
      "get_user_story",
      "get_spec",
    ],
    forbiddenTools: ["write_file", "run_command", "git_push", "delete_file"],
    inputContract: "HorusChatTurnInput",
    outputContract: "HorusChatOutcome",
  },
  {
    id: "spec_agent",
    agentName: "spec",
    label: "Spec Agent",
    purpose: "Create or update implementation specs from user stories and context.",
    allowedTools: [
      "read_file",
      "search_code",
      "read_user_story",
      "read_project_manifest",
      "search_code_readonly",
      "save_spec_revision",
    ],
    forbiddenTools: ["write_project_file", "run_command"],
    inputContract: "UserStory",
    outputContract: "Spec",
  },
  {
    id: "odin_agent",
    agentName: "odin",
    label: "Odin Agent",
    purpose: "Plan assignments and route specialist agents.",
    allowedTools: [
      "read_spec",
      "read_agent_results",
      "create_assignment",
      "update_assignment",
    ],
    forbiddenTools: ["write_project_file", "run_shell"],
    inputContract: "Spec + CuratorFeedback",
    outputContract: "AgentAssignmentPlan",
  },
  {
    id: "front_agent",
    agentName: "front",
    label: "Front Agent",
    purpose: "Produce auditable frontend CodeChangeSet proposals.",
    allowedTools: [
      "search_code_readonly",
      "read_file_readonly",
      "search_code",
      "read_file",
      "propose_code_change_set",
      "get_git_diff",
      "run_static_analysis_readonly",
    ],
    forbiddenTools: ["direct_fs_write", "arbitrary_shell", "git_push"],
    inputContract: "UserStory + Spec + CodeContext",
    outputContract: "CodeChangeSet",
  },
  {
    id: "qa_agent",
    agentName: "qa",
    label: "QA Agent",
    purpose: "Produce test cases and runtime validation evidence.",
    allowedTools: [
      "read_spec",
      "read_code_change_set",
      "run_validation_command",
      "get_git_diff",
      "inspect_preview",
    ],
    forbiddenTools: ["write_project_file"],
    inputContract: "Spec + CodeChangeSet",
    outputContract: "QaResult",
  },
  {
    id: "curator_agent",
    agentName: "curator",
    label: "Curator Agent",
    purpose: "Review final evidence and emit approval or rejection.",
    allowedTools: [
      "read_spec",
      "read_code_change_set",
      "read_validation_evidence",
      "save_file",
      "apply_code_change_set",
      "get_git_diff",
      "emit_verdict",
    ],
    forbiddenTools: ["write_project_file", "run_arbitrary_command"],
    inputContract: "Spec + QaResult + RuntimeEvidence",
    outputContract: "CuratorVerdict",
  },
].map((profile) => AgentProfileSchema.parse(profile));

const PROFILE_BY_ID = new Map(PROFILE_DEFINITIONS.map((profile) => [profile.id, profile]));
const PROFILE_BY_AGENT = new Map(
  PROFILE_DEFINITIONS.flatMap((profile) =>
    profile.agentName ? [[profile.agentName, profile] as const] : []
  )
);

export class AgentProfileRegistry {
  listProfiles(): AgentProfile[] {
    return [...PROFILE_DEFINITIONS];
  }

  getProfile(profileId: AgentProfileId): AgentProfile {
    const profile = PROFILE_BY_ID.get(profileId);
    if (!profile) {
      throw new AgentProfileAccessError(`Unknown agent profile: ${profileId}`);
    }
    return profile;
  }

  getProfileForAgent(agentName: AgentName): AgentProfile {
    const profile = PROFILE_BY_AGENT.get(agentName);
    if (!profile) {
      throw new AgentProfileAccessError(`No profile declared for agent: ${agentName}`);
    }
    return profile;
  }

  canUseTool(profileId: AgentProfileId, toolName: AgentToolName): boolean {
    const profile = this.getProfile(profileId);
    return profile.allowedTools.includes(toolName) && !profile.forbiddenTools.includes(toolName);
  }

  assertCanUseTool(profileId: AgentProfileId, toolName: AgentToolName): void {
    if (!this.canUseTool(profileId, toolName)) {
      throw new AgentToolAccessDeniedError(
        `Tool ${toolName} is not allowed for profile ${profileId}`
      );
    }
  }
}

export class AgentProfileAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentProfileAccessError";
  }
}

export class AgentToolAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolAccessDeniedError";
  }
}

export const defaultAgentProfileRegistry = new AgentProfileRegistry();
