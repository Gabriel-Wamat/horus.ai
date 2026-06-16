import { spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  ExecutionTaskRecordSchema,
  type ExecutionTaskRecord,
  type ExecutionTaskStatus,
} from "@u-build/shared";
import type {
  CliCommandSpec,
  NormalizedCliCommandSpec,
} from "./CliCommandPolicy.js";
import { CliCommandPolicy } from "./CliCommandPolicy.js";
import {
  buildAllowlistedChildEnv,
  DEFAULT_INHERITED_CHILD_ENV_KEYS,
} from "../process/ChildProcessEnv.js";

export interface ExecutionTaskResult {
  task: ExecutionTaskRecord;
  stdout: string;
  stderr: string;
}

export interface ExecutionTaskOutputChunk {
  stream: "stdout" | "stderr";
  chunk: string;
  taskId: string;
  traceId: string | null;
  spanId: string | null;
  parentSpanId: string | null;
  toolCallId: string | null;
  runId: string | null;
  operationalSessionId: string | null;
  projectId: string | null;
  agentId: string | null;
  filePath: string | null;
  diffId: string | null;
}

export interface ExecutionTaskRuntimeOptions {
  policy?: CliCommandPolicy;
  outputBaseDir?: string;
  outputTailLimit?: number;
  outputChunkLimit?: number;
  killGraceMs?: number;
  inheritedEnvKeys?: readonly string[];
}

export interface ExecutionTaskRunOptions {
  signal?: AbortSignal | undefined;
  onOutput?: ((event: ExecutionTaskOutputChunk) => void) | undefined;
  retryOfTaskId?: string | null | undefined;
  attempt?: number | undefined;
}

export interface ExecutionTaskHandle {
  task: ExecutionTaskRecord;
  completion: Promise<ExecutionTaskResult>;
}

export interface ExecutionTaskOutputRead {
  taskId: string;
  stream: "stdout" | "stderr";
  offset: number;
  nextOffset: number;
  chunk: string;
}

interface ExecutionTaskTraceContext {
  traceId: string | null;
  spanId: string | null;
  parentSpanId: string | null;
  toolCallId: string | null;
  runId: string | null;
  operationalSessionId: string | null;
  projectId: string | null;
  agentId: string | null;
  filePath: string | null;
  diffId: string | null;
}

const DEFAULT_OUTPUT_TAIL_LIMIT = 16_384;
const DEFAULT_OUTPUT_CHUNK_LIMIT = 4_096;
const DEFAULT_KILL_GRACE_MS = 500;

function nowMs(): number {
  return Date.now();
}

function isoNow(): string {
  return new Date().toISOString();
}

function appendTail(current: string, chunk: Buffer, limit: number): string {
  const next = current + chunk.toString("utf-8");
  return next.length <= limit ? next : next.slice(next.length - limit);
}

function detectInteractivePrompt(outputTail: string): string | null {
  const text = outputTail.toLowerCase().trimEnd();
  if (!text) return null;
  const promptSuffixes = [
    "password:",
    "passphrase:",
    "(y/n)",
    "[y/n]",
    "(yes/no)",
    "[yes/no]",
    "continue?",
    "proceed?",
    "press any key",
    "enter passphrase",
    "are you sure you want to continue connecting",
  ];
  const detected = promptSuffixes.find((suffix) => text.endsWith(suffix));
  if (!detected) return null;
  const tail = outputTail.trimEnd();
  const lineBreak = Math.max(tail.lastIndexOf("\n"), tail.lastIndexOf("\r"));
  return tail.slice(lineBreak + 1).trim();
}

function emitOutputChunk(
  onOutput: ((event: ExecutionTaskOutputChunk) => void) | undefined,
  task: ExecutionTaskRecord,
  stream: "stdout" | "stderr",
  chunk: Buffer,
  chunkLimit: number
): void {
  if (!onOutput) return;
  const text = chunk.toString("utf-8");
  for (let index = 0; index < text.length; index += chunkLimit) {
    onOutput({
      taskId: task.taskId,
      traceId: task.traceId,
      spanId: task.spanId,
      parentSpanId: task.parentSpanId,
      toolCallId: task.toolCallId,
      runId: task.runId,
      operationalSessionId: task.operationalSessionId,
      projectId: task.projectId,
      agentId: task.agentId,
      filePath: task.filePath,
      diffId: task.diffId,
      stream,
      chunk: text.slice(index, index + chunkLimit),
    });
  }
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process may already have exited.
    }
  }
}

