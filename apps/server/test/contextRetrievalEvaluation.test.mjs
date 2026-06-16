import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ContextRetrievalEvaluationService,
  contextRetrievalCandidateFromSnapshot,
} from "../dist/application/services/ContextRetrievalEvaluationService.js";
import { RepositoryIndexLifecycleService } from "../dist/application/coding/RepositoryIndexLifecycleService.js";
import { ProjectContextEngine } from "../dist/application/services/ProjectContextEngine.js";
import { ProjectIndexManifestStore } from "../dist/application/services/ProjectIndexManifestStore.js";
import { ProjectInspectionService } from "../dist/application/services/ProjectInspectionService.js";
import { ReadOnlyCodeContextService } from "../dist/application/services/ReadOnlyCodeContextService.js";
import { ValidationStrategyRegistry } from "../dist/application/services/ValidationStrategyRegistry.js";
import { RepositoryScanner } from "../dist/application/coding/RepositoryScanner.js";
import { TextRepositoryRetriever } from "../dist/application/coding/TextRepositoryRetriever.js";
import { TreeSitterAstAnalyzer } from "../dist/infrastructure/ast/TreeSitterAstAnalyzer.js";

test("ContextRetrievalEvaluationService reports recall, edit/test hit, symbol hit and terminal error hit", () => {
  const service = new ContextRetrievalEvaluationService();
  const report = service.evaluate({
    k: 3,
    now: new Date("2026-06-09T12:00:00.000Z"),
    cases: [
      {
        id: "edit-settings",
        query: "change settings panel copy",
        expectedFiles: ["src/App.tsx"],
        expectedEditFiles: ["src/App.tsx"],
        expectedTestFiles: ["src/App.test.tsx"],
        expectedSymbols: ["SettingsPanel"],
        terminalErrorPath: "src/App.tsx",
        tags: ["edit", "runtime"],
      },
      {
        id: "missed-test",
        query: "which test covers saving settings",
        expectedFiles: ["src/settings/saveSettings.ts"],
        expectedEditFiles: [],
        expectedTestFiles: ["src/settings/saveSettings.test.ts"],
        expectedSymbols: ["saveSettings"],
        tags: ["qa"],
      },
    ],
    candidates: [
      {
        caseId: "edit-settings",
        selectedFiles: ["src/App.tsx", "src/App.test.tsx", "src/theme.ts"],
        selectedSymbols: ["SettingsPanel"],
        retrievalChannels: ["runtime_errors", "lexical_bm25", "ast_symbols"],
      },
      {
        caseId: "missed-test",
        selectedFiles: ["src/settings/index.ts", "src/settings/saveSettings.ts"],
        selectedSymbols: [],
        retrievalChannels: ["lexical_bm25"],
      },
    ],
  });

  assert.equal(report.caseCount, 2);
  assert.equal(report.averageRecallAtK, 0.75);
  assert.equal(report.editFileHitRate, 0.5);
  assert.equal(report.testFileHitRate, 0.5);
  assert.equal(report.symbolHitRate, 0.5);
  assert.equal(report.terminalErrorFileHitRate, 1);
  assert.deepEqual(report.results[1].missingFiles, [
    "src/settings/saveSettings.test.ts",
  ]);
});

