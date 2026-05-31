import assert from "node:assert/strict";
import test from "node:test";
import {
  ProjectInspectionProfileSchema,
  ProjectPackageManagerDetectionSchema,
} from "../dist/entities/ProjectInspection.js";

test("ProjectInspectionProfileSchema accepts grounded project evidence", () => {
  const profile = ProjectInspectionProfileSchema.parse({
    projectId: "33333333-3333-4333-8333-333333333333",
    projectRootPath: "/tmp/generated",
    packageManager: {
      name: "pnpm",
      status: "detected",
      evidence: [{ path: "pnpm-lock.yaml", reason: "Lockfile present." }],
    },
    framework: {
      name: "react-vite",
      status: "detected",
      confidence: 0.95,
      evidence: [{ path: "vite.config.ts", reason: "Vite config present." }],
    },
    scripts: [{ name: "build", command: "vite build", category: "build" }],
    roots: {
      sourceRoots: ["src"],
      testRoots: ["src"],
      publicRoots: ["public"],
      editableRoots: ["src"],
    },
    entrypoints: [
      { path: "src/main.tsx", kind: "app", evidence: "React entrypoint." },
    ],
    routes: [{ path: "src/App.tsx", route: "/", kind: "static" }],
    editableFiles: [
      {
        path: "src/App.tsx",
        language: "typescriptreact",
        sizeBytes: 42,
        modifiedAt: "2026-05-28T00:00:00.000Z",
      },
    ],
    unsafePaths: [],
    warnings: [],
    stats: {
      totalEntries: 8,
      totalFiles: 4,
      indexedFiles: 4,
      ignoredEntries: 0,
      blockedFiles: 0,
      binaryFiles: 0,
      oversizedFiles: 0,
      partial: false,
    },
    generatedAt: "2026-05-28T00:00:00.000Z",
  });

  assert.equal(profile.packageManager.name, "pnpm");
  assert.equal(profile.framework.name, "react-vite");
  assert.equal(profile.entrypoints[0].path, "src/main.tsx");
});

test("ProjectPackageManagerDetectionSchema keeps unknown evidence explicit", () => {
  const detection = ProjectPackageManagerDetectionSchema.parse({
    name: "unknown",
    status: "unknown",
    evidence: [],
  });

  assert.equal(detection.status, "unknown");
});
