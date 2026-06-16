import type {
  AgentName,
  AgentProfileId,
  AgentToolName,
  CodeChangeSet,
  WorkflowEvent,
} from "@u-build/shared";
import {
  isCodeChangeDeleteOperation,
  isCodeChangeWriteOperation,
} from "@u-build/shared";
import { buildMinimalLineRangeReplacement } from "../tools/ProjectAgentFileEditOperations.js";
import type {
  AgentToolRuntime,
  AgentToolRuntimeEvent,
} from "./AgentToolRuntime.js";
import { AgentToolRuntimePolicyError } from "./AgentToolRuntime.js";
import { AgentToolAccessBlockedError } from "./AgentToolRegistry.js";
import type { AgentOperationalSessionRepository } from "../ports/RepositoryPorts.js";
import {
  attachToolTraceContext,
  buildToolTraceContext,
} from "./AgentToolLoopTrace.js";
import {
  finishOperationalSession,
  operationalSessionSummary,
  recordOperation,
  startOperationalSession,
  type AgentToolLoopOperationalSessionSummary,
} from "./AgentToolLoopOperationalSession.js";
import { recordToolOutputEvidence } from "./AgentToolLoopOutputEvidence.js";
import {
  codeChangeOperationTelemetry,
  extractCommandIds,
  extractTaskId,
  extractFilePaths,
  extractInputFilePaths,
  isMutatingFileTool,
  summarizeToolOutput,
} from "./AgentToolLoopToolTelemetry.js";

export interface AgentToolLoopEventSink {
  emit(event: WorkflowEvent): Promise<void> | void;
}

export interface AgentToolLoopInput {
  runtime: AgentToolRuntime;
  agentName: AgentName;
  agentProfileId: AgentProfileId;
  projectId: string;
  threadId: string;
  userStoryId: string;
  codeChangeSet: CodeChangeSet;
  eventSink?: AgentToolLoopEventSink | undefined;
  operationalSessionRepository?: AgentOperationalSessionRepository | undefined;
  maxSteps?: number | undefined;
  validationCommandIds?: readonly string[] | undefined;
}

export interface AgentToolLoopResult {
  status: "succeeded" | "failed" | "blocked";
  changedFiles: string[];
  validationCommandIds: string[];
  events: AgentToolRuntimeEvent[];
  summary: string;
  operationalSessionId?: string | undefined;
  operationalSession?: AgentToolLoopOperationalSessionSummary | undefined;
}

interface ReadFileToolOutput {
  path: string;
  content: string | null;
  versionHash: string | null;
  version?: {
    hash: string;
    sizeBytes: number;
    mtimeMs: number;
  } | null;
  truncated: boolean;
  binary: boolean;
}

const DEFAULT_MAX_STEPS = 16;

