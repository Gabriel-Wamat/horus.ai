import {
  AgentContextEnvelopeSchema,
  PromptContextBundleSchema,
  type AgentContextEnvelope,
  type AgentContextSection,
  type AgentContextSectionKind,
  type AgentName,
  type AgentProfileId,
  type CodeChangeSet,
  type CodeContextBundle,
  type DesignContextBundle,
  type OperationalMemorySummary,
  type PromptContextBundle,
  type RuntimeValidationEvidence,
  type Spec,
  type SpecTraceabilityReport,
  type UserStory,
  type WorkflowStatus,
} from "@u-build/shared";

interface CuratorDecisionInput {
  passed: boolean;
  score: number;
  notes: string;
  missingItems: string[];
  fixTarget: "front" | "qa" | "both";
}

export interface BuildAgentContextProfileInput {
  agentName: AgentName;
  agentProfileId: AgentProfileId;
  userStory?: UserStory | undefined;
  spec?: Spec | undefined;
  codeContext?: CodeContextBundle | undefined;
  designContext?: DesignContextBundle | undefined;
  codeChangeSet?: CodeChangeSet | undefined;
  qaOutput?: unknown;
  runtimeValidation?: RuntimeValidationEvidence | undefined;
  operationalMemory?: OperationalMemorySummary | undefined;
  traceability?: SpecTraceabilityReport | undefined;
  curatorFeedback?: CuratorDecisionInput | null | undefined;
  routingDecision?: readonly string[] | undefined;
  workflowStatus?: WorkflowStatus | undefined;
  retryCount?: number | undefined;
  now?: Date | undefined;
}

export class AgentContextProfileService {
  build(input: BuildAgentContextProfileInput): AgentContextEnvelope {
    const policy = profilePolicy(input.agentName);
    const sections = buildSections(input, policy.include);
    const envelope: AgentContextEnvelope = {
      agentName: input.agentName,
      agentProfileId: input.agentProfileId,
      purpose: policy.purpose,
      includeSections: policy.include,
      excludeSections: policy.exclude,
      sections,
      ...(input.operationalMemory
        ? { operationalMemory: input.operationalMemory }
        : {}),
      ...(input.traceability ? { traceability: input.traceability } : {}),
      generatedAt: (input.now ?? new Date()).toISOString(),
    };
    return AgentContextEnvelopeSchema.parse(envelope);
  }
}

export function attachAgentContextProfile(
  bundle: PromptContextBundle | undefined,
  profile: AgentContextEnvelope | undefined
): PromptContextBundle | undefined {
  if (!bundle || !profile) return bundle;
  return PromptContextBundleSchema.parse({
    ...bundle,
    contextProfile: profile,
  });
}

function profilePolicy(agentName: AgentName): {
  purpose: string;
  include: AgentContextSectionKind[];
  exclude: AgentContextSectionKind[];
} {
  if (agentName === "front") {
    return {
      purpose:
        "Implement frontend code with project structure, relevant source context, design rules, runtime failures, and retry memory.",
      include: [
        "spec_requirements",
        "project_structure",
        "code_context",
        "design_context",
        "runtime_errors",
        "curator_feedback",
        "operational_memory",
      ],
      exclude: ["status_decision"],
    };
  }
  if (agentName === "qa") {
    return {
      purpose:
        "Validate expected behavior using spec requirements, test targets, runtime evidence, and traceability gaps.",
      include: [
        "spec_requirements",
        "test_targets",
        "design_context",
        "runtime_errors",
        "traceability",
      ],
      exclude: ["code_context", "status_decision"],
    };
  }
  if (agentName === "curator") {
    return {
      purpose:
        "Judge the delivery by comparing spec requirements, diffs, tests, runtime evidence, operational memory, and traceability.",
      include: [
        "spec_requirements",
        "diff_evidence",
        "traceability",
        "operational_memory",
        "runtime_errors",
        "curator_feedback",
      ],
      exclude: ["code_context"],
    };
  }
  if (agentName === "odin") {
    return {
      purpose:
        "Route the workflow from status, curator decision, retry state, and next-step operational memory only.",
      include: ["status_decision", "operational_memory", "curator_feedback"],
      exclude: ["code_context", "design_context", "diff_evidence", "test_targets"],
    };
  }
  return {
    purpose:
      "Generate or update the technical specification from the user story and available project constraints.",
    include: ["spec_requirements", "project_structure", "design_context"],
    exclude: ["diff_evidence", "status_decision"],
  };
}

