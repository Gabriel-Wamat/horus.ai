import { promises as fs } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";

export interface CommandPermissionSpec {
  readonly id: string;
  readonly traceId?: string | null;
  readonly spanId?: string | null;
  readonly parentSpanId?: string | null;
  readonly toolCallId?: string | null;
  readonly runId?: string | null;
  readonly operationalSessionId?: string | null;
  readonly projectId?: string | null;
  readonly agentId?: string | null;
  readonly filePath?: string | null;
  readonly diffId?: string | null;
  readonly command?: string;
  readonly shell?: "bash" | "sh";
  readonly executable?: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
  readonly approved?: boolean;
  readonly approvedBy?: string | null;
  readonly approvalReason?: string | null;
}

export interface CommandPermissionOptions {
  readonly allowedExecutables?: readonly string[];
  readonly allowedRoot?: string;
  readonly maxTimeoutMs?: number;
  readonly profilePolicies?: Readonly<Record<string, CommandProfilePolicy>>;
}

export interface CommandProfilePolicy {
  readonly allowShell?: boolean;
  readonly allowDirectExecutables?: readonly string[];
  readonly allowPackageManagerScripts?: boolean;
  readonly allowedPackageManagerBuiltins?: readonly string[];
  readonly allowedGitCommands?: readonly string[];
  readonly approvalRequired?: boolean;
}

export interface CommandPermissionDecision {
  readonly action: "allow" | "deny" | "ask";
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly normalized: NormalizedCommandPermissionSpec | null;
  readonly approvalRequired: boolean;
  readonly risk: "low" | "medium" | "high";
}

