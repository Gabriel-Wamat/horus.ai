import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  FilePreviewSessionStore,
  PreviewSessionNotFoundError,
} from "../dist/infrastructure/preview/FilePreviewSessionStore.js";

const session = {
  id: "22222222-2222-4222-8222-222222222226",
  projectId: "11111111-1111-4111-8111-111111111116",
  status: "waiting",
  route: "/",
  device: { name: "pc", width: 1440, height: 900 },
  previewUrl: "http://localhost:5174/",
  processId: null,
  startedAt: null,
  stoppedAt: null,
  updatedAt: "2026-05-26T10:00:00.000Z",
  errorMessage: null,
};

const event = {
  id: "33333333-3333-4333-8333-333333333336",
  type: "preview_created",
  sessionId: session.id,
  projectId: session.projectId,
  timestamp: "2026-05-26T10:00:01.000Z",
  status: "waiting",
  message: "Preview session created",
  data: {},
};

test("FilePreviewSessionStore persists sessions, timeline events, and drafts", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-sessions-"));
  const store = new FilePreviewSessionStore(baseDir);

  await store.saveSession(session);
  await store.appendEvent(event);
  await store.saveDraft({
    id: "44444444-4444-4444-8444-444444444446",
    sessionId: session.id,
    projectId: session.projectId,
    mode: "visual_edits",
    message: "Reduza a densidade.",
    status: "drafted",
    createdAt: "2026-05-26T10:00:02.000Z",
  });

  const storedSession = await store.getSession(session.id);
  const sessions = await store.listSessions();
  const events = await store.listEvents(session.id);
  const drafts = await store.listDrafts(session.id);
  const rawSession = JSON.parse(
    await readFile(join(baseDir, session.id, "session.json"), "utf-8")
  );

  assert.equal(storedSession.id, session.id);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, session.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "preview_created");
  assert.equal(drafts.length, 1);
  assert.equal(rawSession.projectId, session.projectId);
});

test("FilePreviewSessionStore rejects unknown sessions", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-sessions-"));
  const store = new FilePreviewSessionStore(baseDir);

  await assert.rejects(
    () => store.getSession("99999999-9999-4999-8999-999999999999"),
    PreviewSessionNotFoundError
  );
});
