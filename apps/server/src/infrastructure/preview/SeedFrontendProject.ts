import { promises as fs } from "node:fs";
import { hostname } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FrontendProjectSchema,
  resolvePreviewPublicHost,
  type FrontendProject,
  type PreviewCommand,
} from "@u-build/shared";

export const WEB_PROJECT_ID = "11111111-1111-4111-8111-111111111116";

export class FrontendProjectRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontendProjectRootError";
  }
}

export interface SeedFrontendProjectOptions {
  repositoryRoot?: string;
  env?: Record<string, string | undefined>;
}

const DEFAULT_REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../../../../../", import.meta.url))
);

function isInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relation = relative(rootPath, candidatePath);
  return (
    relation === "" ||
    (!relation.startsWith("..") && !relation.includes(`..${sep}`))
  );
}

function readEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: string
): string {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readOptionalEnv(
  env: Record<string, string | undefined>,
  names: readonly string[]
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value && value.length > 0) return value;
  }
  return undefined;
}

function resolvePreviewHosts(
  env: Record<string, string | undefined>
): { bindHost: string; publicHost: string } {
  const bindHost =
    readOptionalEnv(env, [
      "HORUS_WEB_PREVIEW_BIND_HOST",
      "HORUS_WEB_PREVIEW_HOST",
      "HORUS_WEB_DEV_HOST",
      "HOST",
    ]) ?? "0.0.0.0";
  const publicHost =
    resolvePreviewPublicHost({
      configuredPublicHost: readOptionalEnv(env, [
        "HORUS_WEB_PREVIEW_PUBLIC_HOST",
        "HORUS_PUBLIC_HOST",
        "HORUS_DOCKER_HOST",
      ]),
      bindHost,
      runtimeHostname: hostname(),
    });
  return { bindHost, publicHost };
}

async function readJsonFile(
  path: string
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function discoverFrontendProjectRoot(
  repositoryRoot: string
): Promise<string> {
  const appsRoot = resolve(repositoryRoot, "apps");
  const entries = await fs.readdir(appsRoot, { withFileTypes: true }).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FrontendProjectRootError(
        "Unable to discover a frontend project. Set HORUS_WEB_PROJECT_ROOT."
      );
    }
    throw err;
  });
  const appDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(appsRoot, entry.name));
  const candidates: Array<{ path: string; isFrontend: boolean }> = [];

  for (const candidatePath of appDirectories) {
    const packageJson = await readJsonFile(join(candidatePath, "package.json"));
    const scripts = packageJson?.["scripts"];
    if (!scripts || typeof scripts !== "object" || !("dev" in scripts)) {
      continue;
    }
    const dependencies = packageJson["dependencies"];
    const devDependencies = packageJson["devDependencies"];
    const isFrontend =
      (dependencies &&
        typeof dependencies === "object" &&
        "react" in dependencies) ||
      (devDependencies &&
        typeof devDependencies === "object" &&
        "vite" in devDependencies);
    candidates.push({
      path: candidatePath,
      isFrontend: Boolean(isFrontend),
    });
  }

  const defaultWebApp = join(appsRoot, "web");
  const preferred = candidates.find(
    (candidate) => candidate.isFrontend && candidate.path === defaultWebApp
  );
  if (preferred) return preferred.path;

  const selected =
    candidates.find((candidate) => candidate.isFrontend) ?? candidates[0];
  if (selected) return selected.path;
  if (appDirectories.length === 1) return appDirectories[0]!;
  throw new FrontendProjectRootError(
    "Unable to discover a frontend project. Set HORUS_WEB_PROJECT_ROOT."
  );
}

async function resolveProjectRootInput(
  repositoryRoot: string,
  env: Record<string, string | undefined>
): Promise<string> {
  const configured = env["HORUS_WEB_PROJECT_ROOT"]?.trim();
  return configured && configured.length > 0
    ? configured
    : await discoverFrontendProjectRoot(repositoryRoot);
}

async function readPackageName(rootPath: string): Promise<string | undefined> {
  const packageJson = await readJsonFile(join(rootPath, "package.json"));
  const name = packageJson?.["name"];
  return typeof name === "string" && name.trim().length > 0
    ? name.trim()
    : undefined;
}

async function readPackageManager(
  repositoryRoot: string
): Promise<string | undefined> {
  const packageJson = await readJsonFile(join(repositoryRoot, "package.json"));
  const packageManager = packageJson?.["packageManager"];
  if (typeof packageManager !== "string" || packageManager.trim().length === 0) {
    return undefined;
  }
  return packageManager.split("@")[0] || undefined;
}

export async function buildSeedFrontendProject(
  options: SeedFrontendProjectOptions = {}
): Promise<FrontendProject> {
  const env = options.env ?? process.env;
  const repositoryRoot = options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT;
  const rootPath = await canonicalizeProjectRoot(
    repositoryRoot,
    await resolveProjectRootInput(repositoryRoot, env)
  );
  const packageName = await readPackageName(rootPath);
  const { bindHost, publicHost } = resolvePreviewHosts(env);
  const port = readEnv(
    env,
    "HORUS_WEB_PREVIEW_PORT",
    readEnv(env, "HORUS_WEB_DEV_PORT", "5174")
  );
  const previewUrl = readEnv(
    env,
    "HORUS_WEB_PREVIEW_URL",
    `http://${publicHost}:${port}`
  );
  const packageManager = readEnv(
    env,
    "HORUS_PACKAGE_MANAGER",
    (await readPackageManager(repositoryRoot)) ?? "pnpm"
  );
  const workspaceFilter = readEnv(
    env,
    "HORUS_WEB_PACKAGE_FILTER",
    packageName ?? basename(rootPath)
  );
  const defaultRoute = readEnv(env, "HORUS_WEB_DEFAULT_ROUTE", "/");
  const devArgs = [
    "--filter",
    workspaceFilter,
    "dev",
    "--",
    "--host",
    bindHost,
    "--port",
    port,
    "--strictPort",
  ];
  const commandCatalog: PreviewCommand[] = [
    {
      id: "dev",
      label: "Start web preview",
      executable: packageManager,
      args: devArgs,
      cwd: ".",
      env: {},
    },
  ];

  return FrontendProjectSchema.parse({
    id: WEB_PROJECT_ID,
    name: readEnv(env, "HORUS_WEB_PROJECT_NAME", "user_stories"),
    slug: readEnv(env, "HORUS_WEB_PROJECT_SLUG", "user-stories"),
    rootPath,
    defaultRoute,
    devCommand: `${packageManager} ${devArgs.join(" ")}`,
    previewCommandId: "dev",
    commandCatalog,
    previewUrl,
    createdAt: readEnv(
      env,
      "HORUS_WEB_PROJECT_CREATED_AT",
      new Date(0).toISOString()
    ),
  });
}

export async function canonicalizeProjectRoot(
  repositoryRoot: string,
  rootPath: string
): Promise<string> {
  const repoRoot = await fs.realpath(repositoryRoot);
  const candidate = resolve(repoRoot, rootPath);
  const canonical = await fs.realpath(candidate);

  if (!isInsideRoot(repoRoot, canonical)) {
    throw new FrontendProjectRootError(
      `Frontend project root must stay inside repository root: ${rootPath}`
    );
  }

  return canonical;
}
