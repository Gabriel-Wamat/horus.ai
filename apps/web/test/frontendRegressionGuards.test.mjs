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

test("Project Files refreshes from preview workflow file-change notifications", () => {
  const page = read("src/features/project-files/ProjectFilesPage.tsx");
  const events = read("src/features/project-files/utils/projectFilesEvents.ts");
  const consoleSource = read("src/components/VisualPreviewConsole.tsx");

  assert.match(events, /PROJECT_FILES_CHANGED_EVENT/);
  assert.match(events, /emitProjectFilesChanged/);
  assert.match(page, /isProjectFilesChangedEvent/);
  assert.match(page, /refreshChangedFiles/);
  assert.match(page, /refetchOnMount: "always"/);
  assert.match(page, /dirtyPaths\.has\(state\.activePath\)/);
  assert.match(page, /queryKey: \["project-files", "tree", state\.selectedProjectId\]/);
  assert.match(consoleSource, /emitProjectFilesChanged/);
  assert.match(consoleSource, /event\.type !== "patch_applied"/);
  assert.match(consoleSource, /paths: event\.filePaths/);
});

test("Project Files exposes a guarded project ZIP download action", () => {
  const page = read("src/features/project-files/ProjectFilesPage.tsx");
  const toolbar = read("src/features/project-files/components/ProjectFilesToolbar.tsx");
  const api = read("src/api/projectFilesApi.ts");

  assert.match(api, /getDownloadUrl/);
  assert.match(api, /\/project-files\/projects\/\$\{projectId\}\/download/);
  assert.match(page, /downloadProject/);
  assert.match(page, /dirtyPaths\.size > 0/);
  assert.match(page, /window\.location\.assign/);
  assert.match(toolbar, /Baixar projeto como ZIP/);
  assert.match(toolbar, /onDownloadProject/);
  assert.match(toolbar, /<Download size=\{16\}/);
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

test("Preview chat uses the streaming turn endpoint with optimistic local messages", () => {
  const consoleSource = read("src/components/VisualPreviewConsole.tsx");
  const panel = read("src/components/PreviewConversationPanel.tsx");
  const css = read("src/index.css");
  const api = read("src/api/horusChatApi.ts");

  assert.match(api, /submitTurnStream/);
  assert.match(api, /\/horus\/chat\/turn\/stream/);
  assert.match(api, /res\.body\.getReader\(\)/);
  assert.match(consoleSource, /createLocalChatMessage/);
  assert.match(consoleSource, /assistant_text_delta/);
  assert.match(consoleSource, /user_message_persisted/);
  assert.match(consoleSource, /previousIndex/);
  assert.match(consoleSource, /streamWorkflowProgress/);
  assert.match(consoleSource, /\/api\/agent-runs\/\$\{threadId\}\/events/);
  assert.match(consoleSource, /new EventSource/);
  assert.match(consoleSource, /workflow-progress-/);
  assert.match(consoleSource, /selectWorkflowReplayEvents/);
  assert.match(consoleSource, /workflowProgressQueuesRef/);
  assert.match(consoleSource, /workflowActivityFromEvent/);
  assert.match(consoleSource, /setWorkflowActivity/);
  assert.match(consoleSource, /scheduleWorkflowActivityClear/);
  assert.match(consoleSource, /patch_proposed/);
  assert.match(consoleSource, /patch_applied/);
  assert.match(consoleSource, /replayCompleted/);
  assert.match(consoleSource, /isRecentWorkflowMessage/);
  assert.match(consoleSource, /isLegacyWorkflowProgressMessage/);
  assert.match(consoleSource, /contextSnapshot\.workflowThreadId/);
  assert.match(panel, /role="log"/);
  assert.match(panel, /PreviewWorkflowActivity/);
  assert.match(panel, /preview-workflow-activity/);
  assert.match(panel, /previousBodyRef/);
  assert.match(css, /\.preview-chat-message p[\s\S]*white-space: pre-wrap/);
  assert.match(css, /preview-workflow-meter/);
  assert.match(css, /preview-workflow-pulse/);
  assert.doesNotMatch(
    consoleSource,
    /function replaceChatMessage[\s\S]*return mergeChatMessages/
  );
  assert.doesNotMatch(consoleSource, /\.submitTurn\(\{/);
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
