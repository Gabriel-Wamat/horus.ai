import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { PreviewProjectHealthService } from "../dist/infrastructure/preview/PreviewProjectHealthService.js";

function projectFixture(overrides = {}) {
  return {
    id: overrides.id ?? "11111111-1111-4111-8111-111111111116",
    name: overrides.name ?? "project-manager-beautiful-ui-spec59-final",
    slug: overrides.slug ?? "project-manager-beautiful-ui-spec59-final",
    rootPath: overrides.rootPath ?? "/tmp/missing",
    defaultRoute: "/",
    devCommand: null,
    previewCommandId: "preview-dev",
    commandCatalog: [
      {
        id: "preview-dev",
        executable: "pnpm",
        args: ["dev"],
        cwd: ".",
        env: {},
      },
    ],
    previewUrl: overrides.previewUrl ?? "http://127.0.0.1:5184",
    createdAt: overrides.createdAt ?? "2026-05-27T00:00:00.000Z",
    projectKind: "generated",
    lifecycleStatus: "published",
    visibility: "visible",
    healthStatus: "unknown",
    healthReasons: [],
    canonicalProjectId: null,
    projectWorkspaceId: null,
    appFingerprint: null,
    lastHealthCheckedAt: null,
    archivedAt: null,
    archivedReason: null,
    ...overrides,
  };
}

async function writeGeneratedApp(rootPath, appSource) {
  await mkdir(join(rootPath, "src"), { recursive: true });
  await writeFile(join(rootPath, "package.json"), "{}\n", "utf8");
  await writeFile(join(rootPath, "src", "App.tsx"), appSource, "utf8");
  await writeFile(join(rootPath, "src", "main.tsx"), "import './App';\n", "utf8");
  await writeFile(
    join(rootPath, "horus.project.json"),
    `${JSON.stringify({ projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })}\n`,
    "utf8"
  );
}

test("PreviewProjectHealthService hides scaffold-only generated projects", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "horus-health-scaffold-"));
  await writeGeneratedApp(
    rootPath,
    "import { WelcomeScreen } from './features/welcome/components/WelcomeScreen'; export function App(){ return <WelcomeScreen />; }\n"
  );
  const service = new PreviewProjectHealthService({
    now: () => "2026-05-27T10:00:00.000Z",
  });

  const [project] = await service.listProjects(
    [projectFixture({ rootPath })],
    "all"
  );

  assert.equal(project.healthStatus, "blocked");
  assert.equal(project.visibility, "hidden");
  assert.equal(project.lifecycleStatus, "failed");
  assert.ok(project.healthReasons.includes("scaffold_only"));
});

test("PreviewProjectHealthService keeps only canonical project visible per family", async () => {
  const oldRoot = await mkdtemp(join(tmpdir(), "horus-health-old-"));
  const newRoot = await mkdtemp(join(tmpdir(), "horus-health-new-"));
  await writeGeneratedApp(
    oldRoot,
    "export function App(){ return <main><h1>Dashboard</h1></main>; }\n"
  );
  await writeGeneratedApp(
    newRoot,
    "export function App(){ return <main><h1>Dashboard</h1><nav>Tarefas</nav></main>; }\n"
  );
  const service = new PreviewProjectHealthService({
    now: () => "2026-05-27T10:00:00.000Z",
  });
  const oldProject = projectFixture({
    id: "22222222-2222-4222-8222-222222222222",
    name: "project-manager-beautiful-ui",
    slug: "project-manager-beautiful-ui",
    rootPath: oldRoot,
    createdAt: "2026-05-27T08:00:00.000Z",
    previewUrl: "http://127.0.0.1:5184",
  });
  const newProject = projectFixture({
    id: "33333333-3333-4333-8333-333333333333",
    name: "project-manager-beautiful-ui-spec59-final",
    slug: "project-manager-beautiful-ui-spec59-final",
    rootPath: newRoot,
    createdAt: "2026-05-27T09:00:00.000Z",
    previewUrl: "http://127.0.0.1:5185",
  });

  const visible = await service.listProjects([oldProject, newProject], "visible");
  const all = await service.listProjects([oldProject, newProject], "all");

  assert.deepEqual(visible.map((project) => project.id), [newProject.id]);
  const superseded = all.find((project) => project.id === oldProject.id);
  assert.equal(superseded.lifecycleStatus, "superseded");
  assert.equal(superseded.canonicalProjectId, newProject.id);
  assert.ok(superseded.healthReasons.includes("superseded_by_canonical"));
});
