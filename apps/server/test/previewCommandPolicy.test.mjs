import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PreviewCommandResolutionError,
  resolvePreviewCommand,
} from "../dist/infrastructure/preview/PreviewCommandResolver.js";

async function rootFixture() {
  const rootPath = await mkdtemp(join(tmpdir(), "horus-preview-command-"));
  return realpath(rootPath);
}

function projectFixture(rootPath, overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111116",
    name: "fixture",
    slug: "fixture",
    rootPath,
    defaultRoute: "/",
    devCommand: null,
    previewCommandId: "dev",
    commandCatalog: [
      {
        id: "dev",
        label: "Dev",
        executable: process.execPath,
        args: ["-e", "console.log('ok')"],
        cwd: ".",
        env: {},
      },
    ],
    previewUrl: "http://localhost:5174",
    createdAt: "2026-05-26T00:00:00.000Z",
    ...overrides,
  };
}

test("resolvePreviewCommand resolves known command ids to normalized command specs", async () => {
  const rootPath = await rootFixture();
  const command = await resolvePreviewCommand(projectFixture(rootPath), {
    allowedExecutables: [process.execPath],
    timeoutMs: 5_000,
  });

  assert.equal(command.id, "dev");
  assert.equal(command.executable, process.execPath);
  assert.deepEqual(command.args, ["-e", "console.log('ok')"]);
  assert.equal(command.cwd, rootPath);
  assert.equal(command.timeoutMs, 5_000);
});

test("resolvePreviewCommand rejects unknown command ids", async () => {
  const rootPath = await rootFixture();
  await assert.rejects(
    () =>
      resolvePreviewCommand(projectFixture(rootPath, { previewCommandId: "missing" }), {
        allowedExecutables: [process.execPath],
        timeoutMs: 5_000,
      }),
    (err) =>
      err instanceof PreviewCommandResolutionError &&
      err.evidence["reason"] === "unknown_command_id"
  );
});

test("resolvePreviewCommand rejects cwd escape before spawn", async () => {
  const rootPath = await rootFixture();
  const outside = await mkdtemp(join(tmpdir(), "horus-preview-command-outside-"));
  await mkdir(join(rootPath, "nested"), { recursive: true });

  await assert.rejects(
    () =>
      resolvePreviewCommand(
        projectFixture(rootPath, {
          commandCatalog: [
            {
              id: "dev",
              executable: process.execPath,
              args: ["-e", "console.log('ok')"],
              cwd: outside,
              env: {},
            },
          ],
        }),
        { allowedExecutables: [process.execPath], timeoutMs: 5_000 }
      ),
    (err) =>
      err instanceof PreviewCommandResolutionError &&
      String(err.evidence["reason"]).includes("outside allowed root")
  );
});

test("resolvePreviewCommand rejects shell expansion content before spawn", async () => {
  const rootPath = await rootFixture();
  await assert.rejects(
    () =>
      resolvePreviewCommand(
        projectFixture(rootPath, {
          commandCatalog: [
            {
              id: "dev",
              executable: process.execPath,
              args: ["-e", "console.log($(whoami))"],
              cwd: ".",
              env: {},
            },
          ],
        }),
        { allowedExecutables: [process.execPath], timeoutMs: 5_000 }
      ),
    (err) =>
      err instanceof PreviewCommandResolutionError &&
      String(err.evidence["reason"]).includes("unsafe shell pattern")
  );
});

test("resolvePreviewCommand rejects network transfer utilities even when allowlisted", async () => {
  const rootPath = await rootFixture();
  await assert.rejects(
    () =>
      resolvePreviewCommand(
        projectFixture(rootPath, {
          commandCatalog: [
            {
              id: "dev",
              executable: "curl",
              args: ["http://example.test"],
              cwd: ".",
              env: {},
            },
          ],
        }),
        { allowedExecutables: ["curl"], timeoutMs: 5_000 }
      ),
    (err) =>
      err instanceof PreviewCommandResolutionError &&
      String(err.evidence["reason"]).includes("network transfer")
  );
});

test("resolvePreviewCommand preserves legacy devCommand as migration fallback", async () => {
  const rootPath = await rootFixture();
  const command = await resolvePreviewCommand(
    projectFixture(rootPath, {
      devCommand: `${process.execPath} -e "console.log('legacy')"`,
      previewCommandId: null,
      commandCatalog: [],
    }),
    { allowedExecutables: [process.execPath], timeoutMs: 5_000 }
  );

  assert.equal(command.id, "legacy-dev");
  assert.equal(command.executable, process.execPath);
  assert.deepEqual(command.args, ["-e", "console.log('legacy')"]);
});

