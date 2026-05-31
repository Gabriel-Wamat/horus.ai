import { z } from "zod";
import type {
  CodeContextBundle,
  IncrementalEditResult,
  ProjectFileVersion,
  WriteFileToolResult,
} from "@u-build/shared";
import {
  CodeChangeSetSchema,
  CodeContextBundleSchema,
  CodingValidationCommandKindSchema,
  IncrementalEditInputSchema,
  IncrementalEditResultSchema,
  ProjectInspectionProfileSchema,
  ProjectFileVersionSchema,
  ShellCommandRequestSchema,
  ShellCommandResultSchema,
  WriteFileToolInputSchema,
  WriteFileToolResultSchema,
} from "@u-build/shared";
import type { AgentToolRegistry } from "../services/AgentToolRegistry.js";
import type { ProjectInspectorPort } from "../services/ProjectInspectionService.js";
import type { ReadOnlyCodeContextService } from "../services/ReadOnlyCodeContextService.js";
import type {
  CodeChangeSetRepository,
  ProjectConstructionRepository,
} from "../ports/RepositoryPorts.js";
import type {
  ProjectConfigReader,
  ProjectDiffReader,
  ProjectExecutionRunner,
  ProjectFileBrowserPort,
  ProjectFileMutationApplierPort,
  ProjectFileMutationOperation,
} from "../ports/ProjectServicesPort.js";
import type { ShellCommandRuntimePort } from "../ports/ShellCommandRuntimePort.js";
import type { WorkflowCodeChangeSetApplier } from "../../domain/services/WorkflowOrchestrator.js";
import {
  applyExactIncrementalEdit,
  applyLineRangeReplacement,
  sliceFileContentByLineRange,
} from "./ProjectAgentFileEditOperations.js";

const ProjectIdInputSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid().optional(),
});

