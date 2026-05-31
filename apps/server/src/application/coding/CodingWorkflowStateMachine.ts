import type {
  CodingRuntimeSignal,
  CodingRuntimeState,
} from "@u-build/shared";
import { isTerminalCodingRuntimeState } from "@u-build/shared";

export class CodingRuntimeIllegalTransitionError extends Error {
  constructor(
    readonly fromState: CodingRuntimeState,
    readonly signal: CodingRuntimeSignal
  ) {
    super(
      `Illegal coding runtime transition from ${fromState} with signal ${signal}`
    );
    this.name = "CodingRuntimeIllegalTransitionError";
  }
}

const TRANSITIONS: Record<
  CodingRuntimeState,
  Partial<Record<CodingRuntimeSignal, CodingRuntimeState>>
> = {
  accepted: {
    scan_requested: "scanning",
    task_failed: "failed",
    task_cancelled: "cancelled",
  },
  scanning: {
    scan_completed: "scanning",
    retrieval_requested: "retrieving",
    task_failed: "failed",
    task_cancelled: "cancelled",
  },
  retrieving: {
    retrieval_completed: "retrieving",
    ast_analysis_requested: "ast_analyzing",
    task_failed: "failed",
    task_cancelled: "cancelled",
  },
  ast_analyzing: {
    ast_analysis_completed: "ast_analyzing",
    patch_planning_requested: "planning_patch",
    task_failed: "failed",
    task_cancelled: "cancelled",
  },
  planning_patch: {
    patch_planning_completed: "planning_patch",
    ast_validation_requested: "validating_ast",
    task_failed: "failed",
    task_cancelled: "cancelled",
  },
  validating_ast: {
    ast_validation_completed: "validating_ast",
    runtime_validation_requested: "validating_runtime",
    task_failed: "failed",
    task_cancelled: "cancelled",
  },
  validating_runtime: {
    runtime_validation_completed: "validating_runtime",
    patch_apply_requested: "applying_patch",
    task_failed: "failed",
    task_cancelled: "cancelled",
  },
  applying_patch: {
    patch_apply_completed: "applying_patch",
    task_completed: "completed",
    task_failed: "failed",
    task_cancelled: "cancelled",
  },
  completed: {},
  failed: {},
  cancelled: {},
};

export class CodingWorkflowStateMachine {
  transition(
    current: CodingRuntimeState,
    signal: CodingRuntimeSignal
  ): CodingRuntimeState {
    if (isTerminalCodingRuntimeState(current)) {
      throw new CodingRuntimeIllegalTransitionError(current, signal);
    }
    const next = TRANSITIONS[current]?.[signal];
    if (!next) {
      throw new CodingRuntimeIllegalTransitionError(current, signal);
    }
    return next;
  }

  canTransition(
    current: CodingRuntimeState,
    signal: CodingRuntimeSignal
  ): boolean {
    if (isTerminalCodingRuntimeState(current)) return false;
    return Boolean(TRANSITIONS[current]?.[signal]);
  }
}
