import type {
  ShellCommandOutputEvent,
  ShellCommandRequest,
  ShellCommandResult,
} from "@u-build/shared";

export interface ShellCommandTaskSummary {
  readonly taskId: string;
  readonly commandId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly stdoutTail: string;
  readonly stderrTail: string;
}

export interface ShellCommandOutputRead {
  readonly taskId: string;
  readonly stream: "stdout" | "stderr";
  readonly offset: number;
  readonly nextOffset: number;
  readonly chunk: string;
}

export interface ShellCommandRuntimeExecuteInput {
  readonly request: ShellCommandRequest;
  readonly projectRootPath: string;
  readonly signal?: AbortSignal | undefined;
  readonly onOutput?: ((event: ShellCommandOutputEvent) => void) | undefined;
  readonly onComplete?: ((result: ShellCommandResult) => void) | undefined;
}

export interface ShellCommandRuntimePort {
  execute(input: ShellCommandRuntimeExecuteInput): Promise<ShellCommandResult>;
  listTasks?(
    input: { readonly projectRootPath: string; readonly limit?: number | undefined }
  ): Promise<ShellCommandTaskSummary[]>;
  readOutput?(
    input: {
      readonly projectRootPath: string;
      readonly taskId: string;
      readonly stream: "stdout" | "stderr";
      readonly offset?: number | undefined;
      readonly limit?: number | undefined;
    }
  ): Promise<ShellCommandOutputRead>;
}
