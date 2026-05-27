import { JsonStorageAdapter } from "../adapters/JsonStorageAdapter.js";
import { FileChatMemoryStore } from "../chat/FileChatMemoryStore.js";
import { createPgPool, readDatabaseConfig, type PgPool } from "../database/pool.js";
import { runMigrations } from "../database/migrate.js";
import { FileFrontendProjectRegistry } from "../preview/FileFrontendProjectRegistry.js";
import { FilePreviewSessionStore } from "../preview/FilePreviewSessionStore.js";
import { FileWorkspaceStore } from "../workspace/FileWorkspaceStore.js";
import { PostgresChatMemoryRepository } from "./PostgresChatMemoryRepository.js";
import { FileCodeChangeSetRepository } from "./FileCodeChangeSetRepository.js";
import { FileProjectConstructionRepository } from "./FileProjectConstructionRepository.js";
import { FileWorkflowEventLogRepository } from "./FileWorkflowEventLogRepository.js";
import { PostgresCodeChangeSetRepository } from "./PostgresCodeChangeSetRepository.js";
import { PostgresFrontendProjectRepository } from "./PostgresFrontendProjectRepository.js";
import { PostgresPreviewSessionRepository } from "./PostgresPreviewSessionRepository.js";
import { PostgresProjectConstructionRepository } from "./PostgresProjectConstructionRepository.js";
import { PostgresWorkflowEventLogRepository } from "./PostgresWorkflowEventLogRepository.js";
import { PostgresWorkflowStateRepository } from "./PostgresWorkflowStateRepository.js";
import { PostgresWorkspaceRepository } from "./PostgresWorkspaceRepository.js";
import type {
  ChatMemoryRepository,
  CodeChangeSetRepository,
  FrontendProjectRepository,
  ProjectConstructionRepository,
  PreviewSessionRepository,
  WorkflowEventLogRepository,
  WorkspaceRepository,
} from "./contracts.js";
import type { IStorageProvider } from "@u-build/shared";

export interface PersistenceRepositories {
  driver: "file" | "postgres";
  pool?: PgPool;
  storage: IStorageProvider;
  workspaceStore: WorkspaceRepository;
  chatMemoryStore: ChatMemoryRepository;
  frontendProjects: FrontendProjectRepository;
  previewSessions: PreviewSessionRepository;
  codeChangeSets: CodeChangeSetRepository;
  workflowEvents: WorkflowEventLogRepository;
  projectConstruction: ProjectConstructionRepository;
}

export async function createRepositories(
  env: Record<string, string | undefined> = process.env
): Promise<PersistenceRepositories> {
  const driver = env["PERSISTENCE_DRIVER"]?.trim() || "file";
  if (driver === "postgres") {
    const pool = createPgPool(readDatabaseConfig(env));
    await runMigrations(pool);
    const storage = new PostgresWorkflowStateRepository(pool);
    const workspaceStore = new PostgresWorkspaceRepository(pool);
    return {
      driver,
      pool,
      storage,
      workspaceStore,
      chatMemoryStore: new PostgresChatMemoryRepository(
        pool,
        workspaceStore,
        storage
      ),
      frontendProjects: new PostgresFrontendProjectRepository(
        pool,
        undefined,
        env
      ),
      previewSessions: new PostgresPreviewSessionRepository(pool),
      codeChangeSets: new PostgresCodeChangeSetRepository(pool),
      workflowEvents: new PostgresWorkflowEventLogRepository(pool),
      projectConstruction: new PostgresProjectConstructionRepository(pool),
    };
  }

  if (driver !== "file") {
    throw new Error(`Unsupported PERSISTENCE_DRIVER "${driver}". Use file or postgres.`);
  }

  const storage = new JsonStorageAdapter();
  const workspaceStore = new FileWorkspaceStore();
  return {
    driver,
    storage,
    workspaceStore,
    chatMemoryStore: new FileChatMemoryStore(workspaceStore, storage),
    frontendProjects: new FileFrontendProjectRegistry(
      undefined,
      undefined,
      env
    ),
    previewSessions: new FilePreviewSessionStore(),
    codeChangeSets: new FileCodeChangeSetRepository(),
    workflowEvents: new FileWorkflowEventLogRepository(),
    projectConstruction: new FileProjectConstructionRepository(),
  };
}