export interface NormalizedCommandPermissionSpec {
  readonly id: string;
  readonly executable: string;
  readonly executableName: string;
  readonly args: string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly env: Record<string, string>;
  readonly approvalRequired: boolean;
  readonly risk: "low" | "medium" | "high";
  readonly approved: boolean;
  readonly approvedBy: string | null;
  readonly approvalReason: string | null;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TIMEOUT_MS = 120_000;

const SAFE_SHELL_UTILITIES = new Set([
  "[",
  "awk",
  "cat",
  "echo",
  "false",
  "find",
  "grep",
  "head",
  "ls",
  "printf",
  "pwd",
  "rg",
  "sed",
  "sleep",
  "sort",
  "tail",
  "tee",
  "test",
  "true",
  "uniq",
  "wc",
  "xargs",
]);

const DEFAULT_ALLOWED_EXECUTABLES = [
  "node",
  process.execPath,
  "pnpm",
  "npm",
  "yarn",
  "bun",
  ...SAFE_SHELL_UTILITIES,
] as const;

const DENIED_EXECUTABLES = new Set([
  "curl",
  "dd",
  "halt",
  "mkfs",
  "nc",
  "netcat",
  "poweroff",
  "reboot",
  "shutdown",
  "wget",
]);

const PACKAGE_MANAGERS = new Set(["bun", "npm", "pnpm", "yarn"]);
const APPROVAL_REQUIRED_PACKAGE_MANAGER_COMMANDS = new Set([
  "add",
  "ci",
  "dlx",
  "exec",
  "i",
  "init",
  "install",
  "link",
  "publish",
  "remove",
  "uninstall",
  "update",
]);
const APPROVAL_REQUIRED_GIT_COMMANDS = new Set([
  "push",
  "clean",
  "commit",
  "tag",
]);
const PACKAGE_MANAGER_OPTION_ARITY = new Map([
  ["--filter", 1],
  ["-F", 1],
  ["--workspace", 1],
  ["--cwd", 1],
  ["-C", 1],
]);

const DEFAULT_PROFILE_POLICIES: Readonly<Record<string, CommandProfilePolicy>> = {
  qa_agent: {
    allowShell: true,
    allowDirectExecutables: ["node", "npm", "pnpm", "yarn", "bun"],
    allowPackageManagerScripts: true,
    allowedPackageManagerBuiltins: [
      "audit",
      "ci",
      "install",
      "list",
      "run",
      "run-script",
      "test",
    ],
    allowedGitCommands: ["diff", "show", "status"],
  },
  front_agent: {
    allowShell: true,
    allowDirectExecutables: ["node", "npm", "pnpm", "yarn", "bun"],
    allowPackageManagerScripts: true,
    allowedPackageManagerBuiltins: ["list", "run", "run-script", "test"],
    allowedGitCommands: ["diff", "show", "status"],
  },
  curator_agent: {
    allowShell: true,
    allowDirectExecutables: ["node", "npm", "pnpm", "yarn", "bun"],
    allowPackageManagerScripts: true,
    allowedPackageManagerBuiltins: ["list", "run", "run-script", "test"],
    allowedGitCommands: ["diff", "show", "status"],
    approvalRequired: true,
  },
  spec_agent: {
    allowShell: false,
    allowedGitCommands: ["diff", "show", "status"],
    approvalRequired: true,
  },
  odin_agent: {
    allowShell: false,
    allowedGitCommands: ["diff", "show", "status"],
    approvalRequired: true,
  },
  horus_chat: {
    allowShell: true,
    allowDirectExecutables: ["node", "npm", "pnpm", "yarn", "bun"],
    allowPackageManagerScripts: true,
    allowedPackageManagerBuiltins: ["list", "run", "run-script", "test"],
    allowedGitCommands: ["diff", "show", "status"],
    approvalRequired: true,
  },
  horus_chat_executor: {
    allowShell: true,
    allowDirectExecutables: ["node", "npm", "pnpm", "yarn", "bun"],
    allowPackageManagerScripts: true,
    allowedPackageManagerBuiltins: [
      "audit",
      "ci",
      "install",
      "list",
      "run",
      "run-script",
      "test",
    ],
    allowedGitCommands: ["diff", "show", "status"],
  },
  coding_runtime: {
    allowShell: true,
    allowDirectExecutables: ["node", "npm", "pnpm", "yarn", "bun"],
    allowPackageManagerScripts: true,
    allowedPackageManagerBuiltins: [
      "audit",
      "ci",
      "install",
      "list",
      "run",
      "run-script",
      "test",
    ],
    allowedGitCommands: ["diff", "show", "status"],
  },
};

interface CommandDescriptor {
  readonly executableName: string;
  readonly packageManagerCommand: string | null;
  readonly packageScript: string | null;
  readonly gitCommand: string | null;
}

function executableName(executable: string): string {
  return basename(executable);
}

function isInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relation = relative(rootPath, candidatePath);
  return relation === "" || (!relation.startsWith("..") && !relation.includes(`..${sep}`));
}

function containsNul(value: string): boolean {
  return value.includes("\x00");
}

function containsCommandSubstitution(value: string): boolean {
  return (
    value.includes("$(") ||
    value.includes("`") ||
    value.includes("<(") ||
    value.includes(">(")
  );
}

function isRecursiveForceRm(args: readonly string[]): boolean {
  let recursive = false;
  let force = false;
  for (const arg of args) {
    if (!arg.startsWith("-") || arg === "--") continue;
    if (arg === "-r" || arg === "-R" || arg === "--recursive") recursive = true;
    if (arg === "-f" || arg === "--force") force = true;
    for (const flag of arg.slice(1)) {
      if (flag === "r" || flag === "R") recursive = true;
      if (flag === "f") force = true;
    }
  }
  return recursive && force;
}

function isRootOrWildcardTarget(value: string): boolean {
  return value === "/" || value === "*" || value.endsWith(`${sep}*`);
}

function dangerousDirectCommandReason(
  executable: string,
  args: readonly string[]
): string | null {
  if (executable === "rm" && isRecursiveForceRm(args)) {
    const targets = args.filter((arg) => !arg.startsWith("-"));
    if (targets.some(isRootOrWildcardTarget)) {
      return "destructive recursive rm target";
    }
  }

  if (executable === "git") {
    const [command, ...rest] = args;
    if (command === "reset" && rest.includes("--hard")) {
      return "destructive git reset";
    }
    if (command === "push" && rest.some((arg) => arg === "--force" || arg === "-f")) {
      return "force push";
    }
  }

  if (executable === "dd") {
    const outputDevice = args.find((arg) => arg.startsWith("of=/dev/"));
    const zeroInput = args.includes("if=/dev/zero");
    if (outputDevice && zeroInput) return "destructive device write";
  }

  return null;
}

