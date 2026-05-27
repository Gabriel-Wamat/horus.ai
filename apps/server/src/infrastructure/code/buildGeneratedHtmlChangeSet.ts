import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import {
  CodeChangeSetSchema,
  type CodeChangeSet,
  type UserStory,
  type WorkspaceArtifactContext,
} from "@u-build/shared";

export interface GeneratedHtmlChangeSetInput {
  workflowThreadId: string;
  userStory: UserStory;
  html: string;
  artifactContext?: WorkspaceArtifactContext;
}

export function buildGeneratedHtmlChangeSet(
  input: GeneratedHtmlChangeSetInput
): CodeChangeSet {
  const targetPath = `generated/horus/${input.userStory.id}.html`;
  const diff = createCreateFileDiff(targetPath, input.html);
  return CodeChangeSetSchema.parse({
    id: uuidv4(),
    workflowThreadId: input.workflowThreadId,
    workspaceFolderId: input.artifactContext?.workspaceFolderId,
    userStoryId: input.userStory.id,
    specRevisionId: input.artifactContext?.specRevisionId,
    sourceAgent: "front",
    status: "proposed",
    operations: [
      {
        targetPath,
        changeType: "create",
        beforeContent: null,
        afterContent: input.html,
        diff,
      },
    ],
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

function createCreateFileDiff(targetPath: string, content: string): string {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const lines = content.split("\n").map((line) => `+${line}`);
  return [
    `diff --git a/${targetPath} b/${targetPath}`,
    "new file mode 100644",
    "index 0000000.." + hash,
    "--- /dev/null",
    `+++ b/${targetPath}`,
    "@@",
    ...lines,
  ].join("\n");
}
