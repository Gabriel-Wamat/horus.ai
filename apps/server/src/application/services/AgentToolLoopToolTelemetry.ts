import type {
  AgentToolName,
  CodeChangeSet,
} from "@u-build/shared";

export function extractFilePaths(toolName: AgentToolName, output: unknown): string[] {
  if (!output || typeof output !== "object") return [];
  const record = output as Record<string, unknown>;
  if (
    (toolName === "read_file" || toolName === "read_file_readonly") &&
    typeof record["path"] === "string"
  ) {
    return [record["path"]];
  }
  if (
    (toolName === "edit_file" ||
      toolName === "rewrite_file" ||
      toolName === "replace_file_range" ||
      toolName === "save_file" ||
      toolName === "write_file") &&
    record["changed"] === true &&
    typeof record["path"] === "string"
  ) {
    return [record["path"]];
  }
  if (
    toolName === "delete_file" &&
    record["deleted"] === true &&
    typeof record["path"] === "string"
  ) {
    return [record["path"]];
  }
  if (toolName === "apply_code_change_set" && Array.isArray(record["appliedOperations"])) {
    return record["appliedOperations"].filter((item): item is string => typeof item === "string");
  }
  if (toolName === "get_git_diff" && Array.isArray(record["files"])) {
    return record["files"].filter((item): item is string => typeof item === "string");
  }
  return [];
}

export function isMutatingFileTool(toolName: AgentToolName): boolean {
  return (
    toolName === "edit_file" ||
    toolName === "rewrite_file" ||
    toolName === "replace_file_range" ||
    toolName === "save_file" ||
    toolName === "write_file" ||
    toolName === "delete_file" ||
    toolName === "apply_code_change_set"
  );
}

export function extractInputFilePaths(input: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  const path = input["path"];
  if (typeof path === "string" && path.length > 0) paths.add(path);

  const operations = input["operations"];
  if (Array.isArray(operations)) {
    for (const operation of operations) {
      if (!operation || typeof operation !== "object") continue;
      const targetPath = (operation as Record<string, unknown>)["targetPath"];
      if (typeof targetPath === "string" && targetPath.length > 0) {
        paths.add(targetPath);
      }
    }
  }

  return [...paths];
}

export function extractCommandIds(output: unknown): string[] {
  const record = asRecord(output);
  const commandId = record["commandId"];
  return typeof commandId === "string" && commandId.length > 0 ? [commandId] : [];
}

export function extractTaskId(output: unknown): string | undefined {
  const record = asRecord(output);
  const taskId = record["taskId"];
  return typeof taskId === "string" && taskId.length > 0 ? taskId : undefined;
}

export function summarizeToolOutput(toolName: AgentToolName, output: unknown): string {
  const paths = extractFilePaths(toolName, output);
  if ((toolName === "read_file" || toolName === "read_file_readonly") && paths.length > 0) {
    return `${toolName} leu ${paths.join(", ")}.`;
  }
  if (toolName === "get_git_diff" && paths.length > 0) {
    return `${toolName} inspecionou diff em ${paths.join(", ")}.`;
  }
  if (paths.length > 0) return `${toolName} alterou ${paths.join(", ")}.`;
  if (toolName === "get_git_diff" && output && typeof output === "object") {
    const summary = (output as Record<string, unknown>)["patchSummary"];
    if (typeof summary === "string") return summary;
  }
  if (toolName === "propose_code_change_set" && output && typeof output === "object") {
    const status = (output as Record<string, unknown>)["status"];
    return `Proposta registrada com status ${String(status ?? "unknown")}.`;
  }
  if (toolName === "inspect_project" && output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    const framework = asRecord(record["framework"]);
    const packageManager = asRecord(record["packageManager"]);
    const editableFiles = Array.isArray(record["editableFiles"])
      ? record["editableFiles"].length
      : 0;
    return `Projeto inspecionado: framework ${String(framework["name"] ?? "unknown")}, package manager ${String(packageManager["name"] ?? "unknown")}, ${editableFiles} arquivo(s) editável(is).`;
  }
  return `${toolName} concluído.`;
}

