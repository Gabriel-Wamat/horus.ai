import assert from "node:assert/strict";
import test from "node:test";
import { RepositoryIndexLifecycleService } from "../dist/application/coding/RepositoryIndexLifecycleService.js";

const now = "2026-05-28T23:59:00.000Z";

test("RepositoryIndexLifecycleService invalidates changed files and their chunks", () => {
  const service = new RepositoryIndexLifecycleService(() => new Date(now));
  const previous = service.buildManifest({
    indexVersion: "semantic-retrieval.v1",
    scan: scanSnapshot([
      file("src/App.tsx", 100, "2026-05-28T22:00:00.000Z"),
      file("src/helpers.ts", 80, "2026-05-28T22:00:00.000Z"),
    ]),
    semanticRetrieval: semanticResult([
      chunk("chunk:app", "src/App.tsx", "old-app"),
      chunk("chunk:helpers", "src/helpers.ts", "old-helpers"),
    ]),
  });
  const current = service.buildManifest({
    indexVersion: "semantic-retrieval.v1",
    scan: scanSnapshot([
      file("src/App.tsx", 160, "2026-05-28T23:00:00.000Z"),
      file("src/helpers.ts", 80, "2026-05-28T22:00:00.000Z"),
    ]),
    semanticRetrieval: semanticResult([
      chunk("chunk:app", "src/App.tsx", "new-app"),
      chunk("chunk:helpers", "src/helpers.ts", "old-helpers"),
    ]),
  });

  const plan = service.planInvalidation({ previous, current });

  assert.equal(plan.status, "stale");
  assert.deepEqual(plan.stalePaths, ["src/App.tsx"]);
  assert.ok(plan.staleChunkIds.includes("chunk:app"));
  assert.equal(plan.entries[0].reasons.includes("source_hash_changed"), true);
  assert.equal(plan.entries[0].reasons.includes("chunk_hash_changed"), true);
});

test("RepositoryIndexLifecycleService requires rebuild when index version changes", () => {
  const service = new RepositoryIndexLifecycleService(() => new Date(now));
  const previous = service.buildManifest({
    indexVersion: "semantic-retrieval.v1",
    scan: scanSnapshot([file("src/App.tsx", 100, now)]),
  });
  const current = service.buildManifest({
    indexVersion: "semantic-retrieval.v2",
    scan: scanSnapshot([file("src/App.tsx", 100, now)]),
  });

  const plan = service.planInvalidation({ previous, current });

  assert.equal(plan.status, "rebuild_required");
  assert.equal(plan.entries[0].reasons[0], "index_version_changed");
});

test("RepositoryIndexLifecycleService cleanup isolates expired ephemeral task memory", () => {
  const oldService = new RepositoryIndexLifecycleService(() =>
    new Date("2026-05-28T21:00:00.000Z")
  );
  const service = new RepositoryIndexLifecycleService(() =>
    new Date("2026-05-28T23:59:00.000Z")
  );
  const manifest = oldService.buildManifest({
    indexVersion: "semantic-retrieval.v1",
    scan: scanSnapshot([file("src/App.tsx", 100, "2026-05-28T21:00:00.000Z")]),
  });

  const cleanup = service.planCleanup({
    namespace: manifest.namespace,
    manifests: [manifest],
    maxManifestAgeMs: 60 * 60 * 1000,
    maxEphemeralMemoryAgeMs: 60 * 60 * 1000,
    memories: [
      memory("11111111-1111-4111-8111-111111111111", {
        codingTaskId: "22222222-2222-4222-8222-222222222222",
        tags: ["ephemeral"],
        createdAt: "2026-05-28T21:00:00.000Z",
      }),
      memory("33333333-3333-4333-8333-333333333333", {
        codingTaskId: null,
        tags: ["ephemeral"],
        createdAt: "2026-05-28T21:00:00.000Z",
      }),
    ],
  });

  assert.deepEqual(cleanup.expiredManifestIds, [manifest.id]);
  assert.deepEqual(cleanup.expiredMemoryIds, [
    "11111111-1111-4111-8111-111111111111",
  ]);
});

function scanSnapshot(files) {
  return {
    projectId: "99999999-9999-4999-8999-999999999999",
    projectRootPath: "/workspace/project",
    selectedPaths: [],
    files,
    stats: {
      totalEntries: files.length,
      totalFiles: files.length,
      indexedFiles: files.length,
      ignoredEntries: 0,
      blockedFiles: 0,
      binaryFiles: 0,
      oversizedFiles: 0,
      partial: false,
    },
    notes: [],
    generatedAt: now,
  };
}

function file(path, sizeBytes, modifiedAt) {
  return {
    path,
    language: "typescript",
    sizeBytes,
    modifiedAt,
    safety: "readable",
  };
}

function semanticResult(chunks) {
  return {
    query: "test",
    namespace: "project:99999999-9999-4999-8999-999999999999",
    status: "matched",
    indexVersion: "semantic-retrieval.v1",
    matches: chunks.map((chunk) => ({
      chunk,
      scoreBreakdown: {
        lexicalScore: 0,
        vectorScore: 80,
        symbolScore: 0,
        graphScore: 0,
        explicitPathScore: 0,
        finalScore: 25,
        reasons: ["vector_similarity"],
      },
    })),
    summary: {
      chunkCount: chunks.length,
      embeddedChunkCount: chunks.length,
      matchedChunkCount: chunks.length,
      omittedChunkCount: 0,
      dimensions: 64,
    },
    notes: [],
    generatedAt: now,
  };
}

function chunk(id, path, contentHash) {
  return {
    id,
    path,
    language: "typescript",
    kind: "symbol",
    content: `export function ${path.includes("helpers") ? "helper" : "App"}() {}`,
    contentHash,
    indexVersion: "semantic-retrieval.v1",
    startLine: 1,
    endLine: 1,
    tokenEstimate: 12,
    symbolIds: [],
    symbolNames: [],
  };
}

function memory(id, input) {
  return {
    id,
    kind: "working",
    scope: {
      workspaceFolderId: null,
      userStoryId: null,
      projectId: null,
      chatSessionId: null,
      workflowThreadId: null,
      codingTaskId: input.codingTaskId,
      agentProfileId: null,
    },
    content: "Temporary task note",
    confidence: 1,
    sourceRefs: [{ type: "manual", id: "note" }],
    tags: input.tags,
    staleAt: null,
    supersededByMemoryId: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}
