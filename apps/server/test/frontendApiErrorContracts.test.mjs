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

test("project files API validates JSON content type and shared response contracts", async () => {
  const source = await readFile(
    join(repositoryRoot, "apps/web/src/api/projectFilesApi.ts"),
    "utf8"
  );

  assert.equal(
    source.includes("response.json() as Promise<ProjectFileListProjectsResponse>"),
    false
  );
  assert.equal(
    source.includes("response.json() as Promise<ProjectFileTreeResponse>"),
    false
  );
  assert.equal(
    source.includes("response.json() as Promise<ProjectFileContentResponse>"),
    false
  );
  assert.equal(
    source.includes("response.json() as Promise<SaveProjectFileResponse>"),
    false
  );
  assert.match(source, /readProjectFilesJson/);
  assert.match(source, /ProjectFileListProjectsResponseSchema/);
  assert.match(source, /ProjectFileTreeResponseSchema/);
  assert.match(source, /ProjectFileContentResponseSchema/);
  assert.match(source, /SaveProjectFileResponseSchema/);
});

test("preview API validates response contracts before exposing visual state", async () => {
  const source = await readFile(
    join(repositoryRoot, "apps/web/src/api/previewApi.ts"),
    "utf8"
  );

  const forbiddenPreviewCasts = [
    "const body = (await res.json()) as { projects: FrontendProject[] }",
    "return res.json() as Promise<PreviewActionResponse>",
    "const body = (await res.json()) as { session: PreviewSession }",
    "const body = (await res.json()) as { events: PreviewEvent[] }",
    "return res.json() as Promise<VisualInstructionDraftResponse>",
  ];

  for (const fragment of forbiddenPreviewCasts) {
    assert.equal(source.includes(fragment), false, fragment);
  }

  assert.match(source, /readPreviewJson/);
  assert.match(source, /FrontendProjectSchema/);
  assert.match(source, /PreviewSessionSchema/);
  assert.match(source, /PreviewEventSchema/);
  assert.match(source, /VisualInstructionDraftSchema/);
  assert.match(source, /PreviewProjectsResponseSchema/);
  assert.match(source, /PreviewActionResponseSchema/);
  assert.match(source, /PreviewTimelineResponseSchema/);
});

test("Horus chat API validates response and stream contracts before exposing chat state", async () => {
  const source = await readFile(
    join(repositoryRoot, "apps/web/src/api/horusChatApi.ts"),
    "utf8"
  );

  const forbiddenHorusChatCasts = [
    "const body = (await res.json()) as { sessions: ChatSession[] }",
    "const body = (await res.json()) as { session: ChatSession }",
    "const body = (await res.json()) as { messages: ChatMessage[] }",
    "return res.json() as Promise<HorusChatTurnResponse>",
    "JSON.parse(data) as HorusChatStreamEvent",
  ];

  for (const fragment of forbiddenHorusChatCasts) {
    assert.equal(source.includes(fragment), false, fragment);
  }

  assert.match(source, /readHorusChatJson/);
  assert.match(source, /parseHorusChatStreamEvent/);
  assert.match(source, /ChatSessionSchema/);
  assert.match(source, /ChatMessageSchema/);
  assert.match(source, /HorusChatTurnResponseSchema/);
  assert.match(source, /HorusChatStreamEventSchema/);
  assert.match(source, /ChatSessionsResponseSchema/);
  assert.match(source, /ChatMessagesResponseSchema/);
});

test("agent skills API validates catalog response contracts before exposing state", async () => {
  const source = await readFile(
    join(repositoryRoot, "apps/web/src/api/agentSkillsApi.ts"),
    "utf8"
  );

  const forbiddenAgentSkillsCasts = [
    "const body = (await response.json()) as { skills: AgentSkillSummary[] }",
    "const body = (await response.json()) as { profiles: AgentProfile[] }",
    "return response.json() as Promise<AgentSkillDetail>",
    "return response.json() as Promise<ValidateAgentSkillResponse>",
    "return response.json() as Promise<CreateAgentSkillResponse>",
    "return response.json() as Promise<PublishAgentSkillResponse>",
    "return response.json() as Promise<{ bindings: AgentSkillDetail[\"bindings\"] }>",
    "return response.json() as Promise<{ skill: AgentSkillSummary }>",
  ];

  for (const fragment of forbiddenAgentSkillsCasts) {
    assert.equal(source.includes(fragment), false, fragment);
  }

  assert.match(source, /readAgentSkillsJson/);
  assert.match(source, /AgentSkillSummarySchema/);
  assert.match(source, /AgentSkillDetailSchema/);
  assert.match(source, /AgentSkillValidationReportSchema/);
  assert.match(source, /AgentProfileSchema/);
  assert.match(source, /AgentSkillsListResponseSchema/);
  assert.match(source, /ValidateAgentSkillResponseSchema/);
  assert.match(source, /CreateAgentSkillResponseSchema/);
  assert.match(source, /PublishAgentSkillResponseSchema/);
  assert.match(source, /AgentSkillBindingsResponseSchema/);
});

