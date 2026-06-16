import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import test from "node:test";
import express from "express";
import {
  createApiErrorHandler,
  createApiNotFoundHandler,
  createApp,
} from "../dist/infrastructure/http/server.js";
import { createLlmSettingsRouter } from "../dist/infrastructure/http/routes/llmSettingsRoutes.js";
import { createProjectConstructionRouter } from "../dist/infrastructure/http/routes/projectConstructionRoutes.js";
import { createAgentRunFlowRouter } from "../dist/infrastructure/http/routes/agentRunFlowRoutes.js";
import { createEventRouter } from "../dist/infrastructure/http/routes/eventRoutes.js";
import { createPreviewRouter } from "../dist/infrastructure/http/routes/previewRoutes.js";
import { createWorkflowRouter } from "../dist/infrastructure/http/routes/workflowRoutes.js";
import { NoopBrowserPreviewAdapter } from "../dist/infrastructure/preview/NoopBrowserPreviewAdapter.js";

const loopbackHost = ["127", "0", "0", "1"].join(".");
const repositoryRoot = process.cwd();
const httpRouteFiles = [
  "apps/server/src/infrastructure/http/routes/agentDebugTraceRoutes.ts",
  "apps/server/src/infrastructure/http/routes/agentRunFlowRoutes.ts",
  "apps/server/src/infrastructure/http/routes/agentSkillRoutes.ts",
  "apps/server/src/infrastructure/http/routes/chatRoutes.ts",
  "apps/server/src/infrastructure/http/routes/codingRoutes.ts",
  "apps/server/src/infrastructure/http/routes/executionTaskRoutes.ts",
  "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts",
  "apps/server/src/infrastructure/http/routes/llmSettingsRoutes.ts",
  "apps/server/src/infrastructure/http/routes/opsControlPlaneRoutes.ts",
  "apps/server/src/infrastructure/http/routes/previewRoutes.ts",
  "apps/server/src/infrastructure/http/routes/projectConstructionRoutes.ts",
  "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts",
  "apps/server/src/infrastructure/http/routes/workflowRoutes.ts",
  "apps/server/src/infrastructure/http/routes/workspaceRoutes.ts",
];

test("mounted app returns JSON for missing API routes instead of SPA HTML", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "horus-http-contract-"));
  const webDistDir = join(sandbox, "web-dist");
  await mkdir(webDistDir, { recursive: true });
  await writeFile(
    join(webDistDir, "index.html"),
    "<!doctype html><html><body><main>VM shell</main></body></html>"
  );

  const app = await createApp({
    env: {
      HORUS_REPOSITORY_ROOT: sandbox,
      HORUS_DATA_DIR: join(sandbox, ".horus", "data"),
      HORUS_WEB_DIST_DIR: webDistDir,
      HORUS_PUBLIC_HOST: "vm-browser.example",
      PERSISTENCE_DRIVER: "file",
    },
    previewAdapter: new NoopBrowserPreviewAdapter(),
  });
  const server = await listen(app);

  try {
    const baseUrl = `http://${loopbackHost}:${server.address().port}`;
    const apiResponse = await fetch(`${baseUrl}/api/not-a-real-route`, {
      headers: { Accept: "application/json" },
    });
    const apiBody = await apiResponse.json();

    assert.equal(apiResponse.status, 404);
    assert.equal(hasJsonContentType(apiResponse), true);
    assert.deepEqual(apiBody, {
      error: "api_route_not_found",
      message: "API route not found",
      path: "/api/not-a-real-route",
    });

    const spaResponse = await fetch(`${baseUrl}/workspace/anything`);
    const spaBody = await spaResponse.text();

    assert.equal(spaResponse.status, 200);
    assert.equal(spaBody.includes("VM shell"), true);
  } finally {
    await close(server);
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("API error handler preserves JSON contract for forwarded route errors", async () => {
  const app = express();
  app.get("/api/boom", (_req, _res, next) => {
    const err = new Error("contract failed");
    Object.assign(err, { status: 409 });
    next(err);
  });
  app.use("/api", createApiNotFoundHandler());
  app.use(createApiErrorHandler());
  const server = await listen(app);

  try {
    const baseUrl = `http://${loopbackHost}:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/boom`);
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(hasJsonContentType(response), true);
    assert.deepEqual(body, {
      error: "api_request_failed",
      message: "contract failed",
      path: "/api/boom",
    });
  } finally {
    await close(server);
  }
});

