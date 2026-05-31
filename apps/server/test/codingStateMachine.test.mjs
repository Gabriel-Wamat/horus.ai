import assert from "node:assert/strict";
import test from "node:test";
import {
  CodingRuntimeIllegalTransitionError,
  CodingWorkflowStateMachine,
} from "../dist/application/coding/CodingWorkflowStateMachine.js";

test("CodingWorkflowStateMachine follows the deterministic coding pipeline", () => {
  const machine = new CodingWorkflowStateMachine();
  let state = "accepted";

  for (const [signal, expected] of [
    ["scan_requested", "scanning"],
    ["scan_completed", "scanning"],
    ["retrieval_requested", "retrieving"],
    ["retrieval_completed", "retrieving"],
    ["ast_analysis_requested", "ast_analyzing"],
    ["ast_analysis_completed", "ast_analyzing"],
    ["patch_planning_requested", "planning_patch"],
    ["patch_planning_completed", "planning_patch"],
    ["ast_validation_requested", "validating_ast"],
    ["ast_validation_completed", "validating_ast"],
    ["runtime_validation_requested", "validating_runtime"],
    ["runtime_validation_completed", "validating_runtime"],
    ["patch_apply_requested", "applying_patch"],
    ["patch_apply_completed", "applying_patch"],
    ["task_completed", "completed"],
  ]) {
    state = machine.transition(state, signal);
    assert.equal(state, expected);
  }
});

test("CodingWorkflowStateMachine rejects skipped or terminal transitions", () => {
  const machine = new CodingWorkflowStateMachine();

  assert.throws(
    () => machine.transition("accepted", "retrieval_requested"),
    (err) =>
      err instanceof CodingRuntimeIllegalTransitionError &&
      err.fromState === "accepted" &&
      err.signal === "retrieval_requested"
  );
  assert.throws(
    () => machine.transition("completed", "task_failed"),
    CodingRuntimeIllegalTransitionError
  );
  assert.equal(machine.canTransition("accepted", "scan_requested"), true);
  assert.equal(machine.canTransition("accepted", "patch_apply_requested"), false);
  assert.equal(machine.canTransition("failed", "task_cancelled"), false);
});

test("CodingWorkflowStateMachine allows bounded failure and cancellation exits", () => {
  const machine = new CodingWorkflowStateMachine();

  assert.equal(machine.transition("retrieving", "task_failed"), "failed");
  assert.equal(machine.transition("planning_patch", "task_cancelled"), "cancelled");
});
