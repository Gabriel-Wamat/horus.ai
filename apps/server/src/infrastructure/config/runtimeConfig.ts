import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type PersistenceDriver = "file" | "postgres";

export interface RuntimeConfig {
  repositoryRoot: string;
  persistenceDriver: PersistenceDriver;
  paths: {
    dataDir: string;
    workflowsDir: string;
    workspaceDir: string;
    chatMemoryDir: string;
    frontendProjectsDir: string;
    previewSessionsDir: string;
    codeChangeSetsDir: string;
    workflowEventsDir: string;
    projectConstructionDir: string;
    agentSkillsDir: string;
    projectWorkspacesDir: string;
    projectRunWorktreesDir: string;
    langgraphCheckpointsDir: string;
  };
}

const DEFAULT_REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../../../../../", import.meta.url))
);

function readEnv(
  env: Record<string, string | undefined>,
  name: string
): string | undefined {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readPersistenceDriver(
  env: Record<string, string | undefined>
): PersistenceDriver {
  const raw = readEnv(env, "PERSISTENCE_DRIVER") ?? "file";
  if (raw === "file" || raw === "postgres") return raw;
  throw new Error(`Unsupported PERSISTENCE_DRIVER "${raw}". Use file or postgres.`);
}

function resolveFromRoot(repositoryRoot: string, input: string): string {
  return resolve(repositoryRoot, input);
}

function resolveFromDataDir(dataDir: string, input: string): string {
  return resolve(dataDir, input);
}

function resolveDefaultDataDir(
  repositoryRoot: string,
  env: Record<string, string | undefined>
): string {
  const configuredDataDir = readEnv(env, "HORUS_DATA_DIR");
  if (configuredDataDir) return resolveFromRoot(repositoryRoot, configuredDataDir);

  const defaultDataDir = resolveFromRoot(repositoryRoot, ".horus/data");
  const legacyDataDir = resolveFromRoot(repositoryRoot, "data");
  if (!existsSync(defaultDataDir) && existsSync(legacyDataDir)) {
    return legacyDataDir;
  }
  return defaultDataDir;
}

export function loadRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
  options: { repositoryRoot?: string } = {}
): RuntimeConfig {
  const repositoryRoot = resolve(options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT);
  const persistenceDriver = readPersistenceDriver(env);
  const dataDir = resolveDefaultDataDir(repositoryRoot, env);
  const projectWorkspacesDir = resolveFromRoot(
    repositoryRoot,
    readEnv(env, "HORUS_PROJECT_WORKSPACE_ROOT") ??
      resolveFromDataDir(dataDir, "project-workspaces")
  );
  const projectRunWorktreesDir = resolveFromRoot(
    repositoryRoot,
    readEnv(env, "HORUS_PROJECT_RUN_WORKSPACE_ROOT") ??
      resolveFromDataDir(dataDir, "project-run-worktrees")
  );

  return {
    repositoryRoot,
    persistenceDriver,
    paths: {
      dataDir,
      workflowsDir: resolveFromDataDir(dataDir, "workflows"),
      workspaceDir: resolveFromDataDir(dataDir, "workspace"),
      chatMemoryDir: resolveFromDataDir(dataDir, "chat-memory"),
      frontendProjectsDir: resolveFromDataDir(dataDir, "frontend-projects"),
      previewSessionsDir: resolveFromDataDir(dataDir, "preview-sessions"),
      codeChangeSetsDir: resolveFromDataDir(dataDir, "code-change-sets"),
      workflowEventsDir: resolveFromDataDir(dataDir, "workflow-events"),
      projectConstructionDir: resolveFromDataDir(dataDir, "project-construction"),
      agentSkillsDir: resolveFromDataDir(dataDir, "agent-skills"),
      projectWorkspacesDir,
      projectRunWorktreesDir,
      langgraphCheckpointsDir: resolveFromDataDir(dataDir, "langgraph-checkpoints"),
    },
  };
}

export async function assertWritableDataDir(config: RuntimeConfig): Promise<void> {
  const stat = await fs.stat(config.paths.dataDir).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  });
  if (stat && !stat.isDirectory()) {
    throw new Error(`HORUS_DATA_DIR must point to a directory: ${config.paths.dataDir}`);
  }
  await fs.mkdir(config.paths.dataDir, { recursive: true });
}
