import { join } from "node:path";
import type {
  HorusProjectConfig,
  HorusProjectManifest,
  ProjectCommand,
} from "@u-build/shared";
import { HorusProjectManifestSchema } from "@u-build/shared";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";

export const HORUS_PROJECT_MANIFEST_FILENAME = "horus.project.json";

const DEFAULT_DENY_PATHS = [
  ".env",
  ".git",
  "node_modules",
  "dist",
  "build",
  ".turbo",
  "coverage",
];

const DEFAULT_SECRET_PATTERNS = [
  "api[_-]?key",
  "secret",
  "token",
  "password",
  "private[_-]?key",
];

export class ProjectManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectManifestError";
  }
}

export class ProjectManifestService {
  manifestPath(projectRoot: string): string {
    return join(projectRoot, HORUS_PROJECT_MANIFEST_FILENAME);
  }

  async read(projectRoot: string): Promise<HorusProjectManifest | null> {
    try {
      return await readJsonFile(
        this.manifestPath(projectRoot),
        HorusProjectManifestSchema
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new ProjectManifestError(
        `Invalid Horus project manifest: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  async ensure(input: {
    projectRoot: string;
    projectId: string;
    projectName: string;
    projectStack: string;
    config: HorusProjectConfig;
  }): Promise<HorusProjectManifest> {
    const existing = await this.read(input.projectRoot);
    if (existing) return existing;
    return this.write(
      input.projectRoot,
      this.build({
        projectId: input.projectId,
        projectName: input.projectName,
        projectStack: input.projectStack,
        config: input.config,
      })
    );
  }

  async write(
    projectRoot: string,
    manifest: HorusProjectManifest
  ): Promise<HorusProjectManifest> {
    const validated = HorusProjectManifestSchema.parse(manifest);
    await writeJsonFileAtomic(this.manifestPath(projectRoot), validated, {
      trailingNewline: true,
    });
    return validated;
  }

  build(input: {
    projectId: string;
    projectName: string;
    projectStack: string;
    config: HorusProjectConfig;
    now?: string;
  }): HorusProjectManifest {
    const now = input.now ?? new Date().toISOString();
    const packageManager = inferPackageManager(input.config.commandCatalog);
    return HorusProjectManifestSchema.parse({
      schemaVersion: 1,
      projectId: input.projectId,
      projectName: input.projectName,
      rootPathPolicy: {
        writeRoots: input.config.writeRoots,
        deniedPaths: DEFAULT_DENY_PATHS,
        generatedPaths: ["dist", "build", ".turbo", "coverage"],
      },
      stack: {
        frontend: inferFrontendStack(input.projectStack),
        language: inferLanguage(input.projectStack),
        packageManager,
      },
      entrypoints: inferEntrypoints(input.projectStack),
      commandCatalog: input.config.commandCatalog,
      architecture: {
        summary:
          "Horus generated project. Agents must use this manifest as orientation and then inspect real source files before making code claims or changes.",
        sourceRoots: input.config.writeRoots.includes("src") ? ["src"] : ["."],
        routeFiles: ["src/main.tsx", "src/App.tsx", "index.html"],
        componentRoots: ["src/components", "src/features"],
      },
      designSystem: {
        referenceFiles: ["ID_VISUAL.md", "src/styles/tokens.css", "src/index.css"],
        notes: [
          "Follow the Horus visual identity when a local design reference exists.",
          "Keep operational interfaces dense, calm and predictable.",
        ],
      },
      agentRules: {
        codingStyle: [
          "Prefer existing project patterns over new abstractions.",
          "Read the affected source files before proposing changes.",
        ],
        uiStyle: [
          "Use project typography, spacing and colors consistently.",
          "Avoid decorative UI that does not support the workflow.",
        ],
        forbiddenPatterns: [
          "Do not hardcode fake runtime behavior.",
          "Do not bypass write-root, command or tool policies.",
          "Do not claim code evidence without reading source files.",
        ],
        testingExpectations:
          input.config.testRunnerIds.length > 0
            ? [`Run validation command ids: ${input.config.testRunnerIds.join(", ")}`]
            : ["Record explicitly when no validation command is available."],
      },
      security: {
        denyPaths: DEFAULT_DENY_PATHS,
        secretPatterns: DEFAULT_SECRET_PATTERNS,
        rulesCannotGrantPermissions: true,
      },
      lastValidatedAt: null,
      updatedAt: now,
    });
  }
}

function inferFrontendStack(projectStack: string): HorusProjectManifest["stack"]["frontend"] {
  const normalized = projectStack.toLowerCase();
  if (normalized.includes("react")) return "react";
  if (normalized.includes("next")) return "next";
  if (normalized.includes("vue")) return "vue";
  if (normalized.includes("svelte")) return "svelte";
  if (normalized.includes("angular")) return "angular";
  if (normalized.includes("html") || normalized.includes("static")) return "static";
  return "unknown";
}

function inferLanguage(projectStack: string): HorusProjectManifest["stack"]["language"] {
  const normalized = projectStack.toLowerCase();
  if (normalized.includes("typescript") || normalized.includes("ts")) return "typescript";
  if (normalized.includes("javascript") || normalized.includes("js")) return "javascript";
  return "unknown";
}

function inferPackageManager(
  commandCatalog: readonly ProjectCommand[]
): HorusProjectManifest["stack"]["packageManager"] {
  const executable = commandCatalog[0]?.executable;
  if (executable === "pnpm" || executable === "npm" || executable === "yarn" || executable === "bun") {
    return executable;
  }
  return "unknown";
}

function inferEntrypoints(projectStack: string): string[] {
  if (inferFrontendStack(projectStack) === "react") {
    return ["index.html", "src/main.tsx", "src/App.tsx"];
  }
  return ["package.json"];
}
