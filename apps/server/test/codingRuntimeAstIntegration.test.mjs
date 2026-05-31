import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { AstAnalysisService } from "../dist/application/coding/AstAnalysisService.js";
import { CodingRuntimeOrchestrator } from "../dist/application/coding/CodingRuntimeOrchestrator.js";
import { RepositoryScanner } from "../dist/application/coding/RepositoryScanner.js";
import { TextRepositoryRetriever } from "../dist/application/coding/TextRepositoryRetriever.js";
import { TreeSitterAstAnalyzer } from "../dist/infrastructure/ast/TreeSitterAstAnalyzer.js";
import { FileCodingTaskRepository } from "../dist/infrastructure/repositories/FileCodingTaskRepository.js";

const projectId = "33333333-3333-4333-8333-333333333333";

test("coding runtime stores AST analysis artifact after retrieval", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-coding-ast-"));
  const projectRoot = join(baseDir, "repo");
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(
    join(projectRoot, "src", "App.tsx"),
    `
      import React from "react";
      export const App = () => <main>Horus</main>;
    `,
    "utf-8"
  );
  const orchestrator = new CodingRuntimeOrchestrator({
    taskRepository: new FileCodingTaskRepository(join(baseDir, "state")),
    steps: {
      scanner: new RepositoryScanner(),
      retriever: new TextRepositoryRetriever(),
      astAnalyzer: new AstAnalysisService(new TreeSitterAstAnalyzer()),
      patchPlanner: passingStep("patchPlanner"),
      astValidator: passingStep("astValidator"),
      runtimeValidator: passingStep("runtimeValidator"),
      patchApplier: passingStep("patchApplier"),
    },
    idGenerator: makeIdGenerator(buildUuidSequence(40)),
    now: () => new Date("2026-05-28T20:00:00.000Z"),
  });

  const created = await orchestrator.createTask({
    prompt: "Ajuste o componente App em src/App.tsx",
    projectId,
    projectRootPath: projectRoot,
    selectedPaths: ["src/App.tsx"],
  });
  const completed = await orchestrator.runTask(created.task.id);

  assert.equal(completed.task.state, "completed");
  const astArtifact = completed.task.artifacts.find(
    (artifact) => artifact.kind === "ast_analysis"
  );
  assert.ok(astArtifact);
  assert.equal(astArtifact.payload.status, "complete");
  assert.equal(astArtifact.payload.summary.parsedDocumentCount, 1);
  assert.ok(
    astArtifact.payload.documents[0].symbols.some(
      (symbol) => symbol.kind === "component" && symbol.name === "App"
    )
  );
});

function passingStep(name) {
  return {
    async execute() {
      return {
        message: `${name} ok`,
        metadata: { step: name },
      };
    },
  };
}

function makeIdGenerator(ids) {
  const queue = [...ids];
  return () => {
    const next = queue.shift();
    assert.ok(next, "test id queue exhausted");
    return next;
  };
}

function buildUuidSequence(count) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(12, "0");
    return `cccccccc-cccc-4ccc-8ccc-${suffix}`;
  });
}
