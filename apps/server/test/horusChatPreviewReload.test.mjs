import assert from "node:assert/strict";
import test from "node:test";
import { SubmitHorusChatTurnUseCase } from "../dist/application/usecases/SubmitHorusChatTurnUseCase.js";

const chatSessionId = "11111111-1111-4111-8111-111111111111";
const workspaceFolderId = "22222222-2222-4222-8222-222222222222";
const userStoryId = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";
const previewSessionId = "55555555-5555-4555-8555-555555555555";

test("chat code change reloads the active preview after applying a patch", async () => {
  const now = "2026-06-09T12:00:00.000Z";
  let sequence = 0;
  let reloadCount = 0;
  const messages = [];
  const project = {
    id: projectId,
    name: "Project",
    slug: "project",
    rootPath: "/tmp/project",
    defaultRoute: "/",
    devCommand: "pnpm dev",
    previewCommandId: "dev",
    commandCatalog: [],
    previewUrl: "http://127.0.0.1:5184",
    createdAt: now,
    projectKind: "generated",
    lifecycleStatus: "published",
    visibility: "visible",
    healthStatus: "healthy",
    healthReasons: [],
    canonicalProjectId: null,
    projectWorkspaceId: null,
    appFingerprint: null,
    lastHealthCheckedAt: null,
    archivedAt: null,
    archivedReason: null,
  };
  const previewSession = {
    id: previewSessionId,
    projectId,
    status: "running",
    route: "/",
    device: { name: "pc", width: 1440, height: 900 },
    previewUrl: "http://127.0.0.1:5184",
    processId: 123,
    startedAt: now,
    stoppedAt: null,
    updatedAt: now,
    errorMessage: null,
  };

  const chatMemoryStore = {
    async buildAgentContext() {
      return {
        session: {
          id: chatSessionId,
          workspaceFolderId,
          userStoryId,
          createdAt: now,
          updatedAt: now,
        },
        messages,
        activeUserStory: {
          id: userStoryId,
          title: "Trocar cor visual",
          description: "Como usuario quero alterar a identidade visual.",
          acceptanceCriteria: ["A alteracao visual e aplicada."],
          priority: "high",
          labels: [],
          createdAt: now,
        },
        artifactContext: { workspaceFolderId },
        previousAgentResults: [],
      };
    },
    async appendMessage(_sessionId, input) {
      const message = {
        id: `66666666-6666-4666-8666-${String(++sequence).padStart(12, "0")}`,
        sessionId: chatSessionId,
        sequence,
        role: input.role,
        eventType: input.eventType ?? "message",
        visibility: input.visibility ?? "user",
        deliveryStatus: input.deliveryStatus ?? "persisted",
        body: input.body,
        contextSnapshot: {
          workspaceFolderId,
          userStoryId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.previewSessionId ? { previewSessionId: input.previewSessionId } : {}),
        },
        metadata: input.metadata ?? {},
        createdAt: now,
      };
      messages.push(message);
      return message;
    },
  };

  const useCase = new SubmitHorusChatTurnUseCase(
    chatMemoryStore,
    {
      async listProjects() {
        return [project];
      },
      async getSession() {
        return previewSession;
      },
      async createSession() {
        return { session: previewSession };
      },
      async startSession() {
        return { session: previewSession };
      },
      async stopSession() {
        return { session: { ...previewSession, status: "stopped" } };
      },
      async reloadSession() {
        reloadCount += 1;
        return {
          session: {
            ...previewSession,
            updatedAt: "2026-06-09T12:00:05.000Z",
          },
        };
      },
    },
    {
      async classify() {
        return {
          kind: "code_change",
          mode: "executor",
          confidence: 0.99,
          rationale: "teste",
        };
      },
    },
    {
      async buildContext() {
        return {
          projectId,
          query: "trocar cor",
          inspectedFiles: ["src/styles/tokens.css"],
          files: [],
          excerpts: [],
          omittedFilesCount: 0,
          totalBytes: 0,
          limits: { maxFiles: 1, maxBytesPerFile: 1, maxTotalBytes: 1 },
          retrievalStatus: "matched",
          retrievalNotes: [],
          retrievalStats: {
            totalFiles: 1,
            indexedFiles: 1,
            contentScannedFiles: 1,
            explicitPathCount: 0,
          },
          manifest: null,
          structuralContext: null,
        };
      },
    },
    {
      async answer() {
        return "Feito.";
      },
      async *streamAgent() {
        yield { type: "text", text: "Feito." };
        yield {
          type: "tool_started",
          tool: "apply_code_change_set",
          title: "Aplicando patch",
          filePaths: ["src/styles/tokens.css"],
          fileOperations: [
            {
              path: "src/styles/tokens.css",
              operationType: "apply",
              status: "running",
              additions: 1,
              deletions: 1,
              replacementCount: null,
              diffPreview: "",
              errorMessage: null,
            },
          ],
        };
        yield {
          type: "tool_succeeded",
          tool: "apply_code_change_set",
          title: "Aplicando patch",
          filePaths: ["src/styles/tokens.css"],
          fileOperations: [
            {
              path: "src/styles/tokens.css",
              operationType: "apply",
              status: "applied",
              additions: 1,
              deletions: 1,
              replacementCount: null,
              diffPreview: "",
              errorMessage: null,
            },
          ],
        };
      },
    },
  );

  const events = [];
  for await (const event of useCase.stream({
    chatSessionId,
    message: "troque verde por amarelo",
    projectId,
    workspaceFolderId,
    userStoryId,
    previewSessionId,
  })) {
    events.push(event);
  }

  assert.equal(reloadCount, 1);
  assert.equal(
    events.some(
      (event) =>
        event.type === "action_updated" &&
        event.action === "project_execution_reloaded" &&
        event.previewSessionId === previewSessionId
    ),
    true,
  );
  const completed = events.find((event) => event.type === "turn_completed");
  assert.equal(completed?.response.outcome.previewSessionId, previewSessionId);
});
