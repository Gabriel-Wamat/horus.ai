import { resolve } from "node:path";
import type { FrontendProject, PreviewCommand } from "@u-build/shared";
import {
  CliCommandPolicy,
  type NormalizedCliCommandSpec,
} from "../tools/CliCommandPolicy.js";

export interface PreviewCommandResolverOptions {
  allowedExecutables?: readonly string[];
  timeoutMs: number;
}

export class PreviewCommandResolutionError extends Error {
  constructor(
    message: string,
    readonly evidence: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "PreviewCommandResolutionError";
  }
}

function splitCommandLine(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (!char) continue;

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new PreviewCommandResolutionError("Preview command has an unclosed quote", {
      reason: "unclosed_quote",
    });
  }
  if (current) tokens.push(current);
  return tokens;
}

function legacyCommandFromDevCommand(project: FrontendProject): PreviewCommand | null {
  if (!project.devCommand) return null;
  const tokens = splitCommandLine(project.devCommand);
  const executable = tokens[0];
  if (!executable) return null;
  return {
    id: "legacy-dev",
    label: "Legacy dev command",
    executable,
    args: tokens.slice(1),
    cwd: ".",
    env: {},
  };
}

export async function resolvePreviewCommand(
  project: FrontendProject,
  options: PreviewCommandResolverOptions
): Promise<NormalizedCliCommandSpec> {
  const commandId = project.previewCommandId ?? project.commandCatalog[0]?.id ?? "legacy-dev";
  const catalogCommand =
    project.commandCatalog.find((command) => command.id === commandId) ??
    (commandId === "legacy-dev" ? legacyCommandFromDevCommand(project) : null);

  return resolveProjectCommand(project, commandId, catalogCommand, options);
}

export async function resolveCatalogCommand(
  project: FrontendProject,
  commandId: string,
  options: PreviewCommandResolverOptions
): Promise<NormalizedCliCommandSpec> {
  return resolveProjectCommand(
    project,
    commandId,
    project.commandCatalog.find((command) => command.id === commandId) ?? null,
    options
  );
}

async function resolveProjectCommand(
  project: FrontendProject,
  commandId: string,
  catalogCommand: PreviewCommand | null,
  options: PreviewCommandResolverOptions
): Promise<NormalizedCliCommandSpec> {
  if (!catalogCommand) {
    throw new PreviewCommandResolutionError("Preview command id was not found", {
      projectId: project.id,
      commandId,
      availableCommandIds: project.commandCatalog.map((command) => command.id),
      reason: "unknown_command_id",
    });
  }

  const policy = new CliCommandPolicy({
    ...(options.allowedExecutables ? { allowedExecutables: options.allowedExecutables } : {}),
    allowedRoot: project.rootPath,
    maxTimeoutMs: Math.max(options.timeoutMs, catalogCommand.timeoutMs ?? 0, 1_000),
  });
  const commandCwd = resolve(project.rootPath, catalogCommand.cwd);
  const decision = await policy.evaluate({
    id: catalogCommand.id,
    executable: catalogCommand.executable,
    args: catalogCommand.args,
    cwd: commandCwd,
    env: catalogCommand.env,
    timeoutMs: catalogCommand.timeoutMs ?? options.timeoutMs,
  });

  if (!decision.allowed || !decision.normalized) {
    throw new PreviewCommandResolutionError("Preview command rejected by policy", {
      projectId: project.id,
      commandId: catalogCommand.id,
      executable: catalogCommand.executable,
      args: catalogCommand.args,
      cwd: commandCwd,
      reason: decision.reason,
    });
  }

  return decision.normalized;
}
