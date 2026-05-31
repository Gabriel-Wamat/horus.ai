import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { CodeChangeSetSchema, type CodeChangeSet, type StructuralPatchPlan } from "@u-build/shared";
import { compileStructuralPatchPlanToCodeChangeOperations } from "../../application/coding/AstPatchPlanner.js";
import type {
  CodingValidationWorkspacePort,
  PreparedValidationWorkspace,
} from "../../application/ports/index.js";
import {
  applyPlannedCodeChangeOperations,
  planCodeChangeSetOperations,
} from "./CodeChangeSetFileOperations.js";
import { evaluateFrontendChangeSet } from "./FrontendChangeSetQualityGate.js";
import { ProjectDefaultContractBuilder } from "../project/ProjectDefaultContractBuilder.js";

export class CodeChangeSetValidationWorkspace
  implements CodingValidationWorkspacePort
{
  constructor(
    private readonly contractBuilder = new ProjectDefaultContractBuilder(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async prepare(input: {
    patchPlan: StructuralPatchPlan;
    projectRootPath: string;
  }): Promise<PreparedValidationWorkspace> {
    const candidateRootPath = await createValidationWorkspace(input.projectRootPath);
    try {
      const changeSet = structuralPatchToChangeSet(
        input.patchPlan,
        this.now().toISOString()
      );
      const planned = await planCodeChangeSetOperations({
        changeSet,
        projectRootPath: candidateRootPath,
      });
      await applyPlannedCodeChangeOperations(planned.operations);
      const staticGate = await evaluateFrontendChangeSet({
        projectRootPath: candidateRootPath,
        changeSet: planned.changeSet,
      });
      const config = await this.contractBuilder.build({
        projectRoot: candidateRootPath,
        projectName: "coding-validation",
        projectStack: "typescript-react",
        baseRef: "main",
      });

      return {
        candidateRootPath,
        config,
        staticIssues: staticGate.issues,
        cleanup: () => fs.rm(candidateRootPath, { recursive: true, force: true }),
      };
    } catch (err) {
      await fs.rm(candidateRootPath, { recursive: true, force: true });
      throw err;
    }
  }

}

function structuralPatchToChangeSet(
  plan: StructuralPatchPlan,
  createdAt: string
): CodeChangeSet {
  return CodeChangeSetSchema.parse({
    id: plan.id,
    workflowThreadId: plan.taskId ?? plan.id,
    userStoryId: plan.taskId ?? plan.id,
    sourceAgent: "front",
    status: "proposed",
    operations: compileStructuralPatchPlanToCodeChangeOperations(plan),
    validation: [],
    createdAt,
  });
}

async function createValidationWorkspace(projectRootPath: string): Promise<string> {
  const projectRoot = resolve(projectRootPath);
  const candidateRoot = await fs.mkdtemp(join(tmpdir(), "horus-validation-"));
  await fs.cp(projectRoot, candidateRoot, {
    recursive: true,
    force: false,
    errorOnExist: false,
    filter: (sourcePath) => shouldCopyValidationPath(projectRoot, sourcePath),
  });
  return candidateRoot;
}

function shouldCopyValidationPath(projectRootPath: string, sourcePath: string): boolean {
  if (sourcePath === projectRootPath) return true;
  const relativePath = sourcePath.slice(projectRootPath.length + 1);
  const segments = relativePath.split(/[\\/]+/u);
  if ([".horus", ".turbo", "data"].includes(segments[0] ?? "")) return false;
  if (
    segments.some((segment) =>
      [".git", "node_modules", "dist", "build", "coverage"].includes(segment)
    )
  ) {
    return false;
  }
  return !isSensitiveValidationFile(segments.at(-1) ?? "");
}

function isSensitiveValidationFile(basename: string): boolean {
  return /(^\.env(?:\..*)?$|\.(pem|key|crt|cer|p12|pfx)$)/iu.test(basename);
}
