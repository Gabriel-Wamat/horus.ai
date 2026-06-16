import type {
  FrontendProject,
  HorusChatToolFileOperation,
  ShellCommandResult,
} from "@u-build/shared";
import type { HorusChatAgentStreamEvent } from "../../application/services/HorusChatAgentStreamEvents.js";
import { commandResultFailed } from "./HorusChatToolDiagnostics.js";

export interface ToolCallEvidence {
  readonly filePaths: string[];
  readonly commandIds: string[];
  readonly taskId: string | null;
  readonly fileOperations: HorusChatToolFileOperation[];
}

export function shellCommandResultToChatStreamEvent(input: {
  toolName: string;
  result: ShellCommandResult;
  title?: string | undefined;
}): HorusChatAgentStreamEvent {
  const failed = input.result.status !== "completed";
  const detail = shellCommandCompletionDetail(input.result);
  const base = {
    tool: input.toolName,
    title: input.title ?? `Comando ${input.result.commandId}`,
    commandIds: [input.result.commandId],
    taskId: input.result.taskId ?? null,
    fileOperations: [],
  };
  if (failed) {
    return {
      type: "tool_failed",
      ...base,
      detail,
    };
  }
  return {
    type: "tool_succeeded",
    ...base,
    ...(detail ? { detail } : {}),
  };
}

export function buildToolCallEvidence(
  toolName: string,
  args: Record<string, unknown>,
  output?: unknown,
  errorMessage?: string
): ToolCallEvidence {
  const outputRecord = asRecord(output);
  const path =
    stringValue(outputRecord["path"]) ??
    stringValue(args["path"]) ??
    firstString(outputRecord["files"]) ??
    firstString(outputRecord["changedFiles"]) ??
    firstString(outputRecord["appliedOperations"]);
  const files = uniqueStrings([
    ...(path ? [path] : []),
    ...arrayOfStrings(outputRecord["files"]),
    ...arrayOfStrings(outputRecord["changedFiles"]),
    ...arrayOfStrings(outputRecord["appliedOperations"]),
  ]);
  const commandId =
    stringValue(outputRecord["commandId"]) ?? stringValue(args["commandId"]);
  const taskId = stringValue(outputRecord["taskId"]);
  const operationType = operationTypeForTool(toolName);
  const status = fileOperationStatusForTool({
    toolName,
    output: outputRecord,
    ...(errorMessage ? { errorMessage } : {}),
  });
  const fileOperations =
    files.length > 0
      ? files.map((filePath) =>
          fileOperation({
            path: filePath,
            operationType,
            status,
            additions: nonnegativeInteger(outputRecord["additions"]),
            deletions: nonnegativeInteger(outputRecord["deletions"]),
            replacementCount: nonnegativeInteger(outputRecord["replacementCount"]),
            diffPreview:
              boundedString(stringValue(outputRecord["diff"]) ?? "", 8_000) ||
              boundedString(stringValue(outputRecord["patchSummary"]) ?? "", 8_000),
            errorMessage: errorMessage ?? null,
          })
        )
      : [];

  return {
    filePaths: files,
    commandIds: commandId ? [commandId] : [],
    taskId: taskId ?? null,
    fileOperations,
  };
}

export function resolveProjectToolRuntimeId(
  project: Pick<FrontendProject, "id" | "projectWorkspaceId"> | undefined
): string | undefined {
  return project?.projectWorkspaceId ?? undefined;
}

export function describeToolCall(
  toolName: string,
  args: Record<string, unknown>
): string {
  const pick = (key: string): string | undefined => {
    const value = args?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  const path = pick("path");
  const query = pick("query");
  const commandId = pick("commandId");
  const target = path ?? query ?? commandId;
  const labels: Record<string, string> = {
    inspect_project: "Inspecionando projeto",
    read_file: "Lendo arquivo",
    list_files: "Listando arquivos",
    search_code: "Buscando no código",
    get_git_diff: "Lendo diff do git",
    write_file: "Criando/gravando arquivo",
    edit_file: "Editando arquivo",
    rewrite_file: "Reescrevendo arquivo",
    replace_file_range: "Editando faixa",
    delete_file: "Removendo arquivo",
    run_validation_command: "Rodando validação",
    run_command: "Executando comando",
  };
  const label = labels[toolName] ?? toolName;
  return target ? `${label}: ${target}` : label;
}

export function safeStringify(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return String(value);
    return text.length > 12_000 ? `${text.slice(0, 12_000)}… [truncado]` : text;
  } catch {
    return String(value);
  }
}

function shellCommandCompletionDetail(result: ShellCommandResult): string {
  if (result.status === "completed") {
    if (result.exitCode === 0 || result.exitCode === null) return "Comando concluído.";
    return `Comando concluído com exit ${result.exitCode}.`;
  }
  if (result.status === "timed_out") return "Comando excedeu o tempo limite.";
  if (result.status === "aborted") return "Comando interrompido.";
  if (result.status === "rejected") {
    return result.errorMessage ?? result.policyReason ?? "Comando rejeitado pela política.";
  }
  return (
    result.errorMessage ??
    (result.stderrTail || result.stdoutTail || "Comando falhou.")
  );
}

function fileOperation(input: {
  path: string;
  operationType: HorusChatToolFileOperation["operationType"];
  status: HorusChatToolFileOperation["status"];
  additions?: number | null;
  deletions?: number | null;
  replacementCount?: number | null;
  diffPreview?: string;
  errorMessage?: string | null;
}): HorusChatToolFileOperation {
  return {
    path: input.path,
    operationType: input.operationType,
    status: input.status,
    additions: input.additions ?? null,
    deletions: input.deletions ?? null,
    replacementCount: input.replacementCount ?? null,
    diffPreview: input.diffPreview ?? "",
    errorMessage: input.errorMessage ?? null,
  };
}

function operationTypeForTool(
  toolName: string
): HorusChatToolFileOperation["operationType"] {
  if (toolName === "read_file" || toolName === "list_files" || toolName === "search_code") {
    return "read";
  }
  if (toolName === "write_file") return "create";
  if (toolName === "delete_file") return "delete";
  if (toolName === "get_git_diff") return "diff";
  if (toolName === "run_validation_command" || toolName === "run_command") {
    return "validate";
  }
  if (
    toolName === "edit_file" ||
    toolName === "rewrite_file" ||
    toolName === "replace_file_range"
  ) {
    return "update";
  }
  return "unknown";
}

function fileOperationStatusForTool(input: {
  toolName: string;
  output: Record<string, unknown>;
  errorMessage?: string;
}): HorusChatToolFileOperation["status"] {
  if (input.errorMessage) return "failed";
  if (Object.keys(input.output).length === 0) return "running";
  if (input.toolName === "read_file") return "read";
  if (input.toolName === "get_git_diff") return "validated";
  if (
    input.toolName === "run_validation_command" ||
    input.toolName === "run_command"
  ) {
    return commandResultFailed(safeStringify(input.output)) ? "failed" : "validated";
  }
  if (input.output["changed"] === false) return "skipped";
  if (input.output["changed"] === true || input.output["deleted"] === true) {
    return "changed";
  }
  return "unknown";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function firstString(value: unknown): string | undefined {
  return arrayOfStrings(value)[0];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function nonnegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function boundedString(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
