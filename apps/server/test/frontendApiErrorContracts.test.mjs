import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const clientFiles = [
  "apps/web/src/api/workflowApi.ts",
  "apps/web/src/api/previewApi.ts",
  "apps/web/src/api/horusChatApi.ts",
  "apps/web/src/api/projectFilesApi.ts",
  "apps/web/src/api/agentSkillsApi.ts",
  "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts",
  "apps/web/src/app/useWorkflowRuntime.ts",
  "apps/web/src/components/VisualPreviewConsole.tsx",
  "apps/web/src/features/visual-preview/usePreviewChatRuntime.ts",
  "apps/web/src/features/visual-preview/workflowProgress.ts",
  "apps/web/src/features/visual-preview/useWorkflowFileOperations.ts",
  "apps/web/src/components/execution-console/useExecutionTaskOutputs.ts",
  "apps/web/src/components/ExecutionConsolePanel.tsx",
];

const forbiddenFragments = [
  "if (!response.ok) return []",
  "if (!response.ok) return null",
  "if (!response.ok) return \"\"",
  "if (!res.ok) return []",
  "if (!res.ok) return null",
  "if (!res.ok) return \"\"",
  ".catch(() => setLlmProviders([]))",
  ".catch(() => setLlmProfile(null))",
  ".catch(() => undefined)",
];

test("frontend API clients do not silently coerce HTTP failures to empty values", async () => {
  const violations = [];
  for (const file of clientFiles) {
    const source = await readFile(join(repositoryRoot, file), "utf8");
    for (const fragment of forbiddenFragments) {
      if (source.includes(fragment)) {
        violations.push(`${file}: ${fragment}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
