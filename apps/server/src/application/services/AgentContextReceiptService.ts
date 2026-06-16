import { createHash } from "node:crypto";
import type {
  AgentContextDiffHintReceipt,
  AgentContextChannel,
  AgentContextReceipt,
  AgentContextRetrievalChannel,
  AgentContextRuntimeHintReceipt,
  AgentName,
  AgentProfileId,
  CodeChangeSet,
  CodeContextBundle,
  ProjectContextSnapshot,
} from "@u-build/shared";
import { AgentContextReceiptSchema } from "@u-build/shared";

export interface BuildAgentContextReceiptInput {
  readonly threadId: string;
  readonly userStoryId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly agentName: AgentName;
  readonly agentProfileId: AgentProfileId;
  readonly snapshot?: ProjectContextSnapshot | undefined;
  readonly codeContext?: CodeContextBundle | undefined;
  readonly codeChangeSet?: CodeChangeSet | undefined;
  readonly now?: Date | undefined;
}

export class AgentContextReceiptService {
  build(input: BuildAgentContextReceiptInput): AgentContextReceipt {
    const codeContext = input.snapshot?.codeContext ?? input.codeContext;
    const generatedAt = (input.now ?? new Date()).toISOString();
    const snapshotId = buildSnapshotId(input.snapshot, codeContext);
    const selectedFiles = (codeContext?.files ?? []).map((file) => ({
      path: file.path,
      startLine: file.startLine,
      ...(file.endLine ? { endLine: file.endLine } : {}),
      bytes: file.bytes,
      hash: hash(file.content),
      channels: channelsForFile(file.path, codeContext, input.snapshot),
    }));
    const retrievalChannels = orderedRetrievalChannels(input, codeContext);
    const omittedFilesCount = codeContext?.omittedFilesCount ?? 0;

    return AgentContextReceiptSchema.parse({
      id: `context-receipt:${hash(
        [
          input.threadId,
          input.userStoryId ?? "",
          input.agentProfileId,
          snapshotId,
          generatedAt,
        ].join("\0")
      ).slice(0, 32)}`,
      snapshotId,
      threadId: input.threadId,
      ...(input.userStoryId ? { userStoryId: input.userStoryId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.snapshot?.projectId ? { projectId: input.snapshot.projectId } : {}),
      agentName: input.agentName,
      agentProfileId: input.agentProfileId,
      selectedFiles,
      selectionReasons: buildSelectionReasons(codeContext, input.snapshot),
      omittedFiles:
        omittedFilesCount > 0
          ? [
              {
                path: "<repository>",
                reason: "Context budget omitted additional readable files.",
                count: omittedFilesCount,
              },
            ]
          : [],
      budget: {
        maxFiles: codeContext?.limits.maxFiles ?? 1,
        maxBytesPerFile: codeContext?.limits.maxBytesPerFile ?? 1,
        maxTotalBytes: codeContext?.limits.maxTotalBytes ?? 1,
        selectedFiles: selectedFiles.length,
        selectedBytes: codeContext?.totalBytes ?? 0,
        omittedFiles: omittedFilesCount,
      },
      contextChannels: buildContextChannels(input, codeContext),
      retrievalStatus: codeContext?.retrievalStatus ?? "partial",
      retrievalChannels,
      hashes: Object.fromEntries(
        selectedFiles
          .filter((file) => file.hash)
          .map((file) => [file.path, file.hash as string])
      ),
      runtimeHints: buildRuntimeHints(input.snapshot),
      diffHints: buildDiffHints(input.codeChangeSet),
      confidence: contextConfidence(codeContext, input.snapshot),
      generatedAt,
    });
  }
}

function buildContextChannels(
  input: BuildAgentContextReceiptInput,
  codeContext: CodeContextBundle | undefined
): AgentContextChannel[] {
  const channels: AgentContextChannel[] = [
    "persistent_instructions",
    "user_story_spec",
  ];
  if (input.snapshot?.inspection) {
    channels.push("repo_structure");
  }
  if (codeContext?.structuralContext?.symbols.length) {
    channels.push("ast_symbols");
  }
  if (codeContext?.files.length) {
    channels.push("relevant_files");
  }
  if (input.codeChangeSet?.operations.length) {
    channels.push("diff");
  }
  if (input.snapshot?.runtimeHints.length) {
    channels.push("runtime_errors");
  }
  if (input.agentProfileId === "qa_agent" || input.agentProfileId === "curator_agent") {
    channels.push("tests");
  }
  if (input.agentProfileId === "odin_agent" || input.agentProfileId === "curator_agent") {
    channels.push("decisions");
  }
  return dedupe(channels);
}

function buildSnapshotId(
  snapshot: ProjectContextSnapshot | undefined,
  codeContext: CodeContextBundle | undefined
): string {
  return `ctx:${hash(
    JSON.stringify({
      projectId: snapshot?.projectId ?? codeContext?.projectId ?? null,
      query: snapshot?.query ?? codeContext?.query ?? null,
      generatedAt: snapshot?.generatedAt ?? null,
      files: codeContext?.files.map((file) => [file.path, file.bytes]) ?? [],
      retrievalStatus: codeContext?.retrievalStatus ?? null,
    })
  ).slice(0, 32)}`;
}

function channelsForFile(
  path: string,
  codeContext: CodeContextBundle | undefined,
  snapshot: ProjectContextSnapshot | undefined
): AgentContextRetrievalChannel[] {
  const channels: AgentContextRetrievalChannel[] = [];
  if (codeContext?.retrievalStats?.explicitPathCount) {
    channels.push("explicit_paths");
  }
  if (snapshot?.runtimeHints.some((hint) => hint.path === path)) {
    channels.push("runtime_errors");
  }
  if (codeContext) {
    channels.push("lexical_bm25");
  }
  if (codeContext?.structuralContext?.symbols.some((symbol) => symbol.path === path)) {
    channels.push("ast_symbols");
  }
  if (codeContext?.structuralContext) {
    channels.push("graph_neighbors");
  }
  if (
    codeContext?.structuralContext?.semanticMatches.some(
      (match) => match.path === path
    )
  ) {
    channels.push("semantic_embeddings", "reranker");
  }
  if (codeContext) {
    channels.push("budget_packer");
  }
  return dedupe(channels);
}

function orderedRetrievalChannels(
  input: BuildAgentContextReceiptInput,
  codeContext: CodeContextBundle | undefined
): AgentContextRetrievalChannel[] {
  const channels: AgentContextRetrievalChannel[] = [];
  if (codeContext?.retrievalStats?.explicitPathCount) {
    channels.push("explicit_paths");
  }
  if (input.snapshot?.runtimeHints.length) {
    channels.push("runtime_errors");
  }
  if (input.codeChangeSet?.operations.length) {
    channels.push("git_diff");
  }
  if (codeContext) {
    channels.push("lexical_bm25");
  }
  if (codeContext?.structuralContext?.symbols.length) {
    channels.push("ast_symbols");
  }
  if (codeContext?.structuralContext) {
    channels.push("graph_neighbors");
  }
  if (codeContext?.structuralContext?.semanticMatches.length) {
    channels.push("semantic_embeddings", "reranker");
  }
  if (codeContext) {
    channels.push("budget_packer");
  }
  if (input.snapshot) {
    channels.push("project_manifest");
  }
  return dedupe(channels);
}

function buildSelectionReasons(
  codeContext: CodeContextBundle | undefined,
  snapshot: ProjectContextSnapshot | undefined
) {
  if (!codeContext) return [];
  const fileReasons = codeContext.files.map((file) => ({
    path: file.path,
    reason:
      file.matchedTerms.length > 0
        ? `Matched terms: ${file.matchedTerms.join(", ")}.`
        : "Selected by repository retrieval ranker.",
    channel: "lexical_bm25" as const,
  }));
  const semanticReasons =
    codeContext.structuralContext?.semanticMatches.map((match) => ({
      path: match.path,
      reason: `Semantic/structural match: ${match.reasons.join(", ") || "ranked"}.`,
      channel: "semantic_embeddings" as const,
      score: match.score,
    })) ?? [];
  const runtimeReasons =
    snapshot?.runtimeHints.flatMap((hint) =>
      hint.path
        ? [
            {
              path: hint.path,
              reason: `${hint.kind}: ${hint.message}`,
              channel: "runtime_errors" as const,
            },
          ]
        : []
    ) ?? [];
  return [...fileReasons, ...semanticReasons, ...runtimeReasons].slice(0, 40);
}

function buildRuntimeHints(
  snapshot: ProjectContextSnapshot | undefined
): AgentContextRuntimeHintReceipt[] {
  return (snapshot?.runtimeHints ?? []).slice(0, 12).map((hint) => ({
    kind: hint.kind,
    source: hint.source,
    message: hint.message,
    ...(hint.path ? { path: hint.path } : {}),
    ...(hint.line ? { line: hint.line } : {}),
  }));
}

function buildDiffHints(
  codeChangeSet: CodeChangeSet | undefined
): AgentContextDiffHintReceipt[] {
  return (codeChangeSet?.operations ?? []).slice(0, 12).map((operation) => ({
    path: operation.targetPath,
    changeType: operation.changeType,
    summary: `${operation.changeType} proposed by ${codeChangeSet?.sourceAgent ?? "agent"}.`,
  }));
}

function contextConfidence(
  codeContext: CodeContextBundle | undefined,
  snapshot: ProjectContextSnapshot | undefined
): number {
  if (!codeContext) return 0.25;
  let score = 0.45;
  if (codeContext.retrievalStatus === "matched") score += 0.2;
  if (codeContext.files.length > 0) score += 0.1;
  if (codeContext.structuralContext?.status === "complete") score += 0.1;
  if (codeContext.structuralContext?.semanticMatches.length) score += 0.1;
  if (snapshot?.validationStrategy.stack !== "unknown") score += 0.05;
  return Math.min(1, Number(score.toFixed(2)));
}

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const defaultAgentContextReceiptService = new AgentContextReceiptService();
