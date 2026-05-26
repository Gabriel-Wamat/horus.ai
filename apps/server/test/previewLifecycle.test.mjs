import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { FileFrontendProjectRegistry } from "../dist/infrastructure/preview/FileFrontendProjectRegistry.js";
import { FilePreviewSessionStore } from "../dist/infrastructure/preview/FilePreviewSessionStore.js";
import { NoopBrowserPreviewAdapter } from "../dist/infrastructure/preview/NoopBrowserPreviewAdapter.js";
import { PreviewEventStreamAdapter } from "../dist/infrastructure/preview/PreviewEventStreamAdapter.js";
import { PreviewRuntimeManager } from "../dist/infrastructure/preview/PreviewRuntimeManager.js";

test("PreviewRuntimeManager creates lifecycle timeline and visual instruction draft", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-runtime-"));
  const repoRoot = join(baseDir, "repo");
  await mkdir(join(repoRoot, "apps", "web"), { recursive: true });
  const registry = new FileFrontendProjectRegistry(join(baseDir, "projects"), repoRoot);
  const store = new FilePreviewSessionStore(join(baseDir, "sessions"));
  const eventStream = new PreviewEventStreamAdapter();
  const runtime = new PreviewRuntimeManager(
    registry,
    store,
    new NoopBrowserPreviewAdapter(),
    eventStream
  );
  const projects = await runtime.listProjects();
  const received = [];

  const created = await runtime.createSession({
    projectId: projects[0].id,
    route: "/",
    device: "pc",
  });
  eventStream.subscribe(created.session.id, (event) => received.push(event));

  const started = await runtime.startSession(created.session.id);
  const deviceChanged = await runtime.setDevice(created.session.id, { device: "phone" });
  const drafted = await runtime.createVisualInstructionDraft({
    sessionId: created.session.id,
    mode: "visual_edits",
    message: "Reduza a densidade visual.",
  });
  const stopped = await runtime.stopSession(created.session.id);
  const timeline = await runtime.listTimeline(created.session.id);

  assert.equal(created.event.type, "preview_created");
  assert.equal(started.session.status, "running");
  assert.equal(deviceChanged.session.device.name, "phone");
  assert.equal(drafted.draft.status, "drafted");
  assert.equal(stopped.session.status, "stopped");
  assert.deepEqual(
    timeline.map((event) => event.type),
    [
      "preview_created",
      "preview_started",
      "device_changed",
      "visual_instruction_drafted",
      "preview_stopped",
    ]
  );
  assert.deepEqual(
    received.map((event) => event.type),
    ["preview_started", "device_changed", "visual_instruction_drafted", "preview_stopped"]
  );
});
