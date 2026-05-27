import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { AgentProfileRegistry } from "../dist/application/services/AgentProfileRegistry.js";
import { AgentToolRegistry } from "../dist/application/services/AgentToolRegistry.js";
import { ReadOnlyCodeContextService } from "../dist/application/services/ReadOnlyCodeContextService.js";
import { registerProjectAgentTools } from "../dist/application/tools/registerProjectAgentTools.js";
import { ProjectFileBrowserService } from "../dist/infrastructure/project/ProjectFileBrowserService.js";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

test("project agent tools wrap file read, search, list and versioned save", async () => {
  const root = await setupToolProject();
  const tools = buildTools(root);

  const list = await tools.execute({
    agentProfileId: "chat_agent",
    toolName: "list_files",
    input: { projectId: PROJECT_ID },
  });
  assert.ok(list.entries.some((entry) => entry.path === "src/App.tsx"));

  const read = await tools.execute({
    agentProfileId: "chat_agent",
    toolName: "read_file",
    input: { projectId: PROJECT_ID, path: "src/App.tsx" },
  });
  assert.equal(read.path, "src/App.tsx");
  assert.match(read.content, /Horus/);
  assert.ok(read.versionHash);

  const search = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "search_code",
    input: { projectId: PROJECT_ID, query: "Horus App" },
  });
  assert.equal(search.projectId, PROJECT_ID);
  assert.ok(search.inspectedFiles.includes("src/App.tsx"));

  const saved = await tools.execute({
    agentProfileId: "curator_agent",
    toolName: "save_file",
    input: {
      projectId: PROJECT_ID,
      path: "src/App.tsx",
      content: "export const App = () => 'Edited Horus';\n",
      baseVersion: {
        hash: read.versionHash,
        sizeBytes: read.content.length,
        mtimeMs: 1,
      },
    },
  });
  assert.equal(saved.path, "src/App.tsx");
  assert.equal(saved.changed, true);
  assert.match(await readFile(join(root, "src", "App.tsx"), "utf8"), /Edited Horus/);
});

test("project agent tools reject raw shell validation inputs", async () => {
  const root = await setupToolProject();
  const tools = buildTools(root);

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "qa_agent",
        toolName: "run_validation_command",
        input: {
          projectId: PROJECT_ID,
          command: "rm -rf /",
        },
      }),
    /Required/
  );
});

async function setupToolProject() {
  const root = await mkdtemp(join(tmpdir(), "horus-agent-tools-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), "export const App = () => 'Horus App';\n");
  await writeFile(
    join(root, ".horus-project.yaml"),
    JSON.stringify({
      version: 1,
      projectName: "Tool Demo",
      projectStack: "typescript-react",
      baseRef: "main",
      writeRoots: ["."],
      commandCatalog: [
        {
          id: "validate-node",
          executable: process.execPath,
          args: ["-e", "console.log('validated')"],
          cwd: ".",
          env: {},
        },
      ],
      testRunnerIds: ["validate-node"],
      bootstrapCommandIds: [],
      roleProfiles: {
        backend_specialist: { allowedCommandIds: ["validate-node"], defaultValidationCommandIds: ["validate-node"] },
        frontend_specialist: { allowedCommandIds: ["validate-node"], defaultValidationCommandIds: ["validate-node"] },
        qa_specialist: { allowedCommandIds: ["validate-node"], defaultValidationCommandIds: ["validate-node"] },
      },
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
  });
  return tools;
}

function repositoryFor(rootPath) {
  const now = new Date().toISOString();
  const project = {
    id: PROJECT_ID,
    workspaceFolderId: null,
    name: "Tool Demo",
    slug: "tool-demo",
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