test("execution console validates execution task route contracts before exposing state", async () => {
  const hookSource = await readFile(
    join(
      repositoryRoot,
      "apps/web/src/components/execution-console/useExecutionTaskOutputs.ts"
    ),
    "utf8"
  );
  const panelSource = await readFile(
    join(repositoryRoot, "apps/web/src/components/ExecutionConsolePanel.tsx"),
    "utf8"
  );

  const forbiddenExecutionTaskCasts = [
    "const body = (await response.json()) as { tasks?: ExecutionTaskSnapshot[] }",
    "return response.json() as Promise<ExecutionTaskSnapshot>",
    "const body = (await response.json()) as { chunk?: string }",
    "return response.json() as Promise<ExecutionTaskRouteTask>",
    "readExecutionTaskRouteError",
  ];

  for (const fragment of forbiddenExecutionTaskCasts) {
    assert.equal(
      hookSource.includes(fragment) || panelSource.includes(fragment),
      false,
      fragment
    );
  }

  assert.equal(hookSource.includes("ShellCommandResultSchema"), false);
  assert.match(hookSource, /ExecutionTaskRecordSchema/);
  assert.match(hookSource, /ExecutionTaskSnapshotSchema/);
  assert.match(hookSource, /ExecutionTaskListResponseSchema/);
  assert.match(hookSource, /ExecutionTaskOutputResponseSchema/);
  assert.match(hookSource, /readExecutionTaskJson/);
  assert.match(panelSource, /ExecutionTaskSnapshotSchema/);
  assert.match(panelSource, /readExecutionTaskJson/);
  assert.match(panelSource, /requireExecutionTaskOk/);
});

test("workflow API validates workspace response contracts before exposing state", async () => {
  const source = await readFile(
    join(repositoryRoot, "apps/web/src/api/workflowApi.ts"),
    "utf8"
  );

  const forbiddenWorkflowWorkspaceCasts = [
    "const body = (await res.json()) as { folders: WorkspaceFolder[] }",
    "const body = (await res.json()) as { folder: WorkspaceFolder }",
    "const body = (await res.json()) as { userStories: UserStory[] }",
    "const body = (await res.json()) as { userStory: UserStory }",
    "const body = (await res.json()) as { spec: Spec }",
  ];

  for (const fragment of forbiddenWorkflowWorkspaceCasts) {
    assert.equal(source.includes(fragment), false, fragment);
  }

  assert.match(source, /readWorkflowJson/);
  assert.match(source, /WorkspaceFolderSchema/);
  assert.match(source, /UserStorySchema/);
  assert.match(source, /SpecSchema/);
  assert.match(source, /WorkspaceUserStoriesResponseSchema/);
});

test("workflow API validates execution response contracts before exposing state", async () => {
  const source = await readFile(
    join(repositoryRoot, "apps/web/src/api/workflowApi.ts"),
    "utf8"
  );

  const forbiddenWorkflowExecutionCasts = [
    "return res.json() as Promise<StartWorkflowResponse>",
    "return res.json() as Promise<WorkflowState>",
    "return res.json() as Promise<StartProjectConstructionResponse>",
  ];

  for (const fragment of forbiddenWorkflowExecutionCasts) {
    assert.equal(source.includes(fragment), false, fragment);
  }

  assert.match(source, /StartWorkflowResponseSchema/);
  assert.match(source, /WorkflowStateSchema/);
  assert.match(source, /StartProjectConstructionResponseSchema/);
  assert.match(source, /ProjectWorkspaceSchema/);
  assert.match(source, /ProjectConstructionRunSchema/);
  assert.match(source, /FrontendProjectSchema/);
  assert.match(source, /PreviewSessionSchema/);
});

test("workflow API validates LLM settings response contracts before exposing state", async () => {
  const source = await readFile(
    join(repositoryRoot, "apps/web/src/api/workflowApi.ts"),
    "utf8"
  );

  const forbiddenLlmSettingsCasts = [
    "return res.json() as Promise<{ providers: LlmProviderCapability[] }>",
    "const body = (await res.json()) as { profile: LlmSettingsProfile | null }",
    "const body = (await res.json()) as { profile: LlmSettingsProfile }",
    "return res.json() as Promise<{ ok: boolean; message: string; testedAt: string }>",
  ];

  for (const fragment of forbiddenLlmSettingsCasts) {
    assert.equal(source.includes(fragment), false, fragment);
  }

  assert.match(source, /LlmProviderCapabilitySchema/);
  assert.match(source, /LlmSettingsProfileSchema/);
  assert.match(source, /LlmProvidersResponseSchema/);
  assert.match(source, /LlmSettingsNullableProfileResponseSchema/);
  assert.match(source, /LlmSettingsProfileResponseSchema/);
  assert.match(source, /LlmSettingsTestResponseSchema/);
});
