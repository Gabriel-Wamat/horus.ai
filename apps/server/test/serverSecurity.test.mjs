import assert from "node:assert/strict";
import express from "express";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readCorsOrigin } from "../dist/infrastructure/http/corsPolicy.js";
import {
  createSecurityBoundaryMiddleware,
  resolveSecurityBoundaryPolicy,
} from "../dist/infrastructure/http/securityBoundary.js";
import { createApp } from "../dist/infrastructure/http/server.js";

test("CORS policy fails closed in production", () => {
  assert.throws(
    () => readCorsOrigin({ NODE_ENV: "production" }),
    /CORS_ORIGIN must be set/
  );
  assert.throws(
    () => readCorsOrigin({ NODE_ENV: "production", CORS_ORIGIN: "*" }),
    /CORS_ORIGIN must be set/
  );
  assert.deepEqual(
    readCorsOrigin({
      NODE_ENV: "production",
      CORS_ORIGIN: "https://app.example.com, https://admin.example.com",
    }),
    ["https://app.example.com", "https://admin.example.com"]
  );
  assert.equal(readCorsOrigin({}), true);
});

test("security boundary protects API requests with token and tenant checks", async () => {
  const app = express();
  app.use(
    "/api",
    createSecurityBoundaryMiddleware(
      resolveSecurityBoundaryPolicy({
        HORUS_AUTH_MODE: "token",
        HORUS_API_TOKEN: "member-token",
        HORUS_TENANT_ID: "tenant-a",
      })
    )
  );
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${baseUrl}/api/ping`)).status, 401);
    assert.equal(
      (
        await fetch(`${baseUrl}/api/ping`, {
          headers: { authorization: "Bearer wrong", "x-horus-tenant-id": "tenant-a" },
        })
      ).status,
      401
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/ping`, {
          headers: { authorization: "Bearer member-token" },
        })
      ).status,
      403
    );
    const response = await fetch(`${baseUrl}/api/ping`, {
      headers: {
        authorization: "Bearer member-token",
        "x-horus-tenant-id": "tenant-a",
      },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await close(server);
  }
});

test("createApp exposes non-secret readiness metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-ready-"));
  const app = await createApp({
    env: {
      PERSISTENCE_DRIVER: "file",
      HORUS_DATA_DIR: join(root, "data"),
      CORS_ORIGIN: "http://localhost:5173",
    },
  });
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      status: "ready",
      persistenceDriver: "file",
      authEnabled: false,
      tenantBoundary: false,
    });
  } finally {
    await close(server);
  }
});

function listen(app) {
  const server = app.listen(0);
  return new Promise((resolve) => server.once("listening", () => resolve(server)));
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}
