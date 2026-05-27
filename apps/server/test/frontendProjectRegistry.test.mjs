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
