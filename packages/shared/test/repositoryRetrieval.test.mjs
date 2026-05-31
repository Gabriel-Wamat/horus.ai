import assert from "node:assert/strict";
import test from "node:test";
import {
  RepositoryRetrievalResultSchema,
  RepositoryScanSnapshotSchema,
} from "../dist/entities/RepositoryRetrieval.js";

const now = "2026-05-28T19:00:00.000Z";

test("RepositoryScanSnapshotSchema accepts bounded scanner evidence", () => {
  const parsed = RepositoryScanSnapshotSchema.parse({
    projectId: "11111111-1111-4111-8111-111111111111",
    projectRootPath: "/workspace/project",
    selectedPaths: ["src/App.tsx"],
    files: [
      {
        path: "src/App.tsx",
        language: "typescript",
        sizeBytes: 42,
        modifiedAt: now,
        safety: "readable",
      },
      {
        path: ".env",
        language: "plaintext",
        sizeBytes: 20,
        modifiedAt: now,
        safety: "blocked",
        reason: "secret",
      },
    ],
    stats: {
      totalEntries: 2,
      totalFiles: 2,
      indexedFiles: 1,
      ignoredEntries: 0,
      blockedFiles: 1,
      binaryFiles: 0,
      oversizedFiles: 0,
      partial: false,
    },
    notes: ["1 arquivo bloqueado."],
    generatedAt: now,
  });

  assert.equal(parsed.files[0].safety, "readable");
  assert.equal(parsed.stats.blockedFiles, 1);
});

test("RepositoryRetrievalResultSchema exposes blocked status and routing hints", () => {
  const parsed = RepositoryRetrievalResultSchema.parse({
    query: "ajuste src/App.tsx",
    status: "blocked",
    candidates: [],
    excerpts: [],
    omittedFilesCount: 0,
    totalBytes: 0,
    stats: {
      totalFiles: 1,
      indexedFiles: 0,
      contentScannedFiles: 0,
      explicitPathCount: 0,
      blockedPathCount: 1,
    },
    notes: ["A recuperação foi bloqueada."],
    routingHints: [
      {
        surface: "frontend",
        reason: "Detected frontend evidence in prompt or selected paths.",
        score: 75,
      },
    ],
  });

  assert.equal(parsed.status, "blocked");
  assert.equal(parsed.routingHints[0].surface, "frontend");
});
