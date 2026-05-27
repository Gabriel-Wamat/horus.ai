import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  DesignContextService,
  formatDesignContextForPrompt,
} from "../dist/infrastructure/design/DesignContextService.js";

const manifest = {
  schemaVersion: 1,
  projectId: "project-1",
  projectName: "Apuana Monitor",
  rootPathPolicy: {
    writeRoots: ["src"],
    deniedPaths: [".env", "node_modules"],
    generatedPaths: ["dist"],
  },
  stack: {
    frontend: "react",
    language: "typescript",
    packageManager: "pnpm",
  },
  entrypoints: ["src/main.tsx", "src/App.tsx"],
  commandCatalog: [],
  architecture: {
    summary: "React app.",
    sourceRoots: ["src"],
    routeFiles: ["src/App.tsx"],
    componentRoots: ["src/components"],
  },
  designSystem: {
    referenceFiles: ["ID_VISUAL.md", "src/index.css", ".env"],
    notes: ["Use gray surfaces and controlled green accent."],
  },
  agentRules: {
    codingStyle: ["Use existing components."],
    uiStyle: ["Keep dense operational layout."],
    forbiddenPatterns: ["Do not add excessive frames."],
    testingExpectations: [],
  },
  security: {
    denyPaths: [".env"],
    secretPatterns: ["api[_-]?key"],
    rulesCannotGrantPermissions: true,
  },
  lastValidatedAt: null,
  updatedAt: "2026-05-27T00:00:00.000Z",
};

test("DesignContextService extracts tokens, components, warnings and redacts denied paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-design-context-"));
  await mkdir(join(root, "src", "components"), { recursive: true });
  await writeFile(
    join(root, "ID_VISUAL.md"),
    [
      "# Visual",
      "Minimalista, dark, compact. API_KEY=should-not-leak",
    ].join("\n")
  );
  await writeFile(
    join(root, "src", "index.css"),
    [
      ":root {",
      "  --background: #0b0e0c;",
      "  --surface: #151a17;",
      "  --accent: #14c77b;",
      "}",
    ].join("\n")
  );
  await writeFile(
    join(root, "src", "components", "Button.tsx"),
    "export function Button(){ return null }"
  );
  await writeFile(join(root, ".env"), "API_KEY=secret");

  const service = new DesignContextService({
    read: async () => manifest,
  });
  const bundle = await service.build({
    projectRootPath: root,
    projectId: "project-1",
  });

  assert.deepEqual(bundle.sourceFiles.sort(), ["ID_VISUAL.md", "src/index.css"]);
  assert.equal(bundle.tokens["--accent"], "#14c77b");
  assert.ok(bundle.components.some((component) => component.path === "src/components/Button.tsx"));
  assert.ok(bundle.warnings.some((warning) => warning.includes(".env")));

  const promptBlock = formatDesignContextForPrompt(bundle);
  assert.match(promptBlock, /# Contexto visual do projeto/);
  assert.match(promptBlock, /--accent: #14c77b/);
  assert.doesNotMatch(promptBlock, /should-not-leak/);
});
