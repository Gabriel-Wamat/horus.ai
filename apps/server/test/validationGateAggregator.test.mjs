import assert from "node:assert/strict";
import test from "node:test";
import { ValidationGateAggregator } from "../dist/application/services/ValidationGateAggregator.js";

const now = "2026-05-26T10:00:00.000Z";

test("ValidationGateAggregator returns completed only when required gates pass", () => {
  const aggregator = new ValidationGateAggregator();
  const summary = aggregator.summarize([
    gate("schema_valid", "Schema", "passed"),
    gate("curator_verdict", "Curator", "passed"),
  ]);

  assert.equal(summary.finalStatus, "completed");
  assert.equal(summary.passedCount, 2);
});

test("ValidationGateAggregator marks skipped required gates as completed_unverified", () => {
  const aggregator = new ValidationGateAggregator();
  const summary = aggregator.summarize([
    gate("schema_valid", "Schema", "passed"),
    gate("runtime_validation", "Runtime", "skipped"),
  ]);

  assert.equal(summary.finalStatus, "completed_unverified");
  assert.match(summary.message, /skipped/);
});

test("ValidationGateAggregator makes failed and blocked gates override success prose", () => {
  const aggregator = new ValidationGateAggregator();

  assert.equal(
    aggregator.summarize([
      gate("curator_verdict", "Curator", "passed"),
      gate("build", "Build", "failed"),
    ]).finalStatus,
    "failed_validation"
  );

  assert.equal(
    aggregator.summarize([
      gate("curator_verdict", "Curator", "passed"),
      gate("permission", "Permission", "blocked"),
    ]).finalStatus,
    "blocked"
  );
});

test("ValidationGateAggregator derives gates from runtime validation evidence", () => {
  const aggregator = new ValidationGateAggregator();
  const gates = aggregator.gatesFromRuntimeEvidence({
    workflowMode: "project_construction",
    curatorPassed: true,
    now,
    runtimeEvidence: {
      id: "11111111-1111-4111-8111-111111111111",
      workflowThreadId: null,
      constructionRunId: null,
      userStoryId: null,
      projectId: null,
      status: "failed",
      skippedReason: null,
      commands: [
        {
          commandId: "type-check",
          command: "pnpm type-check",
          cwd: ".",
          exitCode: 1,
          stdoutTail: "",
          stderrTail: "Type error",
          durationMs: 20,
        },
      ],
      preview: {
        status: "skipped",
        url: null,
        message: "Preview unavailable.",
        evidence: { title: null, bodySnippet: null, screenshotPath: null },
      },
      createdAt: now,
    },
  });

  const summary = aggregator.summarize(gates);
  assert.equal(summary.finalStatus, "failed_validation");
  assert.ok(gates.some((item) => item.commandId === "type-check"));
});

test("ValidationGateAggregator blocks commands waiting for approval or interactive input", () => {
  const aggregator = new ValidationGateAggregator();
  const gates = aggregator.gatesFromRuntimeEvidence({
    workflowMode: "project_construction",
    now,
    runtimeEvidence: {
      id: "11111111-1111-4111-8111-111111111111",
      workflowThreadId: null,
      constructionRunId: null,
      userStoryId: null,
      projectId: null,
      status: "failed",
      skippedReason: "interactive_prompt:Continue? [y/n]",
      commands: [
        {
          commandId: "build-root-build",
          command: "pnpm run build",
          cwd: ".",
          exitCode: null,
          stdoutTail: "Continue? [y/n]",
          stderrTail: "",
          interactivePromptDetected: true,
          interactivePromptText: "Continue? [y/n]",
          durationMs: 20,
        },
        {
          commandId: "install-root-dependencies",
          command: "pnpm install",
          cwd: ".",
          approvalRequired: true,
          approved: false,
          policyReason: "package manager command requires approval: pnpm install",
          exitCode: null,
          stdoutTail: "",
          stderrTail: "",
          durationMs: 20,
        },
      ],
      preview: {
        status: "skipped",
        url: null,
        message: "Preview unavailable.",
        evidence: { title: null, bodySnippet: null, screenshotPath: null },
      },
      createdAt: now,
    },
  });

  assert.equal(aggregator.summarize(gates).finalStatus, "blocked");
  assert.equal(
    gates.find((item) => item.commandId === "build-root-build")?.status,
    "blocked"
  );
  assert.equal(
    gates.find((item) => item.commandId === "install-root-dependencies")?.status,
    "blocked"
  );
});

function gate(id, label, status) {
  return {
    id,
    label,
    status,
    required: true,
    message: `${label}: ${status}`,
    evidenceType: "quality_gate",
    commandId: null,
    filePaths: [],
    createdAt: now,
  };
}
