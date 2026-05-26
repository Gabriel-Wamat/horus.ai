import { promises as fs } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";

export interface CliCommandSpec {
  id: string;
  executable: string;
  args?: string[];
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface CliPolicyOptions {
  allowedExecutables?: readonly string[];
  allowedRoot?: string;
  maxTimeoutMs?: number;
}

export interface CliPolicyDecision {
  allowed: boolean;
  reason: string | null;
  normalized: NormalizedCliCommandSpec | null;
}

export interface NormalizedCliCommandSpec {
  id: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env: Record<string, string>;
}

const DEFAULT_ALLOWED_EXECUTABLES = [
  "node",
  process.execPath,
  "pnpm",
  "npm",
  "yarn",
  "bun",
] as const;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TIMEOUT_MS = 120_000;

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+-rf\s+\//i, reason: "destructive rm against root" },
  { pattern: /\brm\s+-rf\s+\*/i, reason: "destructive rm wildcard" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: "destructive git reset" },
  { pattern: /\bgit\s+push\s+(?:--force|-f)\b/i, reason: "force push" },
  { pattern: /\bDROP\s+TABLE\b/i, reason: "destructive SQL" },
  { pattern: /\bDELETE\s+FROM\b(?!.*\bWHERE\b)/i, reason: "unbounded SQL delete" },
  { pattern: /\bmkfs(?:\.[a-z0-9]+)?\b/i, reason: "filesystem formatting" },
  { pattern: /\bdd\s+if=\/dev\/zero\s+of=\/dev\//i, reason: "destructive device write" },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\};:/, reason: "fork bomb" },
  { pattern: /\b(?:shutdown|reboot|poweroff|halt)\b/i, reason: "host power command" },
];

const DANGEROUS_SHELL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\$\(/, reason: "command substitution" },
  { pattern: /`[^`]+`/, reason: "backtick command substitution" },
  { pattern: /<\(|>\(/, reason: "process substitution" },
  { pattern: /\bzmodload\b|\bemulate\s+-c\b|\bztcp\b/i, reason: "dangerous zsh primitive" },
];

function commandText(spec: Pick<CliCommandSpec, "executable" | "args">): string {
  return [spec.executable, ...(spec.args ?? [])].join(" ");
}

function executableName(executable: string): string {
  return basename(executable);
}

function isInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relation = relative(rootPath, candidatePath);
  return relation === "" || (!relation.startsWith("..") && !relation.includes(`..${sep}`));
}

export class CliCommandPolicy {
  private readonly allowedExecutables: Set<string>;
  private readonly allowedRoot: string | null;
  private readonly maxTimeoutMs: number;

  constructor(options: CliPolicyOptions = {}) {
    this.allowedExecutables = new Set(options.allowedExecutables ?? DEFAULT_ALLOWED_EXECUTABLES);
    this.allowedRoot = options.allowedRoot ? resolve(options.allowedRoot) : null;
    this.maxTimeoutMs = options.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;
  }

  async evaluate(spec: CliCommandSpec): Promise<CliPolicyDecision> {
    const basicRejection = this.evaluateStaticRules(spec);
    if (basicRejection) {
      return { allowed: false, reason: basicRejection, normalized: null };
    }

    const cwdDecision = await this.normalizeCwd(spec.cwd);
    if (!cwdDecision.allowed) {
      return { allowed: false, reason: cwdDecision.reason, normalized: null };
    }

    const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      return { allowed: false, reason: "timeoutMs must be a positive integer", normalized: null };
    }
    if (timeoutMs > this.maxTimeoutMs) {
      return {
        allowed: false,
        reason: `timeoutMs exceeds maximum ${this.maxTimeoutMs}`,
        normalized: null,
      };
    }

    return {
      allowed: true,
      reason: null,
      normalized: {
        id: spec.id.trim(),
        executable: spec.executable.trim(),
        args: spec.args ?? [],
        cwd: cwdDecision.cwd,
        timeoutMs,
        env: spec.env ?? {},
      },
    };
  }

  private evaluateStaticRules(spec: CliCommandSpec): string | null {
    if (!spec.id.trim()) return "command id is required";
    if (!spec.executable.trim()) return "executable is required";
    if (!spec.cwd.trim()) return "cwd is required";
    if (spec.executable.includes("\x00")) return "executable contains NUL byte";
    if ((spec.args ?? []).some((arg) => arg.includes("\x00"))) {
      return "argument contains NUL byte";
    }

    const executable = spec.executable.trim();
    if (
      !this.allowedExecutables.has(executable) &&
      !this.allowedExecutables.has(executableName(executable))
    ) {
      return `executable is not allowlisted: ${executable}`;
    }

    const text = commandText(spec);
    for (const item of DANGEROUS_SHELL_PATTERNS) {
      if (item.pattern.test(text)) return `unsafe shell pattern blocked: ${item.reason}`;
    }
    for (const item of DANGEROUS_PATTERNS) {
      if (item.pattern.test(text)) return `dangerous command blocked: ${item.reason}`;
    }

    return null;
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
}

