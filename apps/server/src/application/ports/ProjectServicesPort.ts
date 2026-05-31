import type {
  CodeChangeOperation,
  CodeChangeOperationPrecondition,
  CreateProjectWorkspaceInput,
  HorusProjectConfig,
  HorusProjectManifest,
  ProjectCommandRun,
  ProjectExecutionPlan,
  ProjectFileVersion,
  ProjectWorkspace,
  ShellCommandOutputEvent,
  StructuralPatchDiffStats,
} from "@u-build/shared";

export interface ProjectManifestReader {
  read(projectRoot: string): Promise<HorusProjectManifest | null>;
}

export interface ProjectConfigReader {
  load(projectRoot: string): Promise<HorusProjectConfig>;
}

export interface ProjectExecutionRunner {
  applyFileOperations(input: {
    projectRoot: string;
    config: HorusProjectConfig;
    plan: ProjectExecutionPlan;
    signal?: AbortSignal;
  }): Promise<string[]>;

  executeCommandRequests(input: {
    constructionRunId: string;
    roleName: string;
    projectRoot: string;
    config: HorusProjectConfig;
    plan: ProjectExecutionPlan;
    signal?: AbortSignal;
    trace?: {
      traceId?: string | null;
      spanId?: string | null;
      parentSpanId?: string | null;
      toolCallId?: string | null;
      runId?: string | null;
      projectId?: string | null;
      agentId?: string | null;
      filePath?: string | null;
      diffId?: string | null;
    };
    onCommandOutput?: ((event: ShellCommandOutputEvent) => void) | undefined;
  }): Promise<ProjectCommandRun[]>;

  executePlan(input: {
    constructionRunId: string;
    roleName: string;
    projectRoot: string;
    config: HorusProjectConfig;
    plan: ProjectExecutionPlan;
    signal?: AbortSignal;
  }): Promise<unknown>;
}

export interface ProjectDiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  changedPaths: string[];
}

export interface ProjectDiffReader {
  readDiffStats(projectRoot: string): Promise<ProjectDiffStats>;
}

export interface ProjectFileBrowserPort {
  getFileContent(input: {
    projectId: string;
    runId?: string;
    projectRootOverride?: string;
    path: string;
    maxBytes?: number;
  }): Promise<{
    path: string;
    content: string | null;
    version?: ProjectFileVersion | undefined;
    truncated: boolean;
    binary: boolean;
  }>;

  getTree(input: {
    projectId: string;
    runId?: string;
    projectRootOverride?: string;
    limit?: number;
    depth?: number;
  }): Promise<{
    entries: Array<{ path: string; kind: "dir" | "file" }>;
    partial: boolean;
  }>;

  saveFile(input: {
    projectId: string;
    runId?: string;
    path: string;
    content: string;
    baseVersion: ProjectFileVersion;
  }): Promise<{
    path: string;
    version: ProjectFileVersion;
  }>;
}

export interface ProjectFileMutationOperation {
  targetPath: string;
  changeType: "create" | "update" | "delete";
  afterContent: string | null;
  beforeContent?: string | null | undefined;
  diff?: string | undefined;
  preconditions?: readonly CodeChangeOperationPrecondition[] | undefined;
  baseVersion?: ProjectFileVersion | undefined;
  expectedContentHash?: string | undefined;
  expectedMtimeMs?: number | undefined;
  expectedSizeBytes?: number | undefined;
  allowOverwrite?: boolean | undefined;
  reason?: string | undefined;
}

export interface ProjectFileMutationAppliedOperation {
  targetPath: string;
  relativePath: string;
  beforeContent: string | null;
  beforeVersion: ProjectFileVersion | null;
  afterContent: string | null;
  afterVersion: ProjectFileVersion | null;
  changeType: "create" | "update" | "delete";
  operation: CodeChangeOperation;
  expectedDiff: string;
  expectedDiffStats: StructuralPatchDiffStats;
  actualDiff: string;
  actualDiffStats: StructuralPatchDiffStats;
}

export interface ProjectFileMutationApplyResult {
  projectRoot: string;
  appliedOperations: ProjectFileMutationAppliedOperation[];
  finalDiff: string;
  actualDiff: string;
  finalDiffStats: StructuralPatchDiffStats;
  actualDiffStats: StructuralPatchDiffStats;
}

export interface ProjectFileMutationApplierPort {
  apply(input: {
    projectRootPath: string;
    operations: readonly ProjectFileMutationOperation[];
    allowDelete?: boolean;
    allowedWriteRoots?: readonly string[];
  }): Promise<ProjectFileMutationApplyResult>;
}

export interface PreparedProjectWorkspace {
  project: ProjectWorkspace;
  workspacePath: string;
  branchName: string | null;
  created: boolean;
}

export interface ProjectWorkspaceProvider {
  createNewProject(input: CreateProjectWorkspaceInput): Promise<ProjectWorkspace>;
  prepareWorkspace(input: {
    runId: string;
    project: ProjectWorkspace;
  }): Promise<PreparedProjectWorkspace>;
}
