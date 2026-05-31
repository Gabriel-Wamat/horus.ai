import { CodeChangeSetSchema, type CodeChangeSet } from "@u-build/shared";
import type { WorkflowCodeChangeSetApplier } from "../../domain/services/WorkflowOrchestrator.js";
import { FileMutationPreflightApplier } from "./FileMutationPreflightApplier.js";
import { evaluateFrontendChangeSet } from "./FrontendChangeSetQualityGate.js";

export class ProjectCodeChangeSetApplier
  implements WorkflowCodeChangeSetApplier
{
  constructor(
    private readonly mutationApplier = new FileMutationPreflightApplier()
  ) {}

  async apply(input: {
    changeSet: CodeChangeSet;
    projectRootPath: string;
  }): Promise<CodeChangeSet> {
    const planned = await this.mutationApplier.planCodeChangeSet({
      changeSet: input.changeSet,
      projectRootPath: input.projectRootPath,
    });
    const qualityGate = await evaluateFrontendChangeSet({
      projectRootPath: planned.projectRoot,
      changeSet: planned.changeSet,
    });
    if (!qualityGate.passed) {
      const failedReason = qualityGate.issues.join("\n");
      return CodeChangeSetSchema.parse({
        ...planned.changeSet,
        status: "failed",
        failedReason,
        validation: [
          ...planned.changeSet.validation,
          {
            command: "frontend-change-set-quality-gate",
            cwd: ".",
            exitCode: 1,
            status: "failed",
            stderr: failedReason,
          },
        ],
      });
    }

    const applied = await this.mutationApplier.applyPlanWithRollback(planned);

    return CodeChangeSetSchema.parse({
      ...planned.changeSet,
      operations: applied.appliedOperations.map((operation) => operation.operation),
      status: "applied",
      appliedAt: new Date().toISOString(),
    });
  }
}
