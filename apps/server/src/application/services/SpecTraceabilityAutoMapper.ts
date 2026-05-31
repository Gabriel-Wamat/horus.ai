import type {
  CodeContextStructuralContext,
  ProjectContextSnapshot,
  Spec,
  SpecRequirementKind,
  SpecRequirementRef,
  SpecTraceabilityConfidence,
  SpecTraceabilityRecord,
  SpecTraceabilityReport,
} from "@u-build/shared";
import { SpecTraceabilityReportSchema } from "@u-build/shared";

// Auto-maps spec requirements to concrete project evidence (symbols, files,
// tests) by matching tokenized requirement labels against AST symbol names and
// file paths from a ProjectContextSnapshot. The output plugs straight into
// curator review and feeds the spec_traceability section of the agent envelope.
//
// This is a heuristic mapper — not LLM-driven. Its strength is determinism:
// the same spec + same project state yields the same coverage report, which
// the curator can rely on without re-prompting.

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "of",
  "to",
  "in",
  "on",
  "as",
  "be",
  "is",
  "are",
  "with",
  "from",
  "must",
  "should",
  "shall",
  "user",
  "system",
  "criterion",
  "criteria",
]);

export interface BuildAutoMappedTraceabilityInput {
  readonly spec: Spec;
  readonly userStoryId: string;
  readonly snapshot: ProjectContextSnapshot;
  readonly now?: (() => Date) | undefined;
}

export class SpecTraceabilityAutoMapper {
  build(input: BuildAutoMappedTraceabilityInput): SpecTraceabilityReport {
    const requirements = buildRequirementsFromSpec(input.spec);
    const symbolIndex = buildSymbolIndex(input.snapshot.codeContext.structuralContext);
    const fileIndex = buildFileIndex(input.snapshot);
    const testIndex = buildTestIndex(input.snapshot);

    const records: SpecTraceabilityRecord[] = requirements.map((requirement) =>
      mapRequirement({
        requirement,
        symbolIndex,
        fileIndex,
        testIndex,
      })
    );

    const summary = {
      totalRequirements: records.length,
      covered: records.filter((r) => r.status === "covered").length,
      partial: records.filter((r) => r.status === "partial").length,
      uncovered: records.filter((r) => r.status === "uncovered").length,
    };

    const report: SpecTraceabilityReport = {
      specId: input.spec.id,
      userStoryId: input.userStoryId,
      generatedAt: (input.now ?? (() => new Date()))().toISOString(),
      records,
      uncoveredRequirements: records
        .filter((record) => record.status === "uncovered")
        .map((record) => record.requirement),
      summary,
    };
    return SpecTraceabilityReportSchema.parse(report);
  }
}

interface SymbolEntry {
  name: string;
  path: string;
  startLine: number;
  endLine: number;
  kind: string;
}

interface FileEntry {
  path: string;
}

function buildRequirementsFromSpec(spec: Spec): SpecRequirementRef[] {
  const requirements: SpecRequirementRef[] = [];
  spec.acceptanceCriteria.forEach((criterion, index) => {
    requirements.push({
      id: `ac-${spec.id}-${index + 1}`,
      kind: "acceptance_criterion" as SpecRequirementKind,
      label: `AC${index + 1}`,
      text: criterion.trim(),
      index,
    });
  });
  spec.components.forEach((component, index) => {
    requirements.push({
      id: `component-${spec.id}-${component.name}-${index + 1}`,
      kind: "component" as SpecRequirementKind,
      label: component.name,
      text: `${component.name}: ${component.description ?? ""}`.trim(),
      index: spec.acceptanceCriteria.length + index,
    });
  });
  return requirements;
}

function buildSymbolIndex(
  structural: CodeContextStructuralContext | null | undefined
): SymbolEntry[] {
  if (!structural) return [];
  return structural.symbols.map((symbol) => ({
    name: symbol.name,
    path: symbol.path,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
    kind: symbol.kind,
  }));
}

