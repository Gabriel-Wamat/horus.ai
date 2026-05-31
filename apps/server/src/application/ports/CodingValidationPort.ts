import type {
  CodingValidationPlanCommand,
  CodingValidationResult,
  HorusProjectConfig,
  StructuralPatchPlan,
} from "@u-build/shared";

export interface CodingValidationInput {
  readonly patchPlan: StructuralPatchPlan;
  readonly projectRootPath: string;
  readonly signal?: AbortSignal;
}

export interface CodingValidationPort {
  validate(input: CodingValidationInput): Promise<CodingValidationResult>;
}

export interface PreparedValidationWorkspace {
  readonly candidateRootPath: string;
  readonly config: HorusProjectConfig;
  readonly staticIssues: readonly string[];
  cleanup(): Promise<void>;
}

export interface CodingValidationWorkspacePort {
  prepare(input: {
    readonly patchPlan: StructuralPatchPlan;
    readonly projectRootPath: string;
  }): Promise<PreparedValidationWorkspace>;
}

export interface CodingValidationCommandRun {
  readonly commandId: string;
  readonly taskId?: string | null;
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly approvalRequired?: boolean;
  readonly risk?: "low" | "medium" | "high";
  readonly policyReason?: string | null;
  readonly approved?: boolean;
  readonly approvedBy?: string | null;
  readonly approvalReason?: string | null;
  readonly status:
    | "completed"
    | "failed"
    | "timed_out"
    | "aborted"
    | "rejected";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutPath?: string | null;
  readonly stderrPath?: string | null;
  readonly interactivePromptDetected?: boolean;
  readonly interactivePromptText?: string | null;
  readonly durationMs: number;
  readonly errorMessage: string | null;
}

export interface CodingValidationCommandRunnerPort {
  run(input: {
    readonly command: CodingValidationPlanCommand;
    readonly workspaceRootPath: string;
    readonly signal?: AbortSignal;
  }): Promise<CodingValidationCommandRun>;
}
