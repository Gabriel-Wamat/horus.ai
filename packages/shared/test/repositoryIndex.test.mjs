import assert from "node:assert/strict";
import test from "node:test";
import {
  RepositoryIndexCleanupPlanSchema,
  RepositoryIndexInvalidationPlanSchema,
  RepositoryIndexManifestSchema,
} from "../dist/index.js";

const now = "2026-05-28T23:59:00.000Z";

test("RepositoryIndexManifestSchema tracks relative files, chunks and embedding metadata", () => {
  const manifest = RepositoryIndexManifestSchema.parse({
    id: "repository-index:abc",
    namespace: "project:11111111-1111-4111-8111-111111111111",
    projectId: "11111111-1111-4111-8111-111111111111",
    indexVersion: "semantic-retrieval.v1",
    dimensions: 64,
    files: [
      {
        path: "src/App.tsx",
        sourceHash: "hash-app",
        sizeBytes: 120,
        modifiedAt: now,
        safety: "readable",
      },
    ],
    chunks: [
      {
        id: "chunk:src/App.tsx",
        path: "src/App.tsx",
        contentHash: "chunk-hash",
        indexVersion: "semantic-retrieval.v1",
        tokenEstimate: 12,
        vectorId: "chunk:src/App.tsx",
      },
    ],
    sourceFileCount: 1,
    chunkCount: 1,
    generatedAt: now,
  });

  assert.equal(manifest.files[0].path, "src/App.tsx");
  assert.equal(manifest.embeddingModel, undefined);
  assert.equal(manifest.chunkCount, 1);
});

test("RepositoryIndexInvalidationPlanSchema explains stale paths and chunks", () => {
  const plan = RepositoryIndexInvalidationPlanSchema.parse({
    namespace: "project:11111111-1111-4111-8111-111111111111",
    status: "stale",
    stalePaths: ["src/App.tsx"],
    staleChunkIds: ["chunk:src/App.tsx"],
    entries: [
      {
        path: "src/App.tsx",
        reasons: ["source_hash_changed"],
        previousSourceHash: "old",
        currentSourceHash: "new",
      },
    ],
    generatedAt: now,
  });

  assert.equal(plan.entries[0].reasons[0], "source_hash_changed");
});

test("RepositoryIndexCleanupPlanSchema carries expired manifests and task memories", () => {
  const plan = RepositoryIndexCleanupPlanSchema.parse({
    namespace: "project:11111111-1111-4111-8111-111111111111",
    cutoffAt: now,
    expiredManifestIds: ["repository-index:old"],
    expiredMemoryIds: ["22222222-2222-4222-8222-222222222222"],
    generatedAt: now,
  });

  assert.equal(plan.expiredManifestIds.length, 1);
  assert.equal(plan.expiredMemoryIds.length, 1);
});
