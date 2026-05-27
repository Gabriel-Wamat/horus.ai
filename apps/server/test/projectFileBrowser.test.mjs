import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import express from "express";
import { ProjectArchiveService } from "../dist/infrastructure/project/ProjectArchiveService.js";
import { ProjectFileBrowserService } from "../dist/infrastructure/project/ProjectFileBrowserService.js";
import { createProjectFileRouter } from "../dist/infrastructure/http/routes/projectFileRoutes.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

test("ProjectFileBrowserService lists safe project files and filters sensitive/generated paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-files-root-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "node_modules", "x"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), "export function App() { return null; }\n");
  await writeFile(join(root, ".env"), "SECRET=1\n");
  await writeFile(join(root, "node_modules", "x", "index.js"), "module.exports = 1;\n");

  const service = new ProjectFileBrowserService(repositoryFor(root), {
    logger: silentLogger,
  });

  const tree = await service.getTree({ projectId: PROJECT_ID });

  assert.equal(tree.projectId, PROJECT_ID);
  assert.ok(tree.entries.some((entry) => entry.path === "src" && entry.kind === "dir"));
  assert.ok(tree.entries.some((entry) => entry.path === "src/App.tsx" && entry.kind === "file"));
  assert.ok(!tree.entries.some((entry) => entry.path.includes(".env")));
  assert.ok(!tree.entries.some((entry) => entry.path.includes("node_modules")));
  assert.ok(tree.ignoredCount >= 2);
});

test("ProjectFileBrowserService reads text files with truncation metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-files-root-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "note.md"), "abcdef");

  const service = new ProjectFileBrowserService(repositoryFor(root), {
    logger: silentLogger,
  });

  const file = await service.getFileContent({
    projectId: PROJECT_ID,
    path: "docs/note.md",
    maxBytes: 3,
  });

  assert.equal(file.path, "docs/note.md");
  assert.equal(file.content, "abc");
  assert.equal(file.truncated, true);
  assert.equal(file.binary, false);
  assert.equal(file.version, undefined);
  assert.equal(file.language, "markdown");
});

test("ProjectFileBrowserService saves text files with version conflict protection", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-files-root-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), "export const value = 1;\n");

  const service = new ProjectFileBrowserService(repositoryFor(root), {
    logger: silentLogger,
  });
  const file = await service.getFileContent({
    projectId: PROJECT_ID,
    path: "src/App.tsx",
  });
  assert.ok(file.version);

  const saved = await service.saveFile({
    projectId: PROJECT_ID,
    path: "src/App.tsx",
    content: "export const value = 2;\n",
    baseVersion: file.version,
  });

  assert.equal(saved.content, "export const value = 2;\n");
  assert.notEqual(saved.version.hash, file.version.hash);
  assert.equal(await readFile(join(root, "src", "App.tsx"), "utf-8"), "export const value = 2;\n");

  await assert.rejects(
    () =>
      service.saveFile({
        projectId: PROJECT_ID,
        path: "src/App.tsx",
        content: "export const value = 3;\n",
        baseVersion: file.version,
      }),
    /changed on disk/
  );
  assert.equal(await readFile(join(root, "src", "App.tsx"), "utf-8"), "export const value = 2;\n");
});

test("ProjectFileBrowserService rejects traversal, secrets, and symlink escapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-files-root-"));
  const outside = await mkdtemp(join(tmpdir(), "horus-files-outside-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, ".env"), "SECRET=1\n");
  await writeFile(join(outside, "secret.txt"), "outside\n");
  await symlink(join(outside, "secret.txt"), join(root, "src", "linked-secret.txt"));

  const service = new ProjectFileBrowserService(repositoryFor(root), {
    logger: silentLogger,
  });

  await assert.rejects(
    () =>
      service.getFileContent({
        projectId: PROJECT_ID,
        path: "../outside.txt",
      }),
    /outside the selected project/
  );
  await assert.rejects(
    () =>
      service.getFileContent({
        projectId: PROJECT_ID,
        path: ".env",
      }),
    /cannot be displayed/
  );
  await assert.rejects(
    () =>
      service.getFileContent({
        projectId: PROJECT_ID,
        path: "src/linked-secret.txt",
      }),
    /outside the selected project|cannot be displayed/
  );
});

