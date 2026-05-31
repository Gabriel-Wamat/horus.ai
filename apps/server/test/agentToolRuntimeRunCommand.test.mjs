import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
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
import { ShellCommandRuntime } from "../dist/infrastructure/tools/ShellCommandRuntime.js";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

test("AgentToolRuntime exposes governed run_command for frontend agents", async () => {
  const root = await setupProject();
  const shellEvents = [];
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    onShellOutput(event) {
      shellEvents.push(event);
    },
  });

  const result = await runtime.execute({
    toolName: "run_command",
    input: {
      commandId: "node-probe",
      kind: "test",
      executable: process.execPath,
      args: ["-e", "console.log(process.cwd())"],
      cwd: ".",
      timeoutMs: 5_000,
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.match(result.stdoutTail, /horus-agent-run-command-/);
  assert.equal(runtime.getEvents().at(-1)?.status, "succeeded");
  assert.equal(shellEvents.length >= 1, true);
  assert.equal(shellEvents[0].toolName, "run_command");
  assert.equal(shellEvents[0].output.commandId, "node-probe");
  assert.equal(shellEvents[0].output.traceId, PROJECT_ID);
  assert.equal(shellEvents[0].output.projectId, PROJECT_ID);
  assert.equal(shellEvents[0].output.agentId, "front_agent");
  assert.equal(typeof shellEvents[0].output.toolCallId, "string");
  assert.equal(shellEvents[0].output.stream, "stdout");
  assert.ok(shellEvents.map((event) => event.output.chunk).join("").includes("horus-agent-run-command-"));
});

test("AgentToolRuntime returns policy evidence for rejected run_command", async () => {
  const root = await setupProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
  });

  const result = await runtime.execute({
    toolName: "run_command",
    input: {
      commandId: "curl-probe",
      executable: "curl",
      args: ["http://127.0.0.1"],
      cwd: ".",
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.spawned, false);
  assert.match(result.errorMessage, /not allowed|not allowlisted/i);
});

test("AgentToolRuntime accepts shell command text through run_command", async () => {
  const root = await setupProject();
  const shellEvents = [];
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "qa_agent",
    projectId: PROJECT_ID,
    onShellOutput(event) {
      shellEvents.push(event);
    },
  });

  const result = await runtime.execute({
    toolName: "run_command",
    input: {
      commandId: "shell-command-probe",
      command: "printf 'one\\ntwo\\n' | wc -l",
      cwd: ".",
      timeoutMs: 5_000,
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.command, "printf 'one\\ntwo\\n' | wc -l");
  assert.match(result.stdoutTail.trim(), /^2$/);
  assert.ok(shellEvents.some((event) => event.output.commandId === "shell-command-probe"));
});

test("AgentToolRuntime blocks ad-hoc dependency commands for frontend profile", async () => {
  const root = await setupProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
  });

  const result = await runtime.execute({
    toolName: "run_command",
    input: {
      commandId: "install-deps",
      executable: "pnpm",
      args: ["install"],
      cwd: ".",
    },
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.spawned, false);
  assert.equal(result.approvalRequired, false);
  assert.equal(result.risk, "high");
  assert.ok(result.errorMessage?.includes("front_agent"));
  assert.ok(result.errorMessage?.includes("pnpm install"));
});

test("AgentToolRuntime resolves run_command details from the project command catalog", async () => {
  const root = await setupProject();
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
  });

  const result = await runtime.execute({
    toolName: "run_command",
    input: {
      commandId: "node-catalog-probe",
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.match(result.stdoutTail, /catalog ok/);
  assert.equal(result.executable, process.execPath);
});

test("AgentToolRuntime exposes background run_command as a live task", async () => {
  const root = await setupProject();
  const shellEvents = [];
  const completionEvents = [];
  const runtime = new AgentToolRuntime(buildTools(root), {
    agentProfileId: "front_agent",
    projectId: PROJECT_ID,
    onShellOutput(event) {
      shellEvents.push(event);
    },
    onShellCommandComplete(event) {
      completionEvents.push(event);
    },
  });

  const result = await runtime.execute({
    toolName: "run_command",
    input: {
      commandId: "background-probe",
      executable: process.execPath,
      args: [
        "-e",
        "console.log('agent-background-started'); setTimeout(()=>console.log('agent-background-done'), 80)",
      ],
      cwd: ".",
      timeoutMs: 2_000,
      background: true,
    },
  });

  assert.equal(result.status, "running");
  assert.equal(result.background, true);
  assert.equal(typeof result.taskId, "string");
  assert.equal(runtime.getEvents().at(-1)?.status, "succeeded");

  await delay(180);
  assert.match(await readFile(result.stdoutPath, "utf-8"), /agent-background-done/);
  assert.ok(shellEvents.some((event) => event.output.taskId === result.taskId));
  assert.equal(completionEvents.length, 1);
  assert.equal(completionEvents[0].toolName, "run_command");
  assert.equal(completionEvents[0].result.taskId, result.taskId);
  assert.equal(completionEvents[0].result.status, "completed");
});

async function setupProject() {
  const root = await mkdtemp(join(tmpdir(), "horus-agent-run-command-"));
  await writeFile(
    join(root, ".horus-project.yaml"),
    JSON.stringify({
      version: 1,
      projectName: "Run Command Demo",
      projectStack: "typescript-react",
      baseRef: "main",
      writeRoots: ["."],
      commandCatalog: [
        {
          id: "node-catalog-probe",
          executable: process.execPath,
          args: ["-e", "console.log('catalog ok')"],
          cwd: ".",
          env: {},
          timeoutMs: 5_000,
        },
      ],
      testRunnerIds: [],
      bootstrapCommandIds: [],
      roleProfiles: {
        backend_specialist: {
          allowedCommandIds: ["node-catalog-probe"],
          defaultValidationCommandIds: ["node-catalog-probe"],
        },
        frontend_specialist: {
          allowedCommandIds: ["node-catalog-probe"],
          defaultValidationCommandIds: ["node-catalog-probe"],
        },
        qa_specialist: {
          allowedCommandIds: ["node-catalog-probe"],
          defaultValidationCommandIds: ["node-catalog-probe"],
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
    shellRuntime: new ShellCommandRuntime(),
  });
  return tools;
}

function repositoryFor(rootPath) {
  const now = new Date().toISOString();
  const project = {
    id: PROJECT_ID,
    workspaceFolderId: null,
    name: "Run Command Demo",
    slug: "run-command-demo",
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
