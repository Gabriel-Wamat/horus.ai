import assert from "node:assert/strict";
import test from "node:test";
import {
  CreatePreviewSessionInputSchema,
  CreateVisualInstructionDraftInputSchema,
  FrontendProjectSchema,
  PreviewEventSchema,
  PreviewSessionSchema,
  SetPreviewDeviceInputSchema,
} from "../dist/entities/Preview.js";

test("Preview schemas accept valid project, session, event, and inputs", () => {
  const project = FrontendProjectSchema.parse({
    id: "11111111-1111-4111-8111-111111111116",
    name: "user_stories",
    slug: "user-stories",
    rootPath: "/repo/apps/web",
    defaultRoute: "/",
    devCommand: "pnpm --filter @u-build/web dev",
    previewCommandId: "dev",
    commandCatalog: [
      {
        id: "dev",
        label: "Start dev server",
        executable: "pnpm",
        args: ["--filter", "@u-build/web", "dev"],
        cwd: ".",
      },
    ],
    previewUrl: "http://localhost:5174",
    createdAt: "2026-05-26T10:00:00.000Z",
  });

  const session = PreviewSessionSchema.parse({
    id: "22222222-2222-4222-8222-222222222226",
    projectId: project.id,
    status: "waiting",
    route: "/",
    device: { name: "pc", width: 1440, height: 900 },
    previewUrl: "http://localhost:5174/",
    processId: null,
    startedAt: null,
    stoppedAt: null,
    updatedAt: "2026-05-26T10:00:00.000Z",
    errorMessage: null,
  });

  const event = PreviewEventSchema.parse({
    id: "33333333-3333-4333-8333-333333333336",
    type: "preview_created",
    sessionId: session.id,
    projectId: project.id,
    timestamp: "2026-05-26T10:00:01.000Z",
    status: "waiting",
    message: "Preview session created",
  });

  assert.equal(project.slug, "user-stories");
  assert.equal(project.previewCommandId, "dev");
  assert.equal(project.commandCatalog[0].executable, "pnpm");
  assert.equal(session.device.name, "pc");
  assert.deepEqual(event.data, {});
  assert.equal(
    CreatePreviewSessionInputSchema.parse({ projectId: project.id }).projectId,
    project.id
  );
  assert.equal(SetPreviewDeviceInputSchema.parse({ device: "phone" }).device, "phone");
  assert.equal(
    CreateVisualInstructionDraftInputSchema.parse({
      sessionId: session.id,
      mode: "visual_edits",
      message: "Ajuste densidade.",
    }).mode,
    "visual_edits"
  );
});

test("Preview project command catalog defaults preserve legacy project compatibility", () => {
  const project = FrontendProjectSchema.parse({
    id: "11111111-1111-4111-8111-111111111116",
    name: "legacy_project",
    slug: "legacy-project",
    rootPath: "/repo/apps/web",
    defaultRoute: "/",
    devCommand: "pnpm dev",
    previewUrl: "http://localhost:5174",
    createdAt: "2026-05-26T10:00:00.000Z",
  });

  assert.equal(project.previewCommandId, null);
  assert.deepEqual(project.commandCatalog, []);
});

test("Preview schemas reject unsafe routes and invalid devices", () => {
  assert.throws(
    () =>
      CreatePreviewSessionInputSchema.parse({
        projectId: "11111111-1111-4111-8111-111111111116",
        route: "../admin",
      }),
    /Invalid/
  );

  assert.throws(
    () => SetPreviewDeviceInputSchema.parse({ device: "desktop" }),
    /Invalid/
  );
});