function firstPackageScriptArg(args: readonly string[]): string | null {
  let sawRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--") return null;
    const optionArity = PACKAGE_MANAGER_OPTION_ARITY.get(arg);
    if (optionArity != null) {
      index += optionArity;
      continue;
    }
    if (arg.startsWith("-")) continue;
    if (arg === "run" || arg === "run-script") {
      sawRun = true;
      continue;
    }
    if (sawRun) return arg;
    if (isPackageManagerBuiltinScript(arg)) return arg;
    if (!isPackageManagerBuiltin(arg)) return arg;
  }
  return null;
}

function firstPackageManagerCommandArg(args: readonly string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--") return null;
    const optionArity = PACKAGE_MANAGER_OPTION_ARITY.get(arg);
    if (optionArity != null) {
      index += optionArity;
      continue;
    }
    if (arg.startsWith("-")) continue;
    return arg;
  }
  return null;
}

function isPackageManagerBuiltin(command: string): boolean {
  return [
    "add",
    "audit",
    "ci",
    "config",
    "dedupe",
    "dlx",
    "exec",
    "explain",
    "help",
    "i",
    "init",
    "install",
    "link",
    "list",
    "outdated",
    "pack",
    "publish",
    "remove",
    "root",
    "start",
    "test",
    "uninstall",
    "update",
    "why",
  ].includes(command);
}

function isPackageManagerBuiltinScript(command: string): boolean {
  return command === "start" || command === "test";
}

function approvalRequiredReason(
  executable: string,
  args: readonly string[]
): string | null {
  if (PACKAGE_MANAGERS.has(executable)) {
    const command = firstPackageManagerCommandArg(args);
    if (command && APPROVAL_REQUIRED_PACKAGE_MANAGER_COMMANDS.has(command)) {
      return `package manager command requires approval: ${executable} ${command}`;
    }
  }

  if (executable === "git") {
    const command = args.find((arg) => arg && !arg.startsWith("-"));
    if (command && APPROVAL_REQUIRED_GIT_COMMANDS.has(command)) {
      return `git command requires approval: git ${command}`;
    }
  }

  return null;
}

function describeCommand(
  executableNameValue: string,
  args: readonly string[]
): CommandDescriptor {
  return {
    executableName: executableNameValue,
    packageManagerCommand: PACKAGE_MANAGERS.has(executableNameValue)
      ? firstPackageManagerCommandArg(args)
      : null,
    packageScript: PACKAGE_MANAGERS.has(executableNameValue)
      ? firstPackageScriptArg(args)
      : null,
    gitCommand:
      executableNameValue === "git"
        ? args.find((arg) => arg && !arg.startsWith("-")) ?? null
        : null,
  };
}

function profilePolicyDenialReason(
  policy: CommandProfilePolicy,
  command: CommandDescriptor
): string | null {
  if (command.executableName === "git") {
    const gitCommand = command.gitCommand;
    if (!gitCommand) return "git command is missing";
    if (!setIncludes(policy.allowedGitCommands, gitCommand)) {
      return `git ${gitCommand} is outside this agent profile`;
    }
    return null;
  }

  if (PACKAGE_MANAGERS.has(command.executableName)) {
    return packageManagerProfileDenialReason(policy, command);
  }

  if (!setIncludes(policy.allowDirectExecutables, command.executableName)) {
    return `${command.executableName} is outside this agent profile`;
  }
  return null;
}

