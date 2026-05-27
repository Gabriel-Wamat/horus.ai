import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  FileWorkspaceStore,
  WorkspaceFolderNotFoundError,
  WorkspaceSpecNotFoundError,
  WorkspaceUserStoryNotFoundError,
} from "../dist/infrastructure/workspace/FileWorkspaceStore.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Processar empresa pelo ticker",
  description: "Como analista, quero informar um ticker.",
  acceptanceCriteria: ["Informa o ticker"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-26T10:00:00.000Z",
};

const spec = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userStoryId: userStory.id,
  version: 1,
  summary: "Criar processamento por ticker",
  technicalApproach: "Implementar fluxo de captura e indexação.",
  components: [
    {
      name: "TickerForm",
      type: "ui",
      description: "Formulário para informar ticker.",
      dependencies: [],
    },
  ],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-05-26T10:01:00.000Z",
};

test("FileWorkspaceStore creates folders and saves each story in its own directory", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const folder = await store.createFolder("User Stories");
  await store.saveUserStories(folder.id, [
    userStory,
    {
      ...userStory,
      id: "22222222-2222-4222-8222-222222222222",
      title: "Fazer perguntas sobre documentos",
    },
  ]);

  const folders = await store.listFolders();
  assert.equal(folders.length, 1);
  assert.equal(folders[0].storyCount, 2);

  const entries = await readdir(join(baseDir, folder.slug), { withFileTypes: true });
  const storyDirs = entries.filter((entry) => entry.isDirectory());
  assert.equal(storyDirs.length, 2);

  const saved = JSON.parse(
    await readFile(
      join(baseDir, folder.slug, storyDirs[0].name, "user-story.json"),
      "utf-8"
    )
  );
  assert.equal(saved.folderId, folder.id);
  assert.ok(saved.story.title);

  const active = JSON.parse(
    await readFile(join(baseDir, folder.slug, storyDirs[0].name, "active.json"), "utf-8")
  );
  const manifest = JSON.parse(
    await readFile(
      join(baseDir, folder.slug, storyDirs[0].name, "manifest.json"),
      "utf-8"
    )
  );
  const revisions = await readdir(
    join(baseDir, folder.slug, storyDirs[0].name, "revisions")
  );
  assert.equal(active.activeRevision, 1);
  assert.equal(manifest.activeRevision, 1);
  assert.deepEqual(revisions, ["0001-user-story.json"]);

  const stories = await store.listUserStories(folder.id);
  assert.deepEqual(
    stories.map((story) => story.title),
    ["Fazer perguntas sobre documentos", "Processar empresa pelo ticker"]
  );
});

test("FileWorkspaceStore rejects missing folders when saving stories", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  await assert.rejects(
    () =>
      store.saveUserStories("11111111-1111-4111-8111-111111111111", [
        userStory,
      ]),
    WorkspaceFolderNotFoundError
  );
});

test("FileWorkspaceStore updates and deletes a persisted user story", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const folder = await store.createFolder("User Stories");
  await store.saveUserStories(folder.id, [userStory]);

  const storyDir = join(baseDir, folder.slug, "processar-empresa-pelo-ticker-11111111");
  const updated = await store.updateUserStory(folder.id, userStory.id, {
    ...userStory,
    title: "Processar empresa editada",
    acceptanceCriteria: ["Critério editado"],
  });

  assert.equal(updated.title, "Processar empresa editada");
  assert.deepEqual(updated.acceptanceCriteria, ["Critério editado"]);

  const storiesAfterUpdate = await store.listUserStories(folder.id);
  assert.equal(storiesAfterUpdate.length, 1);
  assert.equal(storiesAfterUpdate[0].title, "Processar empresa editada");

  const active = JSON.parse(await readFile(join(storyDir, "active.json"), "utf-8"));
  const manifest = JSON.parse(await readFile(join(storyDir, "manifest.json"), "utf-8"));
  const revisions = await readdir(join(storyDir, "revisions"));
  assert.equal(active.activeRevision, 2);
  assert.equal(active.story.title, "Processar empresa editada");
  assert.equal(manifest.activeRevision, 2);
  assert.deepEqual(revisions, ["0001-user-story.json", "0002-user-story.json"]);

  await store.deleteUserStory(folder.id, userStory.id);

  const storiesAfterDelete = await store.listUserStories(folder.id);
  assert.equal(storiesAfterDelete.length, 0);

  const folders = await store.listFolders();
  assert.equal(folders[0].storyCount, 0);
});

test("FileWorkspaceStore rejects cross-folder story updates", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const sourceFolder = await store.createFolder("User Stories");
  const targetFolder = await store.createFolder("Sistema Teste");
  await store.saveUserStories(sourceFolder.id, [userStory]);

  await assert.rejects(
    () =>
      store.updateUserStory(targetFolder.id, userStory.id, {
        ...userStory,
        title: "Tentativa fora da pasta",
      }),
    WorkspaceUserStoryNotFoundError
  );
});

