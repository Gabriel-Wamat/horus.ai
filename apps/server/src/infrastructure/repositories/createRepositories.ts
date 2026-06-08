import { JsonStorageAdapter } from "../adapters/JsonStorageAdapter.js";
import { FileChatMemoryStore } from "../chat/FileChatMemoryStore.js";
import {
  assertWritableDataDir,
  loadRuntimeConfig,
  type RuntimeConfig,
} from "../config/runtimeConfig.js";
import { createPgPool, readDatabaseConfig, type PgPool } from "../database/pool.js";
import { runMigrations } from "../database/migrate.js";
import { FileFrontendProjectRegistry } from "../preview/FileFrontendProjectRegistry.js";
import { FilePreviewSessionStore } from "../preview/FilePreviewSessionStore.js";
import { FileWorkspaceStore } from "../workspace/FileWorkspaceStore.js";
import { PostgresChatMemoryRepository } from "./PostgresChatMemoryRepository.js";
import { FileCodeChangeSetRepository } from "./FileCodeChangeSetRepository.js";
import { FileAgentSkillRepository } from "./FileAgentSkillRepository.js";
import { FileAgentMemoryRepository } from "./FileAgentMemoryRepository.js";
import { FileAgentArtifactRepository } from "./FileAgentArtifactRepository.js";
import { FileAgentCircuitBreakerStore } from "./FileAgentCircuitBreakerStore.js";
import { FileAgentExecutionLedgerRepository } from "./FileAgentExecutionLedgerRepository.js";
import { FileAgentOperationalSessionRepository } from "./FileAgentOperationalSessionRepository.js";
import { FileCodingTaskRepository } from "./FileCodingTaskRepository.js";
import { FileProjectConstructionRepository } from "./FileProjectConstructionRepository.js";
import { FileWorkflowEventLogRepository } from "./FileWorkflowEventLogRepository.js";
import { PostgresCodeChangeSetRepository } from "./PostgresCodeChangeSetRepository.js";
import { PostgresAgentSkillRepository } from "./PostgresAgentSkillRepository.js";
import { PostgresAgentMemoryRepository } from "./PostgresAgentMemoryRepository.js";
import { PostgresAgentArtifactRepository } from "./PostgresAgentArtifactRepository.js";
import { PostgresAgentCircuitBreakerStore } from "./PostgresAgentCircuitBreakerStore.js";
import { PostgresAgentExecutionLedgerRepository } from "./PostgresAgentExecutionLedgerRepository.js";
import { PostgresAgentOperationalSessionRepository } from "./PostgresAgentOperationalSessionRepository.js";
import { PostgresCodingTaskRepository } from "./PostgresCodingTaskRepository.js";
import { PostgresFrontendProjectRepository } from "./PostgresFrontendProjectRepository.js";
import { PostgresPreviewSessionRepository } from "./PostgresPreviewSessionRepository.js";
import { PostgresProjectConstructionRepository } from "./PostgresProjectConstructionRepository.js";
import { PostgresWorkflowEventLogRepository } from "./PostgresWorkflowEventLogRepository.js";
import { PostgresWorkflowStateRepository } from "./PostgresWorkflowStateRepository.js";
import { PostgresWorkspaceRepository } from "./PostgresWorkspaceRepository.js";
import type {
  AgentCircuitBreakerStore,
} from "../../application/services/AgentCircuitBreakerStore.js";
import type { CodingTaskRepository } from "../../application/ports/CodingRuntimePorts.js";
import type {
  ChatMemoryRepository,
  CodeChangeSetRepository,
  AgentSkillRepository,
  AgentMemoryRepository,
  AgentArtifactRepository,
  AgentExecutionLedgerRepository,
  AgentOperationalSessionRepository,
  FrontendProjectRepository,
  ProjectConstructionRepository,
  PreviewSessionRepository,
  WorkflowEventLogRepository,
  WorkspaceRepository,
} from "./contracts.js";
import type { IStorageProvider } from "@u-build/shared";

