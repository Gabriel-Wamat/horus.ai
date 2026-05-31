import assert from "node:assert/strict";
import test from "node:test";
import { ProjectFailureAnalysisService } from "../dist/infrastructure/project/ProjectFailureAnalysisService.js";

test("ProjectFailureAnalysisService classifies validation failures deterministically", () => {
  const service = new ProjectFailureAnalysisService();

  const typeError = service.classify({
    commandId: "type-check-root-type-check",
    kind: "type_check",
    output: "src/App.tsx(1,1): error TS1005: ';' expected.",
    exitCode: 2,
  });
  assert.equal(typeError.category, "type_error");
  assert.equal(typeError.recoverable, true);
  assert.match(typeError.fingerprint, /^[0-9a-f]{16}$/);

  const policy = service.classify({
    commandId: "dangerous-command",
    kind: "command",
    output: "dangerous command blocked: destructive git reset",
    exitCode: null,
  });
  assert.equal(policy.category, "unsafe_command");
  assert.equal(policy.recoverable, false);
});

test("ProjectFailureAnalysisService normalizes volatile output in fingerprints", () => {
  const service = new ProjectFailureAnalysisService();
  const first = service.classify({
    commandId: "test-root-test",
    kind: "test",
    output: "2026-05-29T10:00:00.000Z PID:1234 AssertionError in 52ms",
    exitCode: 1,
  });
  const second = service.classify({
    commandId: "test-root-test",
    kind: "test",
    output: "2026-05-29T10:00:02.000Z PID:9999 AssertionError in 91ms",
    exitCode: 1,
  });

  assert.equal(first.category, "test_failure");
  assert.equal(first.fingerprint, second.fingerprint);
});
