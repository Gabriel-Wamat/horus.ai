import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  FileFrontendProjectRegistry,
  FrontendProjectRootError,
} from "../dist/infrastructure/preview/FileFrontendProjectRegistry.js";

test("FileFrontendProjectRegistry seeds the web frontend project", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-projects-"));
  const registry = new FileFrontendProjectRegistry(join(baseDir, "registry"));

  const projects = await registry.listProjects();

  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, "user_stories");
  assert.equal(projects[0].slug, "user-stories");
  assert.ok(projects[0].rootPath.endsWith("apps/web"));
});

test("FileFrontendProjectRegistry persists repository projects with relative roots", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-projects-"));
  const repoRoot = join(baseDir, "repo");
  await mkdir(join(repoRoot, "apps", "web"), { recursive: true });
  const registryDir = join(baseDir, "registry");
  const registry = new FileFrontendProjectRegistry(registryDir, repoRoot, {
    HORUS_WEB_PROJECT_ROOT: "apps/web",
  });

  const [project] = await registry.listProjects();
  const raw = JSON.parse(await readFile(join(registryDir, "projects.json"), "utf-8"));

  assert.equal(project.rootPath, await realpath(join(repoRoot, "apps", "web")));
  assert.equal(raw[0].rootPath, "apps/web");
});

test("FileFrontendProjectRegistry rejects project roots outside repository", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-projects-"));
  const repoRoot = join(baseDir, "repo");
  const outsideRoot = join(baseDir, "outside");
  await mkdir(join(repoRoot, "apps", "web"), { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  const registry = new FileFrontendProjectRegistry(join(baseDir, "registry"), repoRoot);

  await assert.rejects(
    () =>
      registry.registerProject({
        name: "Outside",
        rootPath: "../outside",
      }),
    FrontendProjectRootError
  );
});

test("FileFrontendProjectRegistry persists preview hygiene metadata", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-preview-projects-"));
  const repoRoot = join(baseDir, "repo");
  const appRoot = join(repoRoot, "generated");
  await mkdir(join(repoRoot, "apps", "web"), { recursive: true });
  await mkdir(appRoot, { recursive: true });
  const registry = new FileFrontendProjectRegistry(
    join(baseDir, "registry"),
    repoRoot
  );

  const project = await registry.registerProject({
    name: "Generated App",
    rootPath: "generated",
    previewUrl: "http://127.0.0.1:5184",
    projectKind: "generated",
    lifecycleStatus: "published",
    visibility: "hidden",
    healthStatus: "blocked",
    healthReasons: ["scaffold_only"],
    projectWorkspaceId: "33333333-3333-4333-8333-333333333333",
    appFingerprint: "abc123",
    lastHealthCheckedAt: "2026-05-27T10:00:00.000Z",
    archivedAt: "2026-05-27T10:00:00.000Z",
    archivedReason: "scaffold",
  });

  const loaded = await registry.getProject(project.id);

  assert.equal(loaded.visibility, "hidden");
  assert.equal(loaded.healthStatus, "blocked");
  assert.deepEqual(loaded.healthReasons, ["scaffold_only"]);
  assert.equal(loaded.projectWorkspaceId, "33333333-3333-4333-8333-333333333333");
  assert.equal(loaded.appFingerprint, "abc123");
});
