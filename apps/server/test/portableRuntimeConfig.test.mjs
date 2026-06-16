import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  isWildcardBindHost,
  resolvePreviewPublicHost,
} from "../../../packages/shared/dist/index.js";
import { ProjectDefaultContractBuilder } from "../dist/infrastructure/project/ProjectDefaultContractBuilder.js";
import {
  FileFrontendProjectRegistry,
} from "../dist/infrastructure/preview/FileFrontendProjectRegistry.js";
import {
  FileProjectConstructionRepository,
} from "../dist/infrastructure/repositories/FileProjectConstructionRepository.js";

const loopbackHost = ["127", "0", "0", "1"].join(".");

test("preview public host policy does not publish wildcard bind hosts", () => {
  assert.equal(
    resolvePreviewPublicHost({
      configuredPublicHost: "preview.team.example",
      bindHost: "0.0.0.0",
      runtimeHostname: "runtime-host",
    }),
    "preview.team.example"
  );
  assert.equal(
    resolvePreviewPublicHost({
      bindHost: "0.0.0.0",
      runtimeHostname: "runtime-host",
    }),
    "runtime-host"
  );
  assert.equal(
    resolvePreviewPublicHost({
      bindHost: "preview-bind.example",
    }),
    "preview-bind.example"
  );
  assert.equal(isWildcardBindHost("0.0.0.0"), true);
  assert.equal(isWildcardBindHost("preview-bind.example"), false);
  assert.throws(
    () => resolvePreviewPublicHost({ bindHost: "0.0.0.0" }),
    /Preview public host could not be resolved/
  );
});

test("default project contract uses portable inspection executables", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-contract-"));
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({
      scripts: {
        build: "echo build",
        test: "echo test",
      },
    })
  );

  const config = await new ProjectDefaultContractBuilder().build({
    projectRoot,
    projectName: "Portable Project",
    projectStack: "typescript-react",
    baseRef: "main",
  });

  const inspectCommands = config.commandCatalog.filter((command) =>
    command.id.startsWith("inspect-")
  );
  assert.ok(inspectCommands.length >= 1);
  assert.deepEqual(
    [...new Set(inspectCommands.map((command) => command.executable))],
    ["node"]
  );
});

test("seed frontend project is resolved from current repo instead of stale persisted root", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "horus-repo-"));
  const webRoot = join(repositoryRoot, "apps", "web");
  const dataRoot = join(repositoryRoot, ".horus", "data", "frontend-projects");
  await mkdir(webRoot, { recursive: true });
  await mkdir(dataRoot, { recursive: true });
  await writeFile(
    join(repositoryRoot, "package.json"),
    JSON.stringify({ packageManager: "pnpm@9.15.0" })
  );
  await writeFile(
    join(webRoot, "package.json"),
    JSON.stringify({
      name: "@u-build/web",
      scripts: { dev: "vite" },
      dependencies: { react: "19.0.0" },
    })
  );
  await writeFile(
    join(dataRoot, "projects.json"),
    JSON.stringify([
      {
        id: "11111111-1111-4111-8111-111111111116",
        name: "user_stories",
        slug: "user-stories",
        rootPath: "/stale-machine/old/horus.ai/apps/web",
        defaultRoute: "/",
        devCommand: "pnpm --filter @u-build/web dev -- --host old-preview.example --port 5174",
        previewCommandId: "dev",
        commandCatalog: [],
        previewUrl: "http://old-preview.example:5174",
        createdAt: "2026-05-26T00:00:00.000Z",
      },
    ])
  );

  const registry = new FileFrontendProjectRegistry(dataRoot, repositoryRoot, {
    HORUS_WEB_PREVIEW_HOST: "0.0.0.0",
    HORUS_WEB_PREVIEW_PORT: "6200",
    HORUS_WEB_PREVIEW_URL: "http://preview.example.test:6200",
  });

  const [project] = await registry.listProjects();

  assert.equal(project.rootPath, await realpath(webRoot));
  assert.equal(project.previewUrl, "http://preview.example.test:6200");
  assert.equal(
    project.devCommand,
    "pnpm --filter @u-build/web dev -- --host 0.0.0.0 --port 6200 --strictPort"
  );
  assert.equal(project.commandCatalog[0].executable, "pnpm");
});