test("LLM settings routes return JSON when persistence dependency fails", async () => {
  const app = express();
  app.use(
    "/api/llm",
    createLlmSettingsRouter({
      credentials: {
        listProviders() {
          return [];
        },
        async getDefaultProfile() {
          throw new Error("credential store unavailable");
        },
      },
      resolver: {},
    })
  );
  app.use("/api", createApiNotFoundHandler());
  app.use(createApiErrorHandler());
  const server = await listen(app);

  try {
    const baseUrl = `http://${loopbackHost}:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/llm/settings`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(hasJsonContentType(response), true);
    assert.deepEqual(body, {
      error: "Internal server error",
      message: "credential store unavailable",
    });
  } finally {
    await close(server);
  }
});

test("project construction routes return JSON when repository dependency fails", async () => {
  const app = express();
  app.use(
    "/api/project-construction",
    createProjectConstructionRouter({
      startUseCase: {},
      projectConstruction: {
        async listProjectWorkspaces() {
          throw new Error("workspace repository unavailable");
        },
      },
    })
  );
  app.use("/api", createApiNotFoundHandler());
  app.use(createApiErrorHandler());
  const server = await listen(app);

  try {
    const baseUrl = `http://${loopbackHost}:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/project-construction/workspaces`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(hasJsonContentType(response), true);
    assert.deepEqual(body, {
      error: "Internal server error",
      message: "workspace repository unavailable",
    });
  } finally {
    await close(server);
  }
});

test("workflow routes preserve dependency failure details in JSON responses", async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/workflow",
    createWorkflowRouter({
      startUseCase: {
        async execute() {
          throw new Error("workflow start dependency unavailable");
        },
      },
      resumeUseCase: {
        async execute() {
          throw new Error("workflow resume dependency unavailable");
        },
      },
      retryDecisionUseCase: {
        async execute() {
          throw new Error("workflow retry dependency unavailable");
        },
      },
      statusUseCase: {
        async execute(input) {
          if (input.threadId === "11111111-1111-4111-8111-111111111111") {
            throw new Error("workflow status dependency unavailable");
          }
          throw new Error("workflow download dependency unavailable");
        },
      },
    })
  );
  app.use("/api", createApiNotFoundHandler());
  app.use(createApiErrorHandler());
  const server = await listen(app);

  try {
    const baseUrl = `http://${loopbackHost}:${server.address().port}`;
    const cases = [
      {
        method: "POST",
        path: "/api/workflow/start",
        body: {},
        message: "workflow start dependency unavailable",
      },
      {
        method: "POST",
        path: "/api/workflow/resume",
        body: {},
        message: "workflow resume dependency unavailable",
      },
      {
        method: "POST",
        path: "/api/workflow/retry-decision",
        body: {},
        message: "workflow retry dependency unavailable",
      },
      {
        method: "GET",
        path: "/api/workflow/status/11111111-1111-4111-8111-111111111111",
        message: "workflow status dependency unavailable",
      },
      {
        method: "GET",
        path: "/api/workflow/download/22222222-2222-4222-8222-222222222222",
        message: "workflow download dependency unavailable",
      },
    ];

    for (const item of cases) {
      const response = await fetch(`${baseUrl}${item.path}`, {
        method: item.method,
        ...(item.body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item.body),
            }
          : {}),
      });
      const body = await response.json();

      assert.equal(response.status, 500, item.path);
      assert.equal(hasJsonContentType(response), true, item.path);
      assert.deepEqual(
        body,
        {
          error: "Internal server error",
          message: item.message,
        },
        item.path
      );
    }
  } finally {
    await close(server);
  }
});

