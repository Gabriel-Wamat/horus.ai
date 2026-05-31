import assert from "node:assert/strict";
import test from "node:test";
import { planQaRuntimeValidation } from "../dist/infrastructure/langgraph/nodes/qaRuntimeValidationPlanner.js";

test("planQaRuntimeValidation follows validation strategy order and de-duplicates commands", () => {
  const plan = planQaRuntimeValidation(snapshot({
    scripts: [
      script("build", "vite build", "build"),
      script("lint", "eslint .", "lint"),
      script("test", "vitest run", "test"),
      script("typecheck", "tsc --noEmit", "typecheck"),
      script("check", "tsc --noEmit", "check"),
    ],
    requirements: [
      requirement("type_check", "required", "typecheck"),
      requirement("build", "required", "build"),
      requirement("lint", "recommended", "lint"),
      requirement("test", "recommended", "test"),
      requirement("preview_smoke", "recommended"),
      requirement("build", "required", "build"),
    ],
  }));

  assert.deepEqual(plan.commandIds, [
    "type-check-root-typecheck",
    "build-root-build",
    "lint-root-lint",
    "test-root-test",
  ]);
  assert.deepEqual(plan.missingEvidence, []);
});

test("planQaRuntimeValidation falls back to executable validation scripts without strategy", () => {
  const plan = planQaRuntimeValidation(snapshot({
    scripts: [
      script("dev", "vite --host 0.0.0.0", "dev"),
      script("build", "vite build", "build"),
      script("check", "tsc --noEmit", "check"),
      script("lint", "eslint .", "lint"),
    ],
    requirements: [],
  }));

  assert.deepEqual(plan.commandIds, [
    "build-root-build",
    "check-root-check",
    "lint-root-lint",
  ]);
  assert.deepEqual(plan.missingEvidence, []);
});

test("planQaRuntimeValidation returns failed evidence when no command can validate", () => {
  const plan = planQaRuntimeValidation(snapshot({
    scripts: [script("dev", "vite", "dev")],
    requirements: [requirement("build", "required", "build")],
  }));

  assert.deepEqual(plan.commandIds, []);
  assert.equal(plan.missingEvidence.length, 1);
  assert.equal(plan.missingEvidence[0].commandId, "qa-validation-command-discovery");
  assert.equal(plan.missingEvidence[0].exitCode, 1);
  assert.equal(
    plan.missingEvidence[0].stderrTail.includes("QA validation commands unavailable"),
    true
  );
});

function script(name, command, category) {
  return { name, command, category };
}

function requirement(kind, level, scriptHint) {
  return {
    kind,
    level,
    reason: `${kind} should be considered by QA.`,
    ...(scriptHint ? { scriptHint } : {}),
  };
}

function snapshot({ scripts, requirements }) {
  return {
    projectId: "33333333-3333-4333-8333-333333333333",
    projectRootPath: "/tmp/horus-qa-planner",
    agentProfileId: "qa_agent",
    query: "Validate project",
    inspection: {
      projectId: "33333333-3333-4333-8333-333333333333",
      projectRootPath: "/tmp/horus-qa-planner",
      packageManager: { name: "pnpm", status: "detected", evidence: [] },
      framework: {
        name: "react-vite",
        status: "detected",
        confidence: 1,
        evidence: [],
      },
      scripts,
      roots: {
        sourceRoots: ["src"],
        testRoots: [],
        publicRoots: [],
        editableRoots: ["src"],
      },
      entrypoints: [],
      routes: [],
      editableFiles: [],
      protectedPaths: [],
      unsafePaths: [],
      warnings: [],
      stats: {
        filesScanned: 0,
        filesIncluded: 0,
        filesSkipped: 0,
        bytesIncluded: 0,
      },
      generatedAt: "2026-05-30T00:02:00.000Z",
    },
    codeContext: {
      projectId: "33333333-3333-4333-8333-333333333333",
      query: "Validate project",
      inspectedFiles: [],
      files: [],
      omittedFilesCount: 0,
      totalBytes: 0,
      limits: { maxFiles: 0, maxBytesPerFile: 0, maxTotalBytes: 0 },
    },
    validationStrategy: {
      stack: "react-vite",
      requirements,
      notes: [],
    },
    editRestrictions: {
      protectedPaths: [],
      unsafePaths: [],
      editableRoots: ["src"],
      forbiddenWritePatterns: [],
    },
    runtimeHints: [],
    runHistory: [],
    notes: [],
    generatedAt: "2026-05-30T00:02:00.000Z",
  };
}
