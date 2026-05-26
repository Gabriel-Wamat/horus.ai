import assert from "node:assert/strict";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BrowserPreviewStartError,
  NoopBrowserPreviewAdapter,
} from "../dist/infrastructure/preview/NoopBrowserPreviewAdapter.js";
import { ProcessBrowserPreviewAdapter } from "../dist/infrastructure/preview/ProcessBrowserPreviewAdapter.js";
import { PreviewRuntimeManager } from "../dist/infrastructure/preview/PreviewRuntimeManager.js";
import { PreviewEventStreamAdapter } from "../dist/infrastructure/preview/PreviewEventStreamAdapter.js";
import { FilePreviewSessionStore } from "../dist/infrastructure/preview/FilePreviewSessionStore.js";

function projectFixture(rootPath, devCommand, previewUrl) {
  return {
    id: "11111111-1111-4111-8111-111111111116",
    name: "fixture",
    slug: "fixture",
    rootPath,
    defaultRoute: "/",
    devCommand,
    previewUrl,
    createdAt: "2026-05-26T00:00:00.000Z",
  };
}

function sessionFixture(project, previewUrl) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    projectId: project.id,
    status: "starting",
    route: "/",
    device: { name: "pc", width: 1440, height: 900 },
    previewUrl,
    processId: null,
    startedAt: null,
    stoppedAt: null,
    updatedAt: "2026-05-26T00:00:00.000Z",
    errorMessage: null,
  };
}

test("ProcessBrowserPreviewAdapter starts a real managed preview process and stops it", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "horus-preview-process-"));
  const canonicalRootPath = await realpath(rootPath);
  const previewUrl = "http://127.0.0.1:51749/";
  const probedUrls = [];

  const project = projectFixture(
    rootPath,
    "/bin/sleep 30",
    previewUrl
  );
  const session = sessionFixture(project, previewUrl);
  const adapter = new ProcessBrowserPreviewAdapter({
    startupTimeoutMs: 3_000,
    readinessPollMs: 25,
    killGraceMs: 100,
    allowedExecutables: ["/bin/sleep", "sleep"],
    killProcessGroup: false,
    readinessProbe: async (url) => {
      probedUrls.push(url);
      return true;
    },
  });

  const started = await adapter.start(project, session);
  try {
    assert.equal(started.previewUrl, previewUrl);
    assert.equal(typeof started.processId, "number");
    assert.equal(started.evidence?.["commandId"], `preview:${project.id}`);
    assert.equal(started.evidence?.["cwd"], canonicalRootPath);
    assert.deepEqual(probedUrls, [previewUrl]);
  } finally {
    await adapter.stop({ ...session, processId: started.processId });
  }
  await assert.rejects(
    async () => {
      process.kill(started.processId, 0);
    },
    /kill ESRCH|no such process/i
  );
});

test("ProcessBrowserPreviewAdapter rejects missing dev commands", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "horus-preview-process-"));
  const project = projectFixture(rootPath, null, "http://127.0.0.1:65530/");
  const session = sessionFixture(project, project.previewUrl);
  const adapter = new ProcessBrowserPreviewAdapter({
    startupTimeoutMs: 250,
    readinessPollMs: 25,
  });

  await assert.rejects(
    () => adapter.start(project, session),
    (err) =>
      err instanceof BrowserPreviewStartError &&
      err.evidence["reason"] === "missing_dev_command"
  );
});

test("PreviewRuntimeManager records preview_error when adapter startup fails", async () => {
  class FailingRegistry {
    constructor(project) {
      this.project = project;
    }
    async listProjects() {
      return [this.project];
    }
    async getProject() {
      return this.project;
    }
  }

  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-runtime-error-"));
  const rootPath = await mkdtemp(join(tmpdir(), "horus-preview-root-"));
  const project = projectFixture(rootPath, null, "http://127.0.0.1:65530/");
  const store = new FilePreviewSessionStore(join(baseDir, "sessions"));
  const eventStream = new PreviewEventStreamAdapter();
  const runtime = new PreviewRuntimeManager(
    new FailingRegistry(project),
    store,
    new ProcessBrowserPreviewAdapter({ startupTimeoutMs: 250, readinessPollMs: 25 }),
    eventStream
  );

  const created = await runtime.createSession({ projectId: project.id });
  const started = await runtime.startSession(created.session.id);
  const timeline = await runtime.listTimeline(created.session.id);

  assert.equal(started.session.status, "error");
  assert.equal(started.event.type, "preview_error");
  assert.match(started.session.errorMessage, /no dev command/i);
  assert.deepEqual(
    timeline.map((event) => event.type),
    ["preview_created", "preview_error"]
  );
});

test("NoopBrowserPreviewAdapter keeps existing lifecycle tests available", async () => {
  const project = projectFixture("/tmp", null, "http://localhost:5174/");
  const adapter = new NoopBrowserPreviewAdapter();
  const result = await adapter.start(project, sessionFixture(project, project.previewUrl));

  assert.equal(result.previewUrl, project.previewUrl);
  assert.equal(result.processId, null);
});
