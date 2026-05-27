import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import {
  HorusProjectConfigSchema,
  type HorusProjectConfig,
} from "@u-build/shared";
import { assertRelativeWriteRoot, resolveInsideRoot } from "./ProjectPathSafety.js";

export class ProjectConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectConfigError";
  }
}

export const HORUS_PROJECT_CONFIG_FILENAME = ".horus-project.yaml";

const REQUIRED_ROLE_PROFILES = [
  "backend_specialist",
  "frontend_specialist",
  "qa_specialist",
] as const;

const FORBIDDEN_EXECUTABLES = new Set([
  "curl",
  "wget",
  "nc",
  "netcat",
  "scp",
  "sftp",
  "shutdown",
  "reboot",
  "poweroff",
  "halt",
  "mkfs",
  "dd",
]);

export class ProjectConfigService {
  configPath(projectRoot: string): string {
    return join(projectRoot, HORUS_PROJECT_CONFIG_FILENAME);
  }

  async load(projectRoot: string): Promise<HorusProjectConfig> {
    const path = this.configPath(projectRoot);
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(path, "utf-8"));
    } catch (err) {
      throw new ProjectConfigError(
        `Project config must exist and be JSON-compatible YAML: ${path}. ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    const config = HorusProjectConfigSchema.parse(raw);
    this.validate(projectRoot, config);
    return config;
  }

  async write(projectRoot: string, config: HorusProjectConfig): Promise<string> {
    const validated = HorusProjectConfigSchema.parse(config);
    this.validate(projectRoot, validated);
    const path = this.configPath(projectRoot);
    await fs.writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
    return path;
  }

  validate(projectRoot: string, config: HorusProjectConfig): void {
    const root = resolve(projectRoot);
    if (config.writeRoots.length === 0) {
      throw new ProjectConfigError("writeRoots must not be empty.");
    }
    if (config.commandCatalog.length === 0) {
      throw new ProjectConfigError("commandCatalog must not be empty.");
    }

    for (const writeRoot of config.writeRoots) {
      assertRelativeWriteRoot(writeRoot);
      resolveInsideRoot(root, writeRoot);
    }

    const commandIds = new Set(config.commandCatalog.map((command) => command.id));
    if (commandIds.size !== config.commandCatalog.length) {
      throw new ProjectConfigError("commandCatalog command ids must be unique.");
    }
    for (const command of config.commandCatalog) {
      this.validateCommand(command.executable, command.args);
      resolveInsideRoot(root, command.cwd);
    }

    for (const role of REQUIRED_ROLE_PROFILES) {
      if (!config.roleProfiles[role]) {
        throw new ProjectConfigError(`Missing required role profile: ${role}`);
      }
    }

    for (const commandId of [
      ...config.testRunnerIds,
      ...config.bootstrapCommandIds,
    ]) {
      if (!commandIds.has(commandId)) {
        throw new ProjectConfigError(`Unknown command id referenced: ${commandId}`);
      }
    }

    for (const [roleName, profile] of Object.entries(config.roleProfiles)) {
      for (const commandId of [
        ...profile.allowedCommandIds,
        ...profile.defaultValidationCommandIds,
      ]) {
        if (!commandIds.has(commandId)) {
          throw new ProjectConfigError(
            `roleProfiles.${roleName} references unknown command id: ${commandId}`
          );
        }
      }
    }
  }

  private validateCommand(executable: string, args: readonly string[]): void {
    const executableName = executable.split(/[\\/]/u).pop() ?? executable;
    if (FORBIDDEN_EXECUTABLES.has(executableName)) {
      throw new ProjectConfigError(`Forbidden command executable: ${executable}`);
    }
    const commandText = [executableName, ...args].join(" ").toLowerCase();
    const forbiddenFragments = [
      "rm -rf /",
      "rm -rf ~",
      "git reset --hard",
      "git push --force",
      "drop table",
      "delete from",
    ];
    for (const fragment of forbiddenFragments) {
      if (commandText.includes(fragment)) {
        throw new ProjectConfigError(`Forbidden command fragment: ${fragment}`);
      }
    }
  }
}
