import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  CodeContextAccessError,
  ReadOnlyCodeContextService,
} from "../dist/application/services/ReadOnlyCodeContextService.js";

const projectId = "11111111-1111-4111-8111-111111111116";

async function setupProject() {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-code-context-"));
  const projectRoot = join(baseDir, "repo", "apps", "web");
  await mkdir(join(projectRoot, "src", "components"), { recursive: true });
  await mkdir(join(projectRoot, "node_modules", "hidden"), { recursive: true });
  await mkdir(join(projectRoot, "dist"), { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({ name: "@u-build/web", scripts: { dev: "vite" } }),
    "utf-8"
  );
  await writeFile(
    join(projectRoot, "src", "App.tsx"),
    "export function App() { return <main>Preview chat</main>; }",
    "utf-8"
  );
  await writeFile(
    join(projectRoot, "src", "components", "PreviewChat.tsx"),
    "export const PreviewChat = () => 'Horus chat';",
    "utf-8"
  );
  await writeFile(
    join(projectRoot, "node_modules", "hidden", "secret.ts"),
    "export const secret = 'do-not-read';",
    "utf-8"
  );
  await writeFile(
    join(projectRoot, "dist", "bundle.js"),
    "console.log('generated');",
    "utf-8"
  );

  return {
    baseDir,
    project: {
      id: projectId,
      name: "user_stories",
      slug: "user-stories",
      rootPath: projectRoot,
      defaultRoute: "/",
      devCommand: "pnpm dev",
      previewUrl: "http://localhost:5174",
      createdAt: "2026-05-26T10:00:00.000Z",
    },
  };
}

const chatContext = {
  session: {
    id: "22222222-2222-4222-8222-222222222222",
    workspaceFolderId: "33333333-3333-4333-8333-333333333333",
    userStoryId: "44444444-4444-4444-8444-444444444444",
    createdAt: "2026-05-26T10:00:00.000Z",
    updatedAt: "2026-05-26T10:00:00.000Z",
  },
  messages: [],
  activeUserStory: {
    id: "44444444-4444-4444-8444-444444444444",
    title: "Preview chat",
    description: "Como usuário, quero conversar com Horus.",
    acceptanceCriteria: [],
    priority: "medium",
    labels: [],
    createdAt: "2026-05-26T10:00:00.000Z",
  },
  artifactContext: {
    workspaceFolderId: "33333333-3333-4333-8333-333333333333",
    userStoryId: "44444444-4444-4444-8444-444444444444",
  },
  previousAgentResults: [],
};

test("ReadOnlyCodeContextService builds bounded context inside the selected project root", async () => {
  const { project } = await setupProject();
  const service = new ReadOnlyCodeContextService();

  const context = await service.buildContext({
    project,
    chatContext,
    query: "Explique o preview chat",
  });

  assert.equal(context.projectId, project.id);
  assert.ok(context.inspectedFiles.includes("package.json"));
  assert.ok(context.inspectedFiles.includes("src/App.tsx"));
  assert.ok(
    context.inspectedFiles.some((path) => path.includes("PreviewChat.tsx"))
  );
  assert.ok(context.totalBytes > 0);
});

test("ReadOnlyCodeContextService rejects paths outside the project root", async () => {
  const { project } = await setupProject();
  const service = new ReadOnlyCodeContextService();

  await assert.rejects(
    () => service.readProjectFile(project, "../server/package.json"),
    CodeContextAccessError
  );
});

test("ReadOnlyCodeContextService ignores generated and vendor folders", async () => {
  const { project } = await setupProject();
  const service = new ReadOnlyCodeContextService();

  const context = await service.buildContext({
    project,
    chatContext,
    query: "secret generated bundle",
  });

  assert.equal(
    context.inspectedFiles.some((path) => path.includes("node_modules")),
    false
  );
  assert.equal(
    context.inspectedFiles.some((path) => path.startsWith("dist/")),
    false
  );
});

test("ReadOnlyCodeContextService enforces file and byte limits", async () => {
  const { project } = await setupProject();
  const service = new ReadOnlyCodeContextService({
    maxFiles: 1,
    maxBytesPerFile: 20,
    maxTotalBytes: 20,
  });

  const context = await service.buildContext({
    project,
    chatContext,
    query: "preview chat package app",
  });

  assert.equal(context.files.length, 1);
  assert.ok(context.totalBytes <= 20);
  assert.ok(context.omittedFilesCount > 0);
});