function buildSections(
  input: BuildAgentContextProfileInput,
  include: readonly AgentContextSectionKind[]
): AgentContextSection[] {
  const sections: AgentContextSection[] = [];
  const add = (section: AgentContextSection | undefined) => {
    if (section && include.includes(section.kind)) sections.push(section);
  };

  add(specSection(input.spec));
  add(projectStructureSection(input.codeContext));
  add(codeContextSection(input.codeContext));
  add(designContextSection(input.designContext));
  add(runtimeErrorsSection(input.runtimeValidation, input.operationalMemory));
  add(diffEvidenceSection(input.codeChangeSet));
  add(testTargetsSection(input.spec, input.qaOutput));
  add(operationalMemorySection(input.operationalMemory));
  add(traceabilitySection(input.traceability));
  add(statusDecisionSection(input));
  add(curatorFeedbackSection(input.curatorFeedback));

  return sections;
}

function specSection(spec: Spec | undefined): AgentContextSection | undefined {
  if (!spec) return undefined;
  return {
    kind: "spec_requirements",
    title: "Spec Requirements",
    priority: "critical",
    items: [
      `summary: ${bounded(spec.summary, 500)}`,
      `technical approach: ${bounded(spec.technicalApproach, 700)}`,
      ...spec.acceptanceCriteria.map(
        (criterion, index) => `AC${index + 1}: ${bounded(criterion, 400)}`
      ),
      ...spec.components.map(
        (component) =>
          `component ${component.name}: ${bounded(component.description, 300)}`
      ),
    ],
    diagnostics: [],
  };
}

function projectStructureSection(
  codeContext: CodeContextBundle | undefined
): AgentContextSection | undefined {
  if (!codeContext) return undefined;
  const manifest = codeContext.manifest;
  return {
    kind: "project_structure",
    title: "Project Structure",
    priority: "high",
    items: [
      `retrieval: ${codeContext.retrievalStatus}; inspected=${codeContext.inspectedFiles.length}; omitted=${codeContext.omittedFilesCount}`,
      ...(manifest
        ? [
            `stack: ${manifest.stack.frontend}/${manifest.stack.language}/${manifest.stack.packageManager}`,
            `entrypoints: ${manifest.entrypoints.join(", ") || "none"}`,
            `source roots: ${manifest.architecture.sourceRoots.join(", ") || "none"}`,
            `component roots: ${manifest.architecture.componentRoots.join(", ") || "none"}`,
            `route files: ${manifest.architecture.routeFiles.join(", ") || "none"}`,
          ]
        : ["manifest: unavailable"]),
    ],
    diagnostics: codeContext.retrievalNotes,
  };
}

function codeContextSection(
  codeContext: CodeContextBundle | undefined
): AgentContextSection | undefined {
  if (!codeContext) return undefined;
  return {
    kind: "code_context",
    title: "Code Context",
    priority: "critical",
    items: [
      ...codeContext.files
        .slice(0, 8)
        .map(
          (file) =>
            `${file.path}:${file.startLine}-${file.endLine ?? file.startLine}; bytes=${file.bytes}; matched=${file.matchedTerms.join(", ") || "none"}`
        ),
      ...((codeContext.structuralContext?.semanticMatches ?? [])
        .slice(0, 8)
        .map(
          (match) =>
            `semantic ${match.path}:${match.startLine}-${match.endLine}; score=${match.score}; symbols=${match.symbolNames.join(", ") || "none"}`
        )),
    ],
    diagnostics:
      codeContext.structuralContext?.diagnostics
        .slice(0, 8)
        .map(
          (diagnostic) =>
            `${diagnostic.severity} ${diagnostic.path}:${diagnostic.startLine ?? "?"} ${diagnostic.message}`
        ) ?? [],
  };
}

function designContextSection(
  designContext: DesignContextBundle | undefined
): AgentContextSection | undefined {
  if (!designContext) return undefined;
  return {
    kind: "design_context",
    title: "Design Context",
    priority: "high",
    items: [
      `summary: ${bounded(designContext.visualSummary, 700)}`,
      `source files: ${designContext.sourceFiles.join(", ") || "none"}`,
      ...designContext.components
        .slice(0, 8)
        .map(
          (component) =>
            `component ${component.name}${component.path ? ` at ${component.path}` : ""}: ${component.purpose ?? "no purpose"}`
        ),
      ...designContext.constraints.slice(0, 8).map((item) => `constraint: ${item}`),
    ],
    diagnostics: [...designContext.warnings, ...designContext.antiPatterns].slice(0, 12),
  };
}

function runtimeErrorsSection(
  runtimeValidation: RuntimeValidationEvidence | undefined,
  operationalMemory: OperationalMemorySummary | undefined
): AgentContextSection | undefined {
  const errors = operationalMemory?.errorsSeen ?? [];
  if (!runtimeValidation && errors.length === 0) return undefined;
  return {
    kind: "runtime_errors",
    title: "Runtime Feedback",
    priority: errors.length > 0 || runtimeValidation?.status === "failed" ? "critical" : "medium",
    items: [
      ...(runtimeValidation
        ? [
            `runtime status: ${runtimeValidation.status}`,
            `preview: ${runtimeValidation.preview.status} - ${runtimeValidation.preview.message}`,
            ...runtimeValidation.commands.map(
              (command) =>
                `command ${command.commandId}: exit=${command.exitCode ?? "null"} cwd=${command.cwd}`
            ),
          ]
        : []),
      ...errors.slice(-8).map((error) => `${error.source}: ${error.message}`),
    ],
    diagnostics: [],
  };
}