test("ProjectContextEngine benchmark fixture evaluates real retrieved context and persisted index", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-context-fixture-"));
  try {
    await createFixtureProject(root);
    const scanner = new RepositoryScanner();
    const engine = new ProjectContextEngine({
      inspector: new ProjectInspectionService(scanner),
      codeContext: new ReadOnlyCodeContextService(
        undefined,
        undefined,
        undefined,
        scanner,
        new TextRepositoryRetriever(),
        new TreeSitterAstAnalyzer()
      ),
      validationStrategy: new ValidationStrategyRegistry(),
      manifestStore: new ProjectIndexManifestStore(),
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });
    const cases = [
      {
        id: "settings-panel",
        query: "qual arquivo editar para alterar SettingsPanel",
        expectedFiles: ["src/components/SettingsPanel.tsx"],
        expectedEditFiles: ["src/components/SettingsPanel.tsx"],
        expectedTestFiles: [],
        expectedSymbols: ["SettingsPanel"],
        tags: ["edit"],
      },
      {
        id: "save-settings-test",
        query: "qual teste cobre saveSettings",
        expectedFiles: ["src/settings/saveSettings.ts"],
        expectedEditFiles: ["src/settings/saveSettings.ts"],
        expectedTestFiles: ["src/settings/saveSettings.test.ts"],
        expectedSymbols: ["saveSettings"],
        tags: ["test"],
      },
    ];
    const projectId = randomUUID();
    const candidates = [];
    for (const item of cases) {
      const snapshot = await engine.buildSnapshot({
        projectId,
        projectRootPath: root,
        query: item.query,
        agentProfileId: item.tags.includes("test") ? "qa_agent" : "front_agent",
      });
      candidates.push(contextRetrievalCandidateFromSnapshot(item.id, snapshot));
    }
    const report = new ContextRetrievalEvaluationService().evaluate({
      cases,
      candidates,
      k: 5,
      now: new Date("2026-06-09T12:00:00.000Z"),
    });
    const manifest = JSON.parse(
      await readFile(join(root, ".horus", "index-manifest.json"), "utf8")
    );

    assert.equal(report.caseCount, 2);
    assert.ok(report.averageRecallAtK >= 0.5);
    assert.ok(report.editFileHitRate >= 0.5);
    assert.ok(
      manifest.repositoryIndex.chunks.some((chunk) =>
        chunk.symbolNames.includes("SettingsPanel")
      )
    );
    assert.equal(typeof manifest.repositoryIndex.freshness.merkleRoot, "string");
    assert.equal(manifest.repositoryIndex.freshness.merkleRoot.length, 64);
    assert.deepEqual(manifest.repositoryIndex.retrievalFusion, [
      "explicit_paths",
      "runtime_errors",
      "git_diff",
      "lexical_bm25",
      "ast_symbols",
      "graph_neighbors",
      "semantic_embeddings",
      "reranker",
      "budget_packer",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ProjectContextEngine reuses cached snapshots and invalidates after deep source edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-context-cache-"));
  try {
    await createFixtureProject(root);
    const scanner = new RepositoryScanner();
    const cache = new MemoryCache();
    const engine = new ProjectContextEngine({
      inspector: new ProjectInspectionService(scanner),
      codeContext: new ReadOnlyCodeContextService(
        undefined,
        undefined,
        undefined,
        scanner,
        new TextRepositoryRetriever(),
        new TreeSitterAstAnalyzer()
      ),
      validationStrategy: new ValidationStrategyRegistry(),
      manifestStore: new ProjectIndexManifestStore(),
      cache,
      cacheTtlMs: 60_000,
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });
    const input = {
      projectId: randomUUID(),
      projectRootPath: root,
      query: "qual arquivo editar para alterar SettingsPanel",
      agentProfileId: "front_agent",
    };

    await engine.buildSnapshot(input);
    const firstManifest = await readIndexManifest(root);
    const firstMerkle = firstManifest.repositoryIndex.freshness.merkleRoot;
    const cached = await engine.buildSnapshot(input);
    const secondManifest = await readIndexManifest(root);

    assert.ok(cached.notes.includes("engine_cache_hit:snapshot"));
    assert.equal(secondManifest.hits, 1);
    assert.equal(secondManifest.misses, 1);
    assert.equal(secondManifest.repositoryIndex.freshness.merkleRoot, firstMerkle);

    const settingsPanelPath = join(root, "src", "components", "SettingsPanel.tsx");
    await writeFile(
      settingsPanelPath,
      [
        "import { saveSettings } from '../settings/saveSettings';",
        "export function SettingsPanel({ userId }: { userId: string }) {",
        "  return <button onClick={() => saveSettings(userId)}>Salvar agora</button>;",
        "}",
        "",
      ].join("\n")
    );
    const future = new Date("2030-06-09T12:00:00.000Z");
    await utimes(settingsPanelPath, future, future);

    const invalidated = await engine.buildSnapshot(input);
    const thirdManifest = await readIndexManifest(root);

    assert.equal(invalidated.notes.includes("engine_cache_hit:snapshot"), false);
    assert.equal(thirdManifest.hits, 1);
    assert.equal(thirdManifest.misses, 2);
    assert.ok(thirdManifest.invalidations >= 1);
    assert.notEqual(thirdManifest.repositoryIndex.freshness.merkleRoot, firstMerkle);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ProjectIndexManifestStore rejects corrupt manifests instead of resetting silently", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-context-corrupt-manifest-"));
  try {
    await mkdir(join(root, ".horus"), { recursive: true });
    await writeFile(join(root, ".horus", "index-manifest.json"), "{not json");

    const store = new ProjectIndexManifestStore();

    await assert.rejects(
      () => store.read(root),
      /Failed to read project index manifest/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ProjectContextEngine surfaces index manifest persistence failures in snapshot notes", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-context-manifest-failure-"));
  try {
    await createFixtureProject(root);
    await writeFile(join(root, ".horus"), "not a directory");
    const scanner = new RepositoryScanner();
    const engine = new ProjectContextEngine({
      inspector: new ProjectInspectionService(scanner),
      codeContext: new ReadOnlyCodeContextService(
        undefined,
        undefined,
        undefined,
        scanner,
        new TextRepositoryRetriever(),
        new TreeSitterAstAnalyzer()
      ),
      validationStrategy: new ValidationStrategyRegistry(),
      manifestStore: new ProjectIndexManifestStore(),
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });

    const snapshot = await engine.buildSnapshot({
      projectId: randomUUID(),
      projectRootPath: root,
      query: "qual arquivo editar para alterar SettingsPanel",
      agentProfileId: "front_agent",
    });

    assert.equal(
      snapshot.notes.some((note) =>
        note.startsWith("index_manifest_persist_failed:")
      ),
      true
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("RepositoryIndexLifecycleService emits a deterministic Merkle root for indexed content", () => {
  const service = new RepositoryIndexLifecycleService(
    () => new Date("2026-06-09T12:00:00.000Z")
  );
  const manifest = service.buildManifest({
    indexVersion: "v1",
    scan: {
      projectRootPath: "/tmp/project",
      selectedPaths: [],
      files: [
        {
          path: "src/App.tsx",
          language: "typescript",
          sizeBytes: 120,
          modifiedAt: "2026-06-09T12:00:00.000Z",
          safety: "readable",
        },
        {
          path: "src/App.test.tsx",
          language: "typescript",
          sizeBytes: 80,
          modifiedAt: "2026-06-09T12:00:01.000Z",
          safety: "readable",
        },
      ],
      stats: {
        totalEntries: 2,
        totalFiles: 2,
        indexedFiles: 2,
        ignoredEntries: 0,
        blockedFiles: 0,
        binaryFiles: 0,
        oversizedFiles: 0,
        partial: false,
      },
      notes: [],
      generatedAt: "2026-06-09T12:00:00.000Z",
    },
  });
  const reordered = service.buildManifest({
    indexVersion: "v1",
    scan: {
      ...manifestToScanInput(manifest),
      files: [...manifestToScanInput(manifest).files].reverse(),
    },
  });

  assert.equal(typeof manifest.freshness?.merkleRoot, "string");
  assert.equal(manifest.freshness?.merkleRoot.length, 64);
  assert.equal(reordered.freshness?.merkleRoot, manifest.freshness?.merkleRoot);
});

function manifestToScanInput(manifest) {
  return {
    projectRootPath: "/tmp/project",
    selectedPaths: [],
    files: manifest.files.map((file) => ({
      path: file.path,
      language: "typescript",
      sizeBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
      safety: file.safety,
    })),
    stats: {
      totalEntries: manifest.files.length,
      totalFiles: manifest.files.length,
      indexedFiles: manifest.files.length,
      ignoredEntries: 0,
      blockedFiles: 0,
      binaryFiles: 0,
      oversizedFiles: 0,
      partial: false,
    },
    notes: [],
    generatedAt: "2026-06-09T12:00:00.000Z",
  };
}

async function createFixtureProject(projectRoot) {
  await mkdir(join(projectRoot, "src", "components"), { recursive: true });
  await mkdir(join(projectRoot, "src", "settings"), { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({
      scripts: { build: "vite build", test: "vitest run" },
      dependencies: { react: "latest", "react-dom": "latest" },
      devDependencies: { typescript: "latest", vite: "latest", vitest: "latest" },
    })
  );
  await writeFile(join(projectRoot, ".gitignore"), "node_modules\ndist\n");
  await writeFile(join(projectRoot, ".horusignore"), "secrets.json\n");
  await writeFile(
    join(projectRoot, "src", "App.tsx"),
    [
      "import { SettingsPanel } from './components/SettingsPanel';",
      "export function App() {",
      "  return <SettingsPanel userId=\"demo-user\" />;",
      "}",
      "",
    ].join("\n")
  );
  await writeFile(
    join(projectRoot, "src", "components", "SettingsPanel.tsx"),
    [
      "import { saveSettings } from '../settings/saveSettings';",
      "export function SettingsPanel({ userId }: { userId: string }) {",
      "  return <button onClick={() => saveSettings(userId)}>Salvar preferencias</button>;",
      "}",
      "",
    ].join("\n")
  );
  await writeFile(
    join(projectRoot, "src", "settings", "saveSettings.ts"),
    [
      "export function saveSettings(userId: string): string {",
      "  return `settings saved for ${userId}`;",
      "}",
      "",
    ].join("\n")
  );
  await writeFile(
    join(projectRoot, "src", "settings", "saveSettings.test.ts"),
    [
      "import { describe, expect, it } from 'vitest';",
      "import { saveSettings } from './saveSettings';",
      "describe('saveSettings', () => {",
      "  it('returns a persisted settings message', () => {",
      "    expect(saveSettings('demo-user')).toContain('demo-user');",
      "  });",
      "});",
      "",
    ].join("\n")
  );
}

async function readIndexManifest(projectRoot) {
  return JSON.parse(
    await readFile(join(projectRoot, ".horus", "index-manifest.json"), "utf8")
  );
}

class MemoryCache {
  constructor() {
    this.values = new Map();
  }

  async getJson(key) {
    return this.values.get(key) ?? null;
  }

  async setJson(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    this.values.delete(key);
  }
}
