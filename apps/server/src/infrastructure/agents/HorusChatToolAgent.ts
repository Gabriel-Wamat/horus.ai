import type {
  AgentProfileId,
  ChatAgentContextBundle,
  CodeContextBundle,
  FrontendProject,
  HorusChatIntent,
  LlmSettings,
  ShellCommandOutputEvent,
} from "@u-build/shared";
import {
  AIMessage,
  type AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { AgentToolRuntime } from "../../application/services/AgentToolRuntime.js";
import type { AgentToolRegistry } from "../../application/services/AgentToolRegistry.js";
import {
  buildForcedCodeChangeContinuationPrompt,
  buildValidationRepairContinuationPrompt,
  buildFullReadBlockMessage,
  commandResultFailed,
  formatDiagnosticEvidence,
  formatDiagnosticEvidenceBlock,
  formatDiagnosticRangeEvidence,
  formatProjectInspectionEvidence,
  isCodeChangeIntent,
  isMutatingTool,
  parsePrimaryDiagnosticTarget,
  selectDiagnosticValidationCommands,
  shouldAutoRunDiagnostics,
  shouldForceCodeChangeContinuation,
  shouldHoldTextUntilToolDecision,
  summarizeCommandResult,
  type DiagnosticTarget,
} from "./HorusChatToolDiagnostics.js";
import type { HorusChatAgentStreamEvent } from "../../application/services/HorusChatAgentStreamEvents.js";
import { createChatModel } from "../llm/createChatModel.js";
import { buildChatModelInvokeOptions } from "../llm/invokeChatModel.js";
import {
  buildToolCallEvidence,
  describeToolCall,
  resolveProjectToolRuntimeId,
  safeStringify,
  shellCommandResultToChatStreamEvent,
  type ToolCallEvidence,
} from "./HorusChatToolEvidence.js";
import {
  createHorusChatTextStreamPolisher,
  HORUS_CHAT_RESPONSE_STYLE_PROMPT,
  polishHorusChatAssistantText,
} from "../../application/services/HorusChatResponseStyle.js";

export {
  resolveProjectToolRuntimeId,
  shellCommandResultToChatStreamEvent,
} from "./HorusChatToolEvidence.js";

export interface HorusChatToolAgentInput {
  message: string;
  context: ChatAgentContextBundle;
  intentKind?: HorusChatIntent["kind"];
  previewSessionId?: string;
  project?: FrontendProject;
  codeContext?: CodeContextBundle;
  llmSettings?: LlmSettings;
  signal?: AbortSignal;
}

export interface HorusChatToolAgentResponder {
  answer(input: HorusChatToolAgentInput): Promise<string>;
  streamAnswer(input: HorusChatToolAgentInput): AsyncIterable<string>;
  streamAgent(
    input: HorusChatToolAgentInput
  ): AsyncIterable<HorusChatAgentStreamEvent>;
}

const HORUS_CHAT_EXECUTOR_PROFILE: AgentProfileId = "horus_chat_executor";
const DEFAULT_MAX_STEPS = 12;
const DEFAULT_MAX_TOOL_CALLS = 32;
const DEFAULT_MAX_REPAIR_CONTINUATIONS = 3;

interface ChatToolSpec {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodObject<z.ZodRawShape>;
}

type InvokeOptions = ReturnType<typeof buildChatModelInvokeOptions>;

interface InvokableModel {
  invoke(messages: BaseMessage[], options?: InvokeOptions): Promise<AIMessage>;
  stream?(
    messages: BaseMessage[],
    options?: InvokeOptions
  ): Promise<AsyncIterable<AIMessageChunk>>;
}

interface ShellToolMetadata {
  readonly tool: string;
  readonly title: string;
}

// Model-facing tool schemas. projectId/runId are injected by AgentToolRuntime,
// so the model never supplies them. edit_file's content hash/version are injected
// from prior read_file evidence by the runtime.
const CHAT_TOOL_SPECS: ChatToolSpec[] = [
  {
    name: "inspect_project",
    description:
      "Inspect the selected project structure before acting: framework, package manager, scripts, entrypoints, routes, editable files, protected paths, and warnings.",
    schema: z.object({
      maxEditableFiles: z.number().int().positive().optional(),
    }),
  },
  {
    name: "read_file",
    description:
      "Read a text file from the selected project. Always read a file before editing it. For large files or compiler line errors, pass startLine/endLine to read the exact failing range.",
    schema: z.object({
      path: z.string().describe("Project-relative file path"),
      maxBytes: z.number().int().positive().optional(),
      startLine: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
    }),
  },
  {
    name: "list_files",
    description: "List files and directories in the selected project.",
    schema: z.object({
      limit: z.number().int().positive().optional(),
      depth: z.number().int().positive().optional(),
    }),
  },
  {
    name: "search_code",
    description:
      "Search the selected project for relevant code by natural-language query. Returns ranked excerpts.",
    schema: z.object({
      query: z.string().describe("What to look for"),
      requestedPaths: z.array(z.string()).optional(),
    }),
  },
  {
    name: "get_git_diff",
    description: "Inspect the current git diff (changed files and summary) of the project.",
    schema: z.object({
      baseRef: z.string().optional(),
    }),
  },
  {
    name: "write_file",
    description:
      "Create a new file (or overwrite when overwrite=true). For changing an existing file prefer edit_file after reading it.",
    schema: z.object({
      path: z.string(),
      content: z.string(),
      overwrite: z.boolean().optional(),
      reason: z.string().optional(),
    }),
  },
  {
    name: "edit_file",
    description:
      "Apply an exact string replacement to an existing file. You MUST read_file first. oldString must match exactly; set replaceAll=true only when every occurrence should change.",
    schema: z.object({
      path: z.string(),
      oldString: z.string(),
      newString: z.string(),
      replaceAll: z.boolean().optional(),
      reason: z.string().optional(),
    }),
  },
  {
    name: "rewrite_file",
    description:
      "Rewrite an existing text file with the full desired content after read_file. Prefer this over edit_file when a broad component/CSS/theme change makes exact oldString fragile. Runtime computes a minimal diff and enforces read-before-write/version checks.",
    schema: z.object({
      path: z.string(),
      content: z.string(),
      reason: z.string().optional(),
    }),
  },
  {
    name: "replace_file_range",
    description:
      "Replace a contiguous 1-based line range in an existing text file. You MUST read_file first, preferably with startLine/endLine around the target. Use replacement='' to delete duplicated or invalid lines.",
    schema: z.object({
      path: z.string(),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      replacement: z.string(),
      reason: z.string().optional(),
    }),
  },
  {
    name: "delete_file",
    description: "Delete a file from the selected project.",
    schema: z.object({
      path: z.string(),
      reason: z.string().optional(),
    }),
  },
  {
    name: "inspect_preview",
    description:
      "Inspect the active preview after visual or layout changes. The runtime injects previewSessionId when a preview is active.",
    schema: z.object({
      filePath: z.string().optional(),
      diffId: z.string().optional(),
    }),
  },
  {
    name: "run_validation_command",
    description:
      "Run a pre-registered validation command (lint/typecheck/test) for the project and read its result.",
    schema: z.object({
      commandId: z.string(),
      roleName: z.string().optional(),
    }),
  },
  {
    name: "run_command",
    description:
      "Run a governed project command through the controlled shell runtime. Prefer registered commandId for known validations; use command only for simple allowed diagnostics. Pipelines, redirection, command substitution, chained shell logic, and arbitrary shell scripts are denied by policy. Use background=true for long-running tasks.",
    schema: z.object({
      commandId: z.string(),
      command: z.string().optional(),
      shell: z.enum(["bash", "sh"]).optional(),
      executable: z.string().optional(),
      args: z.array(z.string()).optional(),
      kind: z.string().optional(),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
      timeoutMs: z.number().int().positive().optional(),
      background: z
        .boolean()
        .optional()
        .describe("Use true for long-running dev servers/watchers so the agent can continue while the task stays followable."),
      reason: z.string().optional(),
    }),
  },
];

export class HorusChatToolAgent implements HorusChatToolAgentResponder {
  constructor(
    private readonly registry: AgentToolRegistry,
    private readonly profileId: AgentProfileId = HORUS_CHAT_EXECUTOR_PROFILE,
    private readonly maxSteps: number = DEFAULT_MAX_STEPS
  ) {}

  async answer(input: HorusChatToolAgentInput): Promise<string> {
    let text = "";
    for await (const event of this.streamAgent(input)) {
      if (event.type === "text") text += event.text;
    }
    const trimmed = polishHorusChatAssistantText(text);
    if (!trimmed) {
      throw new Error("Horus tool agent returned an empty response.");
    }
    return trimmed;
  }

  async *streamAnswer(
    input: HorusChatToolAgentInput
  ): AsyncIterable<string> {
    for await (const event of this.streamAgent(input)) {
      if (event.type === "text") yield event.text;
    }
  }

  async *streamAgent(
    input: HorusChatToolAgentInput
  ): AsyncIterable<HorusChatAgentStreamEvent> {
    const directConversation = shouldUseDirectConversationalAnswer(input);
    const toolProjectId = resolveProjectToolRuntimeId(input.project);
    const tools = toolProjectId ? this.buildBoundTools() : [];
    const baseModel = createChatModel(
      "horus",
      { temperature: 0.2, maxTokens: directConversation ? 900 : 2200 },
      input.llmSettings
    );
    if (directConversation) {
      yield* streamDirectConversationalAnswer(baseModel as unknown as InvokableModel, input);
      return;
    }
    const model: InvokableModel = (
      tools.length > 0 && typeof baseModel.bindTools === "function"
        ? baseModel.bindTools(tools)
        : baseModel
    ) as unknown as InvokableModel;
    const closingModel = baseModel as unknown as InvokableModel;

    let shellOutputSink:
      | ((event: { toolName: string; output: ShellCommandOutputEvent }) => void)
      | undefined;
    const shellCommandMetadataByCommandId = new Map<string, ShellToolMetadata>();
    const shellCommandMetadataByTaskId = new Map<string, ShellToolMetadata>();
    const pendingShellLifecycleEvents: HorusChatAgentStreamEvent[] = [];

    const runtime = toolProjectId
      ? new AgentToolRuntime(this.registry, {
          agentProfileId: this.profileId,
          projectId: toolProjectId,
          maxToolCalls: DEFAULT_MAX_TOOL_CALLS,
          ...(input.previewSessionId
            ? { previewSessionId: input.previewSessionId }
            : {}),
          ...(input.signal ? { signal: input.signal } : {}),
          onShellOutput(event) {
            shellOutputSink?.(event);
          },
          onShellCommandComplete(event) {
            const metadata =
              (event.result.taskId
                ? shellCommandMetadataByTaskId.get(event.result.taskId)
                : undefined) ??
              shellCommandMetadataByCommandId.get(event.result.commandId);
            pendingShellLifecycleEvents.push(
              shellCommandResultToChatStreamEvent({
                toolName: event.toolName,
                result: event.result,
                title: metadata?.title,
              })
            );
          },
        })
      : undefined;

    const diagnosticEvidence: string[] = [];
    let projectInspectionEvidence: string | undefined;
    let diagnosticFailed = false;
    let mutatingToolUsed = false;
    let forcedCodeChangeContinuation = false;
    let repairContinuationCount = 0;
    let latestValidationFailed = false;
    let diagnosticTarget: DiagnosticTarget | undefined;
    let diagnosticRangeEvidence: string | undefined;
    if (
      runtime &&
      input.project &&
      this.registry.canUseTool(this.profileId, "inspect_project")
    ) {
      const title = "Inspecionando estrutura do projeto";
      yield {
        type: "tool_started",
        tool: "inspect_project",
        title,
      };
      const { content, ok, evidence } = await this.runToolCall(runtime, {
        name: "inspect_project",
        args: { maxEditableFiles: 80 },
      });
      projectInspectionEvidence = formatProjectInspectionEvidence(content, ok);
      if (ok) {
        yield {
          type: "tool_succeeded",
          tool: "inspect_project",
          title,
          detail: "Mapa estrutural disponível para o agente.",
          ...evidence,
        };
      } else {
        yield {
          type: "tool_failed",
          tool: "inspect_project",
          title,
          detail: content.slice(0, 300),
          ...evidence,
        };
      }
    }
    if (
      runtime &&
      input.project &&
      this.registry.canUseTool(this.profileId, "run_validation_command") &&
      shouldAutoRunDiagnostics(input.message)
    ) {
      const commands = selectDiagnosticValidationCommands(input.project);
      for (const command of commands) {
        throwIfAborted(input.signal);
        const title = `Rodando validação: ${command.label ?? command.id}`;
        yield {
          type: "tool_started",
          tool: "run_validation_command",
          title,
        };
        const { content, ok, evidence } = await this.runToolCall(runtime, {
          name: "run_validation_command",
          args: { commandId: command.id, roleName: "qa_specialist" },
        });
        const commandFailed = !ok || commandResultFailed(content);
        diagnosticFailed = diagnosticFailed || commandFailed;
        diagnosticEvidence.push(formatDiagnosticEvidence(command, content, ok));
        if (ok) {
          yield {
            type: "tool_succeeded",
            tool: "run_validation_command",
            title,
            detail: summarizeCommandResult(content),
            ...evidence,
          };
        } else {
          yield {
            type: "tool_failed",
            tool: "run_validation_command",
            title,
            detail: content.slice(0, 300),
            ...evidence,
          };
        }
        if (commandFailed) break;
      }
    }
    diagnosticTarget = parsePrimaryDiagnosticTarget(
      diagnosticEvidence,
      input.project?.rootPath
    );
    if (
      runtime &&
      diagnosticFailed &&
      diagnosticTarget &&
      isCodeChangeIntent(input) &&
      this.registry.canUseTool(this.profileId, "read_file")
    ) {
      const title = `Lendo trecho do erro: ${diagnosticTarget.path}:${diagnosticTarget.line}`;
      yield {
        type: "tool_started",
        tool: "read_file",
        title,
      };
      const { content, ok, evidence } = await this.runToolCall(runtime, {
        name: "read_file",
        args: {
          path: diagnosticTarget.path,
          startLine: diagnosticTarget.startLine,
          endLine: diagnosticTarget.endLine,
        },
      });
      diagnosticRangeEvidence = formatDiagnosticRangeEvidence(
        diagnosticTarget,
        content,
        ok
      );
      if (ok) {
        yield {
          type: "tool_succeeded",
          tool: "read_file",
          title,
          detail: `Trecho ${diagnosticTarget.startLine}-${diagnosticTarget.endLine} disponível para correção.`,
          ...evidence,
        };
      } else {
        yield {
          type: "tool_failed",
          tool: "read_file",
          title,
          detail: content.slice(0, 300),
          ...evidence,
        };
      }
    }

    const messages: BaseMessage[] = [
      new SystemMessage(buildSystemPrompt(input, tools.length > 0)),
      ...(diagnosticEvidence.length > 0
        ? [new SystemMessage(formatDiagnosticEvidenceBlock(diagnosticEvidence))]
        : []),
      ...(projectInspectionEvidence
        ? [new SystemMessage(projectInspectionEvidence)]
        : []),
      ...(diagnosticRangeEvidence
        ? [new SystemMessage(diagnosticRangeEvidence)]
        : []),
      new HumanMessage(input.message),
    ];

    let yieldedText = false;
    for (let step = 0; step < this.maxSteps; step += 1) {
      throwIfAborted(input.signal);
      const options = buildChatModelInvokeOptions(input.signal);

      // Stream tokens as they are produced so the chat fills in progressively
      // instead of dumping the whole answer at once. Tool-call chunks are
      // aggregated and acted on after the stream ends.
      let response: AIMessage;
      let bufferedText = "";
      const holdTextUntilToolDecision = shouldHoldTextUntilToolDecision(input);
      const textPolisher = createHorusChatTextStreamPolisher();
      if (typeof model.stream === "function") {
        const tokenStream = await model.stream(messages, options);
        let aggregated: AIMessageChunk | undefined;
        for await (const chunk of tokenStream) {
          throwIfAborted(input.signal);
          aggregated = aggregated ? aggregated.concat(chunk) : chunk;
          const piece = extractText(chunk.content);
          if (piece) {
            if (holdTextUntilToolDecision) {
              bufferedText += piece;
            } else {
              const polishedPiece = textPolisher.push(piece);
              if (polishedPiece) {
                yieldedText = true;
                yield { type: "text", text: polishedPiece };
              }
            }
          }
        }
        if (!holdTextUntilToolDecision) {
          const polishedTail = textPolisher.finish();
          if (polishedTail) {
            yieldedText = true;
            yield { type: "text", text: polishedTail };
          }
        }
        response = (aggregated ?? new AIMessage("")) as unknown as AIMessage;
      } else {
        response = await model.invoke(messages, options);
        const textPart = extractText(response.content);
        if (textPart) {
          if (holdTextUntilToolDecision) {
            bufferedText += textPart;
          } else {
            const polishedText = polishHorusChatAssistantText(textPart);
            if (polishedText) {
              yieldedText = true;
              yield { type: "text", text: polishedText };
            }
          }
        }
      }
      messages.push(response);

      const toolCalls = response.tool_calls ?? [];
      if (toolCalls.length === 0 || !runtime) {
        if (
          shouldForceCodeChangeContinuation({
            input,
            runtime,
            diagnosticFailed,
            mutatingToolUsed,
            forcedCodeChangeContinuation,
          })
        ) {
          forcedCodeChangeContinuation = true;
          messages.push(new HumanMessage(buildForcedCodeChangeContinuationPrompt()));
          continue;
        }
        const polishedBufferedText = polishHorusChatAssistantText(bufferedText);
        if (polishedBufferedText) {
          yieldedText = true;
          yield { type: "text", text: polishedBufferedText };
        }
        return;
      }

      for (const call of toolCalls) {
        throwIfAborted(input.signal);
        if (isMutatingTool(call.name)) {
          mutatingToolUsed = true;
        }
        const title = describeToolCall(call.name, call.args);
        const startedEvidence = buildToolCallEvidence(call.name, call.args);
        rememberShellToolMetadata({
          byCommandId: shellCommandMetadataByCommandId,
          byTaskId: shellCommandMetadataByTaskId,
          tool: call.name,
          title,
          evidence: startedEvidence,
        });
        yield { type: "tool_started", tool: call.name, title, ...startedEvidence };
        const fullReadBlock = buildFullReadBlockMessage({
          input,
          call,
          diagnosticFailed,
          diagnosticTarget,
          mutatingToolUsed,
        });
        const pendingShellEvents: HorusChatAgentStreamEvent[] = [];
        const previousShellOutputSink = shellOutputSink;
        shellOutputSink = ({ toolName, output }) => {
          if (toolName !== call.name) return;
          pendingShellEvents.push({
            type: "tool_started",
            tool: call.name,
            title,
            detail: output.chunk,
            commandIds: [output.commandId],
            taskId: output.taskId ?? null,
          });
        };

        const toolResultPromise = fullReadBlock
          ? {
              content: fullReadBlock,
              ok: false,
              evidence: buildToolCallEvidence(call.name, call.args, undefined, fullReadBlock),
            }
          : this.runToolCall(runtime, call);
        let toolResult:
          | { content: string; ok: boolean; evidence: ToolCallEvidence }
          | undefined;
        try {
          while (!toolResult) {
            throwIfAborted(input.signal);
            const result = await Promise.race([
              Promise.resolve(toolResultPromise).then((value) => ({
                kind: "done" as const,
                value,
              })),
              delay(75).then(() => ({ kind: "tick" as const })),
            ]);
            while (pendingShellEvents.length) {
              const event = pendingShellEvents.shift();
              if (event) yield event;
            }
            while (pendingShellLifecycleEvents.length) {
              const event = pendingShellLifecycleEvents.shift();
              if (event) yield event;
            }
            if (result.kind === "done") {
              toolResult = result.value;
            }
          }
        } finally {
          shellOutputSink = previousShellOutputSink;
        }
        const { content, ok, evidence } = toolResult;
        rememberShellToolMetadata({
          byCommandId: shellCommandMetadataByCommandId,
          byTaskId: shellCommandMetadataByTaskId,
          tool: call.name,
          title,
          evidence,
        });
        if (ok) {
          yield { type: "tool_succeeded", tool: call.name, title, ...evidence };
        } else {
          yield {
            type: "tool_failed",
            tool: call.name,
            title,
            detail: content.slice(0, 300),
            ...evidence,
          };
        }
        if (isValidationTool(call.name) && evidence.taskId) {
          for (let tick = 0; tick < 2; tick += 1) {
            await delay(50);
            while (pendingShellLifecycleEvents.length) {
              const event = pendingShellLifecycleEvents.shift();
              if (event) yield event;
            }
          }
        }
        messages.push(
          new ToolMessage({
            content,
            tool_call_id: call.id ?? call.name,
            name: call.name,
          })
        );
        if (isValidationTool(call.name) && (!ok || commandResultFailed(content))) {
          latestValidationFailed = true;
          diagnosticFailed = true;
          const parsedTarget = parsePrimaryDiagnosticTarget(
            [content],
            input.project?.rootPath
          );
          if (parsedTarget) {
            diagnosticTarget = parsedTarget;
            if (this.registry.canUseTool(this.profileId, "read_file")) {
              const readTitle = `Lendo trecho do erro: ${parsedTarget.path}:${parsedTarget.line}`;
              yield {
                type: "tool_started",
                tool: "read_file",
                title: readTitle,
              };
              const readResult = await this.runToolCall(runtime, {
                name: "read_file",
                args: {
                  path: parsedTarget.path,
                  startLine: parsedTarget.startLine,
                  endLine: parsedTarget.endLine,
                },
              });
              const rangeEvidence = formatDiagnosticRangeEvidence(
                parsedTarget,
                readResult.content,
                readResult.ok
              );
              if (readResult.ok) {
                yield {
                  type: "tool_succeeded",
                  tool: "read_file",
                  title: readTitle,
                  detail: `Trecho ${parsedTarget.startLine}-${parsedTarget.endLine} disponível para correção.`,
                  ...readResult.evidence,
                };
              } else {
                yield {
                  type: "tool_failed",
                  tool: "read_file",
                  title: readTitle,
                  detail: readResult.content.slice(0, 300),
                  ...readResult.evidence,
                };
              }
              messages.push(
                new ToolMessage({
                  content: rangeEvidence,
                  tool_call_id: `${call.id ?? call.name}-diagnostic-range`,
                  name: "read_file",
                })
              );
            }
          }
        } else if (isValidationTool(call.name) && ok) {
          latestValidationFailed = false;
        }
      }

      if (
        latestValidationFailed &&
        isCodeChangeIntent(input) &&
        repairContinuationCount < DEFAULT_MAX_REPAIR_CONTINUATIONS
      ) {
        repairContinuationCount += 1;
        messages.push(
          new HumanMessage(
            buildValidationRepairContinuationPrompt({
              target: diagnosticTarget,
              failedValidations: repairContinuationCount,
              maxRepairAttempts: DEFAULT_MAX_REPAIR_CONTINUATIONS,
            })
          )
        );
      }
    }

    // Loop hit the step ceiling with tools still pending. Force a final
    // textual answer without tools so the chat never ends silently.
      if (!yieldedText) {
        throwIfAborted(input.signal);
        while (pendingShellLifecycleEvents.length) {
          const event = pendingShellLifecycleEvents.shift();
          if (event) yield event;
        }
        const closing = await closingModel.invoke(
        [
          ...messages,
          new HumanMessage(
            "Finalize em português com o ponto principal primeiro, o que foi feito, a validação real e o estado atual. Não chame mais ferramentas."
          ),
        ],
        buildChatModelInvokeOptions(input.signal)
      );
      const closingText = polishHorusChatAssistantText(extractText(closing.content));
      if (closingText) yield { type: "text", text: closingText };
    }
  }

  private buildBoundTools() {
    return CHAT_TOOL_SPECS.filter((spec) =>
      this.registry.canUseTool(this.profileId, spec.name as never)
    ).map((spec) =>
      tool(async () => "", {
        name: spec.name,
        description: spec.description,
        // Cast: the curated ZodObject is structurally valid, but the generic
        // ZodRawShape signature clashes with exactOptionalPropertyTypes on the
        // tool() schema overload.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: spec.schema as any,
      })
    );
  }

  private async runToolCall(
    runtime: AgentToolRuntime,
    call: { name: string; args: Record<string, unknown>; id?: string }
  ): Promise<{ content: string; ok: boolean; evidence: ToolCallEvidence }> {
    try {
      const output = await runtime.execute({
        toolName: call.name as never,
        input: call.args as Record<string, unknown>,
        reason: `chat agent tool call: ${call.name}`,
      });
      return {
        content: safeStringify(output),
        ok: true,
        evidence: buildToolCallEvidence(call.name, call.args, output),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: `TOOL_ERROR: ${message}`,
        ok: false,
        evidence: buildToolCallEvidence(call.name, call.args, undefined, message),
      };
    }
  }
}

export function shouldUseDirectConversationalAnswer(
  input: Pick<HorusChatToolAgentInput, "intentKind" | "message">
): boolean {
  if (isCodeChangeIntent(input)) return false;
  return !shouldAutoRunDiagnostics(input.message);
}

async function* streamDirectConversationalAnswer(
  model: InvokableModel,
  input: HorusChatToolAgentInput
): AsyncIterable<HorusChatAgentStreamEvent> {
  const messages: BaseMessage[] = [
    new SystemMessage(buildDirectConversationalPrompt(input)),
    new HumanMessage(input.message),
  ];
  const options = buildChatModelInvokeOptions(input.signal);

  if (typeof model.stream === "function") {
    const tokenStream = await model.stream(messages, options);
    const textPolisher = createHorusChatTextStreamPolisher();
    for await (const chunk of tokenStream) {
      throwIfAborted(input.signal);
      const piece = extractText(chunk.content);
      if (!piece) continue;
      const polishedPiece = textPolisher.push(piece);
      if (polishedPiece) yield { type: "text", text: polishedPiece };
    }
    const polishedTail = textPolisher.finish();
    if (polishedTail) yield { type: "text", text: polishedTail };
    return;
  }

  const response = await model.invoke(messages, options);
  const text = polishHorusChatAssistantText(extractText(response.content));
  if (text) yield { type: "text", text };
}

function buildDirectConversationalPrompt(input: HorusChatToolAgentInput): string {
  const { context, project, codeContext } = input;
  const chatHistory = context.messages
    .slice(-8)
    .map((message) => `${message.role}: ${message.compactBody ?? message.body}`)
    .join("\n");
  const codeEvidence = formatCodeExcerpts(codeContext);

  return `# Identidade
Você é Horus, um agente de engenharia conversando dentro do produto.
Esta é uma resposta direta: não chame ferramentas, não fale de tools e não diga
que executou validação se nenhuma validação foi executada.

${HORUS_CHAT_RESPONSE_STYLE_PROMPT}

Regras de forma:
- respeite limites explícitos do usuário; se ele pedir exatamente N bullets,
  responda com exatamente N bullets e nada além disso;
- se o usuário pedir uma frase curta, entregue uma frase curta;
- para resumo, priorize produto, arquitetura e estado atual, sem relatório
  operacional.

# Contexto atual
chat_session_id: ${context.session.id}
active_user_story: ${context.activeUserStory.title}
active_user_story_description: ${context.activeUserStory.description}
active_spec_summary: ${context.activeSpec?.summary ?? "sem spec ativa"}
selected_project_name: ${project?.name ?? "nenhum"}
selected_project_root: ${project?.rootPath ?? "nenhum"}

${codeEvidence}

# Histórico recente do chat
${chatHistory || "sem mensagens anteriores"}`;
}

function rememberShellToolMetadata(input: {
  byCommandId: Map<string, ShellToolMetadata>;
  byTaskId: Map<string, ShellToolMetadata>;
  tool: string;
  title: string;
  evidence: ToolCallEvidence;
}): void {
  if (!isValidationTool(input.tool)) return;
  const metadata = { tool: input.tool, title: input.title };
  for (const commandId of input.evidence.commandIds) {
    input.byCommandId.set(commandId, metadata);
  }
  if (input.evidence.taskId) {
    input.byTaskId.set(input.evidence.taskId, metadata);
  }
}

function isValidationTool(toolName: string): boolean {
  return toolName === "run_validation_command" || toolName === "run_command";
}

function buildSystemPrompt(
  input: HorusChatToolAgentInput,
  hasTools: boolean
): string {
  const { context, project, codeContext } = input;
  const chatHistory = context.messages
    .slice(-12)
    .map((message) => `${message.role}: ${message.compactBody ?? message.body}`)
    .join("\n");
  const excerpts = formatCodeExcerpts(codeContext);
  const commandCatalog = formatProjectCommandCatalog(project);
  const turnContract = isCodeChangeIntent(input)
    ? `# Contrato deste turno
Este turno foi classificado como code_change. O usuário já autorizou correção.
Se a validação/build falhar, você deve tentar corrigir no código agora: use o
trecho exato do erro lido automaticamente ou leia com read_file startLine/endLine,
edite com replace_file_range/edit_file/write_file, e rode validação novamente. Não encerre com "se quiser eu corrijo",
"posso executar" ou apenas diagnóstico enquanto houver ferramenta disponível.`
    : `# Contrato deste turno
Este turno é conversacional ou diagnóstico. Só altere arquivos se o usuário tiver
pedido mutação de forma clara no texto atual.`;

  const toolsSection = hasTools
    ? `# Ferramentas
Você pode chamar ferramentas para AGIR no projeto selecionado, em um loop: chame
uma ferramenta, leia o resultado e continue até concluir. Ferramentas disponíveis:
- inspect_project: entender framework, scripts, entrypoints, raízes editáveis e
  protected_paths antes de agir.
- read_file, list_files, search_code, get_git_diff: investigar o projeto.
- write_file: criar arquivo novo. Sobrescrever exige leitura prévia.
- edit_file: alterar arquivo existente. SEMPRE leia o arquivo com read_file antes
  de editar; oldString deve casar exatamente com o conteúdo atual.
- rewrite_file: reescrever um arquivo existente com o conteúdo final desejado.
  Use quando a mudança for ampla, visual ou estrutural e oldString/line range
  forem frágeis. SEMPRE leia o arquivo inteiro ou trecho suficiente antes; o
  runtime calcula diff mínimo e valida versão.
- replace_file_range: substituir/remover uma faixa de linhas quando o erro de
  build aponta linhas ou quando há blocos duplicados/truncados. SEMPRE leia o
  trecho primeiro com read_file startLine/endLine.
- delete_file: remover arquivo. SEMPRE leia o arquivo antes.
- inspect_preview: checar a preview ativa depois de mudanças visuais/layout
  quando houver previewSessionId no contexto.
- run_validation_command / run_command: validar e executar comandos governados.
  run_command aceita command apenas para diagnósticos simples permitidos ou
  executable/args para chamadas diretas. Pipes, redirecionamento, substituição de
  comando, encadeamento de shell e scripts arbitrários são bloqueados por política.
  O runtime grava stdout/stderr, streama progresso no Execution Console, permite
  background=true, kill/retry e aplica permissões do perfil antes de spawnar.

Regras de execução:
- Quando o usuário pedir uma mudança clara, EXECUTE de fato via ferramentas; não
  apenas descreva ou prometa.
- Quando o usuário pedir para analisar código, procurar erro, validar, debugar ou
  confirmar se o projeto funciona, rode validação real antes de concluir. Prefira
  comandos de build/type-check/test registrados. Não responda "não testei" se
  existe comando governado disponível para testar.
- Quando o erro de build apontar linha/coluna em arquivo grande, use read_file
  com startLine/endLine em torno da linha indicada; não confunda truncamento de
  output da ferramenta com conteúdo real do arquivo.
- Use o Mapa estrutural do projeto como orientação de entrypoints, scripts,
  roots editáveis e paths protegidos. Nunca edite protected_paths diretamente.
- Antes de editar, leia o arquivo. Faça mudanças mínimas e coerentes com a spec ativa.
- Depois de alterar código, rode validação quando houver comando aplicável. Se
  falhar, leia a linha do erro, corrija e valide de novo até passar ou atingir o limite.
- Depois de alteração visual/layout, recarregue/valide e use inspect_preview
  quando disponível. Não trate type-check sozinho como prova visual suficiente.
- Para diagnóstico de CLI, prefira commandId registrado ou executable/args. Se
  usar command, mantenha uma chamada simples aceita pela política do runtime.
- Para servidores dev/watchers ou comandos longos, use run_command com
  background=true. O retorno traz taskId para acompanhar, parar ou tentar de novo
  pelo Execution Console; não espere um servidor ficar bloqueando o chat.
- Ao terminar, responda em português resumindo objetivamente o que mudou (arquivos
  e por quê) e o resultado da validação. Não invente arquivos nem resultados.`
    : project
      ? `# Projeto sem runtime operacional
O projeto está selecionado no preview, mas não possui projectWorkspaceId associado.
Você pode responder com o contexto disponível, mas não pode ler nem alterar arquivos
até o projeto ser registrado como workspace de construção.`
    : `# Sem projeto selecionado
Nenhum projeto está selecionado, então você não pode ler nem alterar arquivos
agora. Converse normalmente, oriente o usuário e peça para selecionar um projeto
quando a tarefa exigir acesso ao código.`;

  return `# Identidade
Você é Horus, um agente de engenharia que conversa em português e opera o projeto
selecionado como um único agente de tool-calling (no estilo de um coding agent de
terminal). Você conversa de forma natural E executa de verdade quando o pedido é claro.

${toolsSection}

${turnContract}

${HORUS_CHAT_RESPONSE_STYLE_PROMPT}

Regras adicionais para agente com ferramentas:
- Para saudações ou perguntas simples, responda curto e natural, sem burocracia.
- Quando executar ferramentas, não narre intenção antiga como se fosse resultado:
  diferencie "rodei", "falhou", "não rodei" e "não havia comando governado".
- Use a spec ativa como contrato quando existir; se não houver, não invente.

# Contexto isolado
chat_session_id: ${context.session.id}
workspace_folder_id: ${context.session.workspaceFolderId}
active_user_story: ${context.activeUserStory.title}
active_user_story_description: ${context.activeUserStory.description}
active_spec_summary: ${context.activeSpec?.summary ?? "sem spec ativa"}
selected_project_name: ${project?.name ?? "nenhum"}
selected_project_root: ${project?.rootPath ?? "nenhum"}
selected_project_workspace_id: ${project?.projectWorkspaceId ?? "nenhum"}
active_preview_session_id: ${input.previewSessionId ?? "nenhum"}

# Comandos registrados do projeto
${commandCatalog}

${excerpts}

# Histórico recente do chat
${chatHistory || "sem mensagens anteriores"}`;
}

function formatCodeExcerpts(codeContext: CodeContextBundle | undefined): string {
  if (!codeContext || codeContext.excerpts.length === 0) {
    return "# Código pré-consultado\nnenhum (use as ferramentas para investigar)";
  }
  const blocks = codeContext.excerpts
    .map(
      (excerpt) => `## ${excerpt.filePath}:${excerpt.startLine}-${excerpt.endLine}
\`\`\`
${excerpt.content}
\`\`\``
    )
    .join("\n\n");
  const structuralContext = formatStructuralContext(codeContext);
  return `# Código pré-consultado (fonte primária; confirme com read_file ao editar)
${blocks}

${structuralContext}`;
}

function formatStructuralContext(codeContext: CodeContextBundle): string {
  const context = codeContext.structuralContext;
  if (!context) return "# Contexto estrutural AST\nindisponível";
  const symbols = context.symbols
    .slice(0, 18)
    .map(
      (symbol) =>
        `- ${symbol.path}:${symbol.startLine}-${symbol.endLine} ${symbol.kind} ${symbol.name}${symbol.detail ? ` (${symbol.detail})` : ""}`
    )
    .join("\n");
  const diagnostics = context.diagnostics
    .slice(0, 8)
    .map(
      (diagnostic) =>
        `- ${diagnostic.severity} ${diagnostic.path}${diagnostic.startLine ? `:${diagnostic.startLine}` : ""} ${diagnostic.code}: ${diagnostic.message}`
    )
    .join("\n");
  const semanticMatches = context.semanticMatches
    .slice(0, 8)
    .map(
      (match) =>
        `- ${match.path}:${match.startLine}-${match.endLine} ${match.kind} score=${match.score.toFixed(3)}${match.symbolNames.length ? ` symbols=${match.symbolNames.join(",")}` : ""}`
    )
    .join("\n");

  return `# Contexto estrutural AST
status=${context.status}; parsed=${context.parsedDocumentCount}; symbols=${context.symbolCount}; diagnostics=${context.diagnosticCount}

## Símbolos relevantes
${symbols || "nenhum"}

## Diagnósticos estruturais
${diagnostics || "nenhum"}

## Recuperação semântica
${semanticMatches || "nenhuma"}`;
}

function formatProjectCommandCatalog(project: FrontendProject | undefined): string {
  const commands = project?.commandCatalog ?? [];
  if (commands.length === 0) return "nenhum comando registrado";
  return commands
    .map((command) => {
      const args = command.args.length ? ` ${command.args.join(" ")}` : "";
      const label = command.label ? ` (${command.label})` : "";
      return `- ${command.id}${label}: ${command.executable}${args} [cwd=${command.cwd}]`;
    })
    .join("\n");
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof (part as { text: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("aborted");
  }
}
