import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
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

test("AgentToolRuntime lets front_agent edit selected project files and records redacted events", async () => {
  const root = await setupRuntimeProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    workflowThreadId: "11111111-1111-4111-8111-111111111111",
    userStoryId: "22222222-2222-4222-8222-222222222222",
  });

  const read = await runtime.execute({
    toolName: "read_file",
    input: { path: "src/App.tsx" },
  });

  const result = await runtime.execute({
    toolName: "edit_file",
    reason: "Implement requested copy.",
    input: {
      path: "src/App.tsx",
      oldString: read.content,
      newString: "export const App = () => 'Runtime edited sk-secret123456789';\n",
      expectedContentHash: read.versionHash,
    },
  });

  assert.equal(result.path, "src/App.tsx");
  assert.equal(result.changed, true);
  assert.equal(result.replacementCount, 1);
  assert.match(await readFile(join(root, "src", "App.tsx"), "utf8"), /Runtime edited/);
  assert.equal(runtime.getEvents().length, 4);
  assert.equal(runtime.getEvents()[0].toolName, "read_file");
  assert.equal(runtime.getEvents()[2].toolName, "edit_file");
  assert.equal(runtime.getEvents()[3].status, "succeeded");
  assert.doesNotMatch(
    JSON.stringify(runtime.getEvents()),
    /sk-secret123456789/
  );
});

test("AgentToolRuntime blocks write tools for read-only agents", async () => {
  const root = await setupRuntimeProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "qa_agent",
    projectId: PROJECT_ID,
  });

  await assert.rejects(
    () =>
      runtime.execute({
        toolName: "edit_file",
        input: {
          path: "src/App.tsx",
          oldString: "Horus App",
          newString: "QA write",
        },
      }),
    /not allowed/
  );
  assert.equal(runtime.getEvents().at(-1)?.status, "blocked");
});

test("AgentToolRuntime requires read_file evidence before edit_file", async () => {
  const root = await setupRuntimeProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
  });

  await assert.rejects(
    () =>
      runtime.execute({
        toolName: "edit_file",
        input: {
          path: "src/App.tsx",
          oldString: "Horus App",
          newString: "Runtime edited",
        },
      }),
    /requires read_file evidence/
  );
  assert.equal(runtime.getEvents().at(-1)?.status, "blocked");
  assert.doesNotMatch(await readFile(join(root, "src", "App.tsx"), "utf8"), /Runtime edited/);
});

test("AgentToolRuntime requires read_file evidence before destructive file mutations", async () => {
  const root = await setupRuntimeProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
  });

  await assert.rejects(
    () =>
      runtime.execute({
        toolName: "delete_file",
        input: {
          path: "src/App.tsx",
          reason: "Remove obsolete file.",
        },
      }),
    /requires read_file evidence/
  );

  await assert.rejects(
    () =>
      runtime.execute({
        toolName: "write_file",
        input: {
          path: "src/App.tsx",
          content: "export const App = () => 'overwrite';\n",
          overwrite: true,
          reason: "Overwrite existing file.",
        },
      }),
    /requires read_file evidence/
  );

  assert.match(await readFile(join(root, "src", "App.tsx"), "utf8"), /Horus App/);
});

test("AgentToolRuntime can seed read-before-write evidence from an operational session projection", async () => {
  const root = await setupRuntimeProject();
  const originalContent = "export const App = () => 'Horus App';\n";
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    readEvidence: [
      {
        path: "src/App.tsx",
        versionHash: createHash("sha256").update(originalContent).digest("hex"),
        baseVersion: null,
        readAt: "2026-05-28T00:00:00.000Z",
      },
    ],
  });

  const result = await runtime.execute({
    toolName: "edit_file",
    input: {
      path: "src/App.tsx",
      oldString: originalContent,
      newString: "export const App = () => 'Seeded evidence edit';\n",
    },
  });

  assert.equal(result.changed, true);
  assert.match(await readFile(join(root, "src", "App.tsx"), "utf8"), /Seeded evidence edit/);
});

test("AgentToolRuntime reads and writes through the infrastructure-owned root override", async () => {
  const root = await setupRuntimeProject();
  const isolatedRoot = await setupRuntimeProject();
  await writeFile(
    join(isolatedRoot, "src", "App.tsx"),
    "export const App = () => 'Isolated workspace';\n"
  );
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    projectRootOverride: isolatedRoot,
  });

  const read = await runtime.execute({
    toolName: "read_file",
    input: { path: "src/App.tsx" },
  });
  assert.equal(read.content, "export const App = () => 'Isolated workspace';\n");

  await runtime.execute({
    toolName: "edit_file",
    input: {
      path: "src/App.tsx",
      oldString: read.content,
      newString: "export const App = () => 'Edited isolated workspace';\n",
      expectedContentHash: read.versionHash,
    },
  });

  assert.equal(
    await readFile(join(isolatedRoot, "src", "App.tsx"), "utf8"),
    "export const App = () => 'Edited isolated workspace';\n"
  );
  assert.equal(
    await readFile(join(root, "src", "App.tsx"), "utf8"),
    "export const App = () => 'Horus App';\n"
  );
});

test("AgentToolRuntime enforces call count and selected project context", async () => {
  const root = await setupRuntimeProject();
  const tools = buildTools(root);
  const runtime = new AgentToolRuntime(tools, {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    maxToolCalls: 1,
  });

  await runtime.execute({
    toolName: "read_file",
    input: { path: "src/App.tsx" },
  });
  await assert.rejects(
    () =>
      runtime.execute({
        toolName: "read_file",
        input: { path: "src/App.tsx" },
      }),
    /limit exceeded/
  );

  const runtimeWithoutProject = new AgentToolRuntime(tools, {
    agentProfileId: "front_agent",
  });
  await assert.rejects(
    () =>
      runtimeWithoutProject.execute({
        toolName: "edit_file",
        input: { path: "src/App.tsx", oldString: "x", newString: "y" },
      }),
    /selected project/
  );
});

async function setupRuntimeProject() {
  const root = await mkdtemp(join(tmpdir(), "horus-agent-runtime-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), "export const App = () => 'Horus App';\n");
  await writeFile(
    join(root, ".horus-project.yaml"),
    JSON.stringify({
      version: 1,
      projectName: "Runtime Demo",
      projectStack: "typescript-react",
      baseRef: "main",
      writeRoots: ["src"],
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
        backend_specialist: {
          allowedCommandIds: ["validate-node"],
          defaultValidationCommandIds: ["validate-node"],
        },
        frontend_specialist: {
          allowedCommandIds: ["validate-node"],
          defaultValidationCommandIds: ["validate-node"],
        },
        qa_specialist: {
          allowedCommandIds: ["validate-node"],
          defaultValidationCommandIds: ["validate-node"],
        },
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
    name: "Runtime Demo",
    slug: "runtime-demo",
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
