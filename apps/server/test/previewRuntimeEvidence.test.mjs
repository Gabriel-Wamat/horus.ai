import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PreviewRuntimeManager } from "../dist/infrastructure/preview/PreviewRuntimeManager.js";
import { PreviewEventStreamAdapter } from "../dist/infrastructure/preview/PreviewEventStreamAdapter.js";
import { FilePreviewSessionStore } from "../dist/infrastructure/preview/FilePreviewSessionStore.js";
import { BrowserPreviewStartError } from "../dist/infrastructure/preview/NoopBrowserPreviewAdapter.js";

function projectFixture(rootPath) {
  return {
    id: "11111111-1111-4111-8111-111111111116",
    name: "fixture",
    slug: "fixture",
    rootPath,
    defaultRoute: "/",
    devCommand: null,
    previewCommandId: "dev",
    commandCatalog: [],
    previewUrl: "http://localhost:5174",
    createdAt: "2026-05-26T00:00:00.000Z",
  };
}

class FixtureRegistry {
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

test("PreviewRuntimeManager stores preview_ready with sanitized bounded runtime evidence", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-evidence-"));
  const rootPath = await mkdtemp(join(tmpdir(), "horus-preview-root-"));
  const project = projectFixture(rootPath);
  const longTail = `${"x".repeat(2300)} token=secret-value`;
  const adapter = {
    async start() {
      return {
        previewUrl: "http://localhost:5174/",
        processId: 12345,
        evidence: {
          commandId: "dev",
          executable: "pnpm",
          args: ["--filter", "@u-build/web", "dev", "--api-key=secret"],
          cwd: rootPath,
          processId: 12345,
          stdoutTail: "ready",
          stderrTail: longTail,
          exitCode: null,
          signal: null,
          durationMs: 321,
        },
      };
    },
    async stop() {},
    async reload() {},
  };
  const runtime = new PreviewRuntimeManager(
    new FixtureRegistry(project),
    new FilePreviewSessionStore(join(baseDir, "sessions")),
    adapter,
    new PreviewEventStreamAdapter()
  );

  const created = await runtime.createSession({ projectId: project.id });
  const started = await runtime.startSession(created.session.id);
  const timeline = await runtime.listTimeline(created.session.id);
  const ready = timeline.find((event) => event.type === "preview_ready");

  assert.equal(started.event.type, "preview_ready");
  assert.ok(ready);
  assert.equal(ready.data.runtimeEvidence.commandId, "dev");
  assert.equal(ready.data.runtimeEvidence.processId, 12345);
  assert.equal(ready.data.runtimeEvidence.durationMs, 321);
  assert.equal(ready.data.runtimeEvidence.previewUrl, "http://localhost:5174/");
  assert.ok(ready.data.runtimeEvidence.stderrTail.length <= 2000);
  assert.doesNotMatch(ready.data.runtimeEvidence.stderrTail, /secret-value/);
  assert.doesNotMatch(ready.data.runtimeEvidence.args.join(" "), /secret/);
  assert.equal(ready.data.runtimeEvidence.args.at(-1), "--api-key=[redacted]");
  assert.deepEqual(
    timeline.map((event) => event.type),
    ["preview_created", "preview_started", "preview_ready"]
  );
});

test("PreviewRuntimeManager stores preview_error with sanitized runtime evidence", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-evidence-"));
  const rootPath = await mkdtemp(join(tmpdir(), "horus-preview-root-"));
  const project = projectFixture(rootPath);
  const adapter = {
    async start() {
      throw new BrowserPreviewStartError("Preview failed", {
        commandId: "dev",
        executable: "pnpm",
        cwd: rootPath,
        processId: 12345,
        stderrTail: "authorization=super-secret failure",
        exitCode: 1,
        signal: null,
        durationMs: 87,
        reason: "process_exited_before_ready",
      });
    },
    async stop() {},
    async reload() {},
  };
  const runtime = new PreviewRuntimeManager(
    new FixtureRegistry(project),
    new FilePreviewSessionStore(join(baseDir, "sessions")),
    adapter,
    new PreviewEventStreamAdapter()
  );

  const created = await runtime.createSession({ projectId: project.id });
  const started = await runtime.startSession(created.session.id);

  assert.equal(started.session.status, "error");
  assert.equal(started.event.type, "preview_error");
  assert.equal(started.event.data.runtimeEvidence.commandId, "dev");
  assert.equal(started.event.data.runtimeEvidence.exitCode, 1);
  assert.equal(started.event.data.runtimeEvidence.reason, "process_exited_before_ready");
  assert.doesNotMatch(started.event.data.runtimeEvidence.stderrTail, /super-secret/);
  assert.match(started.event.data.runtimeEvidence.stderrTail, /\[redacted\]/);
});

