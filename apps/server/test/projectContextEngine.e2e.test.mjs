import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ProjectContextEngine } from "../dist/application/services/ProjectContextEngine.js";
import { ProjectInspectionService } from "../dist/application/services/ProjectInspectionService.js";
import { ReadOnlyCodeContextService } from "../dist/application/services/ReadOnlyCodeContextService.js";
import { ValidationStrategyRegistry } from "../dist/application/services/ValidationStrategyRegistry.js";
import { ProjectIndexManifestStore } from "../dist/application/services/ProjectIndexManifestStore.js";
import { RepositoryScanner } from "../dist/application/coding/RepositoryScanner.js";

const PROJECT_ID = "44444444-4444-4444-8444-444444444444";

// End-to-end test of the canonical ProjectContextEngine: spins up a real Vite
// project fixture in tmp, builds a snapshot, asserts every section the
// Engine is contracted to produce, and verifies cache hit + manifest write.
// This is the smoke test that catches regressions in the unified context
// layer (item 3 of the architectural agenda).

test("ProjectContextEngine builds a canonical snapshot for a React/Vite fixture", async () => {
  const root = await setupViteProject();
  const engine = buildEngine();

  const snapshot = await engine.buildSnapshot({
    projectId: PROJECT_ID,
    projectRootPath: root,
    query: "App",
    agentProfileId: "front_agent",
  });

  // Inspection
  assert.equal(snapshot.projectRootPath, await realpath(root));
  assert.equal(snapshot.inspection.framework.name, "react-vite");
  assert.equal(snapshot.inspection.packageManager.name, "pnpm");

  // Validation strategy: React/Vite requires type_check + build
  const required = snapshot.validationStrategy.requirements
    .filter((req) => req.level === "required")
    .map((req) => req.kind);
  assert.ok(required.includes("type_check"), "type_check should be required for react-vite");
  assert.ok(required.includes("build"), "build should be required for react-vite");

  // Edit restrictions
  assert.ok(snapshot.editRestrictions.editableRoots.includes("src"));
  assert.ok(
    snapshot.editRestrictions.forbiddenWritePatterns.some((pattern) =>
      pattern.includes("node_modules")
    )
  );

  // Code context
  assert.ok(
    snapshot.codeContext.files.some((file) => file.path === "src/App.tsx"),
    "snapshot.codeContext should include src/App.tsx"
  );

  // Profile + metadata
  assert.equal(snapshot.agentProfileId, "front_agent");
  assert.equal(snapshot.query, "App");
  assert.ok(snapshot.generatedAt);
});

test("ProjectContextEngine reuses cached snapshot when files do not change", async () => {
  const root = await setupViteProject();
  const cache = new InMemoryKVCache();
  const engine = buildEngine({ cache });

  const first = await engine.buildSnapshot({
    projectId: PROJECT_ID,
    projectRootPath: root,
    query: "App",
    agentProfileId: "front_agent",
  });
  assert.ok(!first.notes.some((note) => note.includes("engine_cache_hit")));

  const second = await engine.buildSnapshot({
    projectId: PROJECT_ID,
    projectRootPath: root,
    query: "App",
    agentProfileId: "front_agent",
  });
  assert.ok(
    second.notes.some((note) => note.includes("engine_cache_hit:snapshot")),
    "second call should return a cached snapshot"
  );
});

test("ProjectContextEngine invalidates cache when an editable file changes", async () => {
  const root = await setupViteProject();
  const cache = new InMemoryKVCache();
  const engine = buildEngine({ cache });

  await engine.buildSnapshot({
    projectId: PROJECT_ID,
    projectRootPath: root,
    query: "App",
    agentProfileId: "front_agent",
  });

  // Sleep ~1.1s so mtime bucket (1s resolution) advances reliably across FSes.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await writeFile(
    join(root, "src", "App.tsx"),
    "export const App = () => <div>changed</div>;\n"
  );

  const third = await engine.buildSnapshot({
    projectId: PROJECT_ID,
    projectRootPath: root,
    query: "App",
    agentProfileId: "front_agent",
  });
  assert.ok(
    !third.notes.some((note) => note.includes("engine_cache_hit")),
    "snapshot after edit must not be a cache hit"
  );
});

test("ProjectContextEngine writes the on-disk index manifest", async () => {
  const root = await setupViteProject();
  const engine = buildEngine({ withManifestStore: true });

  await engine.buildSnapshot({
    projectId: PROJECT_ID,
    projectRootPath: root,
    query: "App",
    agentProfileId: "front_agent",
  });

  const manifestPath = join(root, ".horus", "index-manifest.json");
  const raw = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(raw);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.stack, "react-vite");
  assert.ok(manifest.lastCacheKey, "manifest should record the cache key used");
});

function buildEngine(options = {}) {
  return new ProjectContextEngine({
    inspector: new ProjectInspectionService(new RepositoryScanner()),
    codeContext: new ReadOnlyCodeContextService(),
    validationStrategy: new ValidationStrategyRegistry(),
    ...(options.cache ? { cache: options.cache } : {}),
    ...(options.withManifestStore
      ? { manifestStore: new ProjectIndexManifestStore() }
      : {}),
  });
}

class InMemoryKVCache {
  constructor() {
    this.store = new Map();
  }
  async getJson(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  async setJson(key, value, options = {}) {
    this.store.set(key, {
      value,
      expiresAt: options.ttlMs ? Date.now() + options.ttlMs : null,
    });
  }
  async delete(key) {
    this.store.delete(key);
  }
}

async function realpath(path) {
  const { realpath: fsRealpath } = await import("node:fs/promises");
  return fsRealpath(path);
}

async function setupViteProject() {
  const root = await mkdtemp(join(tmpdir(), "horus-engine-e2e-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        scripts: {
          dev: "vite --host 127.0.0.1",
          build: "vite build",
          test: "vitest run",
          typecheck: "tsc --noEmit",
          lint: "eslint .",
        },
        dependencies: { react: "latest", "react-dom": "latest" },
        devDependencies: { vite: "latest", typescript: "latest" },
      },
      null,
      2
    )
  );
  await writeFile(join(root, "vite.config.ts"), "export default {};\n");
  await writeFile(join(root, "index.html"), "<div id=\"root\"></div>\n");
  await writeFile(join(root, "src", "main.tsx"), "import './App';\n");
  await writeFile(
    join(root, "src", "App.tsx"),
    "export const App = () => <div>hello</div>;\n"
  );
  return root;
}