function commandSpecFromTask(
  task: ExecutionTaskRecord
): Pick<CliCommandSpec, "command" | "shell" | "executable" | "args"> {
  const script = task.args[0] === "-lc" ? task.args[1] : undefined;
  if (script && (task.executable === "/bin/bash" || task.executable === "bash")) {
    return { command: script, shell: "bash", executable: task.executable, args: [] };
  }
  if (script && (task.executable === "/bin/sh" || task.executable === "sh")) {
    return { command: script, shell: "sh", executable: task.executable, args: [] };
  }
  return { executable: task.executable, args: task.args };
}

async function closeStream(stream: WriteStream): Promise<void> {
  await new Promise<void>((resolveClose) => {
    stream.end(() => resolveClose());
  });
}

export class ExecutionTaskRuntime {
  private readonly activeTasks = new Map<
    string,
    {
      child: ReturnType<typeof spawn>;
      metadataPath: string;
      completion: Promise<ExecutionTaskResult>;
      abort: () => void;
    }
  >();
  private readonly activeTaskSnapshots = new Map<string, ExecutionTaskRecord>();
  private readonly policy: CliCommandPolicy;
  private readonly outputBaseDir: string;
  private readonly outputTailLimit: number;
  private readonly outputChunkLimit: number;
  private readonly killGraceMs: number;
  private readonly inheritedEnvKeys: readonly string[];

  constructor(options: ExecutionTaskRuntimeOptions = {}) {
    this.policy = options.policy ?? new CliCommandPolicy();
    this.outputBaseDir = options.outputBaseDir ?? resolve(".horus", "execution-tasks");
    this.outputTailLimit = options.outputTailLimit ?? DEFAULT_OUTPUT_TAIL_LIMIT;
    this.outputChunkLimit = options.outputChunkLimit ?? DEFAULT_OUTPUT_CHUNK_LIMIT;
    this.killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    this.inheritedEnvKeys = options.inheritedEnvKeys ?? DEFAULT_INHERITED_CHILD_ENV_KEYS;
  }

  async run(
    spec: CliCommandSpec,
    options: ExecutionTaskRunOptions = {}
  ): Promise<ExecutionTaskResult> {
    const handle = await this.start(spec, options);
    return handle.completion;
  }

  async start(
    spec: CliCommandSpec,
    options: ExecutionTaskRunOptions = {}
  ): Promise<ExecutionTaskHandle> {
    const taskId = `${spec.id}-${randomUUID()}`;
    const taskDir = join(this.outputBaseDir, taskId);
    await fs.mkdir(taskDir, { recursive: true });
    const stdoutPath = join(taskDir, "stdout.log");
    const stderrPath = join(taskDir, "stderr.log");
    const metadataPath = join(taskDir, "task.json");
    const startedAt = isoNow();
    const start = nowMs();

    const stoppedBeforeSpawn = async (
      reason: string,
      policy: {
        status?: "awaiting_approval" | "rejected";
        approvalRequired?: boolean;
        risk?: "low" | "medium" | "high";
      } = {}
    ): Promise<ExecutionTaskHandle> => {
      const task: ExecutionTaskRecord = {
        taskId,
        commandId: spec.id,
        ...traceContext(spec),
        executable:
          spec.command && spec.shell
            ? spec.shell === "sh"
              ? "/bin/sh"
              : "/bin/bash"
            : spec.executable ?? "/bin/bash",
        args: spec.command ? ["-lc", spec.command] : [...(spec.args ?? [])],
        cwd: spec.cwd,
        env: { ...(spec.env ?? {}) },
        timeoutMs: spec.timeoutMs ?? null,
        status: policy.status ?? "rejected",
        retryOfTaskId: options.retryOfTaskId ?? null,
        attempt: options.attempt ?? 1,
        approvalRequired: policy.approvalRequired ?? false,
        risk: policy.risk ?? "high",
        policyReason: reason,
        approved: spec.approved === true,
        approvedBy: spec.approvedBy ?? null,
        approvalReason: spec.approvalReason ?? null,
        processId: null,
        stdoutPath,
        stderrPath,
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutTail: "",
        stderrTail: "",
        exitCode: null,
        signal: null,
        errorMessage: reason,
        interactivePromptDetected: false,
        interactivePromptText: null,
        timedOut: false,
        startedAt,
        finishedAt: isoNow(),
        lastOutputAt: null,
        durationMs: nowMs() - start,
      };
      await this.persist(metadataPath, task);
      return { task, completion: Promise.resolve({ task, stdout: "", stderr: "" }) };
    };

    if (options.signal?.aborted) {
      return stoppedBeforeSpawn("command aborted before spawn");
    }

    const decision = await this.policy.evaluate(spec);
    if (!decision.allowed || !decision.normalized) {
      return stoppedBeforeSpawn(decision.reason ?? "command rejected", {
        status: decision.action === "ask" ? "awaiting_approval" : "rejected",
        approvalRequired: decision.approvalRequired,
        risk: decision.risk,
      });
    }

    return this.spawnAndTrack({
      spec: decision.normalized,
      trace: traceContext(spec),
      taskId,
      stdoutPath,
      stderrPath,
      metadataPath,
      startedAt,
      start,
      options,
    });
  }