export class AgentToolLoop {
  async executeCodeChangeSet(input: AgentToolLoopInput): Promise<AgentToolLoopResult> {
    const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
    let stepCount = 0;
    const changedFiles = new Set<string>();
    const validationCommandIds: string[] = [];
    const operationalSessionId = await startOperationalSession(input);

    const runTool = async <TOutput>(
      toolName: AgentToolName,
      toolInput: Record<string, unknown>,
      summary: string,
      options: { metadata?: Record<string, unknown> | undefined } = {}
    ): Promise<TOutput> => {
      stepCount += 1;
      if (stepCount > maxSteps) {
        throw new AgentToolLoopError(`Agent tool loop exceeded maxSteps=${maxSteps}.`);
      }
      const inputFilePaths = extractInputFilePaths(toolInput);
      const inputCommandIds = extractCommandIds(toolInput);
      const trace = buildToolTraceContext(input, inputFilePaths);
      const tracedToolInput = attachToolTraceContext(toolName, toolInput, trace);
      await recordOperation(input, operationalSessionId, {
        type: "tool_started",
        toolName,
        toolStatus: "started",
        summary,
        filePaths: inputFilePaths,
      });

      await emitToolEvent(input, {
        type: "tool_call_started",
        threadId: input.threadId,
        agentName: input.agentName,
        agentProfileId: input.agentProfileId,
        toolName,
        ...trace,
        userStoryId: input.userStoryId,
        ...(operationalSessionId ? { operationalSessionId } : {}),
        summary,
        ...(inputFilePaths.length > 0 ? { filePaths: inputFilePaths } : {}),
        ...(inputCommandIds.length > 0 ? { commandIds: inputCommandIds } : {}),
        timestamp: new Date().toISOString(),
      });

      const startedAt = Date.now();
      try {
        const output = await input.runtime.execute<TOutput>({
          toolName,
          input: tracedToolInput,
          reason: summary,
        });
        const filePaths = extractFilePaths(toolName, output);
        if (isMutatingFileTool(toolName)) {
          for (const filePath of filePaths) changedFiles.add(filePath);
        }
        await recordOperation(input, operationalSessionId, {
          type: "tool_succeeded",
          toolName,
          toolStatus: "succeeded",
          summary: summarizeToolOutput(toolName, output),
          filePaths,
          commandIds: extractCommandIds(output),
        });
        await recordToolOutputEvidence(
          input,
          operationalSessionId,
          toolName,
          toolInput,
          output,
          options.metadata
        );
        const outputTaskId = extractTaskId(output);
        const approvalRequest = commandApprovalRequest(output);
        if (approvalRequest && outputTaskId) {
          await recordOperation(input, operationalSessionId, {
            type: "tool_blocked",
            toolName,
            toolStatus: "blocked",
            summary: approvalRequest.policyReason ?? "Comando aguardando aprovação.",
            commandIds: extractCommandIds(output),
          });
          await emitToolEvent(input, {
            type: "command_approval_requested",
            threadId: input.threadId,
            agentName: input.agentName,
            agentProfileId: input.agentProfileId,
            toolName,
            commandId: approvalRequest.commandId,
            taskId: outputTaskId,
            ...trace,
            userStoryId: input.userStoryId,
            ...(operationalSessionId ? { operationalSessionId } : {}),
            approvalReason: approvalRequest.approvalReason,
            policyReason: approvalRequest.policyReason,
            risk: approvalRequest.risk,
            timestamp: new Date().toISOString(),
          });
          await emitToolEvent(input, {
            type: "tool_call_blocked",
            threadId: input.threadId,
            agentName: input.agentName,
            agentProfileId: input.agentProfileId,
            toolName,
            ...trace,
            userStoryId: input.userStoryId,
            ...(operationalSessionId ? { operationalSessionId } : {}),
            summary: approvalRequest.policyReason ?? "Comando aguardando aprovação.",
            errorMessage:
              approvalRequest.policyReason ??
              approvalRequest.approvalReason ??
              "Command requires explicit approval.",
            ...(extractCommandIds(output).length > 0
              ? { commandIds: extractCommandIds(output) }
              : {}),
            taskId: outputTaskId,
            timestamp: new Date().toISOString(),
          });
          throw new AgentToolApprovalRequiredError(
            approvalRequest.policyReason ??
              approvalRequest.approvalReason ??
              "Command requires explicit approval."
          );
        }
        await emitToolEvent(input, {
          type: "tool_call_finished",
          threadId: input.threadId,
          agentName: input.agentName,
          agentProfileId: input.agentProfileId,
          toolName,
          status: "succeeded",
          ...trace,
          userStoryId: input.userStoryId,
          ...(operationalSessionId ? { operationalSessionId } : {}),
          durationMs: Math.max(0, Date.now() - startedAt),
          summary: summarizeToolOutput(toolName, output),
          ...(filePaths.length > 0 ? { filePaths } : {}),
          ...(extractCommandIds(output).length > 0
            ? { commandIds: extractCommandIds(output) }
            : {}),
          ...(outputTaskId ? { taskId: outputTaskId } : {}),
          timestamp: new Date().toISOString(),
        });
        return output;
      } catch (err) {
        if (err instanceof AgentToolApprovalRequiredError) throw err;
        const blocked = isBlockedToolError(err);
        await recordOperation(input, operationalSessionId, {
          type: blocked ? "tool_blocked" : "tool_failed",
          toolName,
          toolStatus: blocked ? "blocked" : "failed",
          summary,
          filePaths: inputFilePaths,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        await emitToolEvent(input, {
          type: blocked ? "tool_call_blocked" : "tool_call_finished",
          threadId: input.threadId,
          agentName: input.agentName,
          agentProfileId: input.agentProfileId,
          toolName,
          ...(blocked ? {} : { status: "failed" as const }),
          ...trace,
          userStoryId: input.userStoryId,
          ...(operationalSessionId ? { operationalSessionId } : {}),
          ...(blocked ? {} : { durationMs: Math.max(0, Date.now() - startedAt) }),
          summary,
          errorMessage: err instanceof Error ? err.message : String(err),
          ...(inputFilePaths.length > 0 ? { filePaths: inputFilePaths } : {}),
          ...(inputCommandIds.length > 0 ? { commandIds: inputCommandIds } : {}),
          timestamp: new Date().toISOString(),
        } as WorkflowEvent);
        throw err;
      }
    };

    try {
      await runTool(
        "inspect_project",
        { maxEditableFiles: 80 },
        "Inspecionar estrutura do projeto antes de alterar arquivos."
      );
      await runTool("propose_code_change_set", input.codeChangeSet, "Registrar proposta de alteração.");

      for (const operation of input.codeChangeSet.operations) {
        if (isCodeChangeWriteOperation(operation)) {
          if (operation.changeType === "create" || operation.beforeContent === null) {
            let overwrite = operation.beforeContent === null;
            if (overwrite) {
              try {
                await runTool<ReadFileToolOutput>(
                  "read_file",
                  {
                    path: operation.targetPath,
                    maxBytes: 2_000_000,
                  },
                  `Ler ${operation.targetPath} antes de sobrescrever.`
                );
              } catch (err) {
                if (!isFileNotFoundError(err)) throw err;
                overwrite = false;
              }
            }
            await runTool(
              "write_file",
              {
                path: operation.targetPath,
                content: operation.afterContent,
                overwrite,
                reason: operation.diff,
              },
              `Criar ${operation.targetPath}.`,
              {
                metadata: {
                  codeChangeOperation: codeChangeOperationTelemetry(operation),
                },
              }
            );
          } else {
            if (operation.beforeContent === operation.afterContent) {
              await recordOperation(input, operationalSessionId, {
                type: "decision_recorded",
                toolName: "edit_file",
                summary: `Edição ignorada em ${operation.targetPath}: conteúdo proposto igual ao atual.`,
                filePaths: [operation.targetPath],
                metadata: {
                  decisionType: "noop_edit_skipped",
                  reason: "beforeContent_equals_afterContent",
                  codeChangeOperation: codeChangeOperationTelemetry(operation),
                },
              });
              continue;
            }
            const read = await runTool<ReadFileToolOutput>(
              "read_file",
              {
                path: operation.targetPath,
                maxBytes: 2_000_000,
              },
              `Ler ${operation.targetPath} antes de editar.`
            );
            if (read.binary || read.truncated || read.content === null) {
              throw new AgentToolRuntimePolicyError(
                `Cannot edit ${operation.targetPath}: read_file did not return complete text content.`
              );
            }
            if (read.content === operation.beforeContent) {
              const lineRangeEdit = buildMinimalLineRangeReplacement({
                currentContent: read.content,
                nextContent: operation.afterContent,
              });
              if (!lineRangeEdit) {
                await recordOperation(input, operationalSessionId, {
                  type: "decision_recorded",
                  toolName: "replace_file_range",
                  summary: `Edição ignorada em ${operation.targetPath}: conteúdo proposto igual ao atual.`,
                  filePaths: [operation.targetPath],
                  metadata: {
                    decisionType: "noop_edit_skipped",
                    reason: "minimal_line_range_noop",
                    codeChangeOperation: codeChangeOperationTelemetry(operation),
                  },
                });
                continue;
              }
              const rewriteInput: Record<string, unknown> = {
                path: operation.targetPath,
                content: operation.afterContent,
                reason: operation.diff,
              };
              if (read.versionHash) rewriteInput["expectedContentHash"] = read.versionHash;
              if (read.version) rewriteInput["baseVersion"] = read.version;
              await runTool(
                "rewrite_file",
                rewriteInput,
                `Reescrever ${operation.targetPath} com diff mínimo.`,
                {
                  metadata: {
                    codeChangeOperation: codeChangeOperationTelemetry(operation),
                  },
                }
              );
              continue;
            }
            const editInput: Record<string, unknown> = {
              path: operation.targetPath,
              content: operation.afterContent,
              reason: operation.diff,
            };
            if (read.versionHash) editInput["expectedContentHash"] = read.versionHash;
            if (read.version) editInput["baseVersion"] = read.version;
            await runTool(
              "rewrite_file",
              editInput,
              `Reescrever ${operation.targetPath} com base na versão atual.`,
              {
                metadata: {
                  codeChangeOperation: codeChangeOperationTelemetry(operation),
                },
              }
            );
          }
          continue;
        }

        if (isCodeChangeDeleteOperation(operation)) {
          await runTool<ReadFileToolOutput>(
            "read_file",
            {
              path: operation.targetPath,
              maxBytes: 2_000_000,
            },
            `Ler ${operation.targetPath} antes de remover.`
          );
          await runTool(
            "delete_file",
            {
              path: operation.targetPath,
              reason: operation.diff,
            },
            `Remover ${operation.targetPath}.`,
            {
              metadata: {
                codeChangeOperation: codeChangeOperationTelemetry(operation),
              },
            }
          );
        }
      }

      try {
        await runTool("get_git_diff", {}, "Inspecionar diff do projeto.");
      } catch (err) {
        if (changedFiles.size === 0) throw err;
      }

      for (const commandId of input.validationCommandIds ?? []) {
        await runTool(
          "run_validation_command",
          { commandId, roleName: "qa_specialist" },
          `Executar validação ${commandId}.`
        );
        validationCommandIds.push(commandId);
      }

      if (changedFiles.size === 0) {
        const summary = "Tool loop terminou sem alteração de arquivo.";
        await finishOperationalSession(input, operationalSessionId, "failed", summary);
        return {
          status: "failed",
          changedFiles: [],
          validationCommandIds,
          events: input.runtime.getEvents(),
          summary,
          ...(operationalSessionId ? { operationalSessionId } : {}),
          ...(await operationalSessionSummary(input, operationalSessionId)),
        };
      }

      const summary = `${changedFiles.size} arquivo(s) alterado(s) por tools governadas.`;
      await finishOperationalSession(input, operationalSessionId, "completed", summary);
      return {
        status: "succeeded",
        changedFiles: [...changedFiles],
        validationCommandIds,
        events: input.runtime.getEvents(),
        summary,
        ...(operationalSessionId ? { operationalSessionId } : {}),
        ...(await operationalSessionSummary(input, operationalSessionId)),
      };
    } catch (err) {
      const blocked = isBlockedToolError(err);
      const summary = err instanceof Error ? err.message : String(err);
      await finishOperationalSession(
        input,
        operationalSessionId,
        blocked ? "blocked" : "failed",
        summary
      );
      await emitToolEvent(input, {
        type: "fallback_executed",
        threadId: input.threadId,
        userStoryId: input.userStoryId,
        action: blocked ? "block_delivery" : "terminal_failure",
        status: "succeeded",
        message:
          err instanceof Error
            ? err.message
            : "Agent tool loop failed without a structured error message.",
        timestamp: new Date().toISOString(),
      });
      return {
        status: blocked ? "blocked" : "failed",
        changedFiles: [...changedFiles],
        validationCommandIds,
        events: input.runtime.getEvents(),
        summary,
        ...(operationalSessionId ? { operationalSessionId } : {}),
        ...(await operationalSessionSummary(input, operationalSessionId)),
      };
    }
  }
}

export class AgentToolLoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolLoopError";
  }
}