test("ProjectFileBrowserService returns binary metadata without content", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-files-root-"));
  await writeFile(join(root, "image.bin"), Buffer.from([0, 1, 2, 3, 4, 5]));

  const service = new ProjectFileBrowserService(repositoryFor(root), {
    logger: silentLogger,
  });

  const file = await service.getFileContent({
    projectId: PROJECT_ID,
    path: "image.bin",
  });

  assert.equal(file.binary, true);
  assert.equal(file.content, null);
  assert.equal(file.sizeBytes, 6);
  assert.equal(file.version, undefined);
  await assert.rejects(
    () =>
      service.saveFile({
        projectId: PROJECT_ID,
        path: "image.bin",
        content: "text",
        baseVersion: { hash: "a".repeat(64), sizeBytes: 6, mtimeMs: 0 },
      }),
    /Binary files cannot be edited/
  );
});

test("ProjectFileBrowserService lists latest run metadata for projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-files-root-"));
  const service = new ProjectFileBrowserService(repositoryFor(root), {
    logger: silentLogger,
  });

  const projects = await service.listProjects();

  assert.equal(projects[0].latestRunId, RUN_ID);
  assert.equal(projects[0].status, "running");
});

test("ProjectFileBrowserService can read a git worktree tied to an existing project", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-files-root-"));
  const runRoot = await mkdtemp(join(tmpdir(), "horus-files-run-"));
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, "root.txt"), "root\n");
  await writeFile(join(runRoot, "run.txt"), "run\n");
  const fakeGit = {
    async run(cwd, args) {
      const fs = await import("node:fs/promises");
      const realRunRoot = await fs.realpath(runRoot);
      const realGitDir = await fs.realpath(join(root, ".git"));
      if (args[1] === "--show-toplevel") return { stdout: `${realRunRoot}\n`, stderr: "", exitCode: 0 };
      if (args[1] === "--git-common-dir") return { stdout: `${realGitDir}\n`, stderr: "", exitCode: 0 };
      assert.equal(cwd, realRunRoot);
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    },
  };

  const service = new ProjectFileBrowserService(repositoryFor(root, runRoot, {
    targetMode: "existing_project",
  }), {
    git: fakeGit,
    logger: silentLogger,
  });

  const file = await service.getFileContent({
    projectId: PROJECT_ID,
    runId: RUN_ID,
    path: "run.txt",
  });

  assert.equal(file.runId, RUN_ID);
  assert.equal(file.content, "run\n");
});

