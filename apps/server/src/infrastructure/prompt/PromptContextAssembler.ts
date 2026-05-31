import {
  PromptContextBundleSchema,
  type AgentContextEnvelope,
  type AgentMemoryItem,
  type AgentMemoryScope,
  type AgentMemorySummary,
  type PromptBudgetSectionReport,
  type PromptContextBundle,
  type RuntimeAgentSkill,
} from "@u-build/shared";
import {
  AgentMemoryService,
  normalizeScope,
} from "../../application/services/AgentMemoryService.js";
import type { AgentSkillRegistryService } from "../agentSkills/AgentSkillRegistryService.js";

const DEFAULT_MAX_PROMPT_CONTEXT_BYTES = 28_000;
const DEFAULT_MEMORY_BYTES = 10_000;
const DEFAULT_SUMMARY_BYTES = 8_000;
const DEFAULT_SKILL_BYTES = 10_000;

export interface BuildPromptContextInput {
  agentProfileId: string;
  workflowThreadId?: string | undefined;
  runId?: string | undefined;
  attemptId?: string | undefined;
  workspaceFolderId?: string | undefined;
  userStoryId?: string | undefined;
  projectId?: string | undefined;
  chatSessionId?: string | undefined;
  triggerReason?: string | undefined;
  maxBytes?: number | undefined;
}

export class PromptContextAssembler {
  constructor(
    private readonly options: {
      memoryService?: AgentMemoryService | undefined;
      skillRegistry?: AgentSkillRegistryService | undefined;
    }
  ) {}

  async assemble(input: BuildPromptContextInput): Promise<PromptContextBundle> {
    const maxBytes = input.maxBytes ?? DEFAULT_MAX_PROMPT_CONTEXT_BYTES;
    const scope = normalizeScope({
      workspaceFolderId: input.workspaceFolderId ?? null,
      userStoryId: input.userStoryId ?? null,
      projectId: input.projectId ?? null,
      chatSessionId: input.chatSessionId ?? null,
      workflowThreadId: input.workflowThreadId ?? null,
      agentProfileId: input.agentProfileId,
    });
    const [memoryResult, runtimeSkills] = await Promise.all([
      this.options.memoryService
        ? this.options.memoryService.retrieveForPrompt({
            scope,
            agentProfileId: input.agentProfileId,
          })
        : Promise.resolve({ summaries: [], memories: [] }),
      this.options.skillRegistry
        ? this.options.skillRegistry.resolveRuntimeSkillsForAgent(
            input.agentProfileId,
            {
              workflowThreadId: input.workflowThreadId ?? null,
              runId: input.runId ?? null,
              attemptId: input.attemptId ?? null,
              triggerReason: input.triggerReason ?? "prompt_context",
            }
          )
        : Promise.resolve([]),
    ]);

    const summaries = clipSummaries(memoryResult.summaries, DEFAULT_SUMMARY_BYTES);
    const memories = clipMemories(memoryResult.memories, DEFAULT_MEMORY_BYTES);
    const skills = clipRuntimeSkills(runtimeSkills, DEFAULT_SKILL_BYTES);
    const sections: PromptBudgetSectionReport[] = [
      sectionReport("summaries", summaries),
      sectionReport("memories", memories),
      sectionReport("runtimeSkills", skills),
    ];
    const usedBytes = sections.reduce((sum, section) => sum + section.usedBytes, 0);
    const clippedBytes = sections.reduce(
      (sum, section) => sum + section.clippedBytes,
      0
    );
    const diagnostics = [
      ...(usedBytes > maxBytes
        ? [`prompt_context_over_budget:${usedBytes}/${maxBytes}`]
        : []),
      ...(clippedBytes > 0 ? [`prompt_context_clipped:${clippedBytes}`] : []),
      ...(runtimeSkills.length > skills.length
        ? [`runtime_skills_trimmed:${runtimeSkills.length - skills.length}`]
        : []),
    ];

    return PromptContextBundleSchema.parse({
      agentProfileId: input.agentProfileId,
      scope,
      summaries,
      memories,
      runtimeSkills: skills,
      budget: {
        maxBytes,
        usedBytes,
        clippedBytes,
        sections,
        diagnostics,
      },
    });
  }
}

