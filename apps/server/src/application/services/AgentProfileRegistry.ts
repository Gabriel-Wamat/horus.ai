import type {
  AgentName,
  AgentProfile,
  AgentProfileId,
  AgentToolCapability,
  AgentToolCapabilityDefinition,
  AgentToolProfileSummary,
  AgentToolName,
} from "@u-build/shared";
import {
  AgentToolCapabilityDefinitionSchema,
  AgentToolProfileSummarySchema,
  AgentProfileSchema,
} from "@u-build/shared";

const TOOL_CAPABILITY_DEFINITIONS: AgentToolCapabilityDefinition[] = [
  toolCapability("inspect_project", ["project_inspection", "project_read"], false, true),
  toolCapability("read_file", ["project_read"], false, true),
  toolCapability("search_code", ["project_search", "project_read"], false, true),
  toolCapability("list_files", ["project_read"], false, true),
  toolCapability("list_project_tree", ["project_read"], false, true),
  toolCapability("edit_file", ["project_mutation"], true, true),
  toolCapability("rewrite_file", ["project_mutation"], true, true),
  toolCapability("replace_file_range", ["project_mutation"], true, true),
  toolCapability("save_file", ["project_mutation"], true, true),
  toolCapability("apply_code_change_set", ["change_application", "project_mutation"], true, true),
  toolCapability("get_git_diff", ["diff_read"], false, true),
  toolCapability("search_code_readonly", ["project_search", "project_read"], false, true),
  toolCapability("read_file_readonly", ["project_read"], false, true),
  toolCapability("read_file_slice", ["project_read"], false, true),
  toolCapability("find_symbol", ["project_search", "project_read"], false, true),
  toolCapability("graph_neighbors", ["project_search", "project_read"], false, true),
  toolCapability("get_runtime_errors", ["evidence_read"], false, false),
  toolCapability("get_recent_diff", ["diff_read"], false, true),
  toolCapability("get_terminal_output", ["evidence_read"], false, false),
  toolCapability("explain_context_selection", ["project_search", "project_read"], false, true),
  toolCapability("list_project_files", ["project_read"], false, true),
  toolCapability("get_user_story", ["story_read"], false, false),
  toolCapability("get_spec", ["spec_read"], false, false),
  toolCapability("read_user_story", ["story_read"], false, false),
  toolCapability("read_project_manifest", ["project_inspection"], false, true),
  toolCapability("save_spec_revision", ["spec_write"], true, false),
  toolCapability("read_spec", ["spec_read"], false, false),
  toolCapability("read_agent_results", ["evidence_read"], false, false),
  toolCapability("create_assignment", ["assignment_routing"], false, false),
  toolCapability("update_assignment", ["assignment_routing"], false, false),
  toolCapability("propose_code_change_set", ["change_proposal"], false, true),
  toolCapability("run_static_analysis_readonly", ["validation_read"], false, true),
  toolCapability("read_code_change_set", ["evidence_read"], false, false),
  toolCapability("run_validation_command", ["validation_run"], false, true),
  toolCapability("inspect_preview", ["preview_inspection"], false, true),
  toolCapability("read_validation_evidence", ["evidence_read"], false, false),
  toolCapability("emit_verdict", ["verdict_emit"], false, false),
  toolCapability("write_file", ["project_mutation"], true, true),
  toolCapability("run_command", ["command_run"], false, true),
  toolCapability("git_push", ["external_publish"], true, true),
  toolCapability("delete_file", ["project_delete", "project_mutation"], true, true),
  toolCapability("write_project_file", ["project_mutation"], true, true),
  toolCapability("run_shell", ["unsafe_shell", "command_run"], false, true),
  toolCapability("direct_fs_write", ["project_mutation"], true, true),
  toolCapability("arbitrary_shell", ["unsafe_shell", "command_run"], false, true),
  toolCapability("run_arbitrary_command", ["unsafe_shell", "command_run"], false, true),
].map((definition) => AgentToolCapabilityDefinitionSchema.parse(definition));

