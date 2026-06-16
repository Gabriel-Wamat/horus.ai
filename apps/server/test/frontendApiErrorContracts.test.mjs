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
  "apps/web/src/hooks/useSseStream.ts",
  "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts",
  "apps/web/src/features/agent-flow-map/hooks/useRunFlowEvents.ts",
  "apps/web/src/features/agent-flow-map/hooks/useRunFileOperations.ts",
  "apps/web/src/app/useWorkflowRuntime.ts",
  "apps/web/src/components/VisualPreviewConsole.tsx",
  "apps/web/src/features/visual-preview/usePreviewChatRuntime.ts",
  "apps/web/src/features/visual-preview/useProjectChatScope.ts",
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
  ".listWorkspaceStoryArtifacts(folderId)\n          .catch(() => null)",
  "syncChatMessagesFromServer();\n      } catch {",
  "Ignoring invalid workflow event payload",
  "Ignoring invalid file operation payload",
  "Ignoring invalid workflow progress event",
  "if (parsed) onEvent(parsed);",
  "if (parsed) onOperation(parsed);",
  "if (parsed) appendWorkflowProgressEvent(parsed);",
  "Failed to parse event:",
  "execution_task_poll_failed",
  "execution_task_output_poll_failed",
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

test("agent flow API validates JSON content type and shared response contracts", async () => {
  const source = await readFile(
    join(
      repositoryRoot,
      "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
    ),
    "utf8"
  );

  assert.equal(source.includes("return response.json() as Promise<T>"), false);
  assert.match(source, /expected application\/json/);
  assert.match(source, /parseApiContract/);
  assert.match(source, /HorusRunLocatorSchema/);
  assert.match(source, /HorusRunSnapshotSchema/);
  assert.match(source, /HorusRunEventSnapshotSchema/);
  assert.match(source, /AgentFileOperationTelemetrySchema/);
  assert.match(source, /AgentDebugTraceEntrySchema/);
});
