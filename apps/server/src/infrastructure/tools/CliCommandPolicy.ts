import {
  CommandPermissionEngine,
  type CommandPermissionOptions,
  type CommandPermissionSpec,
  type NormalizedCommandPermissionSpec,
} from "./CommandPermissionEngine.js";

export interface CliCommandSpec extends CommandPermissionSpec {}

export interface CliPolicyOptions extends CommandPermissionOptions {}

export interface CliPolicyDecision {
  action: "allow" | "deny" | "ask";
  allowed: boolean;
  reason: string | null;
  normalized: NormalizedCliCommandSpec | null;
  approvalRequired: boolean;
  risk: "low" | "medium" | "high";
}

export interface NormalizedCliCommandSpec
  extends Omit<NormalizedCommandPermissionSpec, "executableName"> {}

export class CliCommandPolicy {
  private readonly engine: CommandPermissionEngine;

  constructor(options: CliPolicyOptions = {}) {
    this.engine = new CommandPermissionEngine(options);
  }

  async evaluate(spec: CliCommandSpec): Promise<CliPolicyDecision> {
    const decision = await this.engine.evaluate(spec);
    return {
      allowed: decision.allowed,
      action: decision.action,
      reason: decision.reason,
      approvalRequired: decision.approvalRequired,
      risk: decision.risk,
      normalized: decision.normalized
        ? {
            id: decision.normalized.id,
            executable: decision.normalized.executable,
            args: decision.normalized.args,
            cwd: decision.normalized.cwd,
            timeoutMs: decision.normalized.timeoutMs,
            env: decision.normalized.env,
            approvalRequired: decision.normalized.approvalRequired,
            risk: decision.normalized.risk,
            approved: decision.normalized.approved,
            approvedBy: decision.normalized.approvedBy,
            approvalReason: decision.normalized.approvalReason,
          }
        : null,
    };
  }
}
