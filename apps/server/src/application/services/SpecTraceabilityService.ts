import {
  SpecTraceabilityReportSchema,
  type CodeChangeSet,
  type RuntimeValidationEvidence,
  type Spec,
  type SpecRequirementRef,
  type SpecTraceabilityConfidence,
  type SpecTraceabilityEvidence,
  type SpecTraceabilityRecord,
  type SpecTraceabilityReport,
} from "@u-build/shared";

interface CuratorDecisionInput {
  passed: boolean;
  score: number;
  notes: string;
  missingItems: string[];
  fixTarget: "front" | "qa" | "both";
}

export interface BuildSpecTraceabilityInput {
  spec: Spec;
  codeChangeSet?: CodeChangeSet | undefined;
  qaOutput?: unknown;
  runtimeValidation?: RuntimeValidationEvidence | undefined;
  curatorFeedback?: CuratorDecisionInput | null | undefined;
  now?: Date | undefined;
}

interface EvidenceCandidate {
  evidence: SpecTraceabilityEvidence;
  text: string;
}

export class SpecTraceabilityService {
  build(input: BuildSpecTraceabilityInput): SpecTraceabilityReport {
    const requirements = requirementsFromSpec(input.spec);
    const candidates = evidenceCandidates(input);
    const records = requirements.map((requirement) =>
      traceRequirement({
        requirement,
        candidates,
        runtimeValidation: input.runtimeValidation,
        curatorFeedback: input.curatorFeedback ?? null,
      })
    );
    const uncoveredRequirements = records
      .filter((record) => record.status === "uncovered")
      .map((record) => record.requirement);
    const summary = {
      totalRequirements: records.length,
      covered: records.filter((record) => record.status === "covered").length,
      partial: records.filter((record) => record.status === "partial").length,
      uncovered: uncoveredRequirements.length,
    };

    return SpecTraceabilityReportSchema.parse({
      specId: input.spec.id,
      userStoryId: input.spec.userStoryId,
      generatedAt: (input.now ?? new Date()).toISOString(),
      records,
      uncoveredRequirements,
      summary,
    });
  }
}

function requirementsFromSpec(spec: Spec): SpecRequirementRef[] {
  const requirements: SpecRequirementRef[] = [
    ...spec.acceptanceCriteria.map((criterion, index) => ({
      id: `acceptance:${index + 1}`,
      kind: "acceptance_criterion" as const,
      label: `AC ${index + 1}`,
      text: criterion,
      index,
    })),
    ...spec.components.map((component, index) => ({
      id: `component:${index + 1}:${component.name}`,
      kind: "component" as const,
      label: component.name,
      text: `${component.name}. ${component.description}. dependencies: ${component.dependencies.join(", ")}`,
      index,
    })),
    ...spec.apiEndpoints.map((endpoint, index) => ({
      id: `api:${index + 1}:${endpoint.method}:${endpoint.path}`,
      kind: "api_endpoint" as const,
      label: `${endpoint.method} ${endpoint.path}`,
      text: `${endpoint.method} ${endpoint.path}. ${endpoint.description}`,
      index,
    })),
    ...spec.dataModels.map((model, index) => ({
      id: `data_model:${index + 1}`,
      kind: "data_model" as const,
      label: `Data model ${index + 1}`,
      text: model,
      index,
    })),
  ];

  requirements.push({
    id: "technical_approach:1",
    kind: "technical_approach",
    label: "Technical approach",
    text: spec.technicalApproach,
    index: 0,
  });

  if (spec.visualContract) {
    requirements.push({
      id: "visual_contract:1",
      kind: "visual_contract",
      label: "Visual contract",
      text: [
        spec.visualContract.layoutArchetype,
        spec.visualContract.tone,
        ...spec.visualContract.responsiveRules,
        ...spec.visualContract.accessibilityRules,
        ...spec.visualContract.antiPatterns,
      ].join(". "),
      index: 0,
    });
  }

  return requirements;
}

function evidenceCandidates(
  input: BuildSpecTraceabilityInput
): EvidenceCandidate[] {
  const candidates: EvidenceCandidate[] = [];
  if (input.codeChangeSet) {
    for (const operation of input.codeChangeSet.operations) {
      const base = {
        path: operation.targetPath,
        agentName: input.codeChangeSet.sourceAgent,
        sourceId: input.codeChangeSet.id,
      };
      candidates.push({
        evidence: {
          type: "code_file",
          label: `${operation.changeType} ${operation.targetPath}`,
          ...base,
          confidence: "medium",
          rationale: "CodeChangeSet operation targets this file.",
        },
        text: [operation.targetPath, operation.diff, operation.beforeContent ?? "", operation.afterContent ?? ""].join("\n"),
      });
      candidates.push({
        evidence: {
          type: "diff",
          label: `diff ${operation.targetPath}`,
          ...base,
          confidence: "medium",
          rationale: "Diff text is available for requirement matching.",
        },
        text: operation.diff,
      });
    }
  }

  for (const testCase of testCasesFromQaOutput(input.qaOutput)) {
    candidates.push({
      evidence: {
        type: "test_case",
        label: testCase.id,
        path: null,
        agentName: "qa",
        sourceId: testCase.id,
        confidence: "medium",
        rationale: "QA test case maps behavior back to a spec criterion.",
      },
      text: [testCase.criterion, ...testCase.steps, testCase.expected].join("\n"),
    });
  }

  if (input.runtimeValidation) {
    candidates.push({
      evidence: {
        type: "runtime_validation",
        label: `runtime ${input.runtimeValidation.status}`,
        path: null,
        agentName: "qa",
        sourceId: input.runtimeValidation.id,
        confidence: input.runtimeValidation.status === "passed" ? "medium" : "low",
        rationale: `Runtime validation status is ${input.runtimeValidation.status}.`,
      },
      text: [
        input.runtimeValidation.status,
        input.runtimeValidation.preview.message,
        input.runtimeValidation.skippedReason ?? "",
        ...input.runtimeValidation.commands.flatMap((command) => [
          command.commandId,
          command.command,
          String(command.exitCode ?? "null"),
          command.stdoutTail ?? "",
          command.stderrTail ?? "",
        ]),
      ].join("\n"),
    });
  }

  if (input.curatorFeedback) {
    candidates.push({
      evidence: {
        type: "curator_decision",
        label: input.curatorFeedback.passed ? "curator pass" : "curator fail",
        path: null,
        agentName: "curator",
        sourceId: null,
        confidence: input.curatorFeedback.passed ? "medium" : "low",
        rationale: "Curator decision compared implementation, tests, and spec.",
      },
      text: [
        input.curatorFeedback.notes,
        input.curatorFeedback.fixTarget,
        ...input.curatorFeedback.missingItems,
      ].join("\n"),
    });
  }

  return candidates;
}