export interface PersistenceRepositories {
  driver: "file" | "postgres";
  runtimeConfig: RuntimeConfig;
  pool?: PgPool;
  storage: IStorageProvider;
  workspaceStore: WorkspaceRepository;
  chatMemoryStore: ChatMemoryRepository;
  frontendProjects: FrontendProjectRepository;
  previewSessions: PreviewSessionRepository;
  codeChangeSets: CodeChangeSetRepository;
  workflowEvents: WorkflowEventLogRepository;
  agentExecutionLedger: AgentExecutionLedgerRepository;
  projectConstruction: ProjectConstructionRepository;
  agentSkills: AgentSkillRepository;
  agentMemory: AgentMemoryRepository;
  agentArtifacts: AgentArtifactRepository;
  agentCircuitBreakers: AgentCircuitBreakerStore;
  agentOperationalSessions: AgentOperationalSessionRepository;
  codingTasks: CodingTaskRepository;
}

export async function createRepositories(
  env: Record<string, string | undefined> = process.env,
  runtimeConfig: RuntimeConfig = loadRuntimeConfig(env)
): Promise<PersistenceRepositories> {
  const driver = runtimeConfig.persistenceDriver;
  if (driver === "postgres") {
    const pool = createPgPool(readDatabaseConfig(env));
    await runMigrations(pool);
    const storage = new PostgresWorkflowStateRepository(pool);
    const workspaceStore = new PostgresWorkspaceRepository(pool);
    return {
      driver,
      runtimeConfig,
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
        runtimeConfig.repositoryRoot,
        env
      ),
      previewSessions: new PostgresPreviewSessionRepository(pool),
      codeChangeSets: new PostgresCodeChangeSetRepository(pool),
      workflowEvents: new PostgresWorkflowEventLogRepository(pool),
      agentExecutionLedger: new PostgresAgentExecutionLedgerRepository(pool),
      agentOperationalSessions: new PostgresAgentOperationalSessionRepository(pool),
      projectConstruction: new PostgresProjectConstructionRepository(pool),
      agentSkills: new PostgresAgentSkillRepository(pool),
      agentMemory: new PostgresAgentMemoryRepository(pool),
      agentArtifacts: new PostgresAgentArtifactRepository(pool),
      agentCircuitBreakers: new PostgresAgentCircuitBreakerStore(pool),
      codingTasks: new PostgresCodingTaskRepository(pool),
    };
  }

  if (driver !== "file") {
    throw new Error(`Unsupported PERSISTENCE_DRIVER "${driver}". Use file or postgres.`);
  }

  await assertWritableDataDir(runtimeConfig);
  const storage = new JsonStorageAdapter(runtimeConfig.paths.workflowsDir);
  const workspaceStore = new FileWorkspaceStore(runtimeConfig.paths.workspaceDir);
  return {
    driver,
    runtimeConfig,
    storage,
    workspaceStore,
    chatMemoryStore: new FileChatMemoryStore(
      workspaceStore,
      storage,
      runtimeConfig.paths.chatMemoryDir
    ),
    frontendProjects: new FileFrontendProjectRegistry(
      runtimeConfig.paths.frontendProjectsDir,
      runtimeConfig.repositoryRoot,
      env
    ),
    previewSessions: new FilePreviewSessionStore(
      runtimeConfig.paths.previewSessionsDir
    ),
    codeChangeSets: new FileCodeChangeSetRepository(
      runtimeConfig.paths.codeChangeSetsDir
    ),
    workflowEvents: new FileWorkflowEventLogRepository(
      runtimeConfig.paths.workflowEventsDir
    ),
    agentExecutionLedger: new FileAgentExecutionLedgerRepository(
      runtimeConfig.paths.agentExecutionLedgerDir
    ),
    agentOperationalSessions: new FileAgentOperationalSessionRepository(
      runtimeConfig.paths.agentOperationalSessionsDir
    ),
    projectConstruction: new FileProjectConstructionRepository(
      runtimeConfig.paths.projectConstructionDir
    ),
    agentSkills: new FileAgentSkillRepository(runtimeConfig.paths.agentSkillsDir),
    agentMemory: new FileAgentMemoryRepository(runtimeConfig.paths.agentMemoryDir),
    agentArtifacts: new FileAgentArtifactRepository(
      runtimeConfig.paths.agentArtifactsDir
    ),
    agentCircuitBreakers: new FileAgentCircuitBreakerStore(
      runtimeConfig.paths.agentCircuitBreakersDir
    ),
    codingTasks: new FileCodingTaskRepository(runtimeConfig.paths.codingTasksDir),
  };
}