export function compactInspectionMetadata(output: unknown): Record<string, unknown> {
  const record = asRecord(output);
  const framework = asRecord(record["framework"]);
  const packageManager = asRecord(record["packageManager"]);
  const scripts = Array.isArray(record["scripts"])
    ? record["scripts"].slice(0, 12).map((script) => {
        const item = asRecord(script);
        return {
          name: item["name"],
          category: item["category"],
        };
      })
    : [];
  return {
    framework: framework["name"] ?? "unknown",
    frameworkStatus: framework["status"] ?? "unknown",
    packageManager: packageManager["name"] ?? "unknown",
    packageManagerStatus: packageManager["status"] ?? "unknown",
    scripts,
    editableFileCount: Array.isArray(record["editableFiles"])
      ? record["editableFiles"].length
      : 0,
    warnings: Array.isArray(record["warnings"])
      ? record["warnings"].slice(0, 6)
      : [],
  };
}

export function inferChangeType(
  toolName: AgentToolName
): "create" | "update" | "delete" | "unknown" {
  if (toolName === "write_file") return "create";
  if (toolName === "delete_file") return "delete";
  if (
    toolName === "edit_file" ||
    toolName === "rewrite_file" ||
    toolName === "replace_file_range" ||
    toolName === "save_file"
  ) {
    return "update";
  }
  return "unknown";
}

export function commandStatus(
  record: Record<string, unknown>
): "completed" | "failed" | "timed_out" | "aborted" | "rejected" {
  const status = record["status"];
  if (
    status === "completed" ||
    status === "failed" ||
    status === "timed_out" ||
    status === "aborted" ||
    status === "rejected" ||
    status === "awaiting_approval"
  ) {
    return status === "awaiting_approval" ? "rejected" : status;
  }
  if (typeof record["exitCode"] === "number" && record["exitCode"] !== 0) {
    return "failed";
  }
  return "completed";
}

export function codeChangeOperationTelemetry(
  operation: CodeChangeSet["operations"][number]
): Record<string, unknown> {
  const metadata = asRecord(operation.metadata);
  const preconditions = operation.preconditions ?? [];
  const targets = Array.isArray(metadata["structuralTargets"])
    ? metadata["structuralTargets"].map(asRecord)
    : [];
  const primaryTarget =
    targets.find((target) => stringValue(target["targetSymbolName"])) ?? targets[0] ?? {};
  const contentHash = preconditions.find(
    (precondition) => precondition.kind === "content_hash"
  );
  const patchStrategy =
    stringValue(metadata["patchStrategy"]) ??
    (preconditions.length > 0 ? "preconditioned_patch" : null);

  return {
    patchStrategy,
    structuralIntentKinds: stringArrayValue(metadata["structuralIntentKinds"]),
    structuralSymbolName: stringValue(primaryTarget["targetSymbolName"]) ?? null,
    structuralSymbolKind: stringValue(primaryTarget["targetSymbolKind"]) ?? null,
    preconditionCount: preconditions.length,
    preconditionHash: contentHash?.expected ?? null,
    diffPreview: boundedString(operation.diff, 8_000),
  };
}

export function operationChangeTelemetry(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> {
  const operation = asRecord(metadata?.["codeChangeOperation"]);
  return {
    codeChangeOperation: operation,
    patchStrategy: stringValue(operation["patchStrategy"]) ?? null,
    structuralIntentKinds: stringArrayValue(operation["structuralIntentKinds"]),
    structuralSymbolName: stringValue(operation["structuralSymbolName"]) ?? null,
    structuralSymbolKind: stringValue(operation["structuralSymbolKind"]) ?? null,
    preconditionCount: nonnegativeInteger(operation["preconditionCount"]) ?? 0,
    preconditionHash: stringValue(operation["preconditionHash"]) ?? null,
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function nullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function nonnegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export function boundedString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n[truncated]`;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}
