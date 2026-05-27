import { z } from "zod";
import type { CodeContextBundle, ProjectFileVersion } from "@u-build/shared";
import { CodeChangeSetSchema, CodeContextBundleSchema } from "@u-build/shared";
import type { AgentToolRegistry } from "../services/AgentToolRegistry.js";
import type { ReadOnlyCodeContextService } from "../services/ReadOnlyCodeContextService.js";
import type { ProjectFileBrowserService } from "../../infrastructure/project/ProjectFileBrowserService.js";
import { ProjectConfigService } from "../../infrastructure/project/ProjectConfigService.js";
import { ProjectDiffAnalyzer } from "../../infrastructure/project/ProjectDiffAnalyzer.js";
import { ProjectExecutionService } from "../../infrastructure/project/ProjectExecutionService.js";
import type {
  CodeChangeSetRepository,
  ProjectConstructionRepository,
} from "../../infrastructure/repositories/contracts.js";
import type { ProjectCodeChangeSetApplier } from "../../infrastructure/code/ProjectCodeChangeSetApplier.js";

const ProjectIdInputSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid().optional(),
});

const ReadFileInputSchema = ProjectIdInputSchema.extend({
  path: z.string().trim().min(1),
  maxBytes: z.number().int().positive().max(2_000_000).optional(),
});

const ReadFileOutputSchema = z.object({
  path: z.string(),
  content: z.string().nullable(),
  versionHash: z.string().nullable(),
  truncated: z.boolean(),
  binary: z.boolean(),
});

const SearchCodeInputSchema = ProjectIdInputSchema.extend({
  query: z.string().trim().min(1),
  requestedPaths: z.array(z.string().trim().min(1)).optional(),
});

const ListFilesInputSchema = ProjectIdInputSchema.extend({
  limit: z.number().int().positive().max(10_000).optional(),
  depth: z.number().int().positive().max(24).optional(),
});

const ListFilesOutputSchema = z.object({
  entries: z.array(z.object({ path: z.string(), kind: z.enum(["dir", "file"]) })),
  partial: z.boolean(),
});

const SaveFileInputSchema = ProjectIdInputSchema.extend({
  path: z.string().trim().min(1),
  content: z.string(),
  baseVersion: z.object({
    hash: z.string().trim().min(16),
    sizeBytes: z.number().int().nonnegative(),
    mtimeMs: z.number().nonnegative(),
  }),
});

const SaveFileOutputSchema = z.object({
  path: z.string(),
  newVersionHash: z.string(),
  changed: z.boolean(),
});

const ProposeCodeChangeSetInputSchema = CodeChangeSetSchema;

const ProposeCodeChangeSetOutputSchema = z.object({
  changeSetId: z.string().uuid(),
  status: z.string(),
});

const ApplyCodeChangeSetInputSchema = ProjectIdInputSchema.extend({
  changeSetId: z.string().uuid(),
  workflowThreadId: z.string().uuid(),
});

const ApplyCodeChangeSetOutputSchema = z.object({
  appliedOperations: z.array(z.string()),
  failedOperations: z.array(z.string()),
  status: z.string(),
});

const RunValidationInputSchema = ProjectIdInputSchema.extend({
  commandId: z.string().trim().min(1),
  roleName: z.string().trim().min(1).default("qa_specialist"),
  constructionRunId: z.string().uuid().optional(),
});

const RunValidationOutputSchema = z.object({
  commandId: z.string(),
  exitCode: z.number().int().nullable(),
  stdoutTail: z.string(),
  stderrTail: z.string(),
  durationMs: z.number().int().nonnegative(),
});

const GitDiffInputSchema = ProjectIdInputSchema.extend({
  baseRef: z.string().trim().min(1).optional(),
});

const GitDiffOutputSchema = z.object({
  files: z.array(z.string()),
  patchSummary: z.string(),
});

export interface RegisterProjectAgentToolsDeps {
  registry: AgentToolRegistry;
  fileBrowser: ProjectFileBrowserService;
  codeContext: ReadOnlyCodeContextService;
  projectConstruction: ProjectConstructionRepository;
  codeChangeSets?: CodeChangeSetRepository;
  codeChangeSetApplier?: ProjectCodeChangeSetApplier;
  configService?: ProjectConfigService;
  executionService?: ProjectExecutionService;
  diffAnalyzer?: ProjectDiffAnalyzer;
}