test("agent run scoped routes reject missing runs before returning empty payloads or streams", async () => {
  const app = express();
  const snapshotBuilder = {
    async hasRun() {
      return false;
    },
    async getRun() {
      return null;
    },
    async listEvents() {
      throw new Error("listEvents should not be called for a missing run");
    },
    async listEventsAfter() {
      throw new Error("listEventsAfter should not be called for a missing run");
    },
    async listFileOperations() {
      throw new Error("listFileOperations should not be called for a missing run");
    },
    async listFileOperationsAfter() {
      throw new Error("listFileOperationsAfter should not be called for a missing run");
    },
  };
  const eventStream = {
    subscribe() {
      throw new Error("event stream should not subscribe for a missing run");
    },
  };
  app.use(
    "/api/agent-runs",
    createAgentRunFlowRouter({ snapshotBuilder, eventStream })
  );
  app.use("/api", createApiNotFoundHandler());
  app.use(createApiErrorHandler());
  const server = await listen(app);

  try {
    const baseUrl = `http://${loopbackHost}:${server.address().port}`;
    const routes = [
      "/api/agent-runs/missing-run/events",
      "/api/agent-runs/missing-run/events/stream?since_sequence=0",
      "/api/agent-runs/missing-run/file-operations",
      "/api/agent-runs/missing-run/file-operations/stream?since_sequence=0",
    ];

    for (const route of routes) {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: { Accept: "application/json" },
      });
      const body = await response.json();

      assert.equal(response.status, 404, route);
      assert.equal(hasJsonContentType(response), true, route);
      assert.deepEqual(body, { error: "Run not found" }, route);
    }
  } finally {
    await close(server);
  }
});

test("workflow event stream rejects missing threads before opening SSE", async () => {
  const app = express();
  const storage = {
    async load() {
      return null;
    },
  };
  const events = {
    subscribe() {
      throw new Error("event stream should not subscribe for a missing thread");
    },
  };
  app.use("/api/events", createEventRouter(events, { storage }));
  app.use("/api", createApiNotFoundHandler());
  app.use(createApiErrorHandler());
  const server = await listen(app);

  try {
    const baseUrl = `http://${loopbackHost}:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/events/missing-thread`, {
      headers: { Accept: "application/json" },
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(hasJsonContentType(response), true);
    assert.deepEqual(body, { error: "Workflow thread not found" });
  } finally {
    await close(server);
  }
});

test("workflow event stream emits structured error when subscription fails after opening", async () => {
  const threadId = "11111111-1111-4111-8111-111111111111";
  const app = express();
  const storage = {
    async load() {
      return { threadId };
    },
  };
  const events = {
    subscribe() {
      throw new Error("workflow event bus unavailable");
    },
  };
  app.use("/api/events", createEventRouter(events, { storage }));
  app.use("/api", createApiNotFoundHandler());
  app.use(createApiErrorHandler());
  const server = await listen(app);

  try {
    const baseUrl = `http://${loopbackHost}:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/events/${threadId}`, {
      headers: { Accept: "text/event-stream" },
    });
    const event = readFirstSseData(await response.text());

    assert.equal(response.status, 200);
    assert.equal(
      (response.headers.get("content-type") ?? "").includes("text/event-stream"),
      true
    );
    assert.deepEqual(
      {
        type: event.type,
        threadId: event.threadId,
        message: event.message,
      },
      {
        type: "error",
        threadId,
        message: "workflow event bus unavailable",
      }
    );
  } finally {
    await close(server);
  }
});

