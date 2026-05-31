import assert from "node:assert/strict";
import test from "node:test";
import { ProjectQualityGateService } from "../dist/infrastructure/project/ProjectQualityGateService.js";

const constructionRunId = "11111111-1111-4111-8111-111111111111";

function config(defaultValidationCommandIds = ["type-check-root-type-check"]) {
  return {
    version: 1,
    projectName: "Runtime Evidence",
    projectStack: "typescript-react",
    baseRef: "main",
    writeRoots: ["."],
    commandCatalog: [
      {
        id: "type-check-root-type-check",
        executable: "pnpm",
        args: ["run", "type-check"],
        cwd: ".",
        env: {},
      },
    ],
    testRunnerIds: defaultValidationCommandIds,
    bootstrapCommandIds: [],
    roleProfiles: {
      qa_specialist: {
        allowedCommandIds: ["type-check-root-type-check"],
        defaultValidationCommandIds,
      },
    },
  };
}

test("ProjectQualityGateService returns command runtime evidence for failed validation", async () => {
  const service = new ProjectQualityGateService(
    {
      executeCommandRequests: async () => [
        {
          id: "22222222-2222-4222-8222-222222222222",
          assignmentId: null,
          constructionRunId,
          commandId: "type-check-root-type-check",
          command: "pnpm run type-check",
          cwd: "/tmp/project",
          exitCode: 2,
          stdoutTail: "",
          stderrTail: "src/App.tsx(1,1): error TS1005",
          startedAt: "2026-05-26T00:00:00.000Z",
          finishedAt: "2026-05-26T00:00:01.000Z",
          durationMs: 1000,
          sandboxProfile: "safe-cli-runner",
        },
      ],
    },
    {
      readDiffStats: async () => ({ filesChanged: 1 }),
    }
  );

  const result = await service.run({
    constructionRunId,
    roleName: "qa_specialist",
    config: config(),
    projectRoot: "/tmp/project",
  });

  assert.equal(result.qualityGate.status, "failed");
  assert.equal(result.runtimeEvidence.status, "failed");
  assert.equal(result.runtimeEvidence.commands.length, 1);
  assert.equal(result.runtimeEvidence.commands[0].commandId, "type-check-root-type-check");
  assert.match(result.runtimeEvidence.commands[0].stderrTail, /TS1005/);
  assert.equal(result.qualityGate.failedChecks[0].failureAnalysis.category, "type_error");
  assert.equal(result.runtimeEvidence.preview.status, "skipped");
});

test("ProjectQualityGateService records skipped runtime evidence when no commands are configured", async () => {
  const service = new ProjectQualityGateService(
    {
      executeCommandRequests: async () => {
        throw new Error("No commands should execute");
      },
    },
    {
      readDiffStats: async () => ({}),
    }
  );

  const result = await service.run({
    constructionRunId,
    roleName: "qa_specialist",
    config: config([]),
    projectRoot: "/tmp/project",
  });

  assert.equal(result.qualityGate.status, "skipped");
  assert.equal(result.commandRuns.length, 0);
  assert.equal(result.runtimeEvidence.status, "skipped");
  assert.match(result.runtimeEvidence.skippedReason, /No default validation commands/);
});

test("ProjectQualityGateService treats dependency repair retry as passing when the latest command succeeds", async () => {
  const service = new ProjectQualityGateService(
    {
      executeCommandRequests: async () => [
        {
          id: "22222222-2222-4222-8222-222222222222",
          assignmentId: null,
          constructionRunId,
          commandId: "type-check-root-type-check",
          command: "pnpm run type-check",
          cwd: "/tmp/project",
          exitCode: 1,
          stdoutTail: "",
          stderrTail: "Cannot find module typescript",
          startedAt: "2026-05-26T00:00:00.000Z",
          finishedAt: "2026-05-26T00:00:01.000Z",
          durationMs: 1000,
          sandboxProfile: "safe-cli-runner",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          assignmentId: null,
          constructionRunId,
          commandId: "install-root-dependencies",
          command: "pnpm install",
          cwd: "/tmp/project",
          exitCode: 0,
          stdoutTail: "installed",
          stderrTail: "",
          startedAt: "2026-05-26T00:00:01.000Z",
          finishedAt: "2026-05-26T00:00:02.000Z",
          durationMs: 1000,
          sandboxProfile: "safe-cli-runner",
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          assignmentId: null,
          constructionRunId,
          commandId: "type-check-root-type-check",
          command: "pnpm run type-check",
          cwd: "/tmp/project",
          exitCode: 0,
          stdoutTail: "ok",
          stderrTail: "",
          startedAt: "2026-05-26T00:00:02.000Z",
          finishedAt: "2026-05-26T00:00:03.000Z",
          durationMs: 1000,
          sandboxProfile: "safe-cli-runner",
        },
      ],
    },
    {
      readDiffStats: async () => ({ filesChanged: 1 }),
    }
  );

  const result = await service.run({
    constructionRunId,
    roleName: "qa_specialist",
    config: config(),
    projectRoot: "/tmp/project",
  });

  assert.equal(result.qualityGate.status, "passed");
  assert.equal(result.qualityGate.checks.length, 3);
  assert.equal(result.qualityGate.failedChecks.length, 0);
  assert.equal(result.commandRuns.length, 3);
  assert.equal(result.runtimeEvidence.status, "passed");
});
