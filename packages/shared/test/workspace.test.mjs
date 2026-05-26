import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateWorkspaceFolderInputSchema,
  WorkspaceFolderSchema,
} from "../dist/entities/Workspace.js";

test("WorkspaceFolderSchema accepts a valid folder", () => {
  const parsed = WorkspaceFolderSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    name: "user_stories",
    slug: "user-stories",
    createdAt: "2026-05-26T10:00:00.000Z",
    storyCount: 2,
  });

  assert.equal(parsed.slug, "user-stories");
  assert.equal(parsed.storyCount, 2);
});

test("WorkspaceFolderSchema rejects unsafe slugs", () => {
  assert.throws(
    () =>
      WorkspaceFolderSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        name: "unsafe",
        slug: "../unsafe",
        createdAt: "2026-05-26T10:00:00.000Z",
        storyCount: 0,
      }),
    /Invalid/
  );
});

test("CreateWorkspaceFolderInputSchema trims names", () => {
  const parsed = CreateWorkspaceFolderInputSchema.parse({
    name: "  Sistema Teste  ",
  });

  assert.equal(parsed.name, "Sistema Teste");
});
