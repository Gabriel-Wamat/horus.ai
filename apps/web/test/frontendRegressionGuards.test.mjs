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

function readVisualPreviewConsoleBundle() {
  return [
    "src/components/VisualPreviewConsole.tsx",
    "src/features/visual-preview/usePreviewChatRuntime.ts",
    "src/features/visual-preview/useProjectChatScope.ts",
    "src/features/visual-preview/useWorkflowProgressRuntime.ts",
    "src/features/visual-preview/useWorkflowFileOperations.ts",
    "src/features/visual-preview/chatTurnStream.ts",
    "src/features/visual-preview/previewChatMessages.ts",
    "src/features/visual-preview/workflowProgress.ts",
    "src/features/visual-preview/projectSelection.ts",
  ].map(read).join("\n");
}

function readStylesheetBundle() {
  return [
    "src/index.css",
    "src/styles/base-shell.css",
    "src/styles/workspace-folders.css",
    "src/styles/modal-forms.css",
    "src/styles/story-cards.css",
    "src/styles/spec-rail.css",
    "src/styles/spec-story-list.css",
    "src/styles/spec-detail.css",
    "src/styles/visual-contract.css",
    "src/styles/preview-conversation.css",
    "src/styles/preview-chat-message.css",
    "src/styles/preview-side-and-canvas.css",
    "src/styles/visual-composer.css",
  ].map(read).join("\n");
}

function readPreviewConversationBundle() {
  return [
    "src/components/PreviewConversationPanel.tsx",
    "src/components/preview-conversation/PreviewChatTurnCard.tsx",
    "src/components/ExecutionConsolePanel.tsx",
  ].map(read).join("\n");
}

function readExecutionConsoleProjectionBundle() {
  return [
    "src/components/execution-console/projections.ts",
    "src/components/execution-console/fileRows.ts",
    "src/components/execution-console/terminalRows.ts",
    "src/components/execution-console/timelineRows.ts",
    "src/components/execution-console/traceRows.ts",
    "src/components/execution-console/validationRows.ts",
    "src/components/execution-console/commandTerms.ts",
    "src/components/execution-console/legacyToolSteps.ts",
    "src/components/execution-console/workflowEventText.ts",
  ].map(read).join("\n");
}

test("App delegates navigation, workspace and workflow runtime to feature hooks", () => {
  const app = read("src/App.tsx");
  assert.match(app, /useAppNavigation/);
  assert.match(app, /useWorkspaceFolders/);
  assert.match(app, /useWorkflowRuntime/);
  assert.doesNotMatch(app, /new EventSource/);
});

