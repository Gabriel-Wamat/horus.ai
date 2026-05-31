import { v4 as uuidv4 } from "uuid";
import {
  CodeChangeSetSchema,
  StructuralPatchIntentSchema,
  type CodeChangeSet,
  type CodeContextBundle,
  type RepositoryRetrievalCandidate,
  type StructuralPatchIntent,
  type UserStory,
  type WorkspaceArtifactContext,
} from "@u-build/shared";
import {
  AstPatchPlanner,
  compileStructuralPatchPlanToCodeChangeOperations,
} from "../../application/coding/AstPatchPlanner.js";
import type { AstAnalyzerPort } from "../../application/ports/index.js";
import { TreeSitterAstAnalyzer } from "../ast/TreeSitterAstAnalyzer.js";

export interface BuildStructuralPatchCodeChangeSetInput {
  workflowThreadId: string;
  userStory: UserStory;
  codeContext: CodeContextBundle;
  structuralPatchIntents: readonly StructuralPatchIntent[];
  artifactContext?: WorkspaceArtifactContext;
  astAnalyzer?: AstAnalyzerPort;
  planner?: AstPatchPlanner;
}

export async function buildStructuralPatchCodeChangeSet(
  input: BuildStructuralPatchCodeChangeSetInput
): Promise<CodeChangeSet> {
  const intents = input.structuralPatchIntents.map((intent) =>
    StructuralPatchIntentSchema.parse(intent)
  );
  if (intents.length === 0) {
    throw new Error("Structural patch requires at least one intent.");
  }

  const candidates = input.codeContext.files.map(toRetrievalCandidate);
  const astAnalyzer = input.astAnalyzer ?? new TreeSitterAstAnalyzer();
  const planner = input.planner ?? new AstPatchPlanner();
  const ast = await astAnalyzer.analyze({ candidates });
  const plan = await planner.plan({ ast, candidates, intents });

  if (plan.status !== "planned") {
    const diagnostics = plan.diagnostics
      .map((diagnostic) => {
        const location = diagnostic.path ? `${diagnostic.path}: ` : "";
        return `${location}${diagnostic.code} - ${diagnostic.message}`;
      })
      .join("; ");
    throw new Error(
      diagnostics
        ? `Structural patch plan blocked: ${diagnostics}`
        : "Structural patch plan blocked without diagnostics."
    );
  }

  return CodeChangeSetSchema.parse({
    id: uuidv4(),
    workflowThreadId: input.workflowThreadId,
    workspaceFolderId: input.artifactContext?.workspaceFolderId,
    userStoryId: input.userStory.id,
    specRevisionId: input.artifactContext?.specRevisionId,
    sourceAgent: "front",
    status: "proposed",
    operations: compileStructuralPatchPlanToCodeChangeOperations(plan),
    validation: [
      {
        command: "pending-controlled-frontend-validation",
        cwd: ".",
        exitCode: null,
        status: "not_run",
      },
    ],
    createdAt: new Date().toISOString(),
  });
}

function toRetrievalCandidate(
  file: CodeContextBundle["files"][number]
): RepositoryRetrievalCandidate {
  return {
    path: file.path,
    language: inferLanguage(file.path),
    bytes: file.bytes,
    content: file.content,
    startLine: file.startLine,
    ...(file.endLine ? { endLine: file.endLine } : {}),
    score: 100,
    matchedTerms: file.matchedTerms,
    excerpts: [],
  };
}

function inferLanguage(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js")) return "javascript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  return "text";
}