test("seed frontend project separates preview bind host from browser-facing host", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "horus-repo-"));
  const webRoot = join(repositoryRoot, "apps", "web");
  const dataRoot = join(repositoryRoot, ".horus", "data", "frontend-projects");
  await mkdir(webRoot, { recursive: true });
  await mkdir(dataRoot, { recursive: true });
  await writeFile(
    join(repositoryRoot, "package.json"),
    JSON.stringify({ packageManager: "pnpm@9.15.0" })
  );
  await writeFile(
    join(webRoot, "package.json"),
    JSON.stringify({
      name: "@u-build/web",
      scripts: { dev: "vite" },
      dependencies: { react: "19.0.0" },
    })
  );

  const registry = new FileFrontendProjectRegistry(dataRoot, repositoryRoot, {
    HORUS_WEB_PREVIEW_PORT: "6201",
    HORUS_WEB_PREVIEW_PUBLIC_HOST: "preview.team.example",
  });

  const [project] = await registry.listProjects();

  assert.equal(project.previewUrl, "http://preview.team.example:6201");
  assert.equal(
    project.devCommand,
    "pnpm --filter @u-build/web dev -- --host 0.0.0.0 --port 6201 --strictPort"
  );
  assert.equal(project.commandCatalog[0].args.join(" ").includes(loopbackHost), false);
});

test("data-dir relative generated frontend projects resolve from active HORUS_DATA_DIR", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "horus-repo-"));
  const dataRoot = join(repositoryRoot, ".horus", "data");
  const frontendProjectsRoot = join(dataRoot, "frontend-projects");
  const generatedRoot = join(
    dataRoot,
    "project-workspaces",
    "generated-dashboard"
  );
  await mkdir(frontendProjectsRoot, { recursive: true });
  await mkdir(generatedRoot, { recursive: true });
  await writeFile(
    join(generatedRoot, "package.json"),
    JSON.stringify({
      scripts: { dev: "vite" },
    })
  );
  await writeFile(
    join(frontendProjectsRoot, "projects.json"),
    JSON.stringify([
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Generated Dashboard",
        slug: "generated-dashboard",
        rootPath: "project-workspaces/generated-dashboard",
        defaultRoute: "/",
        devCommand: "npm run dev",
        previewCommandId: "dev",
        commandCatalog: [],
        previewUrl: null,
        createdAt: "2026-05-26T00:00:00.000Z",
      },
    ])
  );

  const registry = new FileFrontendProjectRegistry(
    frontendProjectsRoot,
    repositoryRoot,
    {}
  );

  const [project] = await registry.listProjects();

  assert.equal(project.rootPath, await realpath(generatedRoot));
});

test("data-dir relative project construction roots resolve from active HORUS_DATA_DIR", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "horus-data-"));
  const constructionRoot = join(dataRoot, "project-construction");
  const generatedRoot = join(dataRoot, "project-workspaces", "ops-console");
  await mkdir(constructionRoot, { recursive: true });
  await mkdir(generatedRoot, { recursive: true });
  await writeFile(
    join(constructionRoot, "project-workspaces.json"),
    JSON.stringify([
      {
        id: "33333333-3333-4333-8333-333333333333",
        workspaceFolderId: null,
        name: "Ops Console",
        slug: "ops-console",
        targetMode: "new_project",
        rootPath: "project-workspaces/ops-console",
        configPath: "project-workspaces/ops-console/.horus-project.yaml",
        gitRepositoryPath: "project-workspaces/ops-console",
        currentBranch: "main",
        baseRef: "main",
        projectStack: "typescript-react",
        createdAt: "2026-05-26T00:00:00.000Z",
        updatedAt: "2026-05-26T00:00:00.000Z",
      },
    ])
  );

  const repository = new FileProjectConstructionRepository(constructionRoot);
  const [project] = await repository.listProjectWorkspaces();

  assert.equal(project.rootPath, join(dataRoot, "project-workspaces", "ops-console"));
  assert.equal(
    project.configPath,
    join(dataRoot, "project-workspaces", "ops-console", ".horus-project.yaml")
  );
  assert.equal(
    project.gitRepositoryPath,
    join(dataRoot, "project-workspaces", "ops-console")
  );
});
