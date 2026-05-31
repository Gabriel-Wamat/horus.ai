import { promises as fs } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { HorusProjectConfig, ProjectCommand } from "@u-build/shared";

const IGNORED_DIR_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".idea",
  ".vscode",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".venv",
  "venv",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);

const MANIFEST_NAMES = new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Makefile",
  "makefile",
]);

const PACKAGE_SCRIPT_NAMES = [
  "test",
  "build",
  "lint",
  "type-check",
  "typecheck",
  "check",
  "dev",
  "start",
] as const;

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
  const normalizedDir = !relativeDir || relativeDir === "." ? "root" : relativeDir;
  const raw = [kind, normalizedDir, script]
    .filter(Boolean)
    .join("-");
  return slugifyCommandId(raw);
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
    const validationCommandIds = commandCatalog
      .filter((command) => isValidationCommandId(command.id))
      .map((command) => command.id);
    const testRunnerIds = validationCommandIds.filter((id) =>
      id.startsWith("test-")
    );
    const commandIds = commandCatalog.map((command) => command.id);
    const bootstrapCommandIds = commandIds.filter((id) =>
      id.startsWith("install-") || id.startsWith("inspect-")
    );

    return {
      version: 1,
      projectName: input.projectName,
      projectStack: input.projectStack,
      baseRef: input.baseRef,
      writeRoots,
      commandCatalog,
      testRunnerIds,
      bootstrapCommandIds,
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
          allowedCommandIds: validationCommandIds,
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
      if (isIgnoredDirectoryName(entry.name)) continue;
      roots.push(entry.name);
    }
    return [...new Set(roots)];
  }

  async detectCommandCatalog(projectRoot: string): Promise<ProjectCommand[]> {
    const commands: ProjectCommand[] = [
      inspectCommand(
        "inspect-repo-tree",
        "Inspect repository tree",
        [
          "const fs=require('node:fs');const path=require('node:path');",
          `const ignored=new Set(${JSON.stringify([...IGNORED_DIR_NAMES])});`,
          "let count=0;function walk(dir,depth){if(depth>3||count>=300)return;for(const name of fs.readdirSync(dir).sort()){if(ignored.has(name)||name.startsWith('.'))continue;const abs=path.join(dir,name);const rel=path.relative(process.cwd(),abs).split(path.sep).join('/');const stat=fs.statSync(abs);if(stat.isDirectory())walk(abs,depth+1);else{console.log(rel);count++;if(count>=300)return;}}}walk(process.cwd(),0);",
        ].join("")
      ),
      inspectCommand(
        "inspect-project-manifests",
        "Inspect project manifests",
        [
          "const fs=require('node:fs');const path=require('node:path');",
          `const ignored=new Set(${JSON.stringify([...IGNORED_DIR_NAMES])});`,
          `const manifests=new Set(${JSON.stringify([...MANIFEST_NAMES])});`,
          "const found=[];function walk(dir){for(const name of fs.readdirSync(dir).sort()){if(ignored.has(name)||name.startsWith('.'))continue;const abs=path.join(dir,name);const stat=fs.statSync(abs);if(stat.isDirectory())walk(abs);else if(manifests.has(name))found.push(path.relative(process.cwd(),abs).split(path.sep).join('/'));}}walk(process.cwd());console.log(found.length?found.join('\\n'):'NO_MANIFESTS_FOUND');",
        ].join("")
      ),
    ];

    const manifests = await this.findManifestFiles(projectRoot);
    for (const manifestPath of manifests) {
      const manifestName = basename(manifestPath);
      if (manifestName === "package.json") {
        commands.push(...(await this.packageCommands(projectRoot, manifestPath)));
      } else if (manifestName === "pyproject.toml" || manifestName === "requirements.txt") {
        commands.push(...(await this.pythonCommands(projectRoot, manifestPath)));
      } else if (manifestName === "Cargo.toml") {
        commands.push(...this.cargoCommands(projectRoot, manifestPath));
      } else if (manifestName === "go.mod") {
        commands.push(...this.goCommands(projectRoot, manifestPath));
      } else if (
        manifestName === "pom.xml" ||
        manifestName === "build.gradle" ||
        manifestName === "build.gradle.kts"
      ) {
        commands.push(...(await this.jvmCommands(projectRoot, manifestPath)));
      } else if (manifestName === "Makefile" || manifestName === "makefile") {
        commands.push(...(await this.makeCommands(projectRoot, manifestPath)));
      }
    }

    return uniqueCommands(commands);
  }

  private async findManifestFiles(projectRoot: string): Promise<string[]> {
    const manifests: string[] = [];
    const visit = async (currentPath: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const absolutePath = join(currentPath, entry.name);
        if (entry.isDirectory()) {
          if (!isIgnoredDirectoryName(entry.name)) await visit(absolutePath);
          continue;
        }
        if (entry.isFile() && MANIFEST_NAMES.has(entry.name)) {
          manifests.push(absolutePath);
        }
      }
    };
    await visit(projectRoot);
    return manifests.sort((left, right) => {
      const priority =
        manifestPriority(left) - manifestPriority(right);
      if (priority !== 0) return priority;
      return normalizeRelativePath(projectRoot, left).localeCompare(
        normalizeRelativePath(projectRoot, right)
      );
    });
  }

  private async packageCommands(
    projectRoot: string,
    packageJsonPath: string
  ): Promise<ProjectCommand[]> {
    const packageJson = await readJson(packageJsonPath);
    if (!packageJson) return [];

    const scripts = packageJson["scripts"];
    const scriptMap =
      scripts && typeof scripts === "object"
        ? (scripts as Record<string, unknown>)
        : {};
    const packageDir = dirname(packageJsonPath);
    const relativeDir = normalizeRelativeDir(projectRoot, packageDir);
    const runner = await this.detectPackageManager(packageDir, projectRoot);
    const commands: ProjectCommand[] = [
      {
        id: commandId("install", relativeDir, "dependencies"),
        label: `Install dependencies (${relativeDir})`,
        executable: runner,
        args: installArgsForPackageManager(runner),
        cwd: relativeDir,
        env: {},
        timeoutMs: 120_000,
      },
    ];

    for (const script of PACKAGE_SCRIPT_NAMES) {
      if (!(script in scriptMap)) continue;
      const kind =
        script === "dev" || script === "start"
          ? "run"
          : script === "typecheck"
            ? "type-check"
            : script;
      commands.push({
        id: commandId(kind, relativeDir, script),
        label: `${script} (${relativeDir})`,
        executable: runner,
        args: scriptArgsForPackageManager(runner, script),
        cwd: relativeDir,
        env: {},
        timeoutMs: script === "dev" || script === "start" ? 120_000 : 60_000,
      });
    }

    return commands;
  }

  private async pythonCommands(
    projectRoot: string,
    manifestPath: string
  ): Promise<ProjectCommand[]> {
    const manifestDir = dirname(manifestPath);
    const relativeDir = normalizeRelativeDir(projectRoot, manifestDir);
    const manifestName = basename(manifestPath);
    const commands: ProjectCommand[] = [];
    if (manifestName === "requirements.txt") {
      commands.push({
        id: commandId("install", relativeDir, "dependencies"),
        label: `Install Python dependencies (${relativeDir})`,
        executable: "python",
        args: ["-m", "pip", "install", "-r", "requirements.txt"],
        cwd: relativeDir,
        env: {},
        timeoutMs: 120_000,
      });
    } else {
      commands.push({
        id: commandId("install", relativeDir, "dependencies"),
        label: `Install Python project (${relativeDir})`,
        executable: "python",
        args: ["-m", "pip", "install", "-e", "."],
        cwd: relativeDir,
        env: {},
        timeoutMs: 120_000,
      });
      const content = await fs.readFile(manifestPath, "utf-8").catch(() => "");
      if (content.includes("[build-system]")) {
        commands.push({
          id: commandId("build", relativeDir),
          label: `Build Python project (${relativeDir})`,
          executable: "python",
          args: ["-m", "build"],
          cwd: relativeDir,
          env: {},
          timeoutMs: 60_000,
        });
      }
    }

    const hasTests = await pathExists(join(manifestDir, "tests"))
      || await pathExists(join(manifestDir, "test"))
      || await pathExists(join(manifestDir, "pytest.ini"))
      || await pathExists(join(manifestDir, "tox.ini"));
    const manifestText = await fs.readFile(manifestPath, "utf-8").catch(() => "");
    if (hasTests || manifestMentionsPythonTestRunner(manifestText)) {
      commands.push({
        id: commandId("test", relativeDir),
        label: `Run Python tests (${relativeDir})`,
        executable: "python",
        args: ["-m", "pytest"],
        cwd: relativeDir,
        env: {},
        timeoutMs: 60_000,
      });
    }

    return commands;
  }

  private cargoCommands(projectRoot: string, manifestPath: string): ProjectCommand[] {
    const relativeDir = normalizeRelativeDir(projectRoot, dirname(manifestPath));
    return [
      command("build", relativeDir, "Build Rust project", "cargo", ["build"]),
      command("test", relativeDir, "Run Rust tests", "cargo", ["test"]),
      command("run", relativeDir, "Run Rust project", "cargo", ["run"], 120_000),
    ];
  }

  private goCommands(projectRoot: string, manifestPath: string): ProjectCommand[] {
    const relativeDir = normalizeRelativeDir(projectRoot, dirname(manifestPath));
    return [
      command("build", relativeDir, "Build Go project", "go", ["build", "./..."]),
      command("test", relativeDir, "Run Go tests", "go", ["test", "./..."]),
      command("run", relativeDir, "Run Go project", "go", ["run", "."], 120_000),
    ];
  }

  private async jvmCommands(
    projectRoot: string,
    manifestPath: string
  ): Promise<ProjectCommand[]> {
    const manifestDir = dirname(manifestPath);
    const relativeDir = normalizeRelativeDir(projectRoot, manifestDir);
    const manifestName = basename(manifestPath);
    if (manifestName === "pom.xml") {
      return [
        command("build", relativeDir, "Build Maven project", "mvn", ["package"]),
        command("test", relativeDir, "Run Maven tests", "mvn", ["test"]),
      ];
    }

    const wrapper = (await pathExists(join(manifestDir, "gradlew"))) ? "./gradlew" : "gradle";
    return [
      command("build", relativeDir, "Build Gradle project", wrapper, ["build"]),
      command("test", relativeDir, "Run Gradle tests", wrapper, ["test"]),
    ];
  }

  private async makeCommands(
    projectRoot: string,
    manifestPath: string
  ): Promise<ProjectCommand[]> {
    const content = await fs.readFile(manifestPath, "utf-8").catch(() => "");
    const targets = new Set(readMakeTargets(content));
    const safeTargets = new Set([
      "install",
      "setup",
      "test",
      "check",
      "lint",
      "build",
      "run",
      "dev",
      "start",
      "serve",
      "smoke",
    ]);
    const relativeDir = normalizeRelativeDir(projectRoot, dirname(manifestPath));
    return [...targets]
      .filter((target) => safeTargets.has(target))
      .sort()
      .map((target) =>
        command(
          target === "dev" || target === "start" || target === "serve" ? "run" : target,
          relativeDir,
          `Run make ${target} (${relativeDir})`,
          "make",
          [target],
          target === "dev" || target === "start" || target === "serve" ? 120_000 : 60_000,
          target
        )
      );
  }

  private async detectPackageManager(
    packageDir: string,
    projectRoot: string
  ): Promise<string> {
    if (await pathExists(join(packageDir, "pnpm-lock.yaml"))) return "pnpm";
    if (await pathExists(join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
    if (await pathExists(join(packageDir, "yarn.lock"))) return "yarn";
    if (await pathExists(join(projectRoot, "yarn.lock"))) return "yarn";
    if (await pathExists(join(packageDir, "bun.lock"))) return "bun";
    if (await pathExists(join(packageDir, "bun.lockb"))) return "bun";
    if (await pathExists(join(projectRoot, "bun.lock"))) return "bun";
    if (await pathExists(join(projectRoot, "bun.lockb"))) return "bun";
    if (await pathExists(join(packageDir, "package-lock.json"))) return "npm";
    if (await pathExists(join(projectRoot, "package-lock.json"))) return "npm";
    const parent = dirname(packageDir);
    const relativeProject = relative(parent, packageDir);
    if (relativeProject && (await pathExists(join(parent, "pnpm-lock.yaml")))) return "pnpm";
    return "npm";
  }
}

function isValidationCommandId(commandId: string): boolean {
  return (
    commandId.startsWith("type-check-") ||
    commandId.startsWith("check-") ||
    commandId.startsWith("test-") ||
    commandId.startsWith("build-") ||
    commandId.startsWith("lint-")
  );
}

function inspectCommand(
  id: string,
  label: string,
  inlineScript: string
): ProjectCommand {
  return {
    id,
    label,
    executable: process.execPath,
    args: ["-e", inlineScript],
    cwd: ".",
    env: {},
    timeoutMs: 30_000,
  };
}

function command(
  kind: string,
  relativeDir: string,
  label: string,
  executable: string,
  args: string[],
  timeoutMs = 60_000,
  idSuffix?: string
): ProjectCommand {
  return {
    id: commandId(kind, relativeDir, idSuffix),
    label: `${label} (${relativeDir})`,
    executable,
    args,
    cwd: relativeDir,
    env: {},
    timeoutMs,
  };
}

function installArgsForPackageManager(runner: string): string[] {
  if (runner === "npm") return ["install"];
  if (runner === "yarn") return ["install"];
  if (runner === "bun") return ["install"];
  return ["install"];
}

function scriptArgsForPackageManager(runner: string, script: string): string[] {
  if (runner === "npm" && script === "test") return ["test"];
  if (runner === "yarn") return [script];
  if (runner === "bun") return ["run", script];
  return ["run", script];
}

function normalizeRelativeDir(projectRoot: string, absoluteDir: string): string {
  const relativeDir = relative(projectRoot, absoluteDir).split("\\").join("/");
  return relativeDir === "" ? "." : relativeDir;
}

function normalizeRelativePath(projectRoot: string, absolutePath: string): string {
  return relative(projectRoot, absolutePath).split("\\").join("/");
}

function isIgnoredDirectoryName(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIR_NAMES.has(name);
}

function uniqueCommands(commands: ProjectCommand[]): ProjectCommand[] {
  const seen = new Set<string>();
  const unique: ProjectCommand[] = [];
  for (const command of commands) {
    if (seen.has(command.id)) continue;
    seen.add(command.id);
    unique.push(command);
  }
  return unique;
}

function manifestPriority(path: string): number {
  const name = basename(path);
  if (name === "package.json") return 0;
  if (name === "pyproject.toml" || name === "requirements.txt") return 1;
  if (name === "Cargo.toml" || name === "go.mod") return 2;
  if (name === "pom.xml" || name.startsWith("build.gradle")) return 3;
  if (name === "Makefile" || name === "makefile") return 4;
  return 5;
}

function slugifyCommandId(value: string): string {
  const parts: string[] = [];
  let current = "";
  for (const char of value.toLowerCase().normalize("NFD")) {
    if (isCombiningMark(char)) continue;
    if (isAsciiLowercaseLetter(char) || isAsciiDigit(char)) {
      current += char;
      continue;
    }
    if (current) {
      parts.push(current);
      current = "";
    }
  }
  if (current) parts.push(current);
  return parts.join("-");
}

function isCombiningMark(char: string): boolean {
  const codePoint = char.codePointAt(0);
  return codePoint !== undefined && codePoint >= 0x0300 && codePoint <= 0x036f;
}

function isAsciiLowercaseLetter(char: string): boolean {
  return char >= "a" && char <= "z";
}

function isAsciiDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function manifestMentionsPythonTestRunner(content: string): boolean {
  return containsIdentifier(content, "pytest") || containsIdentifier(content, "unittest");
}

function containsIdentifier(content: string, identifier: string): boolean {
  const target = identifier.toLowerCase();
  let current = "";
  for (const char of content.toLowerCase()) {
    if (isIdentifierChar(char)) {
      current += char;
      continue;
    }
    if (current === target) return true;
    current = "";
  }
  return current === target;
}

function isIdentifierChar(char: string): boolean {
  return (
    isAsciiLowercaseLetter(char) ||
    isAsciiDigit(char) ||
    char === "_" ||
    char === "-"
  );
}

function readMakeTargets(content: string): string[] {
  const targets: string[] = [];
  for (const line of content.split("\n")) {
    const target = readMakeTargetLine(line);
    if (target) targets.push(target);
  }
  return targets;
}

function readMakeTargetLine(line: string): string | null {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("\t")) return null;
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex <= 0) return null;
  if (trimmed[colonIndex + 1] === "=") return null;
  const candidate = trimmed.slice(0, colonIndex).trim();
  if (!candidate || candidate.includes(" ")) return null;
  for (const char of candidate) {
    if (!isMakeTargetChar(char)) return null;
  }
  return candidate;
}

function isMakeTargetChar(char: string): boolean {
  return (
    isAsciiLowercaseLetter(char) ||
    (char >= "A" && char <= "Z") ||
    isAsciiDigit(char) ||
    char === "_" ||
    char === "." ||
    char === "-"
  );
}
