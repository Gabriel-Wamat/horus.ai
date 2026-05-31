import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ProjectDefaultContractBuilder } from "../dist/infrastructure/project/ProjectDefaultContractBuilder.js";

test("ProjectDefaultContractBuilder discovers governed commands across project manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-contract-builder-"));
  await mkdir(join(root, "apps", "web"), { recursive: true });
  await mkdir(join(root, "services", "api", "tests"), { recursive: true });
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      scripts: {
        dev: "vite",
        "type-check": "tsc --noEmit",
        build: "vite build",
      },
    })
  );
  await writeFile(
    join(root, "apps", "web", "package.json"),
    JSON.stringify({ scripts: { test: "vitest run", lint: "eslint ." } })
  );
  await writeFile(
    join(root, "services", "api", "pyproject.toml"),
    "[build-system]\nrequires=[]\n[project]\nname='api'\n[tool.pytest.ini_options]\ntestpaths=['tests']\n"
  );
  await writeFile(
    join(root, "Makefile"),
    "test:\n\t@echo test\nrelease:\n\t@echo release\n"
  );

  const config = await new ProjectDefaultContractBuilder().build({
    projectRoot: root,
    projectName: "Polyglot Demo",
    projectStack: "typescript-react",
    baseRef: "main",
  });
  const commandIds = config.commandCatalog.map((command) => command.id);

  assert.ok(commandIds.includes("inspect-repo-tree"));
  assert.ok(commandIds.includes("inspect-project-manifests"));
  assert.ok(commandIds.includes("install-root-dependencies"));
  assert.ok(commandIds.includes("type-check-root-type-check"));
  assert.ok(commandIds.includes("build-root-build"));
  assert.ok(commandIds.includes("run-root-dev"));
  assert.ok(commandIds.includes("test-apps-web-test"));
  assert.ok(commandIds.includes("lint-apps-web-lint"));
  assert.ok(commandIds.includes("install-services-api-dependencies"));
  assert.ok(commandIds.includes("test-services-api"));
  assert.ok(commandIds.includes("build-services-api"));
  assert.ok(commandIds.includes("test-root-test"));
  assert.equal(commandIds.includes("release-root-release"), false);

  assert.ok(config.bootstrapCommandIds.includes("inspect-repo-tree"));
  assert.ok(config.bootstrapCommandIds.includes("install-root-dependencies"));
  assert.ok(config.testRunnerIds.includes("test-apps-web-test"));
  assert.ok(
    config.roleProfiles.frontend_specialist.allowedCommandIds.includes(
      "run-root-dev"
    )
  );
  assert.equal(
    config.roleProfiles.curator.allowedCommandIds.includes(
      "install-root-dependencies"
    ),
    false
  );
  assert.ok(
    config.roleProfiles.curator.allowedCommandIds.includes(
      "type-check-root-type-check"
    )
  );
});