function buildFileIndex(snapshot: ProjectContextSnapshot): FileEntry[] {
  return snapshot.codeContext.files.map((file) => ({ path: file.path }));
}

function buildTestIndex(snapshot: ProjectContextSnapshot): FileEntry[] {
  return snapshot.codeContext.files
    .filter((file) => /(\.|_)(test|spec)\./i.test(file.path))
    .map((file) => ({ path: file.path }));
}

function mapRequirement(input: {
  requirement: SpecRequirementRef;
  symbolIndex: readonly SymbolEntry[];
  fileIndex: readonly FileEntry[];
  testIndex: readonly FileEntry[];
}): SpecTraceabilityRecord {
  const tokens = tokenize(input.requirement.text + " " + input.requirement.label);
  const matchedSymbols = matchSymbols(tokens, input.symbolIndex);
  const matchedTests = matchFiles(tokens, input.testIndex);
  const matchedFiles = matchFiles(
    tokens,
    input.fileIndex.filter((file) => !input.testIndex.some((t) => t.path === file.path))
  );

  const evidence = [
    ...matchedSymbols.slice(0, 4).map((symbol) => ({
      type: "code_file" as const,
      label: `${symbol.kind} ${symbol.name}`,
      path: symbol.path,
      agentName: null,
      sourceId: null,
      confidence: "medium" as SpecTraceabilityConfidence,
      rationale: `Symbol "${symbol.name}" matches ${matchedTokens(tokens, symbol.name)} requirement keyword(s).`,
    })),
    ...matchedFiles.slice(0, 3).map((file) => ({
      type: "code_file" as const,
      label: file.path,
      path: file.path,
      agentName: null,
      sourceId: null,
      confidence: "low" as SpecTraceabilityConfidence,
      rationale: `Path "${file.path}" matches ${matchedTokens(tokens, file.path)} requirement keyword(s).`,
    })),
    ...matchedTests.slice(0, 3).map((file) => ({
      type: "test_case" as const,
      label: file.path,
      path: file.path,
      agentName: null,
      sourceId: null,
      confidence: "medium" as SpecTraceabilityConfidence,
      rationale: `Test file "${file.path}" matches ${matchedTokens(tokens, file.path)} requirement keyword(s).`,
    })),
  ];

  const hasSymbolOrFile = matchedSymbols.length > 0 || matchedFiles.length > 0;
  const hasTest = matchedTests.length > 0;
  const status =
    hasSymbolOrFile && hasTest
      ? "covered"
      : hasSymbolOrFile || hasTest
        ? "partial"
        : "uncovered";

  const confidence: SpecTraceabilityConfidence =
    status === "covered" ? "high" : status === "partial" ? "medium" : "low";

  const gaps: string[] = [];
  if (!hasSymbolOrFile) gaps.push("No code symbol or file found matching requirement keywords.");
  if (!hasTest) gaps.push("No test file found referencing requirement keywords.");

  return {
    requirement: input.requirement,
    status,
    confidence,
    evidence,
    gaps,
  };
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOPWORDS.has(token))
    )
  );
}

function matchSymbols(
  tokens: readonly string[],
  symbols: readonly SymbolEntry[]
): SymbolEntry[] {
  return symbols
    .map((symbol) => ({
      symbol,
      score: scoreText(tokens, symbol.name),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.symbol);
}

function matchFiles(
  tokens: readonly string[],
  files: readonly FileEntry[]
): FileEntry[] {
  return files
    .map((file) => ({ file, score: scoreText(tokens, file.path) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.file);
}

function scoreText(tokens: readonly string[], text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (lower.includes(token)) score += 1;
  }
  return score;
}

function matchedTokens(tokens: readonly string[], text: string): number {
  return scoreText(tokens, text);
}

export const defaultSpecTraceabilityAutoMapper = new SpecTraceabilityAutoMapper();
