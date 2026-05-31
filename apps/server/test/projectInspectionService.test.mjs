import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ProjectInspectionService } from "../dist/application/services/ProjectInspectionService.js";
import { RepositoryScanner } from "../dist/application/coding/RepositoryScanner.js";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

test("ProjectInspectionService detects a generated React Vite project", async () => {
  const root = await setupViteProject();
  const service = new ProjectInspectionService(new RepositoryScanner());

  const profile = await service.inspect({
    projectId: PROJECT_ID,
    projectRootPath: root,
  });

  assert.equal(profile.projectId, PROJECT_ID);
  assert.equal(profile.packageManager.name, "pnpm");
  assert.equal(profile.packageManager.status, "detected");
  assert.equal(profile.framework.name, "react-vite");
  assert.equal(profile.framework.status, "detected");
  assert.ok(profile.framework.confidence >= 0.9);
  assert.deepEqual(
    profile.scripts.map((script) => script.category).slice(0, 4),
    ["dev", "build", "test", "typecheck"]
  );
  assert.ok(profile.roots.sourceRoots.includes("src"));
  assert.ok(profile.entrypoints.some((entrypoint) => entrypoint.path === "src/main.tsx"));
  assert.ok(profile.routes.some((route) => route.route === "/"));
  assert.ok(profile.editableFiles.some((file) => file.path === "src/App.tsx"));
});

test("ProjectInspectionService returns explicit unknowns when package metadata is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-project-inspection-empty-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), "export const App = () => null;\n");
  const service = new ProjectInspectionService(new RepositoryScanner());

  const profile = await service.inspect({ projectRootPath: root });

  assert.equal(profile.packageManager.name, "unknown");
  assert.equal(profile.packageManager.status, "unknown");
  assert.equal(profile.framework.name, "react");
  assert.equal(profile.framework.status, "partial");
  assert.ok(
    profile.warnings.some((warning) => warning.includes("package.json was not found"))
  );
});

async function setupViteProject() {
  const root = await mkdtemp(join(tmpdir(), "horus-project-inspection-vite-"));
  await mkdir(join(root, "src", "__tests__"), { recursive: true });
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        scripts: {
          dev: "vite --host 127.0.0.1",
          build: "vite build",
          test: "vitest run",
          typecheck: "tsc --noEmit",
          lint: "eslint .",
        },
        dependencies: {
          "@vitejs/plugin-react": "latest",
          react: "latest",
          "react-dom": "latest",
        },
        devDependencies: {
          vite: "latest",
          typescript: "latest",
          vitest: "latest",
        },
      },
      null,
      2
    )
  );
  await writeFile(join(root, "vite.config.ts"), "export default {};\n");
  await writeFile(join(root, "index.html"), "<div id=\"root\"></div>\n");
  await writeFile(join(root, "src", "main.tsx"), "import './App';\n");
  await writeFile(join(root, "src", "App.tsx"), "export const App = () => null;\n");
  await writeFile(join(root, "src", "__tests__", "App.test.tsx"), "test('ok', () => {});\n");
  await writeFile(join(root, "public", "favicon.svg"), "<svg />\n");
  return root;
}