const TOOL_CAPABILITY_BY_NAME = new Map(
  TOOL_CAPABILITY_DEFINITIONS.map((definition) => [definition.toolName, definition])
);

// Profiles allowed to hold project-mutation tools. front_agent mutates inside the
// Front->QA->Curator workflow; horus_chat_executor mutates inside the audited chat
// agent loop (read-before-edit evidence, diff + validation tooling).
const MUTATION_CAPABLE_PROFILES = new Set<AgentProfileId>([
  "front_agent",
  "horus_chat_executor",
]);

export interface AgentProfilePermissionContract {
  profileId: AgentProfileId;
  requiredAllowedTools: readonly AgentToolName[];
  deniedTools: readonly AgentToolName[];
  requiredCapabilities: readonly AgentToolCapability[];
  deniedCapabilities: readonly AgentToolCapability[];
}

const PROFILE_PERMISSION_CONTRACTS: readonly AgentProfilePermissionContract[] = [
  {
    profileId: "chat_agent",
    requiredAllowedTools: [
      "inspect_project",
      "read_file",
      "search_code",
      "list_files",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "explain_context_selection",
    ],
    deniedTools: [
      "write_file",
      "edit_file",
      "rewrite_file",
      "delete_file",
      "run_command",
      "run_validation_command",
      "apply_code_change_set",
    ],
    requiredCapabilities: ["project_read"],
    deniedCapabilities: ["project_mutation", "project_delete", "command_run"],
  },
  {
    profileId: "horus_chat_executor",
    requiredAllowedTools: [
      "read_file",
      "search_code",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "edit_file",
      "rewrite_file",
      "replace_file_range",
      "write_file",
      "delete_file",
      "get_git_diff",
      "inspect_preview",
      "run_command",
      "run_validation_command",
      "propose_code_change_set",
    ],
    deniedTools: [
      "apply_code_change_set",
      "git_push",
      "direct_fs_write",
      "arbitrary_shell",
      "run_arbitrary_command",
      "run_shell",
    ],
    requiredCapabilities: [
      "project_read",
      "project_mutation",
      "diff_read",
      "command_run",
      "validation_run",
    ],
    deniedCapabilities: ["change_application", "external_publish", "unsafe_shell"],
  },
  {
    profileId: "front_agent",
    requiredAllowedTools: [
      "read_file",
      "search_code",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "edit_file",
      "rewrite_file",
      "replace_file_range",
      "write_file",
      "delete_file",
      "get_git_diff",
      "inspect_preview",
      "run_command",
      "run_validation_command",
      "propose_code_change_set",
    ],
    deniedTools: [
      "apply_code_change_set",
      "git_push",
      "direct_fs_write",
      "arbitrary_shell",
      "run_arbitrary_command",
      "run_shell",
    ],
    requiredCapabilities: [
      "project_read",
      "project_mutation",
      "project_delete",
      "diff_read",
      "command_run",
      "validation_run",
      "change_proposal",
    ],
    deniedCapabilities: ["change_application", "external_publish", "unsafe_shell"],
  },
  {
    profileId: "qa_agent",
    requiredAllowedTools: [
      "read_file",
      "search_code",
      "list_files",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "run_command",
      "run_validation_command",
      "inspect_preview",
      "get_git_diff",
    ],
    deniedTools: [
      "write_file",
      "edit_file",
      "replace_file_range",
      "save_file",
      "delete_file",
      "apply_code_change_set",
      "git_push",
      "direct_fs_write",
      "arbitrary_shell",
      "run_arbitrary_command",
      "run_shell",
    ],
    requiredCapabilities: [
      "project_read",
      "command_run",
      "validation_run",
      "preview_inspection",
      "diff_read",
    ],
    deniedCapabilities: [
      "project_mutation",
      "project_delete",
      "change_application",
      "external_publish",
      "unsafe_shell",
    ],
  },
  {
    profileId: "curator_agent",
    requiredAllowedTools: [
      "read_file",
      "search_code",
      "list_files",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "run_validation_command",
      "get_git_diff",
    ],
    deniedTools: [
      "write_file",
      "edit_file",
      "replace_file_range",
      "save_file",
      "delete_file",
      "apply_code_change_set",
      "run_command",
      "git_push",
      "direct_fs_write",
      "arbitrary_shell",
      "run_arbitrary_command",
      "run_shell",
    ],
    requiredCapabilities: ["project_read", "validation_run", "diff_read"],
    deniedCapabilities: [
      "project_mutation",
      "project_delete",
      "change_application",
      "command_run",
      "external_publish",
      "unsafe_shell",
    ],
  },
];