  async approve(
    taskId: string,
    input: {
      approvedBy: string;
      approvalReason?: string | null | undefined;
    },
    options: ExecutionTaskRunOptions = {}
  ): Promise<ExecutionTaskHandle> {
    const task = await this.requireTask(taskId);
    if (task.status !== "awaiting_approval") {
      throw new Error(`Execution task is not awaiting approval: ${taskId}`);
    }
    return this.start(
      {
        id: task.commandId,
        traceId: task.traceId,
        spanId: task.spanId,
        parentSpanId: task.spanId ?? task.parentSpanId,
        toolCallId: task.toolCallId,
        runId: task.runId,
        operationalSessionId: task.operationalSessionId,
        projectId: task.projectId,
        agentId: task.agentId,
        filePath: task.filePath,
        diffId: task.diffId,
        ...commandSpecFromTask(task),
        cwd: task.cwd,
        env: task.env ?? {},
        ...(task.timeoutMs ? { timeoutMs: task.timeoutMs } : {}),
        approved: true,
        approvedBy: input.approvedBy,
        approvalReason:
          input.approvalReason ??
          task.policyReason ??
          task.approvalReason ??
          "Operator approved command execution.",
      },
      {
        ...options,
        retryOfTaskId: task.taskId,
        attempt: (task.attempt ?? 1) + 1,
      }
    );
  }

  async retry(
    taskId: string,
    options: ExecutionTaskRunOptions = {}
  ): Promise<ExecutionTaskHandle> {
    const task = await this.requireTask(taskId);
    if (task.status === "running" || task.status === "queued") {
      throw new Error(`Execution task is still active: ${taskId}`);
    }
    return this.start(
      {
        id: task.commandId,
        traceId: task.traceId,
        spanId: task.spanId,
        parentSpanId: task.spanId ?? task.parentSpanId,
        toolCallId: task.toolCallId,
        runId: task.runId,
        operationalSessionId: task.operationalSessionId,
        projectId: task.projectId,
        agentId: task.agentId,
        filePath: task.filePath,
        diffId: task.diffId,
        ...commandSpecFromTask(task),
        cwd: task.cwd,
        env: task.env ?? {},
        ...(task.timeoutMs ? { timeoutMs: task.timeoutMs } : {}),
        approved: task.approved,
        approvedBy: task.approvedBy,
        approvalReason: task.approvalReason,
      },
      {
        ...options,
        retryOfTaskId: task.taskId,
        attempt: (task.attempt ?? 1) + 1,
      }
    );
  }