export function registerProjectAgentTools(deps: RegisterProjectAgentToolsDeps): void {
  const configService = deps.configService ?? new ProjectConfigService();
  const executionService = deps.executionService ?? new ProjectExecutionService();
  const diffAnalyzer = deps.diffAnalyzer ?? new ProjectDiffAnalyzer();

  deps.registry.register({
    toolName: "read_file",
    mutatesState: false,
    inputSchema: ReadFileInputSchema,
    outputSchema: ReadFileOutputSchema,
    handler: async (input) => {
      const file = await deps.fileBrowser.getFileContent({
        projectId: input.projectId,
        path: input.path,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
      });
      return {
        path: file.path,
        content: file.content,
        versionHash: file.version?.hash ?? null,
        truncated: file.truncated,
        binary: file.binary,
      };
    },
  });

  deps.registry.register({
    toolName: "list_files",
    mutatesState: false,
    inputSchema: ListFilesInputSchema,
    outputSchema: ListFilesOutputSchema,
    handler: async (input) => {
      const tree = await deps.fileBrowser.getTree({
        projectId: input.projectId,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.depth !== undefined ? { depth: input.depth } : {}),
      });
      return {
        entries: tree.entries.map((entry) => ({ path: entry.path, kind: entry.kind })),
        partial: tree.partial,
      };
    },
  });

  deps.registry.register({
    toolName: "search_code",
    mutatesState: false,
    inputSchema: SearchCodeInputSchema,
    outputSchema: CodeContextBundleSchema,
    handler: async (input): Promise<CodeContextBundle> => {
      const project = await deps.projectConstruction.getProjectWorkspace(input.projectId);
      return deps.codeContext.buildContextFromProjectRoot({
        projectId: input.projectId,
        projectRootPath: project.rootPath,
        query: input.query,
        ...(input.requestedPaths ? { requestedPaths: input.requestedPaths } : {}),
      });
    },
  });

  deps.registry.register({
    toolName: "save_file",
    mutatesState: true,
    inputSchema: SaveFileInputSchema,
    outputSchema: SaveFileOutputSchema,
    handler: async (input) => {
      const saved = await deps.fileBrowser.saveFile({
        projectId: input.projectId,
        ...(input.runId ? { runId: input.runId } : {}),
        path: input.path,
        content: input.content,
        baseVersion: input.baseVersion as ProjectFileVersion,
      });
      return {
        path: saved.path,
        newVersionHash: saved.version.hash,
        changed: saved.version.hash !== input.baseVersion.hash,
      };
    },
  });

  deps.registry.register({
    toolName: "propose_code_change_set",
    mutatesState: false,
    inputSchema: ProposeCodeChangeSetInputSchema,
    outputSchema: ProposeCodeChangeSetOutputSchema,
    handler: async (input) => {
      const changeSet = CodeChangeSetSchema.parse(input);
      const saved = deps.codeChangeSets
        ? await deps.codeChangeSets.save(changeSet)
        : changeSet;
      return {
        changeSetId: saved.id,
        status: saved.status,
      };
    },
  });

  deps.registry.register({
    toolName: "apply_code_change_set",
    mutatesState: true,
    inputSchema: ApplyCodeChangeSetInputSchema,
    outputSchema: ApplyCodeChangeSetOutputSchema,
    handler: async (input) => {
      if (!deps.codeChangeSets || !deps.codeChangeSetApplier) {
        throw new Error("CodeChangeSet application tool is not configured.");
      }
      const project = await deps.projectConstruction.getProjectWorkspace(input.projectId);
      const changeSets = await deps.codeChangeSets.listByWorkflow(input.workflowThreadId);
      const changeSet = changeSets.find((candidate) => candidate.id === input.changeSetId);
      if (!changeSet) throw new Error(`CodeChangeSet not found: ${input.changeSetId}`);
      const applied = await deps.codeChangeSetApplier.apply({
        changeSet,
        projectRootPath: project.rootPath,
      });
      await deps.codeChangeSets.save(applied);
      return {
        appliedOperations:
          applied.status === "applied"
            ? applied.operations.map((operation) => operation.targetPath)
            : [],
        failedOperations:
          applied.status === "failed"
            ? applied.operations.map((operation) => operation.targetPath)
            : [],
        status: applied.status,
      };
    },
  });

  deps.registry.register({
    toolName: "run_validation_command",
    mutatesState: false,
    inputSchema: RunValidationInputSchema,
    outputSchema: RunValidationOutputSchema,
    handler: async (input) => {
      const project = await deps.projectConstruction.getProjectWorkspace(input.projectId);
      const config = await configService.load(project.rootPath);
      const roleName = input.roleName ?? "qa_specialist";
      const runs = await executionService.executeCommandRequests({
        constructionRunId: input.constructionRunId ?? input.projectId,
        roleName,
        projectRoot: project.rootPath,
        config,
        plan: {
          summary: `Run validation command ${input.commandId}`,
          fileOperations: [],
          commandRequests: [],
          validationCommandIds: [input.commandId],
          risks: [],
        },
      });
      const run = runs[0];
      if (!run) throw new Error(`Validation command did not produce evidence: ${input.commandId}`);
      return {
        commandId: run.commandId,
        exitCode: run.exitCode,
        stdoutTail: run.stdoutTail,
        stderrTail: run.stderrTail,
        durationMs: run.durationMs,
      };
    },
  });

  deps.registry.register({
    toolName: "get_git_diff",
    mutatesState: false,
    inputSchema: GitDiffInputSchema,
    outputSchema: GitDiffOutputSchema,
    handler: async (input) => {
      const project = await deps.projectConstruction.getProjectWorkspace(input.projectId);
      const stats = await diffAnalyzer.readDiffStats(project.rootPath);
      return {
        files: stats.changedPaths,
        patchSummary: `${stats.filesChanged} file(s), +${stats.insertions}/-${stats.deletions}`,
      };
    },
  });
}
