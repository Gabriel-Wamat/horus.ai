import assert from "node:assert/strict";
import test from "node:test";
import {
  ValidationCommandSelector,
  classifyCommandKind,
} from "../dist/application/coding/ValidationCommandSelector.js";

test("ValidationCommandSelector chooses deterministic validation commands by priority", () => {
  const selector = new ValidationCommandSelector();
  const commands = selector.select(config([
    command("build-root-build", "pnpm", ["run", "build"]),
    command("lint-root-lint", "pnpm", ["run", "lint"]),
    command("test-root-test", "pnpm", ["run", "test"]),
    command("type-check-root-type-check", "pnpm", ["run", "type-check"]),
    command("install-root-dependencies", "pnpm", ["install"]),
    command("run-root-dev", "pnpm", ["run", "dev"]),
  ]));

  assert.deepEqual(
    commands.map((item) => item.id),
    [
      "type-check-root-type-check",
      "test-root-test",
      "build-root-build",
      "lint-root-lint",
    ]
  );
  assert.deepEqual(
    commands.map((item) => item.kind),
    ["type_check", "test", "build", "lint"]
  );
});

test("ValidationCommandSelector classifies commands from executable text when ids are custom", () => {
  assert.equal(
    classifyCommandKind(command("custom-ts", "pnpm", ["run", "tsc"])),
    "type_check"
  );
  assert.equal(
    classifyCommandKind(command("custom-vitest", "pnpm", ["exec", "vitest"])),
    "test"
  );
  assert.equal(classifyCommandKind(command("serve", "pnpm", ["run", "dev"])), "unknown");
});

test("ValidationCommandSelector returns empty selection for projects without validation commands", () => {
  const selector = new ValidationCommandSelector();
  assert.deepEqual(
    selector.select(config([command("inspect-project", process.execPath, ["-e", "0"])])),
    []
  );
});

function config(commandCatalog) {
  return {
    version: 1,
    projectName: "test",
    projectStack: "typescript-react",
    baseRef: "main",
    writeRoots: ["."],
    commandCatalog,
    testRunnerIds: [],
    bootstrapCommandIds: [],
    roleProfiles: {
      curator: {
        allowedCommandIds: commandCatalog.map((item) => item.id),
        defaultValidationCommandIds: [],
      },
    },
  };
}

function command(id, executable, args) {
  return {
    id,
    executable,
    args,
    cwd: ".",
    env: {},
    timeoutMs: 1_000,
  };
}