  private async spawnAndTrack(input: {
    spec: NormalizedCliCommandSpec;
    trace: ExecutionTaskTraceContext;
    taskId: string;
    stdoutPath: string;
    stderrPath: string;
    metadataPath: string;
    startedAt: string;
    start: number;
    options: ExecutionTaskRunOptions;
  }): Promise<ExecutionTaskHandle> {
    const stdoutStream = createWriteStream(input.stdoutPath, { flags: "a" });
    const stderrStream = createWriteStream(input.stderrPath, { flags: "a" });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let lastOutputAt: string | null = null;
    let interactivePromptDetected = false;
    let interactivePromptText: string | null = null;
    let child: ReturnType<typeof spawn> | undefined;
    let metadataWrite = Promise.resolve();

    const taskBase = (): ExecutionTaskRecord => ({
      taskId: input.taskId,
      commandId: input.spec.id,
      ...input.trace,
      executable: input.spec.executable,
      args: [...input.spec.args],
      cwd: input.spec.cwd,
      env: { ...input.spec.env },
      timeoutMs: input.spec.timeoutMs ?? null,
      status: "running",
      retryOfTaskId: input.options.retryOfTaskId ?? null,
      attempt: input.options.attempt ?? 1,
      approvalRequired: input.spec.approvalRequired,
      risk: input.spec.risk,
      policyReason: null,
      approved: input.spec.approved,
      approvedBy: input.spec.approvedBy,
      approvalReason: input.spec.approvalReason,
      processId: child?.pid ?? null,
      stdoutPath: input.stdoutPath,
      stderrPath: input.stderrPath,
      stdoutBytes,
      stderrBytes,
      stdoutTail: stdout,
      stderrTail: stderr,
      exitCode: null,
      signal: null,
      errorMessage: null,
      interactivePromptDetected,
      interactivePromptText,
      timedOut: false,
      startedAt: input.startedAt,
      finishedAt: null,
      lastOutputAt,
      durationMs: nowMs() - input.start,
    });
    const persistSnapshot = (): void => {
      const task = taskBase();
      this.activeTaskSnapshots.set(input.taskId, task);
      metadataWrite = metadataWrite
        .then(() => this.persist(input.metadataPath, task))
        .catch(() => undefined);
    };
    const captureInteractivePrompt = (): void => {
      const promptText = detectInteractivePrompt(`${stdout}\n${stderr}`);
      if (!promptText) return;
      interactivePromptDetected = true;
      interactivePromptText = promptText;
    };

    try {
      child = spawn(input.spec.executable, input.spec.args, {
        cwd: input.spec.cwd,
        env: this.buildChildEnv(input.spec.env),
        detached: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      await closeStream(stdoutStream);
      await closeStream(stderrStream);
      const task = {
        ...taskBase(),
        status: "failed" as const,
        errorMessage: err instanceof Error ? err.message : String(err),
        finishedAt: isoNow(),
      };
      await this.persist(input.metadataPath, task);
      return { task, completion: Promise.resolve({ task, stdout, stderr }) };
    }

    const initialTask = taskBase();
    this.activeTaskSnapshots.set(input.taskId, initialTask);
    await this.persist(input.metadataPath, initialTask);

    let timedOut = false;
    let aborted = false;
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      stdout = appendTail(stdout, chunk, this.outputTailLimit);
      lastOutputAt = isoNow();
      captureInteractivePrompt();
      stdoutStream.write(chunk);
      persistSnapshot();
      emitOutputChunk(
        input.options.onOutput,
        taskBase(),
        "stdout",
        chunk,
        this.outputChunkLimit
      );
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      stderr = appendTail(stderr, chunk, this.outputTailLimit);
      lastOutputAt = isoNow();
      captureInteractivePrompt();
      stderrStream.write(chunk);
      persistSnapshot();
      emitOutputChunk(
        input.options.onOutput,
        taskBase(),
        "stderr",
        chunk,
        this.outputChunkLimit
      );
    });

    const terminate = (reason: "timeout" | "abort") => {
      if (reason === "timeout") timedOut = true;
      if (reason === "abort") {
        aborted = true;
        void this.markAborted(input.taskId);
      }
      if (child.pid) killProcessGroup(child.pid, "SIGTERM");
      void delay(this.killGraceMs).then(() => {
        if (!settled && child.pid) killProcessGroup(child.pid, "SIGKILL");
      });
    };

    const timeout = setTimeout(() => terminate("timeout"), input.spec.timeoutMs);
    const abort = () => terminate("abort");
    input.options.signal?.addEventListener("abort", abort, { once: true });
    if (input.options.signal?.aborted) abort();

    const completion = new Promise<ExecutionTaskResult>((resolveTask) => {
      child.once("error", (err) => {
        clearTimeout(timeout);
        input.options.signal?.removeEventListener("abort", abort);
        settled = true;
        void Promise.all([closeStream(stdoutStream), closeStream(stderrStream)]).then(
          async () => {
            await metadataWrite;
            const task: ExecutionTaskRecord = {
              ...taskBase(),
              status: "failed",
              errorMessage: err.message,
              finishedAt: isoNow(),
              durationMs: nowMs() - input.start,
            };
            this.activeTaskSnapshots.set(input.taskId, task);
            await this.persist(input.metadataPath, task);
            this.activeTasks.delete(input.taskId);
            this.activeTaskSnapshots.delete(input.taskId);
            resolveTask({ task, stdout, stderr });
          }
        );
      });

      child.once("close", (exitCode, signal) => {
        clearTimeout(timeout);
        input.options.signal?.removeEventListener("abort", abort);
        settled = true;
        void Promise.all([closeStream(stdoutStream), closeStream(stderrStream)]).then(
          async () => {
            await metadataWrite;
            let persisted: ExecutionTaskRecord | null = null;
            let persistedReadError: Error | null = null;
            try {
              persisted = await this.readPersistedTask(input.metadataPath);
            } catch (err) {
              persistedReadError =
                err instanceof Error ? err : new Error(String(err));
            }
            const externallyAborted =
              persisted?.status === "aborted" || (await this.isMarkedAborted(input.taskId));
            const status: ExecutionTaskStatus =
              persistedReadError !== null
                ? "failed"
                : timedOut
                  ? "timed_out"
                  : aborted || externallyAborted
                    ? "aborted"
                    : exitCode === 0
                      ? "completed"
                      : "failed";
            const task: ExecutionTaskRecord = {
              ...taskBase(),
              status,
              exitCode,
              signal,
              errorMessage:
                persistedReadError !== null
                  ? persistedReadError.message
                  : status === "completed"
                    ? null
                    : this.buildFailureMessage(status, exitCode, signal),
              timedOut,
              finishedAt: isoNow(),
              durationMs: nowMs() - input.start,
            };
            this.activeTaskSnapshots.set(input.taskId, task);
            await this.persist(input.metadataPath, task);
            this.activeTasks.delete(input.taskId);
            this.activeTaskSnapshots.delete(input.taskId);
            resolveTask({ task, stdout, stderr });
          }
        );
      });
    });
    this.activeTasks.set(input.taskId, {
      child,
      metadataPath: input.metadataPath,
      completion,
      abort: () => terminate("abort"),
    });
    return { task: taskBase(), completion };
  }