function diffEvidenceSection(
  codeChangeSet: CodeChangeSet | undefined
): AgentContextSection | undefined {
  if (!codeChangeSet) return undefined;
  return {
    kind: "diff_evidence",
    title: "Diff Evidence",
    priority: "critical",
    items: codeChangeSet.operations.map(
      (operation) =>
        `${operation.changeType} ${operation.targetPath}: ${bounded(operation.diff, 700)}`
    ),
    diagnostics: [
      `changeSet=${codeChangeSet.id}; status=${codeChangeSet.status}; source=${codeChangeSet.sourceAgent}`,
    ],
  };
}

function testTargetsSection(
  spec: Spec | undefined,
  qaOutput: unknown
): AgentContextSection | undefined {
  const testCases = extractTestCases(qaOutput);
  if (!spec && testCases.length === 0) return undefined;
  return {
    kind: "test_targets",
    title: "Test Targets",
    priority: "high",
    items: [
      ...(spec?.acceptanceCriteria.map(
        (criterion, index) => `expected AC${index + 1}: ${bounded(criterion, 400)}`
      ) ?? []),
      ...testCases.map(
        (test) => `test ${test.id}: ${bounded(test.criterion, 400)}`
      ),
    ],
    diagnostics: [],
  };
}

function operationalMemorySection(
  memory: OperationalMemorySummary | undefined
): AgentContextSection | undefined {
  if (!memory) return undefined;
  return {
    kind: "operational_memory",
    title: "Operational Memory",
    priority: "critical",
    items: [
      `files read: ${memory.filesRead.map((file) => file.path).join(", ") || "none"}`,
      `files changed: ${memory.filesChanged.map((file) => file.path).join(", ") || "none"}`,
      `commands: ${memory.commandsRun.map((command) => `${command.commandId}:${command.status}`).join(", ") || "none"}`,
      `attempts: ${memory.attempts.map((attempt) => `${attempt.attempt}:${attempt.status}`).join(", ") || "none"}`,
      `next step: ${memory.nextStep.reason}`,
    ],
    diagnostics: memory.errorsSeen.slice(-8).map((error) => error.message),
  };
}

function traceabilitySection(
  report: SpecTraceabilityReport | undefined
): AgentContextSection | undefined {
  if (!report) return undefined;
  return {
    kind: "traceability",
    title: "Spec Traceability",
    priority: report.summary.uncovered > 0 ? "critical" : "high",
    items: [
      `summary: covered=${report.summary.covered}; partial=${report.summary.partial}; uncovered=${report.summary.uncovered}; total=${report.summary.totalRequirements}`,
      ...report.records
        .filter((record) => record.status !== "covered")
        .slice(0, 12)
        .map(
          (record) =>
            `${record.status} ${record.requirement.label}: ${record.gaps.join(" | ") || "needs stronger evidence"}`
        ),
    ],
    diagnostics: [],
  };
}

function statusDecisionSection(
  input: BuildAgentContextProfileInput
): AgentContextSection | undefined {
  if (!input.workflowStatus && !input.routingDecision && input.retryCount === undefined) {
    return undefined;
  }
  return {
    kind: "status_decision",
    title: "Status Decision",
    priority: "critical",
    items: [
      `workflow status: ${input.workflowStatus ?? "unknown"}`,
      `retry count: ${input.retryCount ?? 0}`,
      `routing: ${input.routingDecision?.join(", ") || "not decided"}`,
      ...(input.operationalMemory
        ? [`next step: ${input.operationalMemory.nextStep.reason}`]
        : []),
    ],
    diagnostics: [],
  };
}

function curatorFeedbackSection(
  feedback: CuratorDecisionInput | null | undefined
): AgentContextSection | undefined {
  if (!feedback) return undefined;
  return {
    kind: "curator_feedback",
    title: "Curator Feedback",
    priority: feedback.passed ? "medium" : "critical",
    items: [
      `passed=${feedback.passed}; score=${feedback.score}; fixTarget=${feedback.fixTarget}`,
      `notes: ${bounded(feedback.notes, 800)}`,
      ...feedback.missingItems.map((item) => `missing: ${bounded(item, 500)}`),
    ],
    diagnostics: [],
  };
}

function extractTestCases(
  qaOutput: unknown
): Array<{ id: string; criterion: string }> {
  const record = asRecord(qaOutput);
  if (!Array.isArray(record["testCases"])) return [];
  return record["testCases"].flatMap((item) => {
    const test = asRecord(item);
    const id = stringValue(test["id"]);
    const criterion = stringValue(test["criterion"]);
    if (!id || !criterion) return [];
    return [{ id, criterion }];
  });
}

function bounded(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
