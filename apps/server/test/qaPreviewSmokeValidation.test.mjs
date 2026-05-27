import assert from "node:assert/strict";
import test from "node:test";
import { QaPreviewSmokeValidationService } from "../dist/infrastructure/preview/QaPreviewSmokeValidationService.js";

const sessionId = "22222222-2222-4222-8222-222222222222";
const projectId = "11111111-1111-4111-8111-111111111111";
const previewUrl = "http://127.0.0.1:5174/";

function sessionFixture(overrides = {}) {
  return {
    id: sessionId,
    projectId,
    status: "running",
    route: "/",
    device: { name: "pc", width: 1440, height: 900 },
    previewUrl,
    processId: 1234,
    startedAt: "2026-05-26T00:00:00.000Z",
    stoppedAt: null,
    updatedAt: "2026-05-26T00:00:01.000Z",
    errorMessage: null,
    ...overrides,
  };
}

function previewReadyEvent(runtimeEvidence = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    type: "preview_ready",
    sessionId,
    projectId,
    timestamp: "2026-05-26T00:00:01.000Z",
    status: "running",
    message: "Preview session ready",
    data: {
      previewUrl,
      runtimeEvidence: {
        commandId: "dev",
        executable: "pnpm",
        cwd: "/tmp/project",
        previewUrl,
        ...runtimeEvidence,
      },
    },
  };
}

class FakePreviewRuntime {
  constructor(session, timeline = []) {
    this.session = session;
    this.timeline = timeline;
  }

  async getSession() {
    return this.session;
  }

  async listTimeline() {
    return this.timeline;
  }
}

test("QA preview smoke passes only for a running HTML preview with runtime evidence", async () => {
  const service = new QaPreviewSmokeValidationService(
    new FakePreviewRuntime(sessionFixture(), [previewReadyEvent()]),
    {
      fetcher: async (url) => {
        assert.equal(url, previewUrl);
        return new Response("<main>ready</main>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    }
  );

  const result = await service.validate(sessionId);

  assert.equal(result.status, "passed");
  assert.equal(result.reason, "preview_reachable");
  assert.equal(result.previewSessionId, sessionId);
  assert.equal(result.previewUrl, previewUrl);
  assert.equal(result.statusCode, 200);
  assert.match(result.contentType, /text\/html/);
  assert.ok(result.bodyBytes > 0);
  assert.equal(result.runtimeEvidence.commandId, "dev");
});

test("QA preview smoke blocks when preview is not running", async () => {
  const service = new QaPreviewSmokeValidationService(
    new FakePreviewRuntime(sessionFixture({ status: "waiting" }), [])
  );

  const result = await service.validate(sessionId);

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "preview_not_running:waiting");
  assert.equal(result.previewStatus, "waiting");
  assert.equal(result.statusCode, undefined);
});

test("QA preview smoke blocks running previews without startup evidence", async () => {
  const service = new QaPreviewSmokeValidationService(
    new FakePreviewRuntime(sessionFixture(), []),
    {
      fetcher: async () => {
        throw new Error("fetch should not run without runtime evidence");
      },
    }
  );

  const result = await service.validate(sessionId);

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "missing_runtime_evidence");
});

test("QA preview smoke fails when preview response is not HTML", async () => {
  const service = new QaPreviewSmokeValidationService(
    new FakePreviewRuntime(sessionFixture(), [previewReadyEvent()]),
    {
      fetcher: async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    }
  );

  const result = await service.validate(sessionId);

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "preview_not_html");
  assert.equal(result.statusCode, 200);
});
