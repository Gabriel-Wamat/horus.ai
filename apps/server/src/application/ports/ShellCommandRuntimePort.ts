import type {
  ShellCommandOutputEvent,
  ShellCommandRequest,
  ShellCommandResult,
} from "@u-build/shared";

export interface ShellCommandRuntimeExecuteInput {
  readonly request: ShellCommandRequest;
  readonly projectRootPath: string;
  readonly signal?: AbortSignal | undefined;
  readonly onOutput?: ((event: ShellCommandOutputEvent) => void) | undefined;
  readonly onComplete?: ((result: ShellCommandResult) => void) | undefined;
}

export interface ShellCommandRuntimePort {
  execute(input: ShellCommandRuntimeExecuteInput): Promise<ShellCommandResult>;
}
