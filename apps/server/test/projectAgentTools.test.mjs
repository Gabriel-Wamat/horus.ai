import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
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

test("project agent tools wrap file read, search, list and versioned save", async () => {
  const root = await setupToolProject();
  const tools = buildTools(root);

  const list = await tools.execute({
    agentProfileId: "chat_agent",
    toolName: "list_files",
    input: { projectId: PROJECT_ID },
  });
  assert.ok(list.entries.some((entry) => entry.path === "src/App.tsx"));

  const profile = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "inspect_project",
    input: { projectId: PROJECT_ID, maxEditableFiles: 20 },
  });
  assert.equal(profile.framework.name, "react");
  assert.ok(profile.editableFiles.some((file) => file.path === "src/App.tsx"));

  const read = await tools.execute({
    agentProfileId: "chat_agent",
    toolName: "read_file",
    input: { projectId: PROJECT_ID, path: "src/App.tsx" },
  });
  assert.equal(read.path, "src/App.tsx");
  assert.match(read.content, /Horus/);
  assert.ok(read.versionHash);
  assert.equal(read.version.hash, read.versionHash);

  const rangedRead = await tools.execute({
    agentProfileId: "chat_agent",
    toolName: "read_file",
    input: {
      projectId: PROJECT_ID,
      path: "src/App.tsx",
      startLine: 1,
      endLine: 1,
    },
  });
  assert.equal(rangedRead.path, "src/App.tsx");
  assert.equal(rangedRead.content, "export const App = () => 'Horus App';");
  assert.equal(rangedRead.startLine, 1);
  assert.equal(rangedRead.endLine, 1);
  assert.ok(rangedRead.versionHash);

  const search = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "search_code",
    input: { projectId: PROJECT_ID, query: "Horus App" },
  });
  assert.equal(search.projectId, PROJECT_ID);
  assert.ok(search.inspectedFiles.includes("src/App.tsx"));

  const saved = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "save_file",
    input: {
      projectId: PROJECT_ID,
      path: "src/App.tsx",
      content: "export const App = () => 'Edited Horus';\n",
      baseVersion: {
        hash: read.versionHash,
        sizeBytes: read.version.sizeBytes,
        mtimeMs: read.version.mtimeMs,
      },
    },
  });
  assert.equal(saved.path, "src/App.tsx");
  assert.equal(saved.changed, true);
  assert.match(await readFile(join(root, "src", "App.tsx"), "utf8"), /Edited Horus/);
});

test("project agent tools expose governed edit and delete operations", async () => {
  const root = await setupToolProject();
  const tools = buildTools(root);
  const read = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "read_file",
    input: { projectId: PROJECT_ID, path: "src/App.tsx" },
  });

  const edited = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "edit_file",
    input: {
      projectId: PROJECT_ID,
      path: "src/App.tsx",
      oldString: read.content,
      newString: "export const App = () => 'Tool edited';\n",
      expectedContentHash: read.versionHash,
      reason: "Apply requested frontend change.",
    },
  });
  assert.equal(edited.path, "src/App.tsx");
  assert.equal(edited.changed, true);
  assert.equal(edited.replacementCount, 1);
  assert.match(edited.diff, /Tool edited/);
  assert.match(await readFile(join(root, "src", "App.tsx"), "utf8"), /Tool edited/);

  const created = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "write_file",
    input: {
      projectId: PROJECT_ID,
      path: "src/NewPanel.tsx",
      content: "export const NewPanel = () => null;\n",
      reason: "Create new panel.",
    },
  });
  assert.deepEqual(created.path, "src/NewPanel.tsx");
  assert.equal(created.changed, true);
  assert.ok(created.newVersionHash);

  const deleted = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "delete_file",
    input: {
      projectId: PROJECT_ID,
      path: "src/obsolete.ts",
      reason: "Remove obsolete file.",
    },
  });
  assert.deepEqual(deleted, { path: "src/obsolete.ts", deleted: true });
  await assert.rejects(
    () => readFile(join(root, "src", "obsolete.ts"), "utf8"),
    /ENOENT/
  );
});

test("project agent tools expose line-range replacement for malformed files", async () => {
  const root = await setupToolProject();
  const tools = buildTools(root);
  await writeFile(
    join(root, "src", "App.tsx"),
    ["export const App = () => (", "  <main>ok</main>", ");", "<div>duplicate</div>", ""].join("\n"),
    "utf8"
  );

  const replaced = await tools.execute({
    agentProfileId: "horus_chat_executor",
    toolName: "replace_file_range",
    input: {
      projectId: PROJECT_ID,
      path: "src/App.tsx",
      startLine: 4,
      endLine: 4,
      replacement: "",
      reason: "Remove duplicated JSX outside the component.",
    },
  });

  assert.equal(replaced.path, "src/App.tsx");
  assert.equal(replaced.changed, true);
  assert.equal(replaced.replacementCount, 1);
  assert.doesNotMatch(await readFile(join(root, "src", "App.tsx"), "utf8"), /duplicate/);
});

test("project agent tools treat identical edit_file replacements as audited no-ops", async () => {
  const root = await setupToolProject();
  const tools = buildTools(root);
  const read = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "read_file",
    input: { projectId: PROJECT_ID, path: "src/App.tsx" },
  });

  const edited = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "edit_file",
    input: {
      projectId: PROJECT_ID,
      path: "src/App.tsx",
      oldString: read.content,
      newString: read.content,
      expectedContentHash: read.versionHash,
      reason: "Skip identical generated edit.",
    },
  });

  assert.equal(edited.path, "src/App.tsx");
  assert.equal(edited.changed, false);
  assert.equal(edited.replacementCount, 0);
  assert.equal(edited.additions, 0);
  assert.equal(edited.deletions, 0);
  assert.equal(edited.diff, "");
  assert.equal(await readFile(join(root, "src", "App.tsx"), "utf8"), read.content);
});

