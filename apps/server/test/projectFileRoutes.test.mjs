import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createProjectFileRouter } from "../dist/infrastructure/http/routes/projectFileRoutes.js";
import { ProjectFileBrowserService } from "../dist/infrastructure/project/ProjectFileBrowserService.js";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

test("project file routes expose projects, tree, file content, and safe errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-file-routes-"));
  await writeFile(join(root, "README.md"), "# Demo\n");
  await writeFile(
    join(root, ".horus-project.yaml"),
    JSON.stringify({
      version: 1,
      projectName: "Route Demo",
      projectStack: "typescript-react",
      baseRef: "main",
      writeRoots: ["."],
      commandCatalog: [
        {
          id: "run-root-dev",
          executable: process.execPath,
          args: ["-e", "console.log('dev')"],
          cwd: ".",
          env: {},
        },
      ],
      testRunnerIds: [],
      bootstrapCommandIds: [],
      roleProfiles: {
        backend_specialist: { allowedCommandIds: ["run-root-dev"], defaultValidationCommandIds: [] },
        frontend_specialist: { allowedCommandIds: ["run-root-dev"], defaultValidationCommandIds: [] },
        qa_specialist: { allowedCommandIds: ["run-root-dev"], defaultValidationCommandIds: [] },
      },
    }),
    "utf-8"
  );

  const service = new ProjectFileBrowserService(repositoryFor(root), {
    logger: silentLogger,
  });
  const router = createProjectFileRouter({ fileBrowser: service });

  const projects = await invokeRoute(router, "get", "/projects");
  assert.equal(projects.statusCode, 200);
  assert.equal(projects.body.projects.length, 1);
  assert.equal(projects.body.projects[0].id, PROJECT_ID);

  const tree = await invokeRoute(router, "get", "/projects/:projectId/tree", {
    params: { projectId: PROJECT_ID },
  });
  assert.equal(tree.statusCode, 200);
  assert.ok(tree.body.entries.some((entry) => entry.path === "README.md"));

  const manifest = await invokeRoute(router, "get", "/projects/:projectId/manifest", {
    params: { projectId: PROJECT_ID },
  });
  assert.equal(manifest.statusCode, 200);
  assert.equal(manifest.body.projectId, PROJECT_ID);
  assert.equal(manifest.body.projectName, "Route Demo");
  assert.equal(manifest.body.security.rulesCannotGrantPermissions, true);

  const file = await invokeRoute(router, "get", "/projects/:projectId/file", {
    params: { projectId: PROJECT_ID },
    query: { path: "README.md" },
  });
  assert.equal(file.statusCode, 200);
  assert.equal(file.body.content, "# Demo\n");
  assert.ok(file.body.version);

  const saved = await invokeRoute(router, "put", "/projects/:projectId/file", {
    params: { projectId: PROJECT_ID },
    body: {
      path: "README.md",
      content: "# Edited\n",
      baseVersion: file.body.version,
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.content, "# Edited\n");

  const conflict = await invokeRoute(router, "put", "/projects/:projectId/file", {
    params: { projectId: PROJECT_ID },
    body: {
      path: "README.md",
      content: "# Stale\n",
      baseVersion: file.body.version,
    },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.error, "version_conflict");

  const traversal = await invokeRoute(router, "get", "/projects/:projectId/file", {
    params: { projectId: PROJECT_ID },
    query: { path: "../secret.txt" },
  });
  assert.equal(traversal.statusCode, 403);
  assert.equal(traversal.body.error, "forbidden_path");
});

async function invokeRoute(router, method, path, options = {}) {
  const layer = router.stack.find(
    (item) => item.route?.path === path && item.route?.methods?.[method]
  );
  assert.ok(layer, `Route not found: ${method.toUpperCase()} ${path}`);
  const handler = layer.route.stack[0].handle;
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body });
        return this;
      },
    };
    Promise.resolve(
      handler(
        { params: options.params ?? {}, query: options.query ?? {}, body: options.body },
        res,
        reject
      )
    ).catch(reject);
  });
}

const silentLogger = {
  info() {},
  warn() {},
};

function repositoryFor(rootPath) {
  const now = new Date().toISOString();
  const project = {
    id: PROJECT_ID,
    workspaceFolderId: null,
    name: "Route Demo",
    slug: "route-demo",
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
    async saveProjectWorkspace(value) {
      return value;
    },
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
    async saveConstructionRun(value) {
      return value;
    },
    async updateConstructionRun(value) {
      return value;
    },
    async getConstructionRun(id) {
      throw new Error(`Project construction run not found: ${id}`);
    },
    async appendCommandRun(value) {
      return value;
    },
    async listCommandRuns() {
      return [];
    },
    async appendQualityGate(value) {
      return value;
    },
    async listQualityGates() {
      return [];
    },
  };
}