function packageManagerProfileDenialReason(
  policy: CommandProfilePolicy,
  command: CommandDescriptor
): string | null {
  const managerCommand = command.packageManagerCommand;
  if (!managerCommand) return "package manager command is missing";

  const script = command.packageScript;
  if (
    script &&
    !isPackageManagerBuiltin(script) &&
    policy.allowPackageManagerScripts !== true
  ) {
    return `package script ${script} is outside this agent profile`;
  }

  if (
    isPackageManagerBuiltin(managerCommand) &&
    !setIncludes(policy.allowedPackageManagerBuiltins, managerCommand)
  ) {
    return `${command.executableName} ${managerCommand} is outside this agent profile`;
  }

  if (
    !isPackageManagerBuiltin(managerCommand) &&
    policy.allowPackageManagerScripts !== true
  ) {
    return `package script ${managerCommand} is outside this agent profile`;
  }

  return null;
}

function setIncludes(values: readonly string[] | undefined, value: string): boolean {
  return Boolean(values?.includes(value));
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function tokenizeScript(script: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;
  for (let index = 0; index < script.length; index += 1) {
    const char = script[index] ?? "";
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (isWhitespace(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    if (char === ";" || char === "|" || char === "&" || char === ">" || char === "<") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      const next = script[index + 1];
      if (
        (char === "|" && next === "|") ||
        (char === "&" && next === "&") ||
        (char === ">" && next === ">") ||
        (char === "<" && next === "<")
      ) {
        tokens.push(`${char}${next}`);
        index += 1;
      } else {
        tokens.push(char);
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

const SHELL_COMMAND_SEPARATORS = new Set([";", "|", "||", "&&"]);
const SHELL_REDIRECT_OPERATORS = new Set([">", ">>", "<", "<<"]);
const SHELL_OPERATORS = new Set([
  ...SHELL_COMMAND_SEPARATORS,
  ...SHELL_REDIRECT_OPERATORS,
  "&",
]);

interface ShellCommandSegment {
  readonly executable: string;
  readonly args: string[];
}

interface ShellScriptAnalysis {
  readonly tokens: string[];
  readonly commands: ShellCommandSegment[];
  readonly hasEnvironmentAssignment: boolean;
  readonly hasRedirection: boolean;
  readonly redirectionOperator: string | null;
  readonly hasUnmanagedBackground: boolean;
  readonly hasCommandSubstitution: boolean;
}

function isShellOperator(token: string): boolean {
  return SHELL_OPERATORS.has(token);
}

function isAsciiNameStart(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
}

function isAsciiNamePart(char: string): boolean {
  return isAsciiNameStart(char) || (char >= "0" && char <= "9");
}

function isEnvironmentAssignment(token: string): boolean {
  const equalsIndex = token.indexOf("=");
  if (equalsIndex <= 0) return false;
  const firstChar = token[0];
  if (!firstChar || !isAsciiNameStart(firstChar)) return false;
  for (let index = 1; index < equalsIndex; index += 1) {
    const char = token[index];
    if (!char || !isAsciiNamePart(char)) return false;
  }
  return true;
}

function analyzeShellScript(script: string): ShellScriptAnalysis {
  const tokens = tokenizeScript(script);
  const commands: ShellCommandSegment[] = [];
  let current: { executable: string; args: string[] } | null = null;
  let expectingCommand = true;
  let skipRedirectTarget = false;
  let hasEnvironmentAssignment = false;

  for (const token of tokens) {
    if (SHELL_REDIRECT_OPERATORS.has(token)) {
      skipRedirectTarget = true;
      continue;
    }
    if (SHELL_COMMAND_SEPARATORS.has(token)) {
      current = null;
      expectingCommand = true;
      skipRedirectTarget = false;
      continue;
    }
    if (token === "&") {
      current = null;
      expectingCommand = true;
      skipRedirectTarget = false;
      continue;
    }
    if (skipRedirectTarget) {
      skipRedirectTarget = false;
      continue;
    }
    if (expectingCommand) {
      if (isEnvironmentAssignment(token)) {
        hasEnvironmentAssignment = true;
        continue;
      }
      current = { executable: token, args: [] };
      commands.push(current);
      expectingCommand = false;
      continue;
    }
    current?.args.push(token);
  }

  return {
    tokens,
    commands,
    hasEnvironmentAssignment,
    hasRedirection: tokens.some((token) => SHELL_REDIRECT_OPERATORS.has(token)),
    redirectionOperator:
      tokens.find((token) => SHELL_REDIRECT_OPERATORS.has(token)) ?? null,
    hasUnmanagedBackground: tokens.includes("&"),
    hasCommandSubstitution: containsCommandSubstitution(script),
  };
}

function dangerousScriptReason(script: string): string | null {
  const analysis = analyzeShellScript(script);
  if (analysis.hasCommandSubstitution) return "script uses command substitution";
  if (analysis.hasUnmanagedBackground) return "script uses unmanaged background operator";
  if (analysis.hasRedirection) {
    return `script uses shell operator ${analysis.redirectionOperator ?? "redirection"}`;
  }
  for (const command of analysis.commands) {
    const executable = executableName(command.executable);
    const directReason = dangerousDirectCommandReason(executable, command.args);
    if (directReason) return directReason;
  }
  return null;
}

async function readPackageScript(
  cwd: string,
  scriptName: string
): Promise<string | null> {
  try {
    const raw = await fs.readFile(resolve(cwd, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    const script = parsed.scripts?.[scriptName];
    return typeof script === "string" ? script : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

export class CommandPermissionEngine {
  private readonly allowedExecutables: Set<string>;
  private readonly allowedRoot: string | null;
  private readonly maxTimeoutMs: number;
  private readonly profilePolicies: Readonly<Record<string, CommandProfilePolicy>>;

  constructor(options: CommandPermissionOptions = {}) {
    this.allowedExecutables = new Set(
      options.allowedExecutables ?? DEFAULT_ALLOWED_EXECUTABLES
    );
    this.allowedRoot = options.allowedRoot ? resolve(options.allowedRoot) : null;
    this.maxTimeoutMs = options.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;
    this.profilePolicies = {
      ...DEFAULT_PROFILE_POLICIES,
      ...(options.profilePolicies ?? {}),
    };
  }

  async evaluate(spec: CommandPermissionSpec): Promise<CommandPermissionDecision> {
    const staticReason = this.evaluateStaticRules(spec);
    if (staticReason) return this.reject(staticReason);

    const cwdDecision = await this.normalizeCwd(spec.cwd);
    if (!cwdDecision.allowed) return this.reject(cwdDecision.reason);

    const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      return this.reject("timeoutMs must be a positive integer");
    }
    if (timeoutMs > this.maxTimeoutMs) {
      return this.reject(`timeoutMs exceeds maximum ${this.maxTimeoutMs}`);
    }

    if (spec.command) {
      return this.evaluateShellCommand({
        spec,
        cwd: cwdDecision.cwd,
        timeoutMs,
      });
    }

    const executable = spec.executable?.trim() ?? "";
    const name = executableName(executable);
    const args = [...(spec.args ?? [])];
    const descriptor = describeCommand(name, args);

    const profileDecision = this.evaluateProfilePolicy({
      agentId: spec.agentId,
      descriptor,
      approved: spec.approved === true,
    });
    if (!profileDecision.allowed) {
      return this.reject(profileDecision.reason, {
        approvalRequired: profileDecision.approvalRequired,
        risk: profileDecision.risk,
        action: profileDecision.approvalRequired ? "ask" : "deny",
      });
    }

    const scriptReason = await this.evaluatePackageScript({
      executableName: name,
      args,
      cwd: cwdDecision.cwd,
    });
    if (scriptReason) return this.reject(scriptReason);

    const approvalReason =
      approvalRequiredReason(name, args) ?? profileDecision.approvalReason;
    const approvalRequired = approvalReason !== null;
    if (approvalRequired && spec.approved !== true) {
      return this.reject(approvalReason, {
        approvalRequired: true,
        risk: "medium",
        action: "ask",
      });
    }
    const risk = approvalRequired ? "medium" : "low";

    return {
      allowed: true,
      action: "allow",
      reason: null,
      approvalRequired,
      risk,
      normalized: {
        id: spec.id.trim(),
        executable,
        executableName: name,
        args,
        cwd: cwdDecision.cwd,
        timeoutMs,
        env: { ...(spec.env ?? {}) },
        approvalRequired,
        risk,
        approved: spec.approved === true,
        approvedBy: spec.approvedBy ?? null,
        approvalReason: spec.approvalReason ?? approvalReason,
      },
    };
  }

  private async evaluateShellCommand(input: {
    spec: CommandPermissionSpec;
    cwd: string;
    timeoutMs: number;
  }): Promise<CommandPermissionDecision> {
    const command = input.spec.command?.trim() ?? "";
    const analysis = analyzeShellScript(command);
    const profileDecision = this.evaluateShellProfilePolicy({
      agentId: input.spec.agentId,
      analysis,
      approved: input.spec.approved === true,
    });
    if (!profileDecision.allowed) {
      return this.reject(profileDecision.reason, {
        approvalRequired: profileDecision.approvalRequired,
        risk: profileDecision.risk,
        action: profileDecision.approvalRequired ? "ask" : "deny",
      });
    }

    const simpleCommandReason = this.simpleShellCommandDenialReason(analysis);
    if (simpleCommandReason) return this.reject(simpleCommandReason);
    const commandSegment = analysis.commands[0];
    if (!commandSegment) return this.reject("command is empty");
    const executable = commandSegment.executable;
    const name = executableName(executable);
    if (
      !SAFE_SHELL_UTILITIES.has(name) &&
      !this.allowedExecutables.has(executable) &&
      !this.allowedExecutables.has(name)
    ) {
      return this.reject(`executable is not allowlisted: ${executable}`);
    }

    const packageScriptReason = await this.evaluatePackageScript({
      executableName: name,
      args: commandSegment.args,
      cwd: input.cwd,
    });
    if (packageScriptReason) return this.reject(packageScriptReason);

    const approvalReason =
      this.shellCommandApprovalRequiredReason(analysis) ??
      profileDecision.approvalReason;
    const approvalRequired = approvalReason !== null;
    if (approvalRequired && input.spec.approved !== true) {
      return this.reject(approvalReason, {
        approvalRequired: true,
        risk: "medium",
        action: "ask",
      });
    }

    return {
      allowed: true,
      action: "allow",
      reason: null,
      approvalRequired,
      risk: approvalRequired ? "medium" : profileDecision.risk,
      normalized: {
        id: input.spec.id.trim(),
        executable,
        executableName: name,
        args: commandSegment.args,
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
        env: { ...(input.spec.env ?? {}) },
        approvalRequired,
        risk: approvalRequired ? "medium" : profileDecision.risk,
        approved: input.spec.approved === true,
        approvedBy: input.spec.approvedBy ?? null,
        approvalReason: input.spec.approvalReason ?? approvalReason,
      },
    };
  }

  private evaluateStaticRules(spec: CommandPermissionSpec): string | null {
    if (!spec.id.trim()) return "command id is required";
    if (!spec.command && !spec.executable?.trim()) {
      return "executable or command is required";
    }
    if (!spec.cwd.trim()) return "cwd is required";
    if (spec.command && containsNul(spec.command)) return "command contains NUL byte";
    if (spec.executable && containsNul(spec.executable)) {
      return "executable contains NUL byte";
    }
    if ((spec.args ?? []).some(containsNul)) return "argument contains NUL byte";
    if (!spec.command && [spec.executable ?? "", ...(spec.args ?? [])].some(containsCommandSubstitution)) {
      return "unsafe shell substitution blocked";
    }

    if (spec.command) return this.evaluateShellStaticRules(spec.command);

    const executable = spec.executable?.trim() ?? "";
    const name = executableName(executable);
    if (DENIED_EXECUTABLES.has(name)) {
      return `dangerous executable is not allowed: ${name}`;
    }
    if (!this.allowedExecutables.has(executable) && !this.allowedExecutables.has(name)) {
      return `executable is not allowlisted: ${executable}`;
    }

    return dangerousDirectCommandReason(name, spec.args ?? []);
  }

  private evaluateShellStaticRules(command: string): string | null {
    const analysis = analyzeShellScript(command);
    if (analysis.commands.length === 0) return "command is empty";
    if (analysis.hasUnmanagedBackground) {
      return "unmanaged shell background operator is not allowed; use background=true";
    }
    for (const commandSegment of analysis.commands) {
      const name = executableName(commandSegment.executable);
      if (DENIED_EXECUTABLES.has(name)) {
        return `dangerous executable is not allowed: ${name}`;
      }
      const directReason = dangerousDirectCommandReason(name, commandSegment.args);
      if (directReason) return directReason;
    }
    return null;
  }

  private simpleShellCommandDenialReason(analysis: ShellScriptAnalysis): string | null {
    if (analysis.hasEnvironmentAssignment) {
      return "inline environment assignments are not allowed in command text; use explicit env";
    }
    if (analysis.hasCommandSubstitution) {
      return "shell command substitution is not allowed";
    }
    if (analysis.hasRedirection) {
      return `shell redirection is not allowed: ${analysis.redirectionOperator ?? "redirection"}`;
    }
    if (analysis.hasUnmanagedBackground) {
      return "unmanaged shell background operator is not allowed; use background=true";
    }
    if (analysis.commands.length !== 1) {
      return "shell command text must be a single simple command";
    }
    return null;
  }

  private shellCommandApprovalRequiredReason(
    analysis: ShellScriptAnalysis
  ): string | null {
    for (const commandSegment of analysis.commands) {
      const name = executableName(commandSegment.executable);
      const reason = approvalRequiredReason(name, commandSegment.args);
      if (reason) return reason;
    }
    return null;
  }

  private evaluateShellProfilePolicy(input: {
    agentId?: string | null | undefined;
    analysis: ShellScriptAnalysis;
    approved: boolean;
  }):
    | {
        allowed: true;
        reason: null;
        approvalRequired: boolean;
        approvalReason: string | null;
        risk: "low" | "medium" | "high";
      }
    | {
        allowed: false;
        reason: string;
        approvalRequired: boolean;
        approvalReason: string | null;
        risk: "low" | "medium" | "high";
      } {
    const agentId = input.agentId?.trim();
    const policy = agentId ? this.profilePolicies[agentId] : undefined;
    if (!agentId || !policy) {
      return {
        allowed: true,
        reason: null,
        approvalRequired: false,
        approvalReason: null,
        risk: "low",
      };
    }
    if (policy.allowShell !== true) {
      return {
        allowed: false,
        reason: `agent ${agentId} cannot execute shell commands`,
        approvalRequired: false,
        approvalReason: null,
        risk: "high",
      };
    }

    for (const commandSegment of input.analysis.commands) {
      const name = executableName(commandSegment.executable);
      if (SAFE_SHELL_UTILITIES.has(name)) continue;
      if (PACKAGE_MANAGERS.has(name) || name === "git") {
        const descriptor = describeCommand(name, commandSegment.args);
        const denial = profilePolicyDenialReason(policy, descriptor);
        if (denial) {
          return {
            allowed: false,
            reason: `agent ${agentId} cannot execute shell command: ${denial}`,
            approvalRequired: false,
            approvalReason: null,
            risk: "high",
          };
        }
        continue;
      }
      if (setIncludes(policy.allowDirectExecutables, name)) continue;
      if (!input.approved) {
        return {
          allowed: false,
          reason: `agent ${agentId} requires explicit approval for shell command: ${name}`,
          approvalRequired: true,
          approvalReason: `agent ${agentId} requires explicit approval for shell command: ${name}`,
          risk: "medium",
        };
      }
    }

    if (policy.approvalRequired && !input.approved) {
      return {
        allowed: false,
        reason: `agent ${agentId} requires explicit approval for shell command execution`,
        approvalRequired: true,
        approvalReason: `agent ${agentId} requires explicit approval for shell command execution`,
        risk: "medium",
      };
    }

    return {
      allowed: true,
      reason: null,
      approvalRequired: policy.approvalRequired === true,
      approvalReason:
        policy.approvalRequired === true
          ? `agent ${agentId} requires explicit approval for shell command execution`
          : null,
      risk: policy.approvalRequired === true ? "medium" : "low",
    };
  }

  private async evaluatePackageScript(input: {
    executableName: string;
    args: readonly string[];
    cwd: string;
  }): Promise<string | null> {
    if (!PACKAGE_MANAGERS.has(input.executableName)) return null;
    const scriptName = firstPackageScriptArg(input.args);
    if (!scriptName) return null;
    const script = await readPackageScript(input.cwd, scriptName);
    if (!script) return null;
    const scriptReason = dangerousScriptReason(script);
    return scriptReason ? `package script ${scriptName} rejected: ${scriptReason}` : null;
  }

  private evaluateProfilePolicy(input: {
    agentId?: string | null | undefined;
    descriptor: CommandDescriptor;
    approved: boolean;
  }):
    | {
        allowed: true;
        reason: null;
        approvalRequired: boolean;
        approvalReason: string | null;
        risk: "low" | "medium" | "high";
      }
    | {
        allowed: false;
        reason: string;
        approvalRequired: boolean;
        approvalReason: string | null;
        risk: "low" | "medium" | "high";
      } {
    const agentId = input.agentId?.trim();
    const policy = agentId ? this.profilePolicies[agentId] : undefined;
    if (!policy || !agentId) {
      return {
        allowed: true,
        reason: null,
        approvalRequired: false,
        approvalReason: null,
        risk: "low",
      };
    }

    const denial = profilePolicyDenialReason(policy, input.descriptor);
    if (denial) {
      return {
        allowed: false,
        reason: `agent ${agentId} cannot execute command: ${denial}`,
        approvalRequired: false,
        approvalReason: null,
        risk: "high",
      };
    }

    if (policy.approvalRequired && !input.approved) {
      return {
        allowed: false,
        reason: `agent ${agentId} requires explicit approval for command execution`,
        approvalRequired: true,
        approvalReason: `agent ${agentId} requires explicit approval for command execution`,
        risk: "medium",
      };
    }

    return {
      allowed: true,
      reason: null,
      approvalRequired: policy.approvalRequired === true,
      approvalReason:
        policy.approvalRequired === true
          ? `agent ${agentId} requires explicit approval for command execution`
          : null,
      risk: policy.approvalRequired === true ? "medium" : "low",
    };
  }

  private async normalizeCwd(cwd: string): Promise<
    | { allowed: true; cwd: string; reason: null }
    | { allowed: false; cwd: null; reason: string }
  > {
    let canonicalCwd: string;
    try {
      canonicalCwd = await fs.realpath(resolve(cwd));
      const stat = await fs.stat(canonicalCwd);
      if (!stat.isDirectory()) {
        return { allowed: false, cwd: null, reason: `cwd is not a directory: ${cwd}` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { allowed: false, cwd: null, reason: `invalid cwd: ${message}` };
    }

    if (this.allowedRoot) {
      const canonicalRoot = await fs.realpath(this.allowedRoot);
      if (!isInsideRoot(canonicalRoot, canonicalCwd)) {
        return {
          allowed: false,
          cwd: null,
          reason: `cwd is outside allowed root: ${canonicalCwd}`,
        };
      }
    }

    return { allowed: true, cwd: canonicalCwd, reason: null };
  }

  private reject(
    reason: string,
    options: {
      approvalRequired?: boolean;
      risk?: "low" | "medium" | "high";
      action?: "deny" | "ask";
    } = {}
  ): CommandPermissionDecision {
    return {
      allowed: false,
      action: options.action ?? "deny",
      reason,
      normalized: null,
      approvalRequired: options.approvalRequired ?? false,
      risk: options.risk ?? "high",
    };
  }
}
