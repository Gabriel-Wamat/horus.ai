import { resolve } from "node:path";
import type { ExecutionTaskRecord, ShellCommandResult } from "@u-build/shared";
import { ShellCommandOutputEventSchema, ShellCommandResultSchema } from "@u-build/shared";
import type { ExecutionTaskResult } from "./ExecutionTaskRuntime.js";
import type {
  ShellCommandRuntimeExecuteInput,
  ShellCommandRuntimePort,
  ShellCommandOutputRead,
  ShellCommandTaskSummary,
} from "../../application/ports/ShellCommandRuntimePort.js";
import { CliCommandPolicy } from "./CliCommandPolicy.js";
import { ExecutionTaskRuntime } from "./ExecutionTaskRuntime.js";

export class ShellCommandRuntime implements ShellCommandRuntimePort {
  async execute(
    input: ShellCommandRuntimeExecuteInput
  ): Promise<ShellCommandResult> {
    let sequence = 0;
    const request = input.request as typeof input.request & {
      traceId?: string;
      spanId?: string;
      parentSpanId?: string | null;
      toolCallId?: string | null;
      runId?: string | null;
      operationalSessionId?: string | null;
      projectId?: string | null;
      agentId?: string | null;
      filePath?: string | null;
      diffId?: string | null;
      command?: string;
      shell?: "bash" | "sh";
      approved?: boolean;
      approvedBy?: string | null;
      approvalReason?: string | null;
    };
    const cwd = resolve(input.projectRootPath, input.request.cwd);
    const commandText = request.command?.trim();
    const executable = commandText
      ? (input.request.executable ?? "/bin/bash")
      : input.request.executable;
    if (!executable) {
      throw new Error("ShellCommandRuntime requires executable or command.");
    }
    const runner = buildExecutionTaskRuntime(input.projectRootPath);
    const handle = await runner.start(
      {
        id: input.request.commandId,
        ...(request.traceId !== undefined ? { traceId: request.traceId } : {}),
        ...(request.spanId !== undefined ? { spanId: request.spanId } : {}),
        ...(request.parentSpanId !== undefined
          ? { parentSpanId: request.parentSpanId }
          : {}),
        ...(request.toolCallId !== undefined ? { toolCallId: request.toolCallId } : {}),
        ...(request.runId !== undefined ? { runId: request.runId } : {}),
        ...(request.operationalSessionId !== undefined
          ? { operationalSessionId: request.operationalSessionId }
          : {}),
        ...(request.projectId !== undefined ? { projectId: request.projectId } : {}),
        ...(request.agentId !== undefined ? { agentId: request.agentId } : {}),
        ...(request.filePath !== undefined ? { filePath: request.filePath } : {}),
        ...(request.diffId !== undefined ? { diffId: request.diffId } : {}),
        ...(commandText ? { command: commandText, shell: request.shell ?? "bash" } : {}),
        executable,
        args: [...(input.request.args ?? [])],
        cwd,
        env: input.request.env,
        ...(input.request.timeoutMs ? { timeoutMs: input.request.timeoutMs } : {}),
        approved: request.approved === true,
        ...(request.approvedBy !== undefined ? { approvedBy: request.approvedBy } : {}),
        ...(request.approvalReason !== undefined
          ? { approvalReason: request.approvalReason }
          : {}),
      },
      {
        ...(input.signal ? { signal: input.signal } : {}),
        onOutput: input.onOutput
          ? (event) => {
              const outputEvent = ShellCommandOutputEventSchema.parse({
                commandId: input.request.commandId,
                taskId: event.taskId,
                traceId: event.traceId ?? undefined,
                spanId: event.spanId ?? undefined,
                parentSpanId: event.parentSpanId,
                toolCallId: event.toolCallId,
                runId: event.runId,
                operationalSessionId: event.operationalSessionId,
                projectId: event.projectId,
                agentId: event.agentId,
                filePath: event.filePath,
                diffId: event.diffId,
                stream: event.stream,
                chunk: event.chunk,
                sequence,
                timestamp: new Date().toISOString(),
              });
              sequence += 1;
              input.onOutput?.(outputEvent);
            }
          : undefined,
      }
    );

    if (input.request.background) {
      void handle.completion
        .then((result) => {
          input.onComplete?.(
            buildShellCommandResult({
              request: input.request,
              task: result.task,
              stdout: result.stdout,
              stderr: result.stderr,
              background: true,
            })
          );
        })
        .catch(() => undefined);
      return buildShellCommandResult({
        request: input.request,
        task: handle.task,
        stdout: handle.task.stdoutTail,
        stderr: handle.task.stderrTail,
        background: true,
      });
    }

    const result = await handle.completion;
    return buildShellCommandResult({
      request: input.request,
      task: result.task,
      stdout: result.stdout,
      stderr: result.stderr,
      background: false,
    });
  }

