import assert from "node:assert/strict";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProcessBrowserPreviewAdapter } from "../dist/infrastructure/preview/ProcessBrowserPreviewAdapter.js";
import { PreviewProjectHealthService } from "../dist/infrastructure/preview/PreviewProjectHealthService.js";

const loopbackHost = ["127", "0", "0", "1"].join(".");
const previewCommand = {
  id: "dev",
  executable: "pnpm",
  args: ["dev"],
  cwd: ".",
  env: {},
};

const installCommand = {
  id: "install-root-dependencies",
  executable: process.execPath,
  args: [
    "-e",
    "require('node:fs').mkdirSync('node_modules', { recursive: true }); console.log('installed');",
  ],
  cwd: ".",
  env: {},
  timeoutMs: 5000,
};

function buildValidManifest(projectId, commandCatalog = [previewCommand]) {
  return {
    schemaVersion: 1,
    projectId,
    projectName: "Preview Contract Demo",
    rootPathPolicy: {
      writeRoots: ["src"],
      deniedPaths: [],
      generatedPaths: [],
    },
    stack: {
      frontend: "react",
      language: "typescript",
      packageManager: "pnpm",
    },
    entrypoints: ["src/main.tsx"],
    commandCatalog,
    architecture: {
      summary: "Generated project manifest used by preview ownership checks.",
      sourceRoots: ["src"],
      routeFiles: ["src/App.tsx"],
      componentRoots: ["src/components"],
    },
    designSystem: {
      referenceFiles: [],
      notes: [],
    },
    agentRules: {
      codingStyle: [],
      uiStyle: [],
      forbiddenPatterns: [],
      testingExpectations: [],
    },
    security: {
      denyPaths: [],
      secretPatterns: [],
      rulesCannotGrantPermissions: true,
    },
    lastValidatedAt: null,
    updatedAt: "2026-06-16T12:00:00.000Z",
  };
}

function buildProject(rootPath) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Preview Contract Demo",
    slug: "preview-contract-demo",
    rootPath,
    defaultRoute: "/",
    devCommand: "pnpm dev",
    previewCommandId: "dev",
    commandCatalog: [previewCommand],
    previewUrl: `http://${loopbackHost}:5174`,
    createdAt: "2026-06-16T12:00:00.000Z",
    projectKind: "generated",
    lifecycleStatus: "published",
    visibility: "visible",
    healthStatus: "unknown",
    healthReasons: [],
    canonicalProjectId: null,
    projectWorkspaceId: null,
    appFingerprint: null,
    lastHealthCheckedAt: null,
    archivedAt: null,
    archivedReason: null,
  };
}

test("preview readiness accepts only successful HTTP responses", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ready");
      return;
    }
    if (req.url === "/missing") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("missing");
      return;
    }
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("broken");
  });

  await new Promise((resolve) => server.listen(0, loopbackHost, resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  const baseUrl = `http://${loopbackHost}:${address.port}`;
  const adapter = new ProcessBrowserPreviewAdapter({ fetchTimeoutMs: 500 });

  try {
    assert.equal(await adapter.isReachable(`${baseUrl}/ok`), true);
    assert.equal(await adapter.isReachable(`${baseUrl}/missing`), false);
    assert.equal(await adapter.isReachable(`${baseUrl}/broken`), false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("preview readiness validates full Horus project manifest contract", async () => {
  const projectId = "44444444-4444-4444-8444-444444444444";
  const root = await mkdtemp(join(tmpdir(), "horus-preview-manifest-"));
  const manifestPath = join(root, "horus.project.json");
  const adapter = new ProcessBrowserPreviewAdapter({ fetchTimeoutMs: 500 });

  await writeFile(
    manifestPath,
    JSON.stringify({ projectId }),
    "utf-8"
  );
  assert.equal(await adapter.readProjectManifestId(root), null);

  await writeFile(
    manifestPath,
    JSON.stringify(buildValidManifest(projectId)),
    "utf-8"
  );
  assert.equal(await adapter.readProjectManifestId(root), projectId);
});

test("preview health reports corrupt project manifest instead of treating it as missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-preview-health-"));
  await writeFile(
    join(root, "horus.project.json"),
    JSON.stringify({ projectId: "not-a-contract" }),
    "utf-8"
  );

  const [project] = await new PreviewProjectHealthService({
    now: () => "2026-06-16T12:00:00.000Z",
  }).listProjects([buildProject(root)], "all");

  assert.ok(project);
  assert.equal(project.healthStatus, "blocked");
  assert.equal(project.visibility, "hidden");
  assert.equal(project.lifecycleStatus, "failed");
  assert.equal(project.healthReasons.includes("manifest_invalid"), true);
  assert.equal(project.healthReasons.includes("manifest_missing"), false);
});

test("preview dependency bootstrap runs cataloged install before readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-preview-bootstrap-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "preview-bootstrap", scripts: { dev: "vite" } }),
    "utf-8"
  );
  await writeFile(
    join(root, "horus.project.json"),
    JSON.stringify(buildValidManifest("55555555-5555-4555-8555-555555555555")),
    "utf-8"
  );

  const project = {
    ...buildProject(root),
    commandCatalog: [installCommand, previewCommand],
  };
  const adapter = new ProcessBrowserPreviewAdapter({ fetchTimeoutMs: 500 });

  const evidence = await adapter.bootstrapDependenciesIfNeeded(project);
  assert.ok(evidence);
  assert.equal(evidence.commandId, "install-root-dependencies");
  assert.equal(evidence.exitCode, 0);
  assert.equal(evidence.reason, "dependency_bootstrap");
  assert.equal(evidence.stdoutTail.includes("installed"), true);
  await access(join(root, "node_modules"));

  assert.equal(await adapter.bootstrapDependenciesIfNeeded(project), null);
});

test("preview dependency bootstrap can recover install command from project manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-preview-manifest-bootstrap-"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "preview-manifest-bootstrap", scripts: { dev: "vite" } }),
    "utf-8"
  );
  await writeFile(
    join(root, "horus.project.json"),
    JSON.stringify(
      buildValidManifest("66666666-6666-4666-8666-666666666666", [
        installCommand,
        previewCommand,
      ])
    ),
    "utf-8"
  );

  const project = buildProject(root);
  const adapter = new ProcessBrowserPreviewAdapter({ fetchTimeoutMs: 500 });

  const evidence = await adapter.bootstrapDependenciesIfNeeded(project);
  assert.ok(evidence);
  assert.equal(evidence.commandId, "install-root-dependencies");
  assert.equal(evidence.exitCode, 0);
  await access(join(root, "node_modules"));
});
