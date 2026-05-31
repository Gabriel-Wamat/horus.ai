import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { AgentToolRuntime } from "../dist/application/services/AgentToolRuntime.js";
import { AgentProfileRegistry } from "../dist/application/services/AgentProfileRegistry.js";
import { AgentToolRegistry } from "../dist/application/services/AgentToolRegistry.js";
import { ReadOnlyCodeContextService } from "../dist/application/services/ReadOnlyCodeContextService.js";
import { ProjectInspectionService } from "../dist/application/services/ProjectInspectionService.js";
import { RepositoryScanner } from "../dist/application/coding/RepositoryScanner.js";
import { registerProjectAgentTools } from "../dist/application/tools/registerProjectAgentTools.js";
import { FileMutationPreflightApplier } from "../dist/infrastructure/code/FileMutationPreflightApplier.js";
import { ProjectConfigService } from "../dist/infrastructure/project/ProjectConfigService.js";
import { ProjectDiffAnalyzer } from "../dist/infrastructure/project/ProjectDiffAnalyzer.js";
import { ProjectExecutionService } from "../dist/infrastructure/project/ProjectExecutionService.js";
import { ProjectFileBrowserService } from "../dist/infrastructure/project/ProjectFileBrowserService.js";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

test("AgentToolRuntime exposes inspect_project as read-only project grounding", async () => {
  const root = await setupProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
  });

  const profile = await runtime.execute({
    toolName: "inspect_project",
    input: { maxEditableFiles: 10 },
  });

  assert.equal(profile.framework.name, "react-vite");
  assert.equal(profile.packageManager.name, "pnpm");
  assert.ok(profile.editableFiles.some((file) => file.path === "src/App.tsx"));
  assert.ok(profile.protectedPaths.some((file) => file.path === ".env"));
  assert.ok(profile.protectedPaths.some((file) => file.path === "pnpm-lock.yaml"));
  const events = runtime.getEvents();
  assert.equal(events[0].toolName, "inspect_project");
  assert.equal(events[0].mutatesState, false);
  assert.equal(events[1].status, "succeeded");
});

async function setupProject() {
  const root = await mkdtemp(join(tmpdir(), "horus-agent-inspect-project-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(join(root, ".env"), "SECRET=value\n");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      scripts: { dev: "vite", build: "vite build" },
      dependencies: { react: "latest", "react-dom": "latest" },
      devDependencies: { vite: "latest" },
    })
  );
  await writeFile(join(root, "vite.config.ts"), "export default {};\n");
  await writeFile(join(root, "index.html"), "<div id=\"root\"></div>\n");
  await writeFile(join(root, "src", "main.tsx"), "import './App';\n");
  await writeFile(join(root, "src", "App.tsx"), "export const App = () => null;\n");
  await writeFile(
    join(root, ".horus-project.yaml"),
    JSON.stringify({
      version: 1,
      projectName: "Inspect Demo",
      projectStack: "typescript-react",
      baseRef: "main",
      writeRoots: ["src"],
      commandCatalog: [],
      testRunnerIds: [],
      bootstrapCommandIds: [],
      roleProfiles: {},
    })
  );
  return root;
}

function buildTools(root) {
  const repo = repositoryFor(root);
  const fileBrowser = new ProjectFileBrowserService(repo, {
    logger: { info() {}, warn() {} },
  });
  const tools = new AgentToolRegistry(new AgentProfileRegistry());
  registerProjectAgentTools({
    registry: tools,
    fileBrowser,
    codeContext: new ReadOnlyCodeContextService(),
    projectConstruction: repo,
    configService: new ProjectConfigService(),
    executionService: new ProjectExecutionService(),
    diffAnalyzer: new ProjectDiffAnalyzer(),
    fileMutationApplier: new FileMutationPreflightApplier(),
    projectInspector: new ProjectInspectionService(new RepositoryScanner()),
  });
  return tools;
}

function repositoryFor(rootPath) {
  const now = new Date().toISOString();
  const project = {
    id: PROJECT_ID,
    workspaceFolderId: null,
    name: "Inspect Demo",
    slug: "inspect-demo",
    targetMode: "new_project",
    rootPath,
    configPath: join(rootPath, ".horus-project.yaml"),
    gitRepositoryPath: rootPath,
    currentBranch: "main",
    baseRef: "main",
    projectStack: "typescript-react",
    createdAt: now,
    updatedAt: now,
  };
  return {
    async getProjectWorkspace(id) {
      if (id !== PROJECT_ID) throw new Error(`Project workspace not found: ${id}`);
      return project;
    },
    async listProjectWorkspaces() {
      return [project];
    },
    async listConstructionRuns() {
      return [];
    },
    async getConstructionRun(id) {
      throw new Error(`Project construction run not found: ${id}`);
    },
  };
}
