import assert from "node:assert/strict";
import test from "node:test";
import { buildRuntimeValidationEvidenceFromPreviewSmoke } from "../dist/infrastructure/agents/QaAgentImpl.js";

const workflowThreadId = "11111111-1111-4111-8111-111111111111";
const userStoryId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";

test("QA runtime evidence fails when preview smoke is blocked despite passing commands", () => {
  const evidence = buildRuntimeValidationEvidenceFromPreviewSmoke({
    workflowThreadId,
    userStoryId,
    projectId,
    previewSmoke: {
      status: "blocked",
      reason: "missing_preview_session_id",
      elapsedMs: 0,
      checkedAt: "2026-05-30T00:00:00.000Z",
    },
    commands: [
      {
        commandId: "build-root-build",
        command: "pnpm run build",
        cwd: ".",
        exitCode: 0,
        stdoutTail: "ok",
        stderrTail: "",
        durationMs: 100,
      },
    ],
  });

  assert.equal(evidence.status, "failed");
  assert.equal(evidence.preview.status, "failed");
  assert.equal(evidence.skippedReason, "missing_preview_session_id");
});

test("QA runtime evidence fails on interactive command prompts before approving the run", () => {
  const evidence = buildRuntimeValidationEvidenceFromPreviewSmoke({
    workflowThreadId,
    userStoryId,
    projectId,
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
        durationMs: 100,
      },
    ],
  });

  assert.equal(evidence.status, "failed");
  assert.match(evidence.skippedReason, /interactive_prompt/);
});

test("QA runtime evidence keeps repair history but passes when latest command attempts pass", () => {
  const evidence = buildRuntimeValidationEvidenceFromPreviewSmoke({
    workflowThreadId,
    userStoryId,
    projectId,
    commands: [
      {
        commandId: "build-root-build",
        command: "pnpm run build",
        cwd: ".",
        exitCode: 1,
        stdoutTail: "",
        stderrTail: "vite: command not found",
        durationMs: 100,
      },
      {
        commandId: "install-root-dependencies",
        command: "pnpm install",
        cwd: ".",
        exitCode: 0,
        stdoutTail: "installed",
        stderrTail: "",
        durationMs: 100,
      },
      {
        commandId: "build-root-build",
        command: "pnpm run build",
        cwd: ".",
        exitCode: 0,
        stdoutTail: "ok",
        stderrTail: "",
        durationMs: 100,
      },
    ],
  });

  assert.equal(evidence.status, "passed");
  assert.equal(evidence.commands.length, 3);
  assert.equal(evidence.skippedReason, null);
});
