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