test("agent run streams emit structured failures when live subscription fails", async () => {
  const threadId = "11111111-1111-4111-8111-111111111111";
  const snapshotBuilder = {
    async hasRun() {
      return true;
    },
    async getRun() {
      return { threadId };
    },
    async listEvents() {
      return [];
    },
    async listEventsAfter() {
      return [];
    },
    async listFileOperations() {
      return [];
    },
    async listFileOperationsAfter() {
      return [];
    },
  };
  const eventStream = {
    subscribe() {
      throw new Error("agent run event bus unavailable");
    },
  };
  const app = express();
  app.use(
    "/api/agent-runs",
    createAgentRunFlowRouter({ snapshotBuilder, eventStream })
  );
  app.use("/api", createApiNotFoundHandler());
  app.use(createApiErrorHandler());
  const server = await listen(app);

  try {
    const baseUrl = `http://${loopbackHost}:${server.address().port}`;
    const eventResponse = await fetch(
      `${baseUrl}/api/agent-runs/${threadId}/events/stream?since_sequence=0`,
      { headers: { Accept: "text/event-stream" } }
    );
    const event = readFirstSseData(await eventResponse.text());

    assert.equal(eventResponse.status, 200);
    assert.equal(event.type, "error");
    assert.equal(event.threadId, threadId);
    assert.equal(event.sequence, 1);
    assert.equal(event.errorMessage, "agent run event bus unavailable");

    const fileOperationResponse = await fetch(
      `${baseUrl}/api/agent-runs/${threadId}/file-operations/stream?since_sequence=0`,
      { headers: { Accept: "text/event-stream" } }
    );
    const operation = readFirstSseData(await fileOperationResponse.text());

    assert.equal(fileOperationResponse.status, 200);
    assert.equal(operation.threadId, threadId);
    assert.equal(operation.sequence, 1);
    assert.equal(operation.path, "<agent-run-file-operation-stream>");
    assert.equal(operation.operationType, "unknown");
    assert.equal(operation.status, "failed");
    assert.equal(operation.errorMessage, "agent run event bus unavailable");
  } finally {
    await close(server);
  }
});

test("preview event stream emits structured failure when subscription dependency fails", async () => {
  const session = {
    id: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    status: "running",
    route: "/",
    device: { name: "pc", width: 1440, height: 900 },
    previewUrl: `http://${loopbackHost}:5173`,
    processId: null,
    startedAt: null,
    stoppedAt: null,
    updatedAt: "2026-06-09T12:00:00.000Z",
    errorMessage: null,
  };
  const app = express();
  app.use(
    "/api/preview",
    createPreviewRouter({
      listProjectsUseCase: {},
      createSessionUseCase: {},
      startSessionUseCase: {},
      stopSessionUseCase: {},
      reloadSessionUseCase: {},
      getSessionUseCase: {
        async execute() {
          return session;
        },
      },
      setDeviceUseCase: {},
      listTimelineUseCase: {},
      createInstructionDraftUseCase: {},
      eventStream: {
        subscribe() {
          throw new Error("preview event bus unavailable");
        },
      },
    })
  );
  app.use("/api", createApiNotFoundHandler());
  app.use(createApiErrorHandler());
  const server = await listen(app);

  try {
    const baseUrl = `http://${loopbackHost}:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/preview/events/${session.id}`, {
      headers: { Accept: "text/event-stream" },
    });
    const event = readFirstSseData(await response.text());

    assert.equal(response.status, 200);
    assert.equal(
      (response.headers.get("content-type") ?? "").includes("text/event-stream"),
      true
    );
    assert.equal(event.type, "preview_error");
    assert.equal(event.sessionId, session.id);
    assert.equal(event.projectId, session.projectId);
    assert.equal(event.status, "error");
    assert.equal(event.message, "preview event bus unavailable");
    assert.equal(
      event.data.errorCode,
      "preview_event_stream_subscribe_failed"
    );
  } finally {
    await close(server);
  }
});

test("HTTP route handlers keep caught errors visible to route contracts", async () => {
  const violations = [];
  for (const file of httpRouteFiles) {
    const source = await readFile(join(repositoryRoot, file), "utf8");
    if (source.includes("catch {")) violations.push(file);
  }

  assert.deepEqual(violations, []);
});

function hasJsonContentType(response) {
  return (response.headers.get("content-type") ?? "").includes("application/json");
}

function readFirstSseData(text) {
  const dataLine = text
    .split("\n")
    .find((line) => line.startsWith("data: "));
  assert.ok(dataLine, `Expected SSE data line in ${JSON.stringify(text)}`);
  return JSON.parse(dataLine.slice("data: ".length));
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, loopbackHost, () => resolve(server));
    server.on("error", reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
