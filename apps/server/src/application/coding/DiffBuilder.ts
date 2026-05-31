import { createHash } from "node:crypto";
import type { StructuralPatchDiffStats } from "@u-build/shared";

export interface BuiltDiff {
  readonly diff: string;
  readonly stats: StructuralPatchDiffStats;
}

export class DiffBuilder {
  build(input: {
    readonly targetPath: string;
    readonly beforeContent: string | null;
    readonly afterContent: string | null;
  }): BuiltDiff {
    if (input.afterContent === null) {
      return this.deleteDiff(input.targetPath, input.beforeContent);
    }
    return this.replacementDiff(
      input.targetPath,
      input.beforeContent,
      input.afterContent
    );
  }

  private replacementDiff(
    targetPath: string,
    beforeContent: string | null,
    afterContent: string
  ): BuiltDiff {
    const beforeLines = splitLines(beforeContent ?? "");
    const afterLines = splitLines(afterContent);
    const beforeHash = shortHash(beforeContent ?? "");
    const afterHash = shortHash(afterContent);
    const beforeHeader = beforeContent === null ? "--- /dev/null" : `--- a/${targetPath}`;
    const diffLines = [
      `diff --git a/${targetPath} b/${targetPath}`,
      `index ${beforeContent === null ? "0000000" : beforeHash}..${afterHash}`,
      beforeHeader,
      `+++ b/${targetPath}`,
      `@@ -1,${Math.max(beforeLines.length, 1)} +1,${Math.max(afterLines.length, 1)} @@`,
      ...beforeLines.map((line) => `-${line}`),
      ...afterLines.map((line) => `+${line}`),
    ];
    return {
      diff: diffLines.join("\n"),
      stats: {
        addedLines: afterLines.length,
        removedLines: beforeContent === null ? 0 : beforeLines.length,
        changedFiles: 1,
      },
    };
  }

  private deleteDiff(targetPath: string, beforeContent: string | null): BuiltDiff {
    const beforeLines = splitLines(beforeContent ?? "<missing file>");
    const beforeHash = shortHash(beforeContent ?? "");
    const diffLines = [
      `diff --git a/${targetPath} b/${targetPath}`,
      "deleted file mode 100644",
      `index ${beforeContent === null ? "0000000" : beforeHash}..0000000`,
      `--- a/${targetPath}`,
      "+++ /dev/null",
      `@@ -1,${Math.max(beforeLines.length, 1)} +0,0 @@`,
      ...beforeLines.map((line) => `-${line}`),
    ];
    return {
      diff: diffLines.join("\n"),
      stats: {
        addedLines: 0,
        removedLines: beforeLines.length,
        changedFiles: 1,
      },
    };
  }
}

export function combineDiffStats(
  stats: readonly StructuralPatchDiffStats[]
): StructuralPatchDiffStats {
  return stats.reduce(
    (total, item) => ({
      addedLines: total.addedLines + item.addedLines,
      removedLines: total.removedLines + item.removedLines,
      changedFiles: total.changedFiles + item.changedFiles,
    }),
    { addedLines: 0, removedLines: 0, changedFiles: 0 }
  );
}

function splitLines(content: string): string[] {
  if (content.length === 0) return [];
  return content.split("\n");
}

function shortHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}
