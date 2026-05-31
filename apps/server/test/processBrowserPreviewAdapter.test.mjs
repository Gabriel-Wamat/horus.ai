import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
    previewCommandId: "dev",
    commandCatalog: devCommand
      ? [
          {
            id: "dev",
            label: "Dev",
            executable: devCommand.split(" ")[0],
            args: devCommand.split(" ").slice(1),
            cwd: ".",
            env: {},
          },
        ]
      : [],
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

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.ok(address);
  return `http://127.0.0.1:${address.port}/`;
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function readJsonFileEventually(path, timeoutMs = 2_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch (err) {
      lastError = err;
      await delay(25);
    }
  }
  throw lastError;
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
    assert.equal(started.evidence?.["commandId"], "dev");
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

test("ProcessBrowserPreviewAdapter does not inherit arbitrary process env by default", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "horus-preview-env-"));
  const outputPath = join(rootPath, "env-output.json");
  const previewUrl = "http://127.0.0.1:51750/";
  const originalSecret = process.env.HORUS_SECRET_PROBE;
  process.env.HORUS_SECRET_PROBE = "leak-me-not";

  const script = [
    "const fs=require('node:fs');",
    `fs.writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({`,
    "secret: process.env.HORUS_SECRET_PROBE ?? null,",
    "explicit: process.env.HORUS_EXPLICIT_PROBE ?? null,",
    "hasPath: Boolean(process.env.PATH)",
    "}));",
    "setTimeout(()=>{}, 30000);",
  ].join("");
  const project = {
    ...projectFixture(rootPath, null, previewUrl),
    previewCommandId: "dev",
    commandCatalog: [
      {
        id: "dev",
        label: "Dev",
        executable: process.execPath,
        args: ["-e", script],
        cwd: ".",
        env: { HORUS_EXPLICIT_PROBE: "allowed" },
      },
    ],
  };
  const session = sessionFixture(project, previewUrl);
  const adapter = new ProcessBrowserPreviewAdapter({
    startupTimeoutMs: 3_000,
    readinessPollMs: 25,
    killGraceMs: 100,
    allowedExecutables: [process.execPath],
    killProcessGroup: false,
    readinessProbe: async () => true,
  });

  const started = await adapter.start(project, session);
  try {
    const envSnapshot = await readJsonFileEventually(outputPath);
    assert.equal(envSnapshot.secret, null);
    assert.equal(envSnapshot.explicit, "allowed");
    assert.equal(envSnapshot.hasPath, true);
  } finally {
    await adapter.stop({ ...session, processId: started.processId });
    if (originalSecret === undefined) {
      delete process.env.HORUS_SECRET_PROBE;
    } else {
      process.env.HORUS_SECRET_PROBE = originalSecret;
    }
  }
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
      err.evidence["reason"] === "unknown_command_id"
  );
});

test("ProcessBrowserPreviewAdapter reuses reachable URL only when project identity matches", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "horus-preview-owned-"));
  const project = projectFixture(rootPath, "/bin/sleep 30", "http://127.0.0.1:1/");
  await writeFile(
    join(rootPath, "horus.project.json"),
    `${JSON.stringify({ projectId: project.id })}\n`,
    "utf8"
  );
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/horus.project.json")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ projectId: project.id }));
      return;
    }
    res.end("<html><body>owned project</body></html>");
  });
  const previewUrl = await listen(server);
  const adapter = new ProcessBrowserPreviewAdapter({
    startupTimeoutMs: 250,
    readinessPollMs: 25,
    allowedExecutables: ["/bin/sleep", "sleep"],
  });

  try {
    const started = await adapter.start(
      { ...project, previewUrl },
      sessionFixture(project, previewUrl)
    );
    assert.equal(started.processId, null);
    assert.equal(started.evidence.reason, "preview_already_reachable");
  } finally {
    await closeServer(server);
  }
});

test("ProcessBrowserPreviewAdapter refuses a reachable URL owned by another project", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "horus-preview-wrong-owner-"));
  const project = projectFixture(rootPath, "/bin/sleep 30", "http://127.0.0.1:1/");
  await writeFile(
    join(rootPath, "horus.project.json"),
    `${JSON.stringify({ projectId: project.id })}\n`,
    "utf8"
  );
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/horus.project.json")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ projectId: "99999999-9999-4999-8999-999999999999" }));
      return;
    }
    res.end("<html><body>wrong project</body></html>");
  });
  const previewUrl = await listen(server);
  const adapter = new ProcessBrowserPreviewAdapter({
    startupTimeoutMs: 250,
    readinessPollMs: 25,
    killGraceMs: 25,
    allowedExecutables: ["/bin/sleep", "sleep"],
  });

  try {
    await assert.rejects(
      () =>
        adapter.start(
          { ...project, previewUrl },
          sessionFixture(project, previewUrl)
        ),
      (err) =>
        err instanceof BrowserPreviewStartError &&
        err.evidence.reason === "wrong_owner_port" &&
        /serving project/.test(err.message)
    );
  } finally {
    await closeServer(server);
  }
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
  assert.match(started.session.errorMessage, /comando de preview/i);
  assert.equal(
    started.event.data.runtimeEvidence.reason,
    "preview_command_missing"
  );
  assert.deepEqual(
    timeline.map((event) => event.type),
    ["preview_created", "preview_error"]
  );
});

test("PreviewRuntimeManager recovers stale runtime sessions after restart", async () => {
  class Registry {
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

  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-runtime-recover-"));
  const project = projectFixture(baseDir, null, "http://127.0.0.1:65530/");
  const store = new FilePreviewSessionStore(join(baseDir, "sessions"));
  await store.saveSession({
    ...sessionFixture(project, project.previewUrl),
    status: "running",
    processId: 12345,
    startedAt: "2026-05-26T00:00:00.000Z",
  });
  const runtime = new PreviewRuntimeManager(
    new Registry(project),
    store,
    new NoopBrowserPreviewAdapter(),
    new PreviewEventStreamAdapter()
  );

  const recovered = await runtime.recoverStaleRuntimeSessions();
  const stored = await store.getSession(recovered[0].id);
  const timeline = await store.listEvents(stored.id);

  assert.equal(recovered.length, 1);
  assert.equal(stored.status, "stopped");
  assert.equal(stored.processId, null);
  assert.equal(timeline.at(-1).type, "preview_recovered_after_restart");
});

test("NoopBrowserPreviewAdapter keeps existing lifecycle tests available", async () => {
  const project = projectFixture("/tmp", null, "http://localhost:5174/");
  const adapter = new NoopBrowserPreviewAdapter();
  const result = await adapter.start(project, sessionFixture(project, project.previewUrl));

  assert.equal(result.previewUrl, project.previewUrl);
  assert.equal(result.processId, null);
});
