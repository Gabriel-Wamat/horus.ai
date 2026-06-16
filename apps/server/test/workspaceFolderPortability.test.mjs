import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { FileWorkspaceStore } from "../dist/infrastructure/workspace/FileWorkspaceStore.js";
import { slugify } from "../dist/infrastructure/workspace/FileWorkspaceArtifacts.js";

test("workspace folder slugs avoid Windows reserved directory names", () => {
  assert.equal(slugify("CON"), "con-folder");
  assert.equal(slugify("aux"), "aux-folder");
  assert.equal(slugify("COM1"), "com1-folder");
  assert.equal(slugify("LPT9"), "lpt9-folder");
});

test("workspace folder creation uses portable slugs before touching the filesystem", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-workspace-"));
  const store = new FileWorkspaceStore(baseDir);

  const first = await store.createFolder("CON");
  const second = await store.createFolder("con");
  const named = await store.createFolder("Project: Alpha / Beta");

  assert.equal(first.slug, "con-folder");
  assert.equal(second.slug, "con-folder-2");
  assert.equal(named.slug, "project-alpha-beta");

  assert.ok((await stat(join(baseDir, first.slug))).isDirectory());
  assert.ok((await stat(join(baseDir, second.slug))).isDirectory());
  assert.ok((await stat(join(baseDir, named.slug))).isDirectory());
});
