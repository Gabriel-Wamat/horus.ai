import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import {
  CodeChangeSetSchema,
  type CodeChangeSet,
  type CodeContextBundle,
  type UserStory,
  type WorkspaceArtifactContext,
} from "@u-build/shared";

export interface FrontendWriteFileOperationPlan {
  operation?: "write";
  targetPath: string;
  afterContent: string;
  rationale: string;
}

export interface FrontendDeleteFileOperationPlan {
  operation: "delete";
  targetPath: string;
  rationale: string;
}

export type FrontendFileOperationPlan =
  | FrontendWriteFileOperationPlan
  | FrontendDeleteFileOperationPlan;

export interface FrontendCodeChangeSetInput {
  workflowThreadId: string;
  userStory: UserStory;
  operations: FrontendFileOperationPlan[];
  codeContext?: CodeContextBundle;
  artifactContext?: WorkspaceArtifactContext;
}

export function buildFrontendCodeChangeSet(
  input: FrontendCodeChangeSetInput
): CodeChangeSet {
  const currentFiles = new Map(
    input.codeContext?.files.map((file) => [file.path, file.content]) ?? []
  );

  return CodeChangeSetSchema.parse({
    id: uuidv4(),
    workflowThreadId: input.workflowThreadId,
    workspaceFolderId: input.artifactContext?.workspaceFolderId,
    userStoryId: input.userStory.id,
    specRevisionId: input.artifactContext?.specRevisionId,
    sourceAgent: "front",
    status: "proposed",
    operations: input.operations.map((operation) => {
      const beforeContent = currentFiles.get(operation.targetPath) ?? null;
      if (operation.operation === "delete") {
        return {
          targetPath: operation.targetPath,
          changeType: "delete",
          beforeContent,
          afterContent: null,
          diff: createDeleteFileDiff(operation.targetPath, beforeContent),
        };
      }

      return {
        targetPath: operation.targetPath,
        changeType: beforeContent === null ? "create" : "update",
        beforeContent,
        afterContent: operation.afterContent,
        diff: createReplacementDiff(
          operation.targetPath,
          beforeContent,
          operation.afterContent
        ),
      };
    }),
    validation: [
      {
        command: "pending-controlled-frontend-validation",
        cwd: ".",
        exitCode: null,
        status: "not_run",
      },
    ],
    createdAt: new Date().toISOString(),
  });
}

function createReplacementDiff(
  targetPath: string,
  beforeContent: string | null,
  afterContent: string
): string {
  const afterHash = createHash("sha256")
    .update(afterContent)
    .digest("hex")
    .slice(0, 12);
  const beforeHash =
    beforeContent === null
      ? "0000000"
      : createHash("sha256").update(beforeContent).digest("hex").slice(0, 12);
  const beforeLines = beforeContent?.split("\n").map((line) => `-${line}`) ?? [];
  const afterLines = afterContent.split("\n").map((line) => `+${line}`);

  return [
    `diff --git a/${targetPath} b/${targetPath}`,
    `index ${beforeHash}..${afterHash}`,
    beforeContent === null ? "--- /dev/null" : `--- a/${targetPath}`,
    `+++ b/${targetPath}`,
    "@@",
    ...beforeLines,
    ...afterLines,
  ].join("\n");
}

function createDeleteFileDiff(
  targetPath: string,
  beforeContent: string | null
): string {
  const beforeHash =
    beforeContent === null
      ? "0000000"
      : createHash("sha256").update(beforeContent).digest("hex").slice(0, 12);
  const beforeLines =
    beforeContent?.split("\n").map((line) => `-${line}`) ?? [
      "-<missing file>",
    ];

  return [
    `diff --git a/${targetPath} b/${targetPath}`,
    "deleted file mode 100644",
    `index ${beforeHash}..0000000`,
    `--- a/${targetPath}`,
    "+++ /dev/null",
    "@@",
    ...beforeLines,
  ].join("\n");
}