class AgentToolApprovalRequiredError extends AgentToolRuntimePolicyError {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolApprovalRequiredError";
  }
}

async function emitToolEvent(
  input: AgentToolLoopInput,
  event: WorkflowEvent
): Promise<void> {
  await input.eventSink?.emit(event);
}

function isBlockedToolError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    err instanceof AgentToolRuntimePolicyError ||
    err instanceof AgentToolAccessBlockedError ||
    message.includes("not allowed") ||
    message.includes("selected project") ||
    message.includes("forbidden")
  );
}

function commandApprovalRequest(output: unknown): {
  commandId: string;
  approvalReason: string | null;
  policyReason: string | null;
  risk: "low" | "medium" | "high";
} | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (record["approvalRequired"] !== true || record["approved"] === true) return null;
  const commandId =
    typeof record["commandId"] === "string" && record["commandId"].length > 0
      ? record["commandId"]
      : null;
  if (!commandId) return null;
  const risk = record["risk"];
  return {
    commandId,
    approvalReason:
      typeof record["approvalReason"] === "string" ? record["approvalReason"] : null,
    policyReason:
      typeof record["policyReason"] === "string" ? record["policyReason"] : null,
    risk: risk === "low" || risk === "medium" || risk === "high" ? risk : "medium",
  };
}

function isFileNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if ("code" in err && (err as { code?: unknown }).code === "file_not_found") {
    return true;
  }
  return err.message.toLowerCase().includes("file not found");
}