test("ProjectArchiveService streams a safe project ZIP with organized files", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-files-root-"));
  const outside = await mkdtemp(join(tmpdir(), "horus-files-outside-"));
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "node_modules", "x"), { recursive: true });
  await mkdir(join(root, "dist"), { recursive: true });
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, "package.json"), "{\"name\":\"demo\"}\n");
  await writeFile(join(root, "src", "App.tsx"), "export function App() { return null; }\n");
  await writeFile(join(root, ".gitignore"), "node_modules/\n");
  await writeFile(join(root, ".env"), "SECRET=1\n");
  await writeFile(join(root, "node_modules", "x", "index.js"), "module.exports = 1;\n");
  await writeFile(join(root, "dist", "bundle.js"), "compiled\n");
  await writeFile(join(root, ".git", "config"), "[core]\n");
  await writeFile(join(outside, "secret.txt"), "outside\n");
  await symlink(join(outside, "secret.txt"), join(root, "src", "linked-secret.txt"));

  const archive = new ProjectArchiveService(
    new ProjectFileBrowserService(repositoryFor(root), { logger: silentLogger }),
    { logger: silentLogger }
  );
  const manifest = await archive.createManifest({ projectId: PROJECT_ID });

  assert.equal(manifest.projectId, PROJECT_ID);
  assert.equal(manifest.runId, null);
  assert.ok(manifest.fileName.startsWith("horus-project-demo-project-"));
  assert.ok(manifest.entries.some((entry) => entry.archivePath === "demo-project/package.json"));
  assert.ok(manifest.entries.some((entry) => entry.archivePath === "demo-project/src/App.tsx"));
  assert.ok(manifest.entries.some((entry) => entry.archivePath === "demo-project/.gitignore"));
  assert.ok(!manifest.entries.some((entry) => entry.archivePath.includes(".env")));
  assert.ok(!manifest.entries.some((entry) => entry.archivePath.includes("node_modules")));
  assert.ok(!manifest.entries.some((entry) => entry.archivePath.includes("dist/")));
  assert.ok(!manifest.entries.some((entry) => entry.archivePath.includes(".git/")));
  assert.ok(!manifest.entries.some((entry) => entry.archivePath.includes("linked-secret")));

  const zipPath = join(root, "download.zip");
  await archive.streamZip(manifest, createWriteStream(zipPath));
  const zip = await readFile(zipPath);

  assert.ok(zip.includes(Buffer.from("demo-project/package.json")));
  assert.ok(zip.includes(Buffer.from("demo-project/src/App.tsx")));
  assert.ok(zip.includes(Buffer.from("demo-project/.gitignore")));
  assert.ok(!zip.includes(Buffer.from(".env")));
  assert.ok(!zip.includes(Buffer.from("node_modules")));
  assert.ok(!zip.includes(Buffer.from("linked-secret")));
});

test("Project file download route returns a ZIP attachment", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-files-root-"));
  await writeFile(join(root, "package.json"), "{\"name\":\"demo\"}\n");
  await writeFile(join(root, ".env"), "SECRET=1\n");
  const fileBrowser = new ProjectFileBrowserService(repositoryFor(root), {
    logger: silentLogger,
  });
  const archiveService = new ProjectArchiveService(fileBrowser, {
    logger: silentLogger,
  });
  const app = express();
  app.use(
    "/api/project-files",
    createProjectFileRouter({ fileBrowser, archiveService })
  );
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/project-files/projects/${PROJECT_ID}/download`
    );
    const body = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.match(
      response.headers.get("content-disposition") ?? "",
      /^attachment; filename="horus-project-demo-project-/
    );
    assert.ok(body.includes(Buffer.from("demo-project/package.json")));
    assert.ok(!body.includes(Buffer.from(".env")));
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

const silentLogger = {
  info() {},
  warn() {},
};

function repositoryFor(rootPath, runRootPath = rootPath, options = {}) {
  const now = new Date().toISOString();
  const project = {
    id: PROJECT_ID,
    workspaceFolderId: null,
    name: "Demo Project",
    slug: "demo-project",
    targetMode: options.targetMode ?? "new_project",
    rootPath,
    configPath: join(rootPath, ".horus-project.yaml"),
    gitRepositoryPath: rootPath,
    currentBranch: "main",
    baseRef: "main",
    projectStack: "typescript-react",
    createdAt: now,
    updatedAt: now,
  };
  const run = {
    id: RUN_ID,
    projectWorkspaceId: PROJECT_ID,
    workflowRunId: null,
    status: "running",
    workspacePath: runRootPath,
    branchName: "main",
    baseRef: "main",
    selectedUserStoryIds: [],
    selectedSpecIds: [],
    startedAt: now,
    finishedAt: null,
    error: null,
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
    async listConstructionRuns(projectWorkspaceId) {
      return projectWorkspaceId === undefined || projectWorkspaceId === PROJECT_ID
        ? [run]
        : [];
    },
    async saveConstructionRun(value) {
      return value;
    },
    async updateConstructionRun(value) {
      return value;
    },
    async getConstructionRun(id) {
      if (id !== RUN_ID) throw new Error(`Project construction run not found: ${id}`);
      return run;
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
