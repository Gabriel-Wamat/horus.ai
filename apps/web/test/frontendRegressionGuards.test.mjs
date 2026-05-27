import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

function read(relativePath) {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

test("App delegates navigation, workspace and workflow runtime to feature hooks", () => {
  const app = read("src/App.tsx");
  assert.match(app, /useAppNavigation/);
  assert.match(app, /useWorkspaceFolders/);
  assert.match(app, /useWorkflowRuntime/);
  assert.doesNotMatch(app, /new EventSource/);
});

test("Project Files tracks dirty state per path and does not use a global dirty flag", () => {
  const page = read("src/features/project-files/ProjectFilesPage.tsx");
  assert.match(page, /dirtyPaths/);
  assert.match(page, /setPathDirty/);
  assert.doesNotMatch(page, /hasDirtyFile/);
});

test("Project file editor uses an IDE engine, not a click-to-edit highlight preview", () => {
  const viewer = read("src/features/project-files/components/CodeViewer.tsx");
  assert.match(viewer, /@monaco-editor\/react/);
  assert.match(viewer, /project-files-monaco-frame/);
  assert.match(viewer, /monaco\.KeyMod\.CtrlCmd \| monaco\.KeyCode\.KeyS/);
  assert.doesNotMatch(viewer, /project-files-code-input/);
  assert.doesNotMatch(viewer, /<textarea/);
  assert.doesNotMatch(viewer, /isEditing/);
  assert.doesNotMatch(viewer, /dangerouslySetInnerHTML/);
});

test("Agent flow marks manual viewport movement and allows node drag autopan", () => {
  const canvas = read("src/features/agent-flow-map/components/AgentFlowCanvas.tsx");
  assert.match(canvas, /onMoveStart=\{handleViewportMoveStart\}/);
  assert.match(canvas, /autoPanOnNodeDrag/);
});

test("SSE consumers share the generic stream hook", () => {
  const workflowStream = read("src/hooks/useEventStream.ts");
  const previewStream = read("src/hooks/usePreviewEvents.ts");
  assert.match(workflowStream, /useSseStream/);
  assert.match(previewStream, /useSseStream/);
});

test("Agent flow does not treat idle runs as live animated execution", () => {
  const builder = read("src/features/agent-flow-map/utils/buildHorusFlowGraph.ts");
  const runData = read("src/features/agent-flow-map/hooks/useRunFlowData.ts");
  const runEvents = read("src/features/agent-flow-map/hooks/useRunFlowEvents.ts");
  const derive = read("src/features/agent-flow-map/utils/deriveHorusRunSnapshot.ts");

  assert.match(builder, /input\.run\.status === "running" \|\| input\.run\.status === "awaiting_human"/);
  assert.match(builder, /if \(run\.status === "running"\) return "active"/);
  assert.doesNotMatch(runData, /"idle", "running"/);
  assert.doesNotMatch(runEvents, /"idle", "running"/);
  assert.match(derive, /if \(state\.status === "idle"\) return null/);
});
