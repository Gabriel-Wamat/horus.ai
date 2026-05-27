import { promises as fs } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { CodeChangeSetSchema, type CodeChangeSet } from "@u-build/shared";
import type { WorkflowCodeChangeSetApplier } from "../../domain/services/WorkflowOrchestrator.js";
import { evaluateFrontendChangeSet } from "./FrontendChangeSetQualityGate.js";

export class ProjectCodeChangeSetApplier
  implements WorkflowCodeChangeSetApplier
{
  async apply(input: {
    changeSet: CodeChangeSet;
    projectRootPath: string;
  }): Promise<CodeChangeSet> {
    const projectRoot = resolve(input.projectRootPath);
    const plannedOperations = [];

    for (const operation of input.changeSet.operations) {
      const targetPath = resolveProjectPath(projectRoot, operation.targetPath);
      const beforeContent = await readExistingFile(targetPath);
      plannedOperations.push({
        targetPath,
        beforeContent,
        operation: {
          ...operation,
          changeType: beforeContent === null ? "create" : "update",
          beforeContent,
        },
      });
    }

    const candidateChangeSet = CodeChangeSetSchema.parse({
      ...input.changeSet,
      operations: plannedOperations.map((planned) => planned.operation),
    });
    const qualityGate = await evaluateFrontendChangeSet({
      projectRootPath: projectRoot,
      changeSet: candidateChangeSet,
    });
    if (!qualityGate.passed) {
      const failedReason = qualityGate.issues.join("\n");
      return CodeChangeSetSchema.parse({
        ...candidateChangeSet,
        status: "failed",
        failedReason,
        validation: [
          ...candidateChangeSet.validation,
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

    const appliedOperations: typeof plannedOperations = [];
    try {
      for (const planned of plannedOperations) {
        await fs.mkdir(dirname(planned.targetPath), { recursive: true });
        await fs.writeFile(
          planned.targetPath,
          planned.operation.afterContent,
          "utf8"
        );
        appliedOperations.push(planned);
      }
    } catch (err) {
      await rollbackAppliedOperations(appliedOperations);
      throw err;
    }

    return CodeChangeSetSchema.parse({
      ...input.changeSet,
      status: "applied",
      operations: plannedOperations.map((planned) => planned.operation),
      appliedAt: new Date().toISOString(),
    });
  }
}

async function rollbackAppliedOperations(
  appliedOperations: Array<{
    targetPath: string;
    beforeContent: string | null;
  }>
): Promise<void> {
  for (const operation of appliedOperations.reverse()) {
    if (operation.beforeContent === null) {
      await fs.rm(operation.targetPath, { force: true });
      continue;
    }
    await fs.writeFile(operation.targetPath, operation.beforeContent, "utf8");
  }
}

function resolveProjectPath(projectRoot: string, targetPath: string): string {
  if (isAbsolute(targetPath)) {
    throw new Error(
      `CodeChangeSet target path must be relative to the selected project: ${targetPath}`
    );
  }

  const resolvedTarget = resolve(projectRoot, targetPath);
  const relativeTarget = relative(projectRoot, resolvedTarget);

  if (
    relativeTarget.length === 0 ||
    relativeTarget.startsWith("..") ||
    isAbsolute(relativeTarget)
  ) {
    throw new Error(
      `CodeChangeSet target path escapes the selected project: ${targetPath}`
    );
  }

  return resolvedTarget;
}

async function readExistingFile(targetPath: string): Promise<string | null> {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return null;
    throw err;
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
