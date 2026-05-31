import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const protectedFiles = [
  "apps/server/src/application/services/AgenticTextParsing.ts",
  "apps/server/src/application/services/HorusChatAgentStreamEvents.ts",
  "apps/server/src/application/services/HorusChatCodeContextPolicy.ts",
  "apps/server/src/application/services/HorusChatConversationSummary.ts",
  "apps/server/src/application/services/HorusChatOutcomeBuilders.ts",
  "apps/server/src/application/services/HorusChatSuggestedActions.ts",
  "apps/server/src/application/services/HorusChatTurnConcurrency.ts",
  "apps/server/src/application/services/HorusChatTurnMetadata.ts",
  "apps/server/src/application/services/HorusChatTurnReplay.ts",
  "apps/server/src/application/services/HorusOdinIntentRouter.ts",
  "apps/server/src/application/services/ChatContextAssembler.ts",
  "apps/server/src/application/coding/ChatCodingPlanner.ts",
  "apps/server/src/application/coding/ChatCodingRequestParser.ts",
  "apps/server/src/application/tools/ProjectAgentFileEditOperations.ts",
  "apps/server/src/application/tools/registerProjectAgentTools.ts",
  "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts",
  "apps/server/src/infrastructure/code/FileMutationPathPolicy.ts",
  "apps/server/src/infrastructure/code/FileMutationPreflightApplier.ts",
  "apps/server/src/infrastructure/code/FileMutationPreflightErrors.ts",
  "apps/server/src/infrastructure/agents/HorusChatToolDiagnostics.ts",
  "apps/server/src/infrastructure/agents/HorusChatToolAgent.ts",
];

test("agentic chat parsing critical path stays regex-free", () => {
  const findings = protectedFiles.flatMap((file) =>
    collectDisallowedRegexUsage(path.join(repoRoot, file), file)
  );

  assert.deepEqual(findings, []);
});

function collectDisallowedRegexUsage(absoluteFilePath, displayPath) {
  const sourceText = readFileSync(absoluteFilePath, "utf8");
  const sourceFile = ts.createSourceFile(
    displayPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const findings = [];

  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      findings.push(formatFinding(sourceFile, node, "regex literal"));
    }

    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "RegExp"
    ) {
      findings.push(formatFinding(sourceFile, node, "RegExp constructor"));
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "RegExp"
    ) {
      findings.push(formatFinding(sourceFile, node, "RegExp call"));
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

function formatFinding(sourceFile, node, reason) {
  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile)
  );
  return `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}:${reason}`;
}
