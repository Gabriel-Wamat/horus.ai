import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkflowInitialGraphState,
  buildWorkflowInitialStorageState,
} from "../dist/domain/services/WorkflowStartState.js";

const workspaceFolderId = "55555555-5555-4555-8555-555555555555";
const threadId = "99999999-9999-4999-8999-999999999999";
const projectWorkspaceId = "88888888-8888-4888-8888-888888888888";
const frontendProjectId = "33333333-3333-4333-8333-333333333333";
const previewSessionId = "44444444-4444-4444-8444-444444444444";
const sourceChatSessionId = "66666666-6666-4666-8666-666666666666";
const sourceChatMessageId = "77777777-7777-4777-8777-777777777777";
const startedAt = "2026-05-30T10:00:00.000Z";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Executar projeto",
  description: "Como usuario, quero que o agente rode e valide o projeto.",
  acceptanceCriteria: ["Build, teste e preview devem gerar evidencia"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-30T09:00:00.000Z",
};

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: userStory.id,
  version: 1,
  summary: "Criar console de execucao",
  technicalApproach: "Unificar comandos e evidencia no fluxo.",
  components: [],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-05-30T09:01:00.000Z",
};

const artifactContext = {
  workspaceFolderId,
  constructionRunId: "12121212-1212-4212-8212-121212121212",
};

test("workflow start builder keeps graph input and persisted snapshot in sync", () => {
  const options = {
    workspaceFolderId,
    userStories: [userStory],
    workspaceArtifactContext: { [userStory.id]: artifactContext },
    initialSpecs: { [userStory.id]: spec },
    workflowMode: "chat_code_change",
    projectWorkspaceId,
    frontendProjectId,
    frontendProjectRootPath: "/tmp/project",
    previewSessionId,
    sourceChatSessionId,
    sourceChatMessageId,
    executionBrief: "Corrigir build e validar no preview.",
  };

  const graphState = buildWorkflowInitialGraphState({
    options,
    threadId,
    workflowMode: options.workflowMode,
  });
  const storageState = buildWorkflowInitialStorageState({
    options,
    threadId,
    workflowMode: options.workflowMode,
    startedAt,
  });

  for (const key of [
    "threadId",
    "workspaceFolderId",
    "projectWorkspaceId",
    "frontendProjectId",
    "frontendProjectRootPath",
    "previewSessionId",
    "workflowMode",
    "sourceChatSessionId",
    "sourceChatMessageId",
    "executionBrief",
    "userStories",
    "currentUSIndex",
    "specs",
    "workspaceArtifactContext",
    "humanFeedback",
    "agentResults",
    "status",
  ]) {
    assert.deepEqual(storageState[key], graphState[key], key);
  }
  assert.deepEqual(graphState.routingDecision, []);
  assert.deepEqual(graphState.curatorFeedback, {});
  assert.equal(graphState.retryCount, 0);
  assert.equal(graphState.pendingRetryApproval, null);
  assert.deepEqual(storageState.pendingCheckpoints, []);
  assert.deepEqual(storageState.validationGates, []);
  assert.equal(storageState.startedAt, startedAt);
});
