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