const PROFILE_DEFINITIONS: AgentProfile[] = [
  {
    id: "chat_agent",
    label: "Chat Agent",
    purpose: "Answer questions and classify intent without mutating project files.",
    allowedTools: [
      "inspect_project",
      "search_code",
      "read_file",
      "list_files",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "search_code_readonly",
      "read_file_readonly",
      "list_project_files",
      "get_user_story",
      "get_spec",
    ],
    forbiddenTools: [
      "write_file",
      "rewrite_file",
      "run_command",
      "git_push",
      "delete_file",
    ],
    inputContract: "HorusChatTurnInput",
    outputContract: "HorusChatOutcome",
    isolationPolicy: {
      timeoutMs: 20_000,
      maxAttempts: 1,
      retryBackoffMs: 0,
      circuitBreaker: { failureThreshold: 5, cooldownMs: 30_000 },
    },
  },
  {
    id: "horus_chat_executor",
    label: "Horus Chat Executor",
    purpose:
      "Drive the Horus chat as a single tool-calling agent: read, search, validate and mutate the selected project through the audited tool engine.",
    allowedTools: [
      "inspect_project",
      "read_file",
      "search_code",
      "list_files",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "get_git_diff",
      "run_validation_command",
      "run_command",
      "edit_file",
      "rewrite_file",
      "replace_file_range",
      "write_file",
      "delete_file",
      "inspect_preview",
      "propose_code_change_set",
    ],
    forbiddenTools: [
      "apply_code_change_set",
      "git_push",
      "direct_fs_write",
      "arbitrary_shell",
      "run_arbitrary_command",
      "run_shell",
    ],
    inputContract: "HorusChatTurnInput",
    outputContract: "HorusChatOutcome",
    isolationPolicy: {
      timeoutMs: 180_000,
      maxAttempts: 1,
      retryBackoffMs: 0,
      circuitBreaker: { failureThreshold: 4, cooldownMs: 60_000 },
    },
  },
  {
    id: "spec_agent",
    agentName: "spec",
    label: "Spec Agent",
    purpose: "Create or update implementation specs from user stories and context.",
    allowedTools: [
      "inspect_project",
      "read_file",
      "search_code",
      "list_files",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "read_user_story",
      "read_project_manifest",
      "search_code_readonly",
      "save_spec_revision",
    ],
    forbiddenTools: ["write_project_file", "run_command"],
    inputContract: "UserStory",
    outputContract: "Spec",
    isolationPolicy: {
      timeoutMs: 180_000,
      maxAttempts: 2,
      retryBackoffMs: 500,
      circuitBreaker: { failureThreshold: 3, cooldownMs: 60_000 },
    },
  },
  {
    id: "odin_agent",
    agentName: "odin",
    label: "Odin Agent",
    purpose: "Plan assignments and route specialist agents.",
    allowedTools: [
      "inspect_project",
      "read_file",
      "search_code",
      "list_files",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "read_spec",
      "read_agent_results",
      "create_assignment",
      "update_assignment",
    ],
    forbiddenTools: ["write_project_file", "run_shell"],
    inputContract: "Spec + CuratorFeedback",
    outputContract: "AgentAssignmentPlan",
    isolationPolicy: {
      timeoutMs: 30_000,
      maxAttempts: 1,
      retryBackoffMs: 0,
      circuitBreaker: { failureThreshold: 5, cooldownMs: 30_000 },
    },
  },
  {
    id: "front_agent",
    agentName: "front",
    label: "Front Agent",
    purpose: "Produce auditable frontend CodeChangeSet proposals.",
    allowedTools: [
      "inspect_project",
      "search_code_readonly",
      "search_code",
      "read_file",
      "list_files",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "write_file",
      "edit_file",
      "rewrite_file",
      "replace_file_range",
      "save_file",
      "delete_file",
      "propose_code_change_set",
      "get_git_diff",
      "inspect_preview",
      "run_command",
      "run_validation_command",
    ],
    forbiddenTools: ["direct_fs_write", "arbitrary_shell", "git_push", "apply_code_change_set"],
    inputContract: "UserStory + Spec + CodeContext",
    outputContract: "CodeChangeSet",
    isolationPolicy: {
      timeoutMs: 180_000,
      maxAttempts: 2,
      retryBackoffMs: 500,
      circuitBreaker: { failureThreshold: 3, cooldownMs: 60_000 },
    },
  },
  {
    id: "qa_agent",
    agentName: "qa",
    label: "QA Agent",
    purpose: "Produce test cases and runtime validation evidence.",
    allowedTools: [
      "inspect_project",
      "read_file",
      "search_code",
      "list_files",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "run_command",
      "run_validation_command",
      "inspect_preview",
      "get_git_diff",
    ],
    forbiddenTools: [
      "write_project_file",
      "write_file",
      "edit_file",
      "rewrite_file",
      "replace_file_range",
      "save_file",
      "delete_file",
      "apply_code_change_set",
    ],
    inputContract: "Spec + CodeChangeSet",
    outputContract: "QaResult",
    isolationPolicy: {
      timeoutMs: 120_000,
      maxAttempts: 2,
      retryBackoffMs: 500,
      circuitBreaker: { failureThreshold: 3, cooldownMs: 60_000 },
    },
  },
  {
    id: "curator_agent",
    agentName: "curator",
    label: "Curator Agent",
    purpose: "Review final evidence and emit approval or rejection.",
    allowedTools: [
      "inspect_project",
      "read_file",
      "search_code",
      "list_files",
      "list_project_tree",
      "read_file_slice",
      "find_symbol",
      "graph_neighbors",
      "get_runtime_errors",
      "get_recent_diff",
      "get_terminal_output",
      "explain_context_selection",
      "run_validation_command",
      "get_git_diff",
    ],
    forbiddenTools: [
      "write_project_file",
      "write_file",
      "edit_file",
      "rewrite_file",
      "save_file",
      "delete_file",
      "apply_code_change_set",
      "run_command",
      "run_arbitrary_command",
    ],
    inputContract: "Spec + QaResult + RuntimeEvidence",
    outputContract: "CuratorVerdict",
    isolationPolicy: {
      timeoutMs: 120_000,
      maxAttempts: 1,
      retryBackoffMs: 0,
      circuitBreaker: { failureThreshold: 3, cooldownMs: 60_000 },
    },
  },
].map((profile) =>
  AgentProfileSchema.parse({
    ...profile,
    capabilityScopes: deriveCapabilityScopes(profile.allowedTools as AgentToolName[]),
  })
);