test("FileWorkspaceStore resolves active story revisions for workflow start", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const folder = await store.createFolder("User Stories");
  await store.saveUserStories(folder.id, [userStory]);
  await store.updateUserStory(folder.id, userStory.id, {
    ...userStory,
    title: "Processar empresa ativa",
  });

  const resolved = await store.resolveUserStoriesForWorkflow(folder.id, [
    {
      ...userStory,
      title: "Processar empresa payload antigo",
    },
  ]);

  assert.equal(resolved.userStories[0].title, "Processar empresa ativa");
  assert.equal(
    resolved.artifactContext[userStory.id].workspaceFolderId,
    folder.id
  );
  assert.equal(
    resolved.artifactContext[userStory.id].userStoryRevisionId,
    "user-story:2"
  );

  const storyDir = join(baseDir, folder.slug, "processar-empresa-pelo-ticker-11111111");
  const revisions = await readdir(join(storyDir, "revisions"));
  assert.deepEqual(revisions, ["0001-user-story.json", "0002-user-story.json"]);
});

test("FileWorkspaceStore persists missing submitted stories during workflow resolution", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const folder = await store.createFolder("User Stories");
  const resolved = await store.resolveUserStoriesForWorkflow(folder.id, [userStory]);

  assert.equal(resolved.userStories[0].id, userStory.id);
  assert.equal(
    resolved.artifactContext[userStory.id].userStoryRevisionId,
    "user-story:1"
  );
  const persisted = await store.listUserStories(folder.id);
  assert.equal(persisted.length, 1);
});

test("FileWorkspaceStore versions specs inside their user story directory", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const folder = await store.createFolder("User Stories");
  await store.saveUserStories(folder.id, [userStory]);

  await store.saveSpec(folder.id, userStory.id, spec);
  await store.saveSpec(folder.id, userStory.id, {
    ...spec,
    summary: "Criar processamento por ticker editado",
  });

  const specDir = join(
    baseDir,
    folder.slug,
    "processar-empresa-pelo-ticker-11111111",
    "specs",
    spec.id
  );
  const active = JSON.parse(await readFile(join(specDir, "active.json"), "utf-8"));
  const manifest = JSON.parse(await readFile(join(specDir, "manifest.json"), "utf-8"));
  const revisions = await readdir(join(specDir, "revisions"));
  const artifacts = await store.listUserStoryArtifacts(folder.id);

  assert.equal(active.activeRevision, 2);
  assert.equal(active.spec.summary, "Criar processamento por ticker editado");
  assert.equal(manifest.activeRevision, 2);
  assert.deepEqual(revisions, ["0001-spec.json", "0002-spec.json"]);
  assert.equal(artifacts[0].revision.activeRevision, 1);
  assert.equal(artifacts[0].specs[0].revision.activeRevision, 2);
});

test("FileWorkspaceStore rejects spec updates with mismatched ids", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const folder = await store.createFolder("User Stories");
  await store.saveUserStories(folder.id, [userStory]);
  await store.saveSpec(folder.id, userStory.id, spec);

  await assert.rejects(
    () =>
      store.updateSpec(
        folder.id,
        userStory.id,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        spec
      ),
    WorkspaceSpecNotFoundError
  );
});

test("FileWorkspaceStore updates existing specs as new active revisions", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const folder = await store.createFolder("User Stories");
  await store.saveUserStories(folder.id, [userStory]);
  await store.saveSpec(folder.id, userStory.id, spec);

  const updated = await store.updateSpec(folder.id, userStory.id, spec.id, {
    ...spec,
    summary: "Criar processamento por ticker revisado",
  });

  const specDir = join(
    baseDir,
    folder.slug,
    "processar-empresa-pelo-ticker-11111111",
    "specs",
    spec.id
  );
  const active = JSON.parse(await readFile(join(specDir, "active.json"), "utf-8"));
  const manifest = JSON.parse(await readFile(join(specDir, "manifest.json"), "utf-8"));
  const revisions = await readdir(join(specDir, "revisions"));

  assert.equal(updated.summary, "Criar processamento por ticker revisado");
  assert.equal(active.activeRevision, 2);
  assert.equal(active.spec.summary, "Criar processamento por ticker revisado");
  assert.equal(manifest.activeRevision, 2);
  assert.deepEqual(revisions, ["0001-spec.json", "0002-spec.json"]);
});

test("FileWorkspaceStore rejects missing spec updates", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const folder = await store.createFolder("User Stories");
  await store.saveUserStories(folder.id, [userStory]);

  await assert.rejects(
    () => store.updateSpec(folder.id, userStory.id, spec.id, spec),
    WorkspaceSpecNotFoundError
  );
});

test("FileWorkspaceStore rejects cross-folder spec saves", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const sourceFolder = await store.createFolder("User Stories");
  const targetFolder = await store.createFolder("Sistema Teste");
  await store.saveUserStories(sourceFolder.id, [userStory]);

  await assert.rejects(
    () => store.saveSpec(targetFolder.id, userStory.id, spec),
    WorkspaceUserStoryNotFoundError
  );
});
