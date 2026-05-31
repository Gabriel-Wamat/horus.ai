import { resolve } from "node:path";
import type { CodingValidationPlanCommand } from "@u-build/shared";
import type {
  CodingValidationCommandRun,
  CodingValidationCommandRunnerPort,
} from "../../application/ports/index.js";
import { CliCommandPolicy } from "./CliCommandPolicy.js";
import { ExecutionTaskRuntime } from "./ExecutionTaskRuntime.js";

export class SafeCliValidationCommandRunner
  implements CodingValidationCommandRunnerPort
{
  async run(input: {
    readonly command: CodingValidationPlanCommand;
    readonly workspaceRootPath: string;
    readonly signal?: AbortSignal;
  }): Promise<CodingValidationCommandRun> {
    const runner = new ExecutionTaskRuntime({
      policy: new CliCommandPolicy({
        allowedRoot: input.workspaceRootPath,
        allowedExecutables: [
          "node",
          process.execPath,
          "pnpm",
          "npm",
          "yarn",
          "bun",
          input.command.executable,
        ],
      }),
      outputBaseDir: resolve(input.workspaceRootPath, ".horus", "execution-tasks"),
    });
    const result = await runner.run(
      {
        id: input.command.id,
        executable: input.command.executable,
        args: [...input.command.args],
        cwd: resolve(input.workspaceRootPath, input.command.cwd),
        env: input.command.env,
        ...(input.command.timeoutMs ? { timeoutMs: input.command.timeoutMs } : {}),
        approved: true,
        approvedBy: "system:validation-plan",
        approvalReason: `Validation command ${input.command.id} is part of the prepared validation plan.`,
      },
      input.signal ? { signal: input.signal } : {}
    );

    return {
      commandId: result.task.commandId,
      taskId: result.task.taskId,
      executable: result.task.executable,
      args: result.task.args,
      cwd: result.task.cwd,
      approvalRequired: result.task.approvalRequired,
      risk: result.task.risk,
      policyReason: result.task.policyReason,
      approved: result.task.approved,
      approvedBy: result.task.approvedBy,
      approvalReason: result.task.approvalReason,
      status: terminalValidationStatus(result.task.status),
      exitCode: result.task.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      stdoutPath: result.task.stdoutPath,
      stderrPath: result.task.stderrPath,
      interactivePromptDetected: result.task.interactivePromptDetected,
      interactivePromptText: result.task.interactivePromptText,
      durationMs: result.task.durationMs,
      errorMessage: result.task.errorMessage,
    };
  }
}

function terminalValidationStatus(status: string): CodingValidationCommandRun["status"] {
  if (
    status === "completed" ||
    status === "failed" ||
    status === "timed_out" ||
    status === "aborted" ||
    status === "rejected"
  ) {
    return status;
  }
  return "failed";
}