  async getTask(taskId: string): Promise<ExecutionTaskRecord | null> {
    const activeSnapshot = this.activeTaskSnapshots.get(taskId);
    if (activeSnapshot) return activeSnapshot;
    try {
      return await this.readTaskMetadata(this.metadataPath(taskId));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async listTasks(input: { limit?: number | undefined } = {}): Promise<ExecutionTaskRecord[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    await fs.mkdir(this.outputBaseDir, { recursive: true });
    const entries = await fs.readdir(this.outputBaseDir, { withFileTypes: true });
    const tasks: ExecutionTaskRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = join(this.outputBaseDir, entry.name, "task.json");
      try {
        tasks.push(await this.readTaskMetadata(path));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          // Incomplete task folders can exist between mkdir and the first atomic metadata write.
          continue;
        }
        throw err;
      }
    }
    return tasks
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, limit);
  }

  async readOutput(input: {
    taskId: string;
    stream: "stdout" | "stderr";
    offset?: number;
    limit?: number;
  }): Promise<ExecutionTaskOutputRead> {
    const task = await this.requireTask(input.taskId);
    const path = input.stream === "stdout" ? task.stdoutPath : task.stderrPath;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? this.outputChunkLimit;
    const file = await fs.open(path, "r").catch((err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    });
    if (!file) {
      return {
        taskId: input.taskId,
        stream: input.stream,
        offset,
        nextOffset: offset,
        chunk: "",
      };
    }
    try {
      const buffer = Buffer.alloc(limit);
      const read = await file.read(buffer, 0, limit, offset);
      return {
        taskId: input.taskId,
        stream: input.stream,
        offset,
        nextOffset: offset + read.bytesRead,
        chunk: buffer.subarray(0, read.bytesRead).toString("utf-8"),
      };
    } finally {
      await file.close();
    }
  }

  async kill(taskId: string): Promise<ExecutionTaskRecord> {
    const active = this.activeTasks.get(taskId);
    if (active) {
      active.abort();
      return this.requireTask(taskId);
    }

    const task = await this.requireTask(taskId);
    if (task.status !== "running" || task.processId == null) return task;
    await this.markAborted(taskId);
    killProcessGroup(task.processId, "SIGTERM");
    const aborted: ExecutionTaskRecord = {
      ...task,
      status: "aborted",
      errorMessage: "command aborted",
      finishedAt: isoNow(),
      durationMs: Date.parse(isoNow()) - Date.parse(task.startedAt),
    };
    await this.persist(this.metadataPath(taskId), aborted);
    return aborted;
  }

  private buildChildEnv(explicitEnv: Record<string, string>): Record<string, string> {
    return buildAllowlistedChildEnv(explicitEnv, this.inheritedEnvKeys);
  }

  private async persist(path: string, task: ExecutionTaskRecord): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true });
    const tempPath = join(
      dirname(path),
      `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`
    );
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(task, null, 2)}\n`, "utf-8");
      await fs.rename(tempPath, path);
    } catch (err) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  private async readPersistedTask(path: string): Promise<ExecutionTaskRecord | null> {
    try {
      return await this.readTaskMetadata(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async readTaskMetadata(path: string): Promise<ExecutionTaskRecord> {
    let payload: unknown;
    try {
      payload = JSON.parse(await fs.readFile(path, "utf-8"));
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`Invalid execution task metadata at ${path}: malformed JSON`);
      }
      throw err;
    }
    const parsed = ExecutionTaskRecordSchema.safeParse(payload);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => {
          const fieldPath = issue.path.length > 0 ? issue.path.join(".") : "<root>";
          return `${fieldPath}: ${issue.message}`;
        })
        .join("; ");
      throw new Error(`Invalid execution task metadata at ${path}: ${issues}`);
    }
    return parsed.data;
  }

  private metadataPath(taskId: string): string {
    assertSafeTaskId(taskId);
    return join(this.outputBaseDir, taskId, "task.json");
  }

  private abortMarkerPath(taskId: string): string {
    assertSafeTaskId(taskId);
    return join(this.outputBaseDir, taskId, "aborted");
  }

  private async markAborted(taskId: string): Promise<void> {
    const markerPath = this.abortMarkerPath(taskId);
    await fs.mkdir(dirname(markerPath), { recursive: true });
    await fs.writeFile(markerPath, `${isoNow()}\n`, "utf-8");
  }

  private async isMarkedAborted(taskId: string): Promise<boolean> {
    try {
      await fs.access(this.abortMarkerPath(taskId));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  }

  private async requireTask(taskId: string): Promise<ExecutionTaskRecord> {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Execution task not found: ${taskId}`);
    return task;
  }

  private buildFailureMessage(
    status: ExecutionTaskStatus,
    exitCode: number | null,
    signal: string | null
  ): string {
    if (status === "timed_out") return "command timed out";
    if (status === "aborted") return "command aborted";
    if (status === "rejected") return "command rejected";
    if (signal) return `command terminated by ${signal}`;
    return `command exited with code ${exitCode ?? "unknown"}`;
  }
}

function traceContext(spec: {
  traceId?: string | null;
  spanId?: string | null;
  parentSpanId?: string | null;
  toolCallId?: string | null;
  runId?: string | null;
  operationalSessionId?: string | null;
  projectId?: string | null;
  agentId?: string | null;
  filePath?: string | null;
  diffId?: string | null;
}): ExecutionTaskTraceContext {
  return {
    traceId: spec.traceId ?? null,
    spanId: spec.spanId ?? null,
    parentSpanId: spec.parentSpanId ?? null,
    toolCallId: spec.toolCallId ?? null,
    runId: spec.runId ?? null,
    operationalSessionId: spec.operationalSessionId ?? null,
    projectId: spec.projectId ?? null,
    agentId: spec.agentId ?? null,
    filePath: spec.filePath ?? null,
    diffId: spec.diffId ?? null,
  };
}

function assertSafeTaskId(taskId: string): void {
  if (!taskId || taskId.includes("/") || taskId.includes("\\") || taskId.includes("..")) {
    throw new Error(`Invalid execution task id: ${taskId || "<empty>"}`);
  }
}