const ReadFileInputSchema = ProjectIdInputSchema.extend({
  path: z.string().trim().min(1),
  maxBytes: z.number().int().positive().max(2_000_000).optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

const InspectProjectInputSchema = ProjectIdInputSchema.extend({
  maxEditableFiles: z.number().int().positive().max(500).optional(),
});

const InspectProjectOutputSchema = ProjectInspectionProfileSchema;

const ReadFileOutputSchema = z.object({
  path: z.string(),
  content: z.string().nullable(),
  versionHash: z.string().nullable(),
  version: ProjectFileVersionSchema.nullable().default(null),
  truncated: z.boolean(),
  binary: z.boolean(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  lineCount: z.number().int().nonnegative().optional(),
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

const WriteFileInputSchema = ProjectIdInputSchema.merge(WriteFileToolInputSchema);

const WriteFileOutputSchema = WriteFileToolResultSchema;

const EditFileInputSchema = ProjectIdInputSchema.merge(IncrementalEditInputSchema);

const EditFileOutputSchema = IncrementalEditResultSchema;

const ReplaceFileRangeInputSchema = ProjectIdInputSchema.extend({
  path: z.string().trim().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  replacement: z.string(),
  expectedContentHash: z.string().trim().min(16).optional(),
  expectedMtimeMs: z.number().nonnegative().optional(),
  baseVersion: ProjectFileVersionSchema.optional(),
  reason: z.string().trim().min(1).optional(),
});

const ReplaceFileRangeOutputSchema = IncrementalEditResultSchema;

const DeleteFileInputSchema = ProjectIdInputSchema.extend({
  path: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

const DeleteFileOutputSchema = z.object({
  path: z.string(),
  deleted: z.boolean(),
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
  traceId: z.string().trim().min(1).optional(),
  spanId: z.string().trim().min(1).optional(),
  parentSpanId: z.string().trim().min(1).nullable().optional(),
  toolCallId: z.string().trim().min(1).nullable().optional(),
  runId: z.string().trim().min(1).nullable().optional(),
  agentId: z.string().trim().min(1).nullable().optional(),
  filePath: z.string().trim().min(1).nullable().optional(),
  diffId: z.string().trim().min(1).nullable().optional(),
});

const RunValidationOutputSchema = z.object({
  commandId: z.string(),
  taskId: z.string().nullable().default(null),
  approvalRequired: z.boolean().default(false),
  risk: z.enum(["low", "medium", "high"]).default("low"),
  policyReason: z.string().nullable().default(null),
  approved: z.boolean().default(false),
  approvedBy: z.string().nullable().default(null),
  approvalReason: z.string().nullable().default(null),
  exitCode: z.number().int().nullable(),
  stdoutTail: z.string(),
  stderrTail: z.string(),
  stdoutPath: z.string().nullable().default(null),
  stderrPath: z.string().nullable().default(null),
  interactivePromptDetected: z.boolean().default(false),
  interactivePromptText: z.string().nullable().default(null),
  durationMs: z.number().int().nonnegative(),
  runs: z
    .array(
      z.object({
        commandId: z.string(),
        taskId: z.string().nullable().default(null),
        approvalRequired: z.boolean().default(false),
        risk: z.enum(["low", "medium", "high"]).default("low"),
        policyReason: z.string().nullable().default(null),
        approved: z.boolean().default(false),
        approvedBy: z.string().nullable().default(null),
        approvalReason: z.string().nullable().default(null),
        exitCode: z.number().int().nullable(),
        stdoutTail: z.string(),
        stderrTail: z.string(),
        stdoutPath: z.string().nullable().default(null),
        stderrPath: z.string().nullable().default(null),
        interactivePromptDetected: z.boolean().default(false),
        interactivePromptText: z.string().nullable().default(null),
        durationMs: z.number().int().nonnegative(),
      })
    )
    .default([]),
});

const RunCommandInputSchema = ProjectIdInputSchema.merge(
  z.object({
    commandId: z.string().trim().min(1),
    kind: CodingValidationCommandKindSchema.optional(),
    command: z.string().trim().min(1).optional(),
    shell: z.enum(["bash", "sh"]).default("bash"),
    executable: z.string().trim().min(1).optional(),
    args: z.array(z.string()).optional(),
    cwd: z.string().trim().min(1).optional(),
    env: z.record(z.string()).optional(),
    timeoutMs: z.number().int().positive().optional(),
    background: z.boolean().default(false),
    reason: z.string().trim().min(1).optional(),
    traceId: z.string().trim().min(1).optional(),
    spanId: z.string().trim().min(1).optional(),
    parentSpanId: z.string().trim().min(1).nullable().optional(),
    toolCallId: z.string().trim().min(1).nullable().optional(),
    runId: z.string().trim().min(1).nullable().optional(),
    agentId: z.string().trim().min(1).nullable().optional(),
    filePath: z.string().trim().min(1).nullable().optional(),
    diffId: z.string().trim().min(1).nullable().optional(),
  })
);

const RunCommandOutputSchema = ShellCommandResultSchema;

const GitDiffInputSchema = ProjectIdInputSchema.extend({
  baseRef: z.string().trim().min(1).optional(),
});

const GitDiffOutputSchema = z.object({
  files: z.array(z.string()),
  patchSummary: z.string(),
});

const InspectPreviewInputSchema = ProjectIdInputSchema.extend({
  previewSessionId: z.string().uuid(),
  traceId: z.string().trim().min(1).optional(),
  spanId: z.string().trim().min(1).optional(),
  parentSpanId: z.string().trim().min(1).nullable().optional(),
  toolCallId: z.string().trim().min(1).nullable().optional(),
  runId: z.string().trim().min(1).nullable().optional(),
  agentId: z.string().trim().min(1).nullable().optional(),
  filePath: z.string().trim().min(1).nullable().optional(),
  diffId: z.string().trim().min(1).nullable().optional(),
});

const InspectPreviewOutputSchema = z.object({
  status: z.enum(["passed", "failed", "blocked"]),
  reason: z.string(),
  previewSessionId: z.string().optional(),
  previewStatus: z.string().nullable().optional(),
  previewUrl: z.string().nullable().optional(),
  statusCode: z.number().int().nullable().optional(),
  contentType: z.string().nullable().optional(),
  bodyBytes: z.number().int().nonnegative().optional(),
  errorMessage: z.string().nullable().optional(),
  elapsedMs: z.number().int().nonnegative(),
  checkedAt: z.string(),
});

export interface PreviewSmokeValidatorPort {
  validate(previewSessionId: string): Promise<z.infer<typeof InspectPreviewOutputSchema>>;
}

export interface RegisterProjectAgentToolsDeps {
  registry: AgentToolRegistry;
  fileBrowser: ProjectFileBrowserPort;
  codeContext: ReadOnlyCodeContextService;
  projectConstruction: ProjectConstructionRepository;
  codeChangeSets?: CodeChangeSetRepository;
  codeChangeSetApplier?: WorkflowCodeChangeSetApplier;
  configService: ProjectConfigReader;
  executionService: ProjectExecutionRunner;
  diffAnalyzer: ProjectDiffReader;
  fileMutationApplier?: ProjectFileMutationApplierPort | undefined;
  projectInspector: ProjectInspectorPort;
  shellRuntime?: ShellCommandRuntimePort | undefined;
  previewSmokeValidator?: PreviewSmokeValidatorPort | undefined;
}

export function registerProjectAgentTools(deps: RegisterProjectAgentToolsDeps): void {
  const configService = deps.configService;
  const executionService = deps.executionService;
  const diffAnalyzer = deps.diffAnalyzer;

  deps.registry.register({
    toolName: "inspect_project",
    mutatesState: false,
    inputSchema: InspectProjectInputSchema,
    outputSchema: InspectProjectOutputSchema,
    handler: async (input, context) => {
      const project = await deps.projectConstruction.getProjectWorkspace(input.projectId);
      let rootPath = project.rootPath;
      if (input.runId) {
        const run = await deps.projectConstruction.getConstructionRun(input.runId);
        if (run.projectWorkspaceId !== project.id) {
          throw new Error(`Run not found for this project: ${input.runId}`);
        }
        rootPath = run.workspacePath;
      } else if (context.projectRootOverride) {
        rootPath = context.projectRootOverride;
      }
      return deps.projectInspector.inspect({
        projectId: input.projectId,
        projectRootPath: rootPath,
        ...(input.maxEditableFiles !== undefined
          ? { maxEditableFiles: input.maxEditableFiles }
          : {}),
        ...(context.signal ? { signal: context.signal } : {}),
      });
    },
  });

  deps.registry.register({
    toolName: "read_file",
    mutatesState: false,
    inputSchema: ReadFileInputSchema,
    outputSchema: ReadFileOutputSchema,
    handler: async (input, context) => {
      const rangeRequested = input.startLine !== undefined || input.endLine !== undefined;
      const maxBytes = input.maxBytes ?? (rangeRequested ? 2_000_000 : undefined);
      const file = await deps.fileBrowser.getFileContent({
        projectId: input.projectId,
        path: input.path,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(context.projectRootOverride
          ? { projectRootOverride: context.projectRootOverride }
          : {}),
        ...(maxBytes !== undefined ? { maxBytes } : {}),
      });
      const range = sliceFileContentByLineRange(file.content, {
        startLine: input.startLine,
        endLine: input.endLine,
      });
      return {
        path: file.path,
        content: range.content,
        versionHash: file.version?.hash ?? null,
        version: file.version ?? null,
        truncated: file.truncated,
        binary: file.binary,
        ...(range.startLine !== undefined ? { startLine: range.startLine } : {}),
        ...(range.endLine !== undefined ? { endLine: range.endLine } : {}),
        ...(range.lineCount !== undefined ? { lineCount: range.lineCount } : {}),
      };
    },
  });

  deps.registry.register({
    toolName: "list_files",
    mutatesState: false,
    inputSchema: ListFilesInputSchema,
    outputSchema: ListFilesOutputSchema,
    handler: async (input, context) => {
      const tree = await deps.fileBrowser.getTree({
        projectId: input.projectId,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(context.projectRootOverride
          ? { projectRootOverride: context.projectRootOverride }
          : {}),
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
    handler: async (input, context): Promise<CodeContextBundle> => {
      const { rootPath } = await resolveToolWorkspace(deps, input, context);
      return deps.codeContext.buildContextFromProjectRoot({
        projectId: input.projectId,
        projectRootPath: rootPath,
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
    handler: async (input, context) => {
      const applied = await applyProjectFileMutation(deps, {
        projectId: input.projectId,
        runId: input.runId,
        projectRootOverride: context.projectRootOverride,
        operation: {
          targetPath: input.path,
          changeType: "update",
          afterContent: input.content,
          baseVersion: input.baseVersion as ProjectFileVersion,
          expectedContentHash: input.baseVersion.hash,
          expectedMtimeMs: input.baseVersion.mtimeMs,
          expectedSizeBytes: input.baseVersion.sizeBytes,
          reason: "Agent tool save_file",
        },
      });
      const operation = firstAppliedOperation(applied, input.path);
      return {
        path: operation.relativePath,
        newVersionHash: operation.afterVersion?.hash ?? "",
        changed: operation.afterVersion?.hash !== input.baseVersion.hash,
      };
    },
  });

  deps.registry.register({
    toolName: "write_file",
    mutatesState: true,
    inputSchema: WriteFileInputSchema,
    outputSchema: WriteFileOutputSchema,
    handler: async (input, context): Promise<WriteFileToolResult> => {
      if (!input.overwrite) {
        const existing = await tryReadProjectFile({
          fileBrowser: deps.fileBrowser,
          projectId: input.projectId,
          runId: input.runId,
          projectRootOverride: context.projectRootOverride,
          path: input.path,
        });
        if (existing.exists) {
          throw new Error(
            `write_file refuses to overwrite existing file: ${input.path}. Use edit_file with read_file evidence.`
          );
        }
      }

      const applied = await applyProjectFileMutation(deps, {
        projectId: input.projectId,
        runId: input.runId,
        projectRootOverride: context.projectRootOverride,
        operation: {
          targetPath: input.path,
          changeType: "create",
          afterContent: input.content,
          allowOverwrite: input.overwrite,
          preconditions: input.overwrite
            ? []
            : [{ kind: "missing", path: input.path }],
          reason: input.reason ?? "Agent tool write_file",
        },
      });
      const operation = firstAppliedOperation(applied, input.path);
      return {
        path: operation.relativePath,
        changed: operation.beforeVersion?.hash !== operation.afterVersion?.hash,
        newVersionHash: operation.afterVersion?.hash ?? null,
      };
    },
  });

  deps.registry.register({
    toolName: "edit_file",
    mutatesState: true,
    inputSchema: EditFileInputSchema,
    outputSchema: EditFileOutputSchema,
    handler: async (input, context): Promise<IncrementalEditResult> => {
      const file = await deps.fileBrowser.getFileContent({
        projectId: input.projectId,
        path: input.path,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(context.projectRootOverride
          ? { projectRootOverride: context.projectRootOverride }
          : {}),
        maxBytes: 2_000_000,
      });
      if (file.binary) throw new Error(`edit_file blocked binary_file for ${input.path}.`);
      if (file.truncated) throw new Error(`edit_file blocked truncated_file for ${input.path}.`);
      if (file.content === null || !file.version) {
        throw new Error(`edit_file requires readable text content for ${input.path}.`);
      }

      const edit = applyExactIncrementalEdit({
        path: input.path,
        currentContent: file.content,
        oldString: input.oldString,
        newString: input.newString,
        replaceAll: input.replaceAll ?? false,
      });
      if (edit.replacementCount === 0) {
        return {
          path: input.path,
          changed: false,
          newVersionHash: file.version.hash,
          replacementCount: 0,
          additions: 0,
          deletions: 0,
          diff: "",
        };
      }
      const applied = await applyProjectFileMutation(deps, {
        projectId: input.projectId,
        runId: input.runId,
        projectRootOverride: context.projectRootOverride,
        operation: {
          targetPath: input.path,
          changeType: "update",
          beforeContent: file.content,
          afterContent: edit.nextContent,
          baseVersion: input.baseVersion ?? file.version,
          expectedContentHash: input.expectedContentHash,
          expectedMtimeMs: input.expectedMtimeMs,
          reason: input.reason ?? "Agent tool edit_file",
        },
      });
      const operation = firstAppliedOperation(applied, input.path);
      return {
        path: operation.relativePath,
        changed: operation.afterVersion?.hash !== file.version.hash,
        newVersionHash: operation.afterVersion?.hash ?? file.version.hash,
        replacementCount: edit.replacementCount,
        additions: operation.actualDiffStats.addedLines,
        deletions: operation.actualDiffStats.removedLines,
        diff: operation.actualDiff,
      };
    },
  });

  deps.registry.register({
    toolName: "replace_file_range",
    mutatesState: true,
    inputSchema: ReplaceFileRangeInputSchema,
    outputSchema: ReplaceFileRangeOutputSchema,
    handler: async (input, context): Promise<IncrementalEditResult> => {
      const file = await deps.fileBrowser.getFileContent({
        projectId: input.projectId,
        path: input.path,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(context.projectRootOverride
          ? { projectRootOverride: context.projectRootOverride }
          : {}),
        maxBytes: 2_000_000,
      });
      if (file.binary) {
        throw new Error(`replace_file_range blocked binary_file for ${input.path}.`);
      }
      if (file.truncated) {
        throw new Error(`replace_file_range blocked truncated_file for ${input.path}.`);
      }
      if (file.content === null || !file.version) {
        throw new Error(`replace_file_range requires readable text content for ${input.path}.`);
      }

      const edit = applyLineRangeReplacement({
        path: input.path,
        currentContent: file.content,
        startLine: input.startLine,
        endLine: input.endLine,
        replacement: input.replacement,
      });
      const applied = await applyProjectFileMutation(deps, {
        projectId: input.projectId,
        runId: input.runId,
        projectRootOverride: context.projectRootOverride,
        operation: {
          targetPath: input.path,
          changeType: "update",
          beforeContent: file.content,
          afterContent: edit.nextContent,
          baseVersion: input.baseVersion ?? file.version,
          expectedContentHash: input.expectedContentHash,
          expectedMtimeMs: input.expectedMtimeMs,
          reason: input.reason ?? "Agent tool replace_file_range",
        },
      });
      const operation = firstAppliedOperation(applied, input.path);
      return {
        path: operation.relativePath,
        changed: operation.afterVersion?.hash !== file.version.hash,
        newVersionHash: operation.afterVersion?.hash ?? file.version.hash,
        replacementCount: 1,
        additions: operation.actualDiffStats.addedLines,
        deletions: operation.actualDiffStats.removedLines,
        diff: operation.actualDiff,
      };
    },
  });

  deps.registry.register({
    toolName: "delete_file",
    mutatesState: true,
    inputSchema: DeleteFileInputSchema,
    outputSchema: DeleteFileOutputSchema,
    handler: async (input, context) => {
      const applied = await applyProjectFileMutation(deps, {
        projectId: input.projectId,
        runId: input.runId,
        projectRootOverride: context.projectRootOverride,
        operation: {
          targetPath: input.path,
          changeType: "delete",
          afterContent: null,
          reason: input.reason ?? "Agent tool delete_file",
        },
      });
      const operation = firstAppliedOperation(applied, input.path);
      return {
        path: operation.relativePath,
        deleted: operation.changeType === "delete",
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
    handler: async (input, context) => {
      if (!deps.codeChangeSets || !deps.codeChangeSetApplier) {
        throw new Error("CodeChangeSet application tool is not configured.");
      }
      const { rootPath } = await resolveToolWorkspace(deps, input, context);
      const changeSets = await deps.codeChangeSets.listByWorkflow(input.workflowThreadId);
      const changeSet = changeSets.find((candidate) => candidate.id === input.changeSetId);
      if (!changeSet) throw new Error(`CodeChangeSet not found: ${input.changeSetId}`);
      const applied = await deps.codeChangeSetApplier.apply({
        changeSet,
        projectRootPath: rootPath,
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
    handler: async (input, context) => {
      const { rootPath } = await resolveToolWorkspace(
        deps,
        { projectId: input.projectId },
        context
      );
      const config = await configService.load(rootPath);
      const roleName = input.roleName ?? "qa_specialist";
      const runs = await executionService.executeCommandRequests({
        constructionRunId: input.constructionRunId ?? input.projectId,
        roleName,
        projectRoot: rootPath,
        config,
        plan: {
          summary: `Run validation command ${input.commandId}`,
          fileOperations: [],
          commandRequests: [],
          validationCommandIds: [input.commandId],
          risks: [],
        },
        ...(context.signal ? { signal: context.signal } : {}),
        trace: {
          traceId: input.traceId ?? null,
          spanId: input.spanId ?? null,
          parentSpanId: input.parentSpanId ?? null,
          toolCallId: input.toolCallId ?? null,
          runId: input.runId ?? null,
          projectId: input.projectId,
          agentId: input.agentId ?? null,
          filePath: input.filePath ?? null,
          diffId: input.diffId ?? null,
        },
        ...(context.onShellOutput
          ? { onCommandOutput: context.onShellOutput }
          : {}),
      });
      const run =
        runs
          .slice()
          .reverse()
          .find((item) => item.commandId === input.commandId) ?? runs[0];
      if (!run) throw new Error(`Validation command did not produce evidence: ${input.commandId}`);
      return {
        commandId: run.commandId,
        taskId: run.taskId,
        approvalRequired: run.approvalRequired,
        risk: run.risk,
        policyReason: run.policyReason,
        approved: run.approved,
        approvedBy: run.approvedBy,
        approvalReason: run.approvalReason,
        exitCode: run.exitCode,
        stdoutTail: run.stdoutTail,
        stderrTail: run.stderrTail,
        stdoutPath: run.stdoutPath,
        stderrPath: run.stderrPath,
        interactivePromptDetected: run.interactivePromptDetected,
        interactivePromptText: run.interactivePromptText,
        durationMs: run.durationMs,
        runs: runs.map((item) => ({
          commandId: item.commandId,
          taskId: item.taskId,
          approvalRequired: item.approvalRequired,
          risk: item.risk,
          policyReason: item.policyReason,
          approved: item.approved,
          approvedBy: item.approvedBy,
          approvalReason: item.approvalReason,
          exitCode: item.exitCode,
          stdoutTail: item.stdoutTail,
          stderrTail: item.stderrTail,
          stdoutPath: item.stdoutPath,
          stderrPath: item.stderrPath,
          interactivePromptDetected: item.interactivePromptDetected,
          interactivePromptText: item.interactivePromptText,
          durationMs: item.durationMs,
        })),
      };
    },
  });

  if (deps.previewSmokeValidator) {
    deps.registry.register({
      toolName: "inspect_preview",
      mutatesState: false,
      inputSchema: InspectPreviewInputSchema,
      outputSchema: InspectPreviewOutputSchema,
      handler: async (input) => {
        return deps.previewSmokeValidator!.validate(input.previewSessionId);
      },
    });
  }

  deps.registry.register({
    toolName: "run_command",
    mutatesState: false,
    inputSchema: RunCommandInputSchema,
    outputSchema: RunCommandOutputSchema,
    handler: async (input, context) => {
      if (!deps.shellRuntime) {
        throw new Error("ShellCommandRuntime is not configured.");
      }
      const { rootPath } = await resolveToolWorkspace(
        deps,
        { projectId: input.projectId },
        context
      );
      const catalogCommand = await resolveProjectCatalogCommand({
        configService,
        projectRoot: rootPath,
        commandId: input.commandId,
        required: !input.executable && !input.command,
      });
      const executable = input.executable ?? catalogCommand?.executable;
      if (!input.command && !executable) {
        throw new Error(
          `run_command requires command, executable, or registered commandId: ${input.commandId}`
        );
      }
      const args = input.command ? (input.args ?? []) : (input.args ?? catalogCommand?.args ?? []);
      const approvedByCatalog = Boolean(catalogCommand && !input.executable && !input.command);
      const request = ShellCommandRequestSchema.parse({
        commandId: input.commandId,
        traceId: input.traceId,
        spanId: input.spanId,
        parentSpanId: input.parentSpanId,
        toolCallId: input.toolCallId,
        runId: input.runId,
        projectId: input.projectId,
        agentId: input.agentId,
        filePath: input.filePath,
        diffId: input.diffId,
        kind:
          input.kind ??
          inferRunCommandKind({
            commandId: input.commandId,
            executable: executable ?? "",
            command: input.command,
            args,
          }),
        command: input.command,
        shell: input.shell,
        executable,
        args,
        cwd: input.cwd ?? catalogCommand?.cwd ?? ".",
        env: input.env ?? catalogCommand?.env ?? {},
        timeoutMs: input.timeoutMs ?? catalogCommand?.timeoutMs,
        background: input.background,
        approved: approvedByCatalog,
        approvedBy: approvedByCatalog ? "system:project-command-catalog" : null,
        approvalReason: approvedByCatalog
          ? `Command ${input.commandId} is registered in the selected project command catalog.`
          : null,
      });
      return deps.shellRuntime.execute({
        projectRootPath: rootPath,
        request,
        ...(context.signal ? { signal: context.signal } : {}),
        ...(context.onShellOutput ? { onOutput: context.onShellOutput } : {}),
        ...(context.onShellCommandComplete
          ? { onComplete: context.onShellCommandComplete }
          : {}),
      });
    },
  });

  deps.registry.register({
    toolName: "get_git_diff",
    mutatesState: false,
    inputSchema: GitDiffInputSchema,
    outputSchema: GitDiffOutputSchema,
    handler: async (input, context) => {
      const { rootPath } = await resolveToolWorkspace(deps, input, context);
      const stats = await diffAnalyzer.readDiffStats(rootPath);
      return {
        files: stats.changedPaths,
        patchSummary: `${stats.filesChanged} file(s), +${stats.insertions}/-${stats.deletions}`,
      };
    },
  });
}

async function resolveProjectCatalogCommand(input: {
  configService: ProjectConfigReader;
  projectRoot: string;
  commandId: string;
  required: boolean;
}): Promise<
  | {
      id: string;
      executable: string;
      args: string[];
      cwd: string;
      env: Record<string, string>;
      timeoutMs?: number | undefined;
    }
  | undefined
> {
  try {
    const config = await input.configService.load(input.projectRoot);
    const command = config.commandCatalog.find((item) => item.id === input.commandId);
    if (!command && input.required) {
      throw new Error(`Command not found in project catalog: ${input.commandId}`);
    }
    return command;
  } catch (err) {
    if (input.required) throw err;
    return undefined;
  }
}

function inferRunCommandKind(input: {
  commandId: string;
  executable: string;
  command?: string | undefined;
  args: readonly string[];
}): z.infer<typeof CodingValidationCommandKindSchema> {
  const terms = [input.commandId, input.executable, input.command ?? "", ...input.args].flatMap(
    splitCommandTerms
  );
  const termSet = new Set(terms);

  if (
    termSet.has("typecheck") ||
    termSet.has("tsc") ||
    hasAdjacentTerms(terms, "type", "check")
  ) {
    return "type_check";
  }
  if (termSet.has("test") || termSet.has("vitest") || termSet.has("jest")) return "test";
  if (termSet.has("build")) return "build";
  if (termSet.has("lint") || termSet.has("eslint")) return "lint";
  if (termSet.has("check")) return "check";
  return "unknown";
}

function splitCommandTerms(value: string): string[] {
  const terms: string[] = [];
  let current = "";

  for (const char of value.toLowerCase()) {
    if (isAsciiLetterOrDigit(char)) {
      current += char;
      continue;
    }

    if (current.length > 0) {
      terms.push(current);
      current = "";
    }
  }

  if (current.length > 0) terms.push(current);
  return terms;
}

function hasAdjacentTerms(
  terms: readonly string[],
  first: string,
  second: string
): boolean {
  for (let index = 0; index < terms.length - 1; index += 1) {
    if (terms[index] === first && terms[index + 1] === second) return true;
  }
  return false;
}

function isAsciiLetterOrDigit(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}

async function applyProjectFileMutation(
  deps: RegisterProjectAgentToolsDeps,
  input: {
    projectId: string;
    runId?: string | undefined;
    projectRootOverride?: string | undefined;
    operation: ProjectFileMutationOperation;
  }
) {
  if (!deps.fileMutationApplier) {
    throw new Error("Project file mutation applier is not configured.");
  }
  const workspace = await resolveMutationWorkspace(deps, {
    projectId: input.projectId,
    runId: input.runId,
    projectRootOverride: input.projectRootOverride,
  });
  return deps.fileMutationApplier.apply({
    projectRootPath: workspace.rootPath,
    operations: [input.operation],
    allowedWriteRoots: workspace.config.writeRoots,
  });
}

async function resolveMutationWorkspace(
  deps: RegisterProjectAgentToolsDeps,
  input: {
    projectId: string;
    runId?: string | undefined;
    projectRootOverride?: string | undefined;
  }
) {
  const workspace = await resolveToolWorkspace(deps, input, {
    ...(input.projectRootOverride
      ? { projectRootOverride: input.projectRootOverride }
      : {}),
  });
  const config = await deps.configService.load(workspace.rootPath);
  return { rootPath: workspace.rootPath, config };
}

async function resolveToolWorkspace(
  deps: RegisterProjectAgentToolsDeps,
  input: { projectId: string; runId?: string | null | undefined },
  context: { projectRootOverride?: string | undefined }
) {
  const project = await deps.projectConstruction.getProjectWorkspace(input.projectId);
  let rootPath = project.rootPath;
  if (input.runId) {
    const run = await deps.projectConstruction.getConstructionRun(input.runId);
    if (run.projectWorkspaceId !== project.id) {
      throw new Error(`Run not found for this project: ${input.runId}`);
    }
    rootPath = run.workspacePath;
  } else if (context.projectRootOverride) {
    rootPath = context.projectRootOverride;
  }
  return { project, rootPath };
}

function firstAppliedOperation(
  result: Awaited<ReturnType<ProjectFileMutationApplierPort["apply"]>>,
  path: string
) {
  const operation = result.appliedOperations[0];
  if (!operation) {
    throw new Error(`File mutation did not apply any operation for ${path}.`);
  }
  return operation;
}

async function tryReadProjectFile(input: {
  fileBrowser: ProjectFileBrowserPort;
  projectId: string;
  runId?: string | undefined;
  projectRootOverride?: string | undefined;
  path: string;
}): Promise<{ exists: boolean }> {
  try {
    await input.fileBrowser.getFileContent({
      projectId: input.projectId,
      path: input.path,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.projectRootOverride
        ? { projectRootOverride: input.projectRootOverride }
        : {}),
      maxBytes: 1,
    });
    return { exists: true };
  } catch (err) {
    if (isFileNotFoundError(err)) return { exists: false };
    throw err;
  }
}

function isFileNotFoundError(err: unknown): boolean {
  return (
    err instanceof Error &&
    ("code" in err
      ? (err as { code?: unknown }).code === "file_not_found"
      : err.message.toLowerCase().includes("file not found"))
  );
}
