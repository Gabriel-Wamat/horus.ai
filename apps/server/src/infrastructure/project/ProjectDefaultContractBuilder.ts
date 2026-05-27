import { promises as fs } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { HorusProjectConfig, ProjectCommand } from "@u-build/shared";

const IGNORED_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(path, "utf-8"));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function commandId(kind: string, relativeDir: string, script?: string): string {
  const raw = [kind, relativeDir || basename(process.cwd()), script]
    .filter(Boolean)
    .join("-");
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .split(/[^a-z0-9]+/u)
    .filter(Boolean)
    .join("-");
}

export class ProjectDefaultContractBuilder {
  async build(input: {
    projectRoot: string;
    projectName: string;
    projectStack: string;
    baseRef: string;
  }): Promise<HorusProjectConfig> {
    const writeRoots = await this.detectWriteRoots(input.projectRoot);
    const commandCatalog = await this.detectCommandCatalog(input.projectRoot);
    const testRunnerIds = commandCatalog
      .filter((command) => command.id.startsWith("test-"))
      .map((command) => command.id);
    const commandIds = commandCatalog.map((command) => command.id);

    return {
      version: 1,
      projectName: input.projectName,
      projectStack: input.projectStack,
      baseRef: input.baseRef,
      writeRoots,
      commandCatalog,
      testRunnerIds,
      bootstrapCommandIds: commandIds.filter((id) => id.startsWith("install-")),
      roleProfiles: {
        backend_specialist: {
          allowedCommandIds: commandIds,
          defaultValidationCommandIds: testRunnerIds,
        },
        frontend_specialist: {
          allowedCommandIds: commandIds,
          defaultValidationCommandIds: testRunnerIds,
        },
        qa_specialist: {
          allowedCommandIds: commandIds,
          defaultValidationCommandIds: testRunnerIds,
        },
        curator: {
          allowedCommandIds: commandIds,
          defaultValidationCommandIds: testRunnerIds,
        },
      },
    };
  }

  async detectWriteRoots(projectRoot: string): Promise<string[]> {
    const entries = await fs.readdir(projectRoot, { withFileTypes: true });
    const roots = ["."];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || IGNORED_DIR_NAMES.has(entry.name)) continue;
      roots.push(entry.name);
    }
    return [...new Set(roots)];
  }

  async detectCommandCatalog(projectRoot: string): Promise<ProjectCommand[]> {
    const packageJsonPath = join(projectRoot, "package.json");
    if (!(await pathExists(packageJsonPath))) {
      return [
        {
          id: "inspect-project",
          label: "Inspect project",
          executable: process.execPath,
          args: ["-e", "console.log('project ready')"],
          cwd: ".",
          env: {},
        },
      ];
    }

    const packageJson = await readJson(packageJsonPath);
    const scripts = packageJson?.["scripts"];
    const scriptMap =
      scripts && typeof scripts === "object"
        ? (scripts as Record<string, unknown>)
        : {};
    const runner = await this.detectPackageManager(projectRoot);
    const commands: ProjectCommand[] = [
      {
        id: "install-root-dependencies",
        label: "Install dependencies",
        executable: runner,
        args: runner === "npm" ? ["install"] : ["install"],
        cwd: ".",
        env: {},
        timeoutMs: 120_000,
      },
    ];

    for (const script of ["test", "build", "lint", "type-check", "check", "dev", "start"]) {
      if (!(script in scriptMap)) continue;
      const kind = script === "dev" || script === "start" ? "run" : script;
      commands.push({
        id: commandId(kind, "root", script),
        label: `${script} root`,
        executable: runner,
        args: runner === "npm" && script === "test" ? ["test"] : ["run", script],
        cwd: ".",
        env: {},
        timeoutMs: script === "dev" || script === "start" ? 120_000 : 60_000,
      });
    }

    return commands;
  }

  private async detectPackageManager(projectRoot: string): Promise<string> {
    if (await pathExists(join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
    if (await pathExists(join(projectRoot, "yarn.lock"))) return "yarn";
    if (await pathExists(join(projectRoot, "bun.lock"))) return "bun";
    if (await pathExists(join(projectRoot, "bun.lockb"))) return "bun";
    if (await pathExists(join(projectRoot, "package-lock.json"))) return "npm";
    const parent = dirname(projectRoot);
    const relativeProject = relative(parent, projectRoot);
    if (relativeProject && (await pathExists(join(parent, "pnpm-lock.yaml")))) return "pnpm";
    return "npm";
  }
}