const PROFILE_BY_ID = new Map(PROFILE_DEFINITIONS.map((profile) => [profile.id, profile]));
const PROFILE_BY_AGENT = new Map(
  PROFILE_DEFINITIONS.flatMap((profile) =>
    profile.agentName ? [[profile.agentName, profile] as const] : []
  )
);

export class AgentProfileRegistry {
  constructor() {
    this.validateProfileDefinitions();
    this.validatePermissionContracts();
  }

  listProfiles(): AgentProfile[] {
    return [...PROFILE_DEFINITIONS];
  }

  listToolCapabilityDefinitions(): AgentToolCapabilityDefinition[] {
    return [...TOOL_CAPABILITY_DEFINITIONS];
  }

  listProfileSummaries(): AgentToolProfileSummary[] {
    return this.listProfiles().map((profile) => this.toProfileSummary(profile));
  }

  listPermissionContracts(): AgentProfilePermissionContract[] {
    return PROFILE_PERMISSION_CONTRACTS.map((contract) => ({
      profileId: contract.profileId,
      requiredAllowedTools: [...contract.requiredAllowedTools],
      deniedTools: [...contract.deniedTools],
      requiredCapabilities: [...contract.requiredCapabilities],
      deniedCapabilities: [...contract.deniedCapabilities],
    }));
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

  getToolCapabilityDefinition(toolName: AgentToolName): AgentToolCapabilityDefinition {
    const definition = TOOL_CAPABILITY_BY_NAME.get(toolName);
    if (!definition) {
      throw new AgentProfileAccessError(`No capability definition declared for tool: ${toolName}`);
    }
    return definition;
  }

  isToolMutating(toolName: AgentToolName): boolean {
    return this.getToolCapabilityDefinition(toolName).mutatesState;
  }

  getProfileSummary(profileId: AgentProfileId): AgentToolProfileSummary {
    return this.toProfileSummary(this.getProfile(profileId));
  }

  validateRegisteredToolReferences(input: {
    registeredTools: readonly AgentToolName[];
    profileIds?: readonly AgentProfileId[];
    toolNames?: readonly AgentToolName[];
    includeForbiddenTools?: boolean;
  }): void {
    this.validateProfileDefinitions();
    const registered = new Set(input.registeredTools);
    const requiredToolFilter = input.toolNames
      ? new Set(input.toolNames)
      : undefined;
    const profileFilter = input.profileIds
      ? new Set(input.profileIds)
      : undefined;
    const missing: string[] = [];

    for (const profile of this.listProfiles()) {
      if (profileFilter && !profileFilter.has(profile.id)) continue;
      const declared = input.includeForbiddenTools
        ? [...profile.allowedTools, ...profile.forbiddenTools]
        : profile.allowedTools;
      for (const toolName of declared) {
        if (requiredToolFilter && !requiredToolFilter.has(toolName)) continue;
        if (!registered.has(toolName)) {
          missing.push(`${profile.id}:${toolName}`);
        }
      }
    }

    if (missing.length > 0) {
      throw new AgentProfileAccessError(
        `Agent profile references unregistered tool(s): ${missing.join(", ")}`
      );
    }
  }

  assertCanUseTool(profileId: AgentProfileId, toolName: AgentToolName): void {
    if (!this.canUseTool(profileId, toolName)) {
      throw new AgentToolAccessDeniedError(
        `Tool ${toolName} is not allowed for profile ${profileId}`
      );
    }
  }

  assertToolRegistration(toolName: AgentToolName, mutatesState: boolean): void {
    const definition = this.getToolCapabilityDefinition(toolName);
    if (definition.mutatesState !== mutatesState) {
      throw new AgentProfileAccessError(
        `Tool ${toolName} registration mutatesState=${mutatesState} does not match capability registry mutatesState=${definition.mutatesState}`
      );
    }
  }

  validateProfileDefinitions(): void {
    for (const profile of PROFILE_DEFINITIONS) {
      const allowed = new Set(profile.allowedTools);
      const forbidden = new Set(profile.forbiddenTools);
      if (allowed.size !== profile.allowedTools.length) {
        throw new AgentProfileAccessError(`Profile ${profile.id} has duplicate allowed tools.`);
      }
      if (forbidden.size !== profile.forbiddenTools.length) {
        throw new AgentProfileAccessError(`Profile ${profile.id} has duplicate forbidden tools.`);
      }
      for (const toolName of [...profile.allowedTools, ...profile.forbiddenTools]) {
        this.getToolCapabilityDefinition(toolName);
      }
      for (const toolName of profile.allowedTools) {
        if (forbidden.has(toolName)) {
          throw new AgentProfileAccessError(
            `Profile ${profile.id} declares tool ${toolName} as both allowed and forbidden.`
          );
        }
      }
      if (!MUTATION_CAPABLE_PROFILES.has(profile.id)) {
        const projectMutationTools = profile.allowedTools.filter((toolName) => {
          const definition = this.getToolCapabilityDefinition(toolName);
          return definition.capabilities.includes("project_mutation");
        });
        if (projectMutationTools.length > 0) {
          throw new AgentProfileAccessError(
            `Profile ${profile.id} cannot allow project mutation tools: ${projectMutationTools.join(", ")}`
          );
        }
      }
    }
  }

  validatePermissionContracts(): void {
    const failures: string[] = [];
    for (const contract of PROFILE_PERMISSION_CONTRACTS) {
      const profile = this.getProfile(contract.profileId);
      const summary = this.toProfileSummary(profile);
      for (const toolName of contract.requiredAllowedTools) {
        if (!this.canUseTool(contract.profileId, toolName)) {
          failures.push(`${contract.profileId}:missing_allowed:${toolName}`);
        }
      }
      for (const toolName of contract.deniedTools) {
        if (this.canUseTool(contract.profileId, toolName)) {
          failures.push(`${contract.profileId}:unexpected_allowed:${toolName}`);
        }
      }
      for (const capability of contract.requiredCapabilities) {
        if (!summary.capabilityScopes.includes(capability)) {
          failures.push(`${contract.profileId}:missing_capability:${capability}`);
        }
      }
      for (const capability of contract.deniedCapabilities) {
        if (summary.capabilityScopes.includes(capability)) {
          failures.push(`${contract.profileId}:unexpected_capability:${capability}`);
        }
      }
    }

    if (failures.length > 0) {
      throw new AgentProfileAccessError(
        `Agent profile permission contract violation(s): ${failures.join(", ")}`
      );
    }
  }

  private toProfileSummary(profile: AgentProfile): AgentToolProfileSummary {
    const definitions = profile.allowedTools.map((toolName) =>
      this.getToolCapabilityDefinition(toolName)
    );
    return AgentToolProfileSummarySchema.parse({
      id: profile.id,
      ...(profile.agentName ? { agentName: profile.agentName } : {}),
      label: profile.label,
      purpose: profile.purpose,
      capabilityScopes: profile.capabilityScopes,
      allowedTools: profile.allowedTools,
      forbiddenTools: profile.forbiddenTools,
      readOnlyTools: definitions
        .filter((definition) => !definition.mutatesState && !definition.capabilities.includes("command_run"))
        .map((definition) => definition.toolName),
      mutatingTools: definitions
        .filter((definition) => definition.mutatesState)
        .map((definition) => definition.toolName),
      commandTools: definitions
        .filter((definition) => definition.capabilities.includes("command_run"))
        .map((definition) => definition.toolName),
    });
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

function toolCapability(
  toolName: AgentToolName,
  capabilities: AgentToolCapability[],
  mutatesState: boolean,
  requiresProjectContext: boolean
): AgentToolCapabilityDefinition {
  return {
    toolName,
    capabilities,
    mutatesState,
    requiresProjectContext,
    description: `${toolName} capability contract`,
  };
}

function deriveCapabilityScopes(toolNames: readonly AgentToolName[]): AgentToolCapability[] {
  return [
    ...new Set(
      toolNames.flatMap((toolName) =>
        TOOL_CAPABILITY_BY_NAME.get(toolName)?.capabilities ?? []
      )
    ),
  ].sort();
}
