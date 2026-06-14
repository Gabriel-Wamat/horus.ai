import { z } from "zod";

const FrontendWriteOperationPlanSchema = z.object({
  operation: z.literal("write"),
  targetPath: z.string().trim().min(1),
  afterContent: z.string().min(1),
  rationale: z.string().trim().min(1),
});

const FrontendDeleteOperationPlanSchema = z.object({
  operation: z.literal("delete"),
  targetPath: z.string().trim().min(1),
  afterContent: z.null(),
  rationale: z.string().trim().min(1),
});

const FrontendOperationPlanSchema = z.union([
  FrontendWriteOperationPlanSchema,
  FrontendDeleteOperationPlanSchema,
]);

// Standalone schema compatible with OpenAI strict structured outputs.
// All optional fields use .nullish() (= .optional().nullable()) because
// OpenAI strict mode requires every non-required field to also accept null.
const FrontendStructuralPatchIntentSchema = z.object({
  id: z.string().trim().min(1).nullish(),
  kind: z.enum([
    "insert",
    "replace",
    "delete",
    "rename_local",
    "add_import",
    "remove_import",
    "update_export",
  ]),
  targetPath: z.string().trim().min(1),
  targetSymbolId: z.string().trim().min(1).nullish(),
  targetSymbolName: z.string().trim().min(1).nullish(),
  targetSymbolKind: z
    .enum([
      "import",
      "export",
      "function",
      "class",
      "method",
      "variable",
      "component",
      "hook",
      "type",
      "interface",
      "unknown",
    ])
    .nullish(),
  position: z
    .enum([
      "file_start",
      "file_end",
      "before_symbol",
      "after_symbol",
      "after_imports",
    ])
    .nullish(),
  content: z.string().nullish(),
  newName: z.string().trim().min(1).nullish(),
  importSource: z.string().trim().min(1).nullish(),
  namedImports: z.array(z.string().trim().min(1)).default([]),
  defaultImport: z.string().trim().min(1).nullish(),
  namespaceImport: z.string().trim().min(1).nullish(),
  rationale: z.string().trim().min(1).nullish(),
});

export const CodeAwareFrontendOutputSchema = z
  .object({
    summary: z.string().trim().min(1),
    previewHtml: z.string().nullable(),
    operations: z.array(FrontendOperationPlanSchema).default([]),
    structuralPatchIntents: z
      .array(FrontendStructuralPatchIntentSchema)
      .default([]),
  })
  .superRefine((output, ctx) => {
    if (
      output.operations.length === 0 &&
      output.structuralPatchIntents.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operations"],
        message:
          "Return at least one file operation or one structuralPatchIntent.",
      });
    }
  });

export type CodeAwareFrontendOutput = z.infer<
  typeof CodeAwareFrontendOutputSchema
>;

const ProjectFileOperationPlanSchema = z.object({
  operation: z.enum(["write", "delete"]),
  path: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  content: z.string().nullable(),
  contentBase64: z.string().nullable(),
});

const ProjectCommandRequestPlanSchema = z.object({
  commandId: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

export const ProjectExecutionPlanLlmSchema = z.object({
  summary: z.string().trim().min(1),
  fileOperations: z.array(ProjectFileOperationPlanSchema),
  commandRequests: z.array(ProjectCommandRequestPlanSchema),
  validationCommandIds: z.array(z.string().trim().min(1)),
  risks: z.array(z.string()),
});

export type ProjectExecutionPlanLlm = z.infer<
  typeof ProjectExecutionPlanLlmSchema
>;
