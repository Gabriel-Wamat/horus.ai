import { randomUUID } from "node:crypto";
import {
  CodingRuntimeArtifactRefSchema,
  CodingValidationCommandEvidenceSchema,
  CodingValidationPlanSchema,
  CodingValidationResultSchema,
  StructuralPatchPlanSchema,
  type CodeChangeValidationCommand,
  type CodingValidationCommandEvidence,
  type CodingValidationPlanCommand,
  type CodingValidationResult,
} from "@u-build/shared";
import type {
  CodingRuntimeStepContext,
  CodingRuntimeStepResult,
  CodingValidationCommandRun,
  CodingValidationCommandRunnerPort,
  CodingValidationInput,
  CodingValidationPort,
  CodingValidationWorkspacePort,
} from "../ports/index.js";
import { ValidationCommandSelector } from "./ValidationCommandSelector.js";

export class CodingValidationRunner implements CodingValidationPort {
  constructor(
    private readonly workspace: CodingValidationWorkspacePort,
    private readonly commandRunner: CodingValidationCommandRunnerPort,
    private readonly commandSelector = new ValidationCommandSelector(),
    private readonly now: () => Date = () => new Date(),
    private readonly idGenerator: () => string = randomUUID
  ) {}

  async validate(input: CodingValidationInput): Promise<CodingValidationResult> {
    throwIfAborted(input.signal);
    const startedAt = this.now();
    const plan = CodingValidationPlanSchema.parse({
      id: this.idGenerator(),
      patchPlanId: input.patchPlan.id,
      projectRootPath: input.projectRootPath,
      commands: [],
      createdAt: startedAt.toISOString(),
    });

    if (input.patchPlan.status !== "planned") {
      return this.result({
        planId: plan.id,
        patchPlanId: input.patchPlan.id,
        startedAt,
        status: "failed",
        commands: [],
        codeChangeValidation: [],
        issues: [`Patch plan is not ready for runtime validation: ${input.patchPlan.status}.`],
        skippedReason: null,
      });
    }

    const prepared = await this.workspace.prepare({
      patchPlan: input.patchPlan,
      projectRootPath: input.projectRootPath,
    });

    try {
      if (prepared.staticIssues.length > 0) {
        const issueText = prepared.staticIssues.join("\n");
        const evidence = CodingValidationCommandEvidenceSchema.parse({
          commandId: "frontend-change-set-quality-gate",
          kind: "static_gate",
          command: "frontend-change-set-quality-gate",
          cwd: ".",
          status: "failed",
          exitCode: 1,
          stdoutTail: "",
          stderrTail: issueText,
          durationMs: 0,
          errorMessage: "Static frontend validation failed.",
          startedAt: startedAt.toISOString(),
          finishedAt: this.now().toISOString(),
        });
        return this.result({
          planId: plan.id,
          patchPlanId: input.patchPlan.id,
          startedAt,
          status: "failed",
          commands: [evidence],
          codeChangeValidation: [toCodeChangeValidation(evidence)],
          issues: prepared.staticIssues.map((issue) => `[static] ${issue}`),
          skippedReason: null,
        });
      }

      const commands = this.commandSelector.select(prepared.config);
      if (commands.length === 0) {
        return this.result({
          planId: plan.id,
          patchPlanId: input.patchPlan.id,
          startedAt,
          status: "skipped",
          commands: [],
          codeChangeValidation: [
            {
              command: "coding-runtime-validation",
              cwd: ".",
              exitCode: null,
              status: "not_run",
              stdout:
                "No lint, type-check, check, test or build command was detected.",
            },
          ],
          issues: [],
          skippedReason:
            "No deterministic lint, type-check, check, test or build command was detected.",
        });
      }

      const evidence: CodingValidationCommandEvidence[] = [];
      for (const command of commands) {
        throwIfAborted(input.signal);
        const run = await this.commandRunner.run({
          command,
          workspaceRootPath: prepared.candidateRootPath,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        evidence.push(commandEvidence(command, run, this.now));
      }

      const status = summarizeStatus(evidence);
      const issues = evidence
        .filter((item) => item.status !== "passed")
        .map((item) => formatIssue(item));
      return this.result({
        planId: plan.id,
        patchPlanId: input.patchPlan.id,
        startedAt,
        status,
        commands: evidence,
        codeChangeValidation: evidence.map(toCodeChangeValidation),
        issues,
        skippedReason: null,
      });
    } finally {
      await prepared.cleanup();
    }
  }

  async execute(context: CodingRuntimeStepContext): Promise<CodingRuntimeStepResult> {
    const planArtifact = context.artifacts
      .filter((artifact) => artifact.kind === "patch_plan")
      .at(-1);
    if (!planArtifact?.payload) {
      throw new Error("Coding task cannot validate runtime without a patch plan artifact.");
    }
    const astValidationArtifact = context.artifacts
      .filter((artifact) => artifact.kind === "ast_validation")
      .at(-1);
    if (!astValidationArtifact || astValidationArtifact.status !== "ready") {
      throw new Error("Runtime validation requires a passing AST validation artifact.");
    }
    if (!context.task.projectRootPath) {
      throw new Error("Runtime validation requires task.projectRootPath.");
    }

    const patchPlan = StructuralPatchPlanSchema.parse(planArtifact.payload);
    const result = await this.validate({
      patchPlan,
      projectRootPath: context.task.projectRootPath,
      signal: context.signal,
    });

    return {
      message: `Runtime validation finished with status ${result.status}.`,
      artifact: CodingRuntimeArtifactRefSchema.parse({
        id: this.idGenerator(),
        kind: "runtime_validation",
        label: "Runtime validation",
        status: result.passed ? "ready" : "failed",
        createdAt: this.now().toISOString(),
        summary:
          result.status === "skipped"
            ? `Runtime validation skipped: ${result.skippedReason}`
            : `${result.commands.length} command(s), ${result.issues.length} issue(s).`,
        payload: result,
      }),
      metadata: {
        status: result.status,
        passed: result.passed,
        commandCount: result.commands.length,
        issueCount: result.issues.length,
        skippedReason: result.skippedReason,
      },
    };
  }

  private result(input: {
    readonly planId: string;
    readonly patchPlanId: string;
    readonly startedAt: Date;
    readonly status: CodingValidationResult["status"];
    readonly commands: readonly CodingValidationCommandEvidence[];
    readonly codeChangeValidation: readonly CodeChangeValidationCommand[];
    readonly issues: readonly string[];
    readonly skippedReason: string | null;
  }): CodingValidationResult {
    const finishedAt = this.now();
    return CodingValidationResultSchema.parse({
      id: this.idGenerator(),
      planId: input.planId,
      patchPlanId: input.patchPlanId,
      status: input.status,
      passed: input.status === "passed" || input.status === "skipped",
      commands: input.commands,
      codeChangeValidation: input.codeChangeValidation,
      issues: input.issues,
      skippedReason: input.skippedReason,
      startedAt: input.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - input.startedAt.getTime()),
    });
  }
}

function commandEvidence(
  command: CodingValidationPlanCommand,
  run: CodingValidationCommandRun,
  now: () => Date
): CodingValidationCommandEvidence {
  const status = run.status === "completed" ? "passed" : run.status;
  return CodingValidationCommandEvidenceSchema.parse({
    commandId: run.commandId,
    kind: command.kind,
    command: [run.executable, ...run.args].join(" "),
    cwd: run.cwd,
    status,
    exitCode: run.exitCode,
    stdoutTail: redactValidationOutput(run.stdout),
    stderrTail: redactValidationOutput(run.stderr),
    durationMs: run.durationMs,
    errorMessage: run.errorMessage ? redactValidationOutput(run.errorMessage) : null,
    startedAt: null,
    finishedAt: now().toISOString(),
  });
}

function summarizeStatus(
  commands: readonly CodingValidationCommandEvidence[]
): CodingValidationResult["status"] {
  if (commands.some((command) => command.status === "aborted")) return "aborted";
  if (commands.some((command) => command.status === "timed_out")) return "timed_out";
  if (commands.some((command) => command.status === "rejected")) return "rejected";
  if (commands.some((command) => command.status === "failed")) return "failed";
  return "passed";
}

function toCodeChangeValidation(
  evidence: CodingValidationCommandEvidence
): CodeChangeValidationCommand {
  return {
    command: evidence.command,
    cwd: evidence.cwd,
    exitCode: evidence.exitCode,
    status: evidence.status === "passed" ? "passed" : "failed",
    ...(evidence.stdoutTail ? { stdout: evidence.stdoutTail } : {}),
    ...(evidence.stderrTail || evidence.errorMessage
      ? { stderr: evidence.stderrTail || evidence.errorMessage || "" }
      : {}),
  };
}

function formatIssue(evidence: CodingValidationCommandEvidence): string {
  const detail =
    evidence.stderrTail.trim() ||
    evidence.stdoutTail.trim() ||
    evidence.errorMessage ||
    "Validation command failed.";
  return `[${evidence.kind}] ${evidence.commandId} ${evidence.status}: ${detail}`;
}

function redactValidationOutput(output: string): string {
  return output
    .replace(/sk-[A-Za-z0-9_-]{16,}/gu, "[REDACTED_SECRET]")
    .replace(
      /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]+/giu,
      (match) => `${match.split(/[:=]/u)[0]}=[REDACTED_SECRET]`
    );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Runtime validation cancelled.");
  error.name = "AbortError";
  throw error;
}