  async listTasks(input: {
    readonly projectRootPath: string;
    readonly limit?: number | undefined;
  }): Promise<ShellCommandTaskSummary[]> {
    const runner = buildExecutionTaskRuntime(input.projectRootPath);
    const tasks = await runner.listTasks({ limit: input.limit });
    return tasks.map((task) => ({
      taskId: task.taskId,
      commandId: task.commandId,
      status: task.status,
      startedAt: task.startedAt,
      stdoutTail: task.stdoutTail,
      stderrTail: task.stderrTail,
    }));
  }

  async readOutput(input: {
    readonly projectRootPath: string;
    readonly taskId: string;
    readonly stream: "stdout" | "stderr";
    readonly offset?: number | undefined;
    readonly limit?: number | undefined;
  }): Promise<ShellCommandOutputRead> {
    const runner = buildExecutionTaskRuntime(input.projectRootPath);
    return runner.readOutput({
      taskId: input.taskId,
      stream: input.stream,
      ...(input.offset !== undefined ? { offset: input.offset } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    });
  }
}

function buildExecutionTaskRuntime(projectRootPath: string): ExecutionTaskRuntime {
  return new ExecutionTaskRuntime({
    policy: new CliCommandPolicy({ allowedRoot: projectRootPath }),
    outputBaseDir: resolve(projectRootPath, ".horus", "execution-tasks"),
  });
}

function buildShellCommandResult(input: {
  request: ShellCommandRuntimeExecuteInput["request"];
  task: ExecutionTaskRecord;
  stdout: ExecutionTaskResult["stdout"];
  stderr: ExecutionTaskResult["stderr"];
  background: boolean;
}): ShellCommandResult {
  return ShellCommandResultSchema.parse({
    commandId: input.task.commandId,
    taskId: input.task.taskId,
    traceId: input.task.traceId,
    spanId: input.task.spanId,
    parentSpanId: input.task.parentSpanId,
    toolCallId: input.task.toolCallId,
    runId: input.task.runId,
    operationalSessionId: input.task.operationalSessionId,
    projectId: input.task.projectId,
    agentId: input.task.agentId,
    filePath: input.task.filePath,
    diffId: input.task.diffId,
    kind: input.request.kind,
    command:
      (input.request as typeof input.request & { command?: string }).command ??
      [input.task.executable, ...input.task.args].join(" "),
    executable: input.task.executable,
    args: input.task.args,
    cwd: input.task.cwd,
    status: input.task.status,
    approvalRequired: input.task.approvalRequired,
    risk: input.task.risk,
    policyReason: input.task.policyReason,
    approved: input.task.approved,
    approvedBy: input.task.approvedBy,
    approvalReason: input.task.approvalReason,
    exitCode: input.task.exitCode,
    signal: input.task.signal,
    stdoutTail: input.stdout,
    stderrTail: input.stderr,
    durationMs: input.task.durationMs,
    timedOut: input.task.timedOut,
    spawned: input.task.status !== "rejected" && input.task.processId != null,
    processId: input.task.processId,
    stdoutPath: input.task.stdoutPath,
    stderrPath: input.task.stderrPath,
    stdoutBytes: input.task.stdoutBytes,
    stderrBytes: input.task.stderrBytes,
    lastOutputAt: input.task.lastOutputAt,
    interactivePromptDetected: input.task.interactivePromptDetected,
    interactivePromptText: input.task.interactivePromptText,
    errorMessage: input.task.errorMessage,
    background: input.background,
    startedAt: input.task.startedAt,
    finishedAt: input.task.finishedAt,
  });
}