function traceRequirement(input: {
  requirement: SpecRequirementRef;
  candidates: readonly EvidenceCandidate[];
  runtimeValidation?: RuntimeValidationEvidence | undefined;
  curatorFeedback?: CuratorDecisionInput | null | undefined;
}): SpecTraceabilityRecord {
  const requirementTokens = significantTokens(input.requirement.text);
  const evidence: SpecTraceabilityEvidence[] = [];
  let strongest: SpecTraceabilityConfidence = "low";

  for (const candidate of input.candidates) {
    const match = matchRequirement(requirementTokens, input.requirement, candidate.text);
    if (!match) continue;
    evidence.push({
      ...candidate.evidence,
      confidence: match.confidence,
      rationale: `${candidate.evidence.rationale} Matched ${match.matchedTokenCount} requirement token(s).`,
    });
    strongest = maxConfidence(strongest, match.confidence);
  }

  const gaps: string[] = [];
  if (evidence.length === 0) {
    gaps.push("No code, test, diff, runtime, or curator evidence matched this requirement.");
  }
  if (input.runtimeValidation?.status === "failed") {
    gaps.push("Runtime validation failed; coverage cannot be considered complete.");
  }
  if (
    input.curatorFeedback &&
    !input.curatorFeedback.passed &&
    curatorMentionsRequirement(input.curatorFeedback, requirementTokens)
  ) {
    gaps.push("Curator feedback explicitly mentions this requirement area.");
  }

  const status =
    evidence.length === 0 || gaps.length > 0
      ? evidence.length > 0
        ? "partial"
        : "uncovered"
      : strongest === "high" || evidence.length > 1
        ? "covered"
        : "partial";

  return {
    requirement: input.requirement,
    status,
    confidence: strongest,
    evidence,
    gaps,
  };
}

function matchRequirement(
  requirementTokens: readonly string[],
  requirement: SpecRequirementRef,
  candidateText: string
): { confidence: SpecTraceabilityConfidence; matchedTokenCount: number } | null {
  const candidateTokens = significantTokens(candidateText);
  if (candidateTokens.length === 0) return null;
  const candidateSet = new Set(candidateTokens);
  const matched = requirementTokens.filter((token) => candidateSet.has(token));
  const labelTokens = significantTokens(requirement.label);
  const labelMatched =
    labelTokens.length > 0 && labelTokens.every((token) => candidateSet.has(token));

  if (labelMatched && matched.length > 0) {
    return { confidence: "high", matchedTokenCount: matched.length };
  }
  if (matched.length >= 3) {
    return { confidence: "medium", matchedTokenCount: matched.length };
  }
  if (matched.length >= 1 && requirement.kind === "acceptance_criterion") {
    return { confidence: "low", matchedTokenCount: matched.length };
  }
  return null;
}

function curatorMentionsRequirement(
  feedback: CuratorDecisionInput,
  requirementTokens: readonly string[]
): boolean {
  const feedbackTokens = new Set(
    significantTokens([feedback.notes, ...feedback.missingItems].join("\n"))
  );
  return requirementTokens.some((token) => feedbackTokens.has(token));
}

function testCasesFromQaOutput(
  qaOutput: unknown
): Array<{ id: string; criterion: string; steps: string[]; expected: string }> {
  const record = asRecord(qaOutput);
  if (!Array.isArray(record["testCases"])) return [];
  return record["testCases"].flatMap((item) => {
    const test = asRecord(item);
    const id = stringValue(test["id"]);
    const criterion = stringValue(test["criterion"]);
    const expected = stringValue(test["expected"]);
    const steps = Array.isArray(test["steps"])
      ? test["steps"].filter((step): step is string => typeof step === "string")
      : [];
    if (!id || !criterion || !expected) return [];
    return [{ id, criterion, steps, expected }];
  });
}

function significantTokens(text: string): string[] {
  const tokens = tokenize(text);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.length < 3 || STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    result.push(token);
  }
  return result;
}

function tokenize(text: string): string[] {
  const normalized = text.normalize("NFD").toLowerCase();
  const tokens: string[] = [];
  let current = "";
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) continue;
    if (
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 95
    ) {
      current += char;
      continue;
    }
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function maxConfidence(
  left: SpecTraceabilityConfidence,
  right: SpecTraceabilityConfidence
): SpecTraceabilityConfidence {
  const rank = { low: 1, medium: 2, high: 3 };
  return rank[right] > rank[left] ? right : left;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "uma",
  "para",
  "com",
  "que",
  "deve",
  "dever",
  "dos",
  "das",
  "por",
  "sem",
  "quando",
  "onde",
  "como",
  "user",
  "story",
]);