test("project agent tools enforce profile and path boundaries for writes", async () => {
  const root = await setupToolProject();
  const tools = buildTools(root);

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "qa_agent",
        toolName: "edit_file",
        input: {
          projectId: PROJECT_ID,
          path: "src/App.tsx",
          oldString: "Horus App",
          newString: "QA write",
        },
      }),
    /not allowed/
  );

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "front_agent",
        toolName: "edit_file",
        input: {
          projectId: PROJECT_ID,
          path: ".env",
          oldString: "SECRET=0",
          newString: "SECRET=1\n",
        },
      }),
    /displayed|sensitive/
  );

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "front_agent",
        toolName: "edit_file",
        input: {
          projectId: PROJECT_ID,
          path: "../outside.ts",
          oldString: "old",
          newString: "export {}\n",
        },
      }),
    /escapes|outside/
  );

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "front_agent",
        toolName: "write_file",
        input: {
          projectId: PROJECT_ID,
          path: "src/App.tsx",
          content: "export const App = () => 'overwrite';\n",
        },
      }),
    /refuses to overwrite/
  );

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "front_agent",
        toolName: "delete_file",
        input: {
          projectId: PROJECT_ID,
          path: ".horus-project.yaml",
        },
      }),
    /Protected project file|delete/i
  );
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

test("run_validation_command returns dependency repair and retry evidence", async () => {
  const root = await setupToolProject({
    commandCatalog: [
      {
        id: "build-root-build",
        executable: process.execPath,
        args: [
          "-e",
          [
            "const fs=require('node:fs');",
            "if(!fs.existsSync('node_modules/.repaired')){",
            "console.error('sh: vite: command not found');",
            "process.exit(1);",
            "}",
            "console.log('build passed after install');",
          ].join(""),
        ],
        cwd: ".",
        env: {},
        timeoutMs: 5_000,
      },
      {
        id: "install-root-dependencies",
        executable: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync('node_modules/.repaired','ok')",
        ],
        cwd: ".",
        env: {},
        timeoutMs: 5_000,
      },
    ],
    defaultValidationCommandIds: ["build-root-build"],
  });
  await mkdir(join(root, "node_modules"), { recursive: true });
  const tools = buildTools(root);

  const result = await tools.execute({
    agentProfileId: "qa_agent",
    toolName: "run_validation_command",
    input: {
      projectId: PROJECT_ID,
      commandId: "build-root-build",
      roleName: "qa_specialist",
    },
  });

  assert.equal(result.commandId, "build-root-build");
  assert.equal(result.exitCode, 0);
  assert.deepEqual(
    result.runs.map((run) => run.commandId),
    ["build-root-build", "install-root-dependencies", "build-root-build"]
  );
  assert.deepEqual(
    result.runs.map((run) => run.exitCode),
    [1, 0, 0]
  );
  assert.match(result.runs[0].stderrTail, /vite: command not found/);
  assert.match(result.runs[2].stdoutTail, /build passed after install/);
});

test("inspect_preview exposes QA smoke validation through governed project tools", async () => {
  const root = await setupToolProject();
  const tools = buildTools(root, {
    previewSmokeValidator: {
      async validate(previewSessionId) {
        assert.equal(previewSessionId, "77777777-7777-4777-8777-777777777777");
        return {
          status: "passed",
          reason: "preview_reachable",
          previewSessionId,
          previewStatus: "running",
          previewUrl: "http://localhost:5173",
          statusCode: 200,
          contentType: "text/html",
          bodyBytes: 128,
          elapsedMs: 9,
          checkedAt: "2026-05-30T00:03:30.000Z",
        };
      },
    },
  });

  const result = await tools.execute({
    agentProfileId: "qa_agent",
    toolName: "inspect_preview",
    input: {
      projectId: PROJECT_ID,
      previewSessionId: "77777777-7777-4777-8777-777777777777",
    },
  });

  assert.equal(result.status, "passed");
  assert.equal(result.previewStatus, "running");
  assert.equal(result.statusCode, 200);
});

async function setupToolProject(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "horus-agent-tools-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), "export const App = () => 'Horus App';\n");
  await writeFile(join(root, "src", "obsolete.ts"), "export const old = true;\n");
  const commandCatalog = options.commandCatalog ?? [
    {
      id: "validate-node",
      executable: process.execPath,
      args: ["-e", "console.log('validated')"],
      cwd: ".",
      env: {},
    },
  ];
  const defaultValidationCommandIds =
    options.defaultValidationCommandIds ?? ["validate-node"];
  await writeFile(
    join(root, ".horus-project.yaml"),
    JSON.stringify({
      version: 1,
      projectName: "Tool Demo",
      projectStack: "typescript-react",
      baseRef: "main",
      writeRoots: ["."],
      commandCatalog,
      testRunnerIds: defaultValidationCommandIds,
      bootstrapCommandIds: [],
      roleProfiles: {
        backend_specialist: { allowedCommandIds: commandCatalog.map((command) => command.id), defaultValidationCommandIds },
        frontend_specialist: { allowedCommandIds: commandCatalog.map((command) => command.id), defaultValidationCommandIds },
        qa_specialist: { allowedCommandIds: commandCatalog.map((command) => command.id), defaultValidationCommandIds },
      },
    })
  );
  return root;
}

function buildTools(root, options = {}) {
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
    previewSmokeValidator: options.previewSmokeValidator,
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
