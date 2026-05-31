import assert from "node:assert/strict";
import test from "node:test";
import {
  CodingValidationPlanSchema,
  CodingValidationResultSchema,
} from "../dist/index.js";

const now = "2026-05-28T22:00:00.000Z";

test("CodingValidationPlanSchema models deterministic validation commands", () => {
  const plan = CodingValidationPlanSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    patchPlanId: "22222222-2222-4222-8222-222222222222",
    projectRootPath: "/tmp/project",
    commands: [
      {
        id: "type-check-root-type-check",
        kind: "type_check",
        executable: "pnpm",
        args: ["run", "type-check"],
        cwd: ".",
        required: true,
      },
    ],
    createdAt: now,
  });

  assert.equal(plan.commands[0].kind, "type_check");
  assert.equal(plan.commands[0].required, true);
});

test("CodingValidationResultSchema captures failure evidence and CodeChangeSet compatibility", () => {
  const result = CodingValidationResultSchema.parse({
    id: "33333333-3333-4333-8333-333333333333",
    planId: "11111111-1111-4111-8111-111111111111",
    patchPlanId: "22222222-2222-4222-8222-222222222222",
    status: "failed",
    passed: false,
    commands: [
      {
        commandId: "test-root-test",
        kind: "test",
        command: "pnpm run test",
        cwd: "/tmp/project",
        status: "failed",
        exitCode: 1,
        stdoutTail: "",
        stderrTail: "assertion failed",
        durationMs: 42,
        errorMessage: "command failed with exit code 1",
      },
    ],
    codeChangeValidation: [
      {
        command: "pnpm run test",
        cwd: "/tmp/project",
        exitCode: 1,
        status: "failed",
        stderr: "assertion failed",
      },
    ],
    issues: ["[test] test-root-test failed: assertion failed"],
    skippedReason: null,
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.commands[0].stderrTail, "assertion failed");
  assert.equal(result.codeChangeValidation[0].status, "failed");
});