test("Shell hides internal sidebar shortcuts", () => {
  const shell = read("src/components/Shell.tsx");

  assert.doesNotMatch(shell, /aria-label="Agents"/);
  assert.doesNotMatch(shell, /title="Agents"/);
  assert.doesNotMatch(shell, /onChangeMode\("agents"\)/);
  assert.doesNotMatch(shell, /<Icon name="agents" \/>/);
  assert.doesNotMatch(shell, />Agents<\/span>/);
  assert.doesNotMatch(shell, /aria-label="Skills"/);
  assert.doesNotMatch(shell, /title="Skills"/);
  assert.doesNotMatch(shell, /onChangeMode\("skills"\)/);
  assert.doesNotMatch(shell, /<Icon name="skills" \/>/);
  assert.doesNotMatch(shell, />Skills<\/span>/);
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
  const chatRuntime = read("src/features/visual-preview/usePreviewChatRuntime.ts");
  const workflowRuntime = read(
    "src/features/visual-preview/useWorkflowProgressRuntime.ts"
  );

  assert.match(events, /PROJECT_FILES_CHANGED_EVENT/);
  assert.match(events, /emitProjectFilesChanged/);
  assert.match(page, /isProjectFilesChangedEvent/);
  assert.match(page, /refreshChangedFiles/);
  assert.match(page, /refetchOnMount: "always"/);
  assert.match(page, /dirtyPaths\.has\(state\.activePath\)/);
  assert.match(page, /queryKey: \["project-files", "tree", state\.selectedProjectId\]/);
  assert.match(consoleSource, /usePreviewChatRuntime/);
  assert.match(chatRuntime, /useWorkflowProgressRuntime/);
  assert.match(workflowRuntime, /emitProjectFilesChanged/);
  assert.match(workflowRuntime, /event\.type !== "patch_applied"/);
  assert.match(workflowRuntime, /tool_call_finished/);
  assert.match(workflowRuntime, /paths: event\.filePaths/);
  assert.ok(
    workflowRuntime.includes(
      "selectedProject.projectWorkspaceId ?? selectedProject.id"
    )
  );
  assert.ok(page.includes("event.detail.selectProject"));
  assert.ok(events.includes('"project-construction"'));
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
  const consoleSource = readVisualPreviewConsoleBundle();
  const consoleComponent = read("src/components/VisualPreviewConsole.tsx");
  const panel = readPreviewConversationBundle();
  const css = readStylesheetBundle();
  const api = read("src/api/horusChatApi.ts");

  assert.match(api, /submitTurnStream/);
  assert.match(api, /\/horus\/chat\/turn\/stream/);
  assert.match(api, /res\.body\.getReader\(\)/);
  assert.match(consoleSource, /createLocalChatMessage/);
  assert.match(consoleSource, /assistant_text_delta/);
  assert.match(consoleSource, /user_message_persisted/);
  assert.match(consoleSource, /setInterval\(\(\) =>/);
  assert.match(consoleSource, /afterSequence/);
  assert.match(consoleSource, /horusChatApi\.listMessages\(/);
  assert.match(consoleSource, /projectWorkspaceFolderId/);
  assert.match(consoleSource, /projectChatWorkspaceFolderId/);
  assert.match(consoleSource, /chatWorkspaceFolderId/);
  assert.match(consoleSource, /chatUserStoryId/);
  assert.match(consoleSource, /isMessageForSelectedProject/);
  assert.match(consoleSource, /useProjectChatScope/);
  assert.match(consoleSource, /selectedProject\?\.id/);
  assert.match(consoleSource, /workflowApi\.listWorkspaceFolders\(\)/);
  assert.match(consoleSource, /findProjectWorkspaceFolder/);
  assert.match(consoleSource, /listWorkspaceStoryArtifacts\(folderId\)/);
  assert.match(consoleSource, /workspaceFolderId: chatWorkspaceFolderId/);
  assert.match(consoleSource, /userStoryId: chatUserStoryId/);
  assert.match(consoleSource, /previousIndex/);
  assert.match(consoleSource, /streamWorkflowProgress/);
  assert.match(consoleSource, /\/api\/agent-runs\/\$\{threadId\}\/events/);
  assert.match(consoleSource, /new EventSource/);
  assert.doesNotMatch(consoleSource, /workflow-progress-/);
  assert.match(consoleSource, /selectWorkflowReplayEvents/);
  assert.doesNotMatch(consoleSource, /workflowProgressQueuesRef/);
  assert.match(consoleSource, /isVisibleChatMessage/);
  assert.match(consoleSource, /deliveryStatus === "streaming"/);
  assert.match(consoleSource, /workflowActivityFromEvent/);
  assert.match(consoleSource, /parseWorkflowProgressEventPayload/);
  assert.doesNotMatch(consoleSource, /JSON\.parse\(event\.data\)/);
  assert.match(consoleSource, /setWorkflowActivity/);
  assert.match(consoleSource, /scheduleWorkflowActivityClear/);
  assert.match(consoleSource, /patch_proposed/);
  assert.match(consoleSource, /patch_applied/);
  assert.match(consoleSource, /tool_call_started/);
  assert.match(consoleSource, /tool_call_finished/);
  assert.match(consoleSource, /tool_call_blocked/);
  assert.match(consoleSource, /node_completed/);
  assert.match(consoleSource, /SSE offline/);
  assert.match(consoleSource, /replayCompleted/);
  assert.match(consoleSource, /events\.some\(isTerminalWorkflowEvent\)/);
  assert.match(consoleSource, /isLegacyWorkflowProgressMessage/);
  assert.match(consoleSource, /contextSnapshot\.workflowThreadId/);
  assert.match(panel, /role="log"/);
  assert.match(panel, /PreviewWorkflowActivity/);
  assert.match(panel, /preview-workflow-activity/);
  assert.match(panel, /<WorkflowLiveActivity activity=\{workflowActivity\} \/>[\s\S]*<VisualInstructionComposer/);
  assert.doesNotMatch(panel, /<\/section>\s*<VisualInstructionComposer/);
  assert.match(panel, /previousBodyRef/);
  assert.match(css, /\.preview-chat-message p[\s\S]*white-space: pre-wrap/);
  assert.match(css, /preview-workflow-meter/);
  assert.match(css, /preview-workflow-pulse/);
  assert.match(css, /\.preview-conversation-panel > \*/);
  assert.match(css, /grid-template-rows: auto auto minmax\(0, 1fr\)/);
  assert.match(css, /\.preview-chat-thread-section \.visual-composer[\s\S]*flex: 0 0 auto/);
  assert.match(css, /\.preview-project-identity > div[\s\S]*min-width: 0/);
  assert.match(css, /\.preview-conversation-config[\s\S]*min-width: 0/);
  assert.match(css, /\.preview-conversation-config \.input,[\s\S]*\.preview-conversation-config \.select[\s\S]*min-width: 0/);
  assert.match(css, /\.visual-composer[\s\S]*width: calc\(100% - 28px\)/);
  assert.doesNotMatch(
    consoleSource,
    /function replaceChatMessage[\s\S]*return mergeChatMessages/
  );
  assert.doesNotMatch(consoleComponent, /submitTurnStream/);
  assert.doesNotMatch(consoleComponent, /assistant_text_delta/);
  assert.doesNotMatch(consoleComponent, /new EventSource/);
  assert.doesNotMatch(consoleComponent, /setInterval\(\(\) =>/);
  assert.doesNotMatch(consoleSource, /\.submitTurn\(\{/);
});

test("Preview chat renders product-grade retry and technical answer states without scope frames", () => {
  const panel = readPreviewConversationBundle();
  const composer = read("src/components/VisualInstructionComposer.tsx");
  const messageMapper = read("src/features/visual-preview/previewChatMessages.ts");
  const streamController = read("src/features/visual-preview/chatTurnStream.ts");
  const runtime = read("src/features/visual-preview/usePreviewChatRuntime.ts");
  const css = readStylesheetBundle();

  assert.doesNotMatch(panel, /ChatScopeBar/);
  assert.doesNotMatch(panel, /preview-chat-scope-bar/);
  assert.doesNotMatch(panel, /Ver inválidos/);
  assert.doesNotMatch(panel, /Ocultar inválidos/);
  assert.doesNotMatch(panel, /preview-project-debug-toggle/);
  assert.doesNotMatch(panel, /preview-project-health-row/);
  assert.doesNotMatch(panel, /preview-project-health-badge/);
  assert.doesNotMatch(panel, /<p className="panel-kicker">Chat<\/p>/);
  assert.doesNotMatch(panel, /<h2 className="panel-title">Histórico<\/h2>/);
  assert.doesNotMatch(panel, /preview-count-pill[\s\S]*chatMessages\.length/);
  assert.match(panel, /ChatTurnCard/);
  assert.match(panel, /parseMessageBlocks/);
  assert.match(panel, /preview-chat-code-block/);
  assert.match(panel, /preview-chat-file-refs/);
  assert.match(panel, /ChatCodingEvidence/);
  assert.match(panel, /preview-chat-coding-evidence/);
  assert.match(panel, /onRetryMessage/);
  assert.match(panel, /Copiar erro/);
  assert.match(composer, /composer-status-row/);
  assert.match(messageMapper, /turnStatus/);
  assert.match(messageMapper, /retryable/);
  assert.match(messageMapper, /codingEvidence/);
  assert.match(messageMapper, /toolSteps/);
  assert.match(messageMapper, /shouldExposeTechnicalEvidence/);
  assert.match(messageMapper, /code_change_completed/);
  assert.match(panel, /isCodeChangeAction/);
  assert.match(panel, /code_change_completed/);
  assert.match(streamController, /turn_cancelled/);
  assert.match(streamController, /completeActiveAssistant/);
  assert.match(streamController, /activeMessage\?\.toolSteps/);
  assert.match(streamController, /turnStatus: "cancelled"/);
  assert.match(runtime, /retryInstruction/);
  assert.match(runtime, /startChatTurn/);
  assert.match(runtime, /useProjectChatScope\(\{\s*selectedProject,\s*workspaceFolderId,\s*userStoryId,\s*onError,\s*\}\)/);
  assert.doesNotMatch(runtime, /onError: \(message\) => onError\(message\)/);
  assert.doesNotMatch(css, /\.preview-chat-scope-bar/);
  assert.doesNotMatch(css, /\.preview-chat-scope-item/);
  assert.doesNotMatch(css, /\.preview-project-debug-toggle/);
  assert.doesNotMatch(css, /\.preview-project-health-row/);
  assert.doesNotMatch(css, /\.preview-project-health-badge/);
  assert.match(css, /\.preview-chat-turn-status/);
  assert.match(css, /\.preview-chat-message-actions/);
  assert.match(css, /\.preview-chat-code-block/);
  assert.match(css, /\.preview-chat-coding-evidence/);
  assert.match(css, /\.composer-status-row/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.preview-console[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
});

test("Preview chat includes a live execution console without backend-specific UI inference", () => {
  const consoleComponent = read("src/components/VisualPreviewConsole.tsx");
  const runtime = read("src/features/visual-preview/usePreviewChatRuntime.ts");
  const workflowRuntime = read(
    "src/features/visual-preview/useWorkflowProgressRuntime.ts"
  );
  const fileRuntime = read("src/features/visual-preview/useWorkflowFileOperations.ts");
  const executionConsole = read("src/components/ExecutionConsolePanel.tsx");
  const executionSections = read(
    "src/components/execution-console/ExecutionConsoleSections.tsx"
  );
  const executionProjection = readExecutionConsoleProjectionBundle();
  const css = readStylesheetBundle();

  assert.ok(consoleComponent.includes("<ExecutionConsolePanel"));
  assert.ok(consoleComponent.includes("workflowThreadId={chatRuntime.activeWorkflowThreadId}"));
  assert.ok(consoleComponent.includes("workflowEvents={chatRuntime.workflowEvents}"));
  assert.ok(consoleComponent.includes("fileOperations={chatRuntime.fileOperations}"));
  assert.ok(runtime.includes("useWorkflowFileOperations(activeWorkflowThreadId)"));
  assert.ok(runtime.includes("activeWorkflowThreadId"));
  assert.ok(runtime.includes("workflowEvents"));
  assert.ok(workflowRuntime.includes("workflowEvents"));
  assert.ok(workflowRuntime.includes("appendWorkflowConsoleEvents(events)"));
  assert.ok(fileRuntime.includes(".listFileOperations"));
  assert.ok(fileRuntime.includes("agentFlowApi.streamFileOperations"));
  assert.ok(executionConsole.includes("ExecutionConsoleHeader"));
  assert.ok(executionConsole.includes("ExecutionTimelineSection"));
  assert.ok(executionConsole.includes("ExecutionTerminalSection"));
  assert.ok(executionConsole.includes("ExecutionValidationSection"));
  assert.ok(executionConsole.includes("ExecutionDiffSection"));
  assert.ok(executionSections.includes("Execution Console"));
  assert.ok(executionSections.includes("Timeline"));
  assert.ok(executionSections.includes("Arquivos"));
  assert.ok(executionSections.includes("Terminal"));
  assert.ok(executionSections.includes("Validação"));
  assert.ok(executionSections.includes("Diff"));
  assert.ok(executionSections.includes("diffPreview"));
  assert.ok(executionProjection.includes('event.type === "command_output"'));
  assert.ok(executionProjection.includes("mergeTerminalOutput"));
  assert.ok(executionSections.includes("terminal-output"));
  assert.ok(executionProjection.includes("event.evidence?.commands"));
  assert.ok(executionProjection.includes("selectValidationChains"));
  assert.ok(executionProjection.includes("selectOperationalTraceRows"));
  assert.ok(executionProjection.includes("traceRowKey"));
  assert.ok(executionProjection.includes("splitCommandTerms"));
  assert.ok(executionProjection.includes("selectTerminalRows"));
  assert.ok(executionProjection.includes("selectLatestFileOperations"));
  assert.ok(executionProjection.includes("selectTimelineRows"));
  assert.ok(executionConsole.includes("stopExecutionTask"));
  assert.ok(executionConsole.includes("/kill"));
  assert.ok(executionConsole.includes("retryExecutionTask"));
  assert.ok(executionConsole.includes("/retry"));
  assert.ok(executionSections.includes("isStoppableTaskStatus"));
  assert.ok(css.includes(".execution-console-panel"));
  assert.ok(css.includes("grid-template-columns: minmax(340px, 390px) minmax(0, 1fr) minmax(300px, 360px)"));
  assert.ok(css.includes(".execution-console-terminal"));
  assert.ok(css.includes(".execution-console-trace-row"));
  assert.ok(css.includes(".trace-step"));
  assert.ok(css.includes(".execution-console-validation-chain"));
  assert.ok(css.includes(".validation-step"));
  assert.ok(css.includes(".execution-console-stop-task"));
  assert.ok(css.includes(".execution-console-retry-task"));
  assert.ok(css.includes(".execution-console-diff-row"));
  assert.ok(css.includes("@media (max-width: 1080px)"));
});

test("Preview console does not keep invalid projects selected in the default list", () => {
  const consoleSource = readVisualPreviewConsoleBundle();

  assert.match(consoleSource, /canShowInDefaultPreviewList/);
  assert.match(consoleSource, /listProjects\(\{\s*visibility: "visible"\s*\}\)/);
  assert.doesNotMatch(consoleSource, /showAllProjects/);
  assert.doesNotMatch(consoleSource, /setShowAllProjects/);
  assert.match(consoleSource, /project\.visibility === "visible"/);
  assert.match(consoleSource, /project\.healthStatus !== "blocked"/);
  assert.match(consoleSource, /project\.lifecycleStatus !== "superseded"/);
  assert.match(consoleSource, /projects\.filter\(canShowInDefaultPreviewList\)/);
  assert.match(consoleSource, /setSelectedProjectId\(fallbackProject\?\.id \?\? ""\)/);
});

test("Spec review renders visualContract compactly without verbose prompt blocks", () => {
  const review = read("src/components/SpecReview.tsx");
  const specDetails = read("src/components/story-spec/StorySpecDetails.tsx");
  const css = readStylesheetBundle();

  assert.match(review, /VisualContractSummary/);
  assert.match(review, /Contrato visual/);
  assert.match(review, /visualContract\.colorPolicy/);
  assert.ok(
    specDetails.includes("<VisualContractSummary visualContract={spec.visualContract}")
  );
  assert.match(css, /\.visual-contract-summary/);
  assert.doesNotMatch(review, /JSON\.stringify\(visualContract/);
});

test("Agent flow marks manual viewport movement and allows node drag autopan", () => {
  const canvas = read("src/features/agent-flow-map/components/AgentFlowCanvas.tsx");
  assert.match(canvas, /onMoveStart=\{handleViewportMoveStart\}/);
  assert.match(canvas, /autoPanOnNodeDrag/);
});

test("Agent flow exposes telemetry JSON picker and live edited files", () => {
  const page = read("src/features/agent-flow-map/AgentFlowPage.tsx");
  const telemetry = read(
    "src/features/agent-flow-map/components/RunTelemetryPanel.tsx"
  );
  const css = read("src/features/agent-flow-map/styles/agent-flow-map.css");

  assert.ok(page.includes("<RunTelemetryPanel run={run} />"));
  assert.ok(telemetry.includes("Logs e JSON por etapa"));
  assert.ok(telemetry.includes("Ingestão de user stories"));
  assert.ok(telemetry.includes("Software concluído"));
  assert.ok(telemetry.includes("Arquivos em tempo real"));
  assert.ok(telemetry.includes("stringifyJson(selectedItem.payload)"));
  assert.ok(telemetry.includes('event.type === "tool_call_started"'));
  assert.ok(telemetry.includes('event.type === "tool_call_blocked"'));
  assert.ok(telemetry.includes('event.type === "tool_call_finished"'));
  assert.ok(css.includes(".agent-flow-telemetry-picker"));
  assert.ok(css.includes(".agent-flow-live-files-list"));
});

test("Dedicated telemetry screen consumes typed file-operation stream", () => {
  const app = read("src/App.tsx");
  const shell = read("src/components/Shell.tsx");
  const api = read("src/features/agent-flow-map/utils/agentFlowApi.ts");
  const page = read("src/features/agent-flow-map/AgentTelemetryPage.tsx");
  const hook = read("src/features/agent-flow-map/hooks/useRunFileOperations.ts");
  const runData = read("src/features/agent-flow-map/hooks/useRunFlowData.ts");
  const css = read("src/features/agent-flow-map/styles/agent-flow-map.css");

  assert.ok(app.includes("<AgentTelemetryPage workflowState={agentFlowState} events={workflow.events} />"));
  assert.ok(shell.includes('onChangeMode("telemetry")'));
  assert.ok(api.includes("/file-operations/stream"));
  assert.ok(api.includes("file_operation"));
  assert.ok(api.includes("project_id"));
  assert.ok(api.includes("limit"));
  assert.ok(api.includes("offset"));
  assert.ok(api.includes("q"));
  assert.ok(api.includes("listRunsWithProjectFallback"));
  assert.ok(hook.includes("streamFileOperations"));
  assert.ok(runData.includes("RUN_LIST_LIMIT = 12"));
  assert.ok(page.includes("Telemetria dedicada"));
  assert.ok(page.includes("Arquivos tocados pelos agentes"));
  assert.ok(page.includes("RUN_SELECTOR_VISIBLE_LIMIT = 8"));
  assert.ok(page.includes("RUN_HISTORY_PAGE_SIZE = 20"));
  assert.ok(page.includes("Histórico de runs"));
  assert.ok(page.includes("agent-telemetry-history-panel"));
  assert.ok(page.includes("selectVisibleRunOptions"));
  assert.ok(page.includes("compactRunTitle"));
  assert.ok(page.includes("operation.operationType"));
  assert.ok(page.includes("operation.status"));
  assert.ok(css.includes(".agent-telemetry-workbench"));
  assert.ok(css.includes(".agent-telemetry-table"));
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

test("Skills screen is backed by the registry API and not static local data", () => {
  const page = read("src/features/agent-skills/AgentSkillsPage.tsx");
  const hook = read("src/features/agent-skills/useAgentSkills.ts");
  const api = read("src/api/agentSkillsApi.ts");

  assert.match(page, /useAgentSkills/);
  assert.match(hook, /agentSkillsApi\.listSkills/);
  assert.match(hook, /agentSkillsApi\.listAgentProfiles/);
  assert.match(hook, /agentSkillsApi\.publishRevision/);
  assert.match(api, /\/agent-profiles/);
  assert.doesNotMatch(page, /sample|mock|placeholder/i);
});

test("Project construction feedback uses system toast instead of rail banners or local paths", () => {
  const app = read("src/App.tsx");
  const hook = read("src/app/useProjectConstructionAction.ts");
  const workspace = read("src/components/StorySpecWorkspace.tsx");
  const css = readStylesheetBundle();

  assert.match(app, /ProjectConstructionNotification/);
  assert.match(app, /system-toast-region/);
  assert.match(hook, /Software pronto/);
  assert.match(hook, /workflowApi[\s\S]*\.getStatus/);
  assert.ok(hook.includes("emitProjectFilesChanged"));
  assert.ok(hook.includes("projectId: result.projectWorkspace.id"));
  assert.ok(hook.includes('source: "project-construction"'));
  assert.ok(hook.includes("selectProject: true"));
  assert.doesNotMatch(hook, /projectWorkspace\.rootPath/);
  assert.doesNotMatch(workspace, /constructionNotice/);
  assert.doesNotMatch(workspace, /success-banner[\s\S]*construction/);
  assert.match(css, /\.system-toast/);
  assert.match(css, /\.system-toast-success/);
});
