import { randomUUID } from "node:crypto";
import {
  CodeChangeSetSchema,
  CodingRuntimeArtifactRefSchema,
  CodingValidationResultSchema,
  StructuralPatchPlanSchema,
  type CodeChangeSet,
} from "@u-build/shared";
import type {
  CodingRuntimeStepContext,
  CodingRuntimeStepResult,
} from "../ports/index.js";
import { compileStructuralPatchPlanToCodeChangeOperations } from "./AstPatchPlanner.js";

export interface CodingPatchApplyPort {
  apply(input: {
    readonly changeSet: CodeChangeSet;
    readonly projectRootPath: string;
  }): Promise<CodeChangeSet>;
}

export class CodingPatchApplier {
  constructor(
    private readonly applier: CodingPatchApplyPort,
    private readonly now: () => Date = () => new Date(),
    private readonly idGenerator: () => string = randomUUID
  ) {}

  async execute(context: CodingRuntimeStepContext): Promise<CodingRuntimeStepResult> {
    const planArtifact = context.artifacts
      .filter((artifact) => artifact.kind === "patch_plan")
      .at(-1);
    const validationArtifact = context.artifacts
      .filter((artifact) => artifact.kind === "runtime_validation")
      .at(-1);
    if (!planArtifact?.payload || !validationArtifact?.payload) {
      throw new Error("Patch apply requires patch plan and runtime validation artifacts.");
    }
    if (!context.task.projectRootPath) {
      throw new Error("Patch apply requires task.projectRootPath.");
    }

    const patchPlan = StructuralPatchPlanSchema.parse(planArtifact.payload);
    const validation = CodingValidationResultSchema.parse(validationArtifact.payload);
    assertValidationAllowsApply(validation);
    const changeSet = CodeChangeSetSchema.parse({
      id: this.idGenerator(),
      workflowThreadId: context.task.workflowThreadId ?? context.task.id,
      workspaceFolderId: undefined,
      userStoryId: context.task.userStoryId ?? context.task.id,
      sourceAgent: "front",
      status: "proposed",
      operations: compileStructuralPatchPlanToCodeChangeOperations(patchPlan),
      validation: validation.codeChangeValidation,
      createdAt: this.now().toISOString(),
    });

    try {
      const applied = await this.applier.apply({
        changeSet,
        projectRootPath: context.task.projectRootPath,
      });
      const ready = applied.status === "applied";
      return {
        message: ready
          ? "Patch applied after validation."
          : `Patch apply failed with status ${applied.status}.`,
        artifact: CodingRuntimeArtifactRefSchema.parse({
          id: this.idGenerator(),
          kind: "patch_apply",
          label: "Patch apply",
          status: ready ? "ready" : "failed",
          createdAt: this.now().toISOString(),
          summary: `${applied.operations.length} operation(s), status ${applied.status}.`,
          payload: applied,
        }),
        metadata: {
          status: applied.status,
          operationCount: applied.operations.length,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        message: `Patch apply failed: ${message}`,
        artifact: CodingRuntimeArtifactRefSchema.parse({
          id: this.idGenerator(),
          kind: "patch_apply",
          label: "Patch apply",
          status: "failed",
          createdAt: this.now().toISOString(),
          summary: message,
          payload: {
            changeSet,
            error: message,
          },
        }),
        metadata: {
          status: "failed",
          error: message,
        },
      };
    }
  }
}

function assertValidationAllowsApply(
  validation: ReturnType<typeof CodingValidationResultSchema.parse>
): void {
  if (validation.status === "passed") return;
  if (validation.status === "skipped" && validation.skippedReason) return;
  throw new Error(
    `Patch apply blocked by runtime validation status ${validation.status}.`
  );
}
