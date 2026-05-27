import type {
  RuntimeValidationEvidence,
  ValidationGateResult,
  ValidationGateSummary,
  WorkflowMode,
} from "@u-build/shared";
import { ValidationGateResultSchema, ValidationGateSummarySchema } from "@u-build/shared";

export class ValidationGateAggregator {
  summarize(gates: readonly ValidationGateResult[]): ValidationGateSummary {
    const normalized = gates.map((gate) => ValidationGateResultSchema.parse(gate));
    const failedCount = normalized.filter((gate) => gate.status === "failed").length;
    const blockedCount = normalized.filter((gate) => gate.status === "blocked").length;
    const skippedCount = normalized.filter((gate) => gate.status === "skipped").length;
    const passedCount = normalized.filter((gate) => gate.status === "passed").length;
    const requiredSkipped = normalized.some(
      (gate) => gate.required && gate.status === "skipped"
    );
    const requiredFailed = normalized.some(
      (gate) => gate.required && gate.status === "failed"
    );
    const requiredBlocked = normalized.some(
      (gate) => gate.required && gate.status === "blocked"
    );

    const finalStatus = requiredBlocked
      ? "blocked"
      : requiredFailed
        ? "failed_validation"
        : requiredSkipped
          ? "completed_unverified"
          : "completed";

    return ValidationGateSummarySchema.parse({
      finalStatus,
      gates: normalized,
      passedCount,
      failedCount,
      skippedCount,
      blockedCount,
      message: messageForStatus(finalStatus, {
        passedCount,
        failedCount,
        skippedCount,
        blockedCount,
      }),
    });
  }

  gatesFromRuntimeEvidence(input: {
    workflowMode: WorkflowMode;
    runtimeEvidence?: RuntimeValidationEvidence | null;
    curatorPassed?: boolean | null;
    now?: string;
  }): ValidationGateResult[] {
    const now = input.now ?? new Date().toISOString();
    const gates: ValidationGateResult[] = [];
    if (input.runtimeEvidence) {
      for (const command of input.runtimeEvidence.commands) {
        gates.push(
          ValidationGateResultSchema.parse({
            id: `command:${command.commandId}`,
            label: `Command ${command.commandId}`,
            status: command.exitCode === 0 ? "passed" : "failed",
            required: true,
            message:
              command.exitCode === 0
                ? "Command completed successfully."
                : command.stderrTail || `Command failed with exit code ${command.exitCode}.`,
            evidenceType: "command",
            commandId: command.commandId,
            filePaths: [],
            createdAt: now,
          })
        );
      }
      gates.push(
        ValidationGateResultSchema.parse({
          id: "preview_smoke",
          label: "Preview smoke",
          status: input.runtimeEvidence.preview.status,
          required: input.workflowMode === "project_construction",
          message: input.runtimeEvidence.preview.message,
          evidenceType: "preview",
          commandId: null,
          filePaths: [],
          createdAt: now,
        })
      );
    } else {
      gates.push(
        ValidationGateResultSchema.parse({
          id: "runtime_validation",
          label: "Runtime validation",
          status: "skipped",
          required: input.workflowMode !== "spec_generation",
          message: "No runtime validation evidence was recorded.",
          evidenceType: "quality_gate",
          commandId: null,
          filePaths: [],
          createdAt: now,
        })
      );
    }

    if (input.curatorPassed != null) {
      gates.push(
        ValidationGateResultSchema.parse({
          id: "curator_verdict",
          label: "Curator verdict",
          status: input.curatorPassed ? "passed" : "failed",
          required: true,
          message: input.curatorPassed
            ? "Curator approved the available evidence."
            : "Curator rejected the available evidence.",
          evidenceType: "curator",
          commandId: null,
          filePaths: [],
          createdAt: now,
        })
      );
    }
    return gates;
  }
}

function messageForStatus(
  status: ValidationGateSummary["finalStatus"],
  counts: {
    passedCount: number;
    failedCount: number;
    skippedCount: number;
    blockedCount: number;
  }
): string {
  if (status === "blocked") {
    return `Blocked by ${counts.blockedCount} required validation gate(s).`;
  }
  if (status === "failed_validation") {
    return `Failed ${counts.failedCount} required validation gate(s).`;
  }
  if (status === "completed_unverified") {
    return `Completed with ${counts.skippedCount} skipped validation gate(s).`;
  }
  return `Completed with ${counts.passedCount} passed validation gate(s).`;
}