export function formatPromptContextForPrompt(
  bundle: PromptContextBundle | undefined
): string {
  if (!bundle) return "";
  const summaryBlock =
    bundle.summaries.length > 0
      ? [
          "## Conversation Summaries",
          ...bundle.summaries.map(
            (summary) =>
              `- summary_id=${summary.id}; sources=${summary.sourceRefs
                .map((source) => `${source.type}:${source.id}`)
                .join(", ")}\n${summary.summary}`
          ),
        ].join("\n")
      : "";
  const memoryBlock =
    bundle.memories.length > 0
      ? [
          "## Scoped Memories",
          ...bundle.memories.map(
            (memory) =>
              `- memory_id=${memory.id}; kind=${memory.kind}; confidence=${memory.confidence}; sources=${memory.sourceRefs
                .map((source) => `${source.type}:${source.id}`)
                .join(", ")}\n${memory.content}`
          ),
        ].join("\n")
      : "";
  const skillBlock =
    bundle.runtimeSkills.length > 0
      ? [
          "## Runtime Skills Available",
          ...bundle.runtimeSkills.map(
            (skill) =>
              `- skill_id=${skill.skillId}; slug=${skill.slug}; revision=${skill.revisionNumber}; trigger=${skill.triggerMode}; hash=${skill.contentHash}`
          ),
        ].join("\n")
      : "";
  const contextProfileBlock = bundle.contextProfile
    ? formatAgentContextProfile(bundle.contextProfile)
    : "";
  const diagnostics = [
    `budget=${bundle.budget.usedBytes}/${bundle.budget.maxBytes} bytes`,
    ...bundle.budget.diagnostics,
  ].join("; ");
  return [
    "# Governed Prompt Context",
    `agent_profile_id=${bundle.agentProfileId}; ${diagnostics}`,
    "Use memories as scoped, source-cited hints only. Real project files, specs, tests and runtime validation override memory when they disagree.",
    summaryBlock,
    memoryBlock,
    skillBlock,
    contextProfileBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function summarizePromptContextForResult(
  bundle: PromptContextBundle | undefined
) {
  if (!bundle) return undefined;
  return {
    agentProfileId: bundle.agentProfileId,
    memoryIds: bundle.memories.map((memory) => memory.id),
    summaryIds: bundle.summaries.map((summary) => summary.id),
    runtimeSkillIds: bundle.runtimeSkills.map((skill) => skill.skillId),
    ...(bundle.contextProfile
      ? {
          contextProfile: {
            agentName: bundle.contextProfile.agentName,
            agentProfileId: bundle.contextProfile.agentProfileId,
            purpose: bundle.contextProfile.purpose,
            includeSections: bundle.contextProfile.includeSections,
            excludeSections: bundle.contextProfile.excludeSections,
            sectionKinds: bundle.contextProfile.sections.map(
              (section) => section.kind
            ),
            operationalNextStep:
              bundle.contextProfile.operationalMemory?.nextStep ?? null,
            traceabilitySummary:
              bundle.contextProfile.traceability?.summary ?? null,
          },
        }
      : {}),
    budget: bundle.budget,
  };
}

function formatAgentContextProfile(profile: AgentContextEnvelope): string {
  const lines: string[] = [
    "## Role-Specific Context Profile",
    `agent=${profile.agentName}; profile=${profile.agentProfileId}`,
    `purpose=${profile.purpose}`,
    `include=${profile.includeSections.join(", ") || "none"}`,
    `exclude=${profile.excludeSections.join(", ") || "none"}`,
  ];

  for (const section of profile.sections) {
    lines.push(
      `### ${section.title}`,
      `kind=${section.kind}; priority=${section.priority}`
    );
    if (section.items.length > 0) {
      lines.push(...section.items.map((item) => `- ${item}`));
    }
    if (section.diagnostics.length > 0) {
      lines.push(
        ...section.diagnostics.map((diagnostic) => `- diagnostic: ${diagnostic}`)
      );
    }
  }

  if (profile.operationalMemory) {
    const memory = profile.operationalMemory;
    lines.push(
      "### Operational Memory Snapshot",
      `files_read=${memory.filesRead.length}; files_changed=${memory.filesChanged.length}; commands=${memory.commandsRun.length}; errors=${memory.errorsSeen.length}; attempts=${memory.attempts.length}`,
      `next_step=${memory.nextStep.reason}; recommended_agent=${memory.nextStep.recommendedAgent ?? "none"}; blocked=${memory.nextStep.blocked}`
    );
    for (const error of memory.errorsSeen.slice(-3)) {
      lines.push(`- runtime_error: ${error.message}`);
    }
  }

  if (profile.traceability) {
    const trace = profile.traceability;
    lines.push(
      "### Spec Traceability Snapshot",
      `requirements=${trace.summary.totalRequirements}; covered=${trace.summary.covered}; partial=${trace.summary.partial}; uncovered=${trace.summary.uncovered}`
    );
    for (const record of trace.records.filter((item) => item.status !== "covered")) {
      lines.push(
        `- ${record.status}: ${record.requirement.kind} ${record.requirement.label}; gaps=${record.gaps.join(" | ") || "none"}`
      );
    }
  }

  return lines.join("\n");
}

function clipSummaries(
  summaries: AgentMemorySummary[],
  maxBytes: number
): AgentMemorySummary[] {
  return clipByJsonBytes(summaries, maxBytes);
}

function clipMemories(
  memories: AgentMemoryItem[],
  maxBytes: number
): AgentMemoryItem[] {
  return clipByJsonBytes(memories, maxBytes);
}

function clipRuntimeSkills(
  skills: RuntimeAgentSkill[],
  maxBytes: number
): RuntimeAgentSkill[] {
  return clipByJsonBytes(skills, maxBytes);
}

function clipByJsonBytes<T>(items: T[], maxBytes: number): T[] {
  const kept: T[] = [];
  let used = 0;
  for (const item of items) {
    const bytes = Buffer.byteLength(JSON.stringify(item), "utf8");
    if (used + bytes > maxBytes) break;
    kept.push(item);
    used += bytes;
  }
  return kept;
}

function sectionReport(
  name: string,
  items: unknown[]
): PromptBudgetSectionReport {
  return {
    name,
    itemCount: items.length,
    usedBytes: Buffer.byteLength(JSON.stringify(items), "utf8"),
    clippedBytes: 0,
  };
}
