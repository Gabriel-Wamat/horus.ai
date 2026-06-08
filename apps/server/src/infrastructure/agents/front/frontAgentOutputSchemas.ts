import {
  AstSymbolKindSchema,
  StructuralPatchInsertionPositionSchema,
  StructuralPatchIntentSchema,
  StructuralPatchOperationKindSchema,
  type StructuralPatchIntent,
} from "@u-build/shared";
import { z } from "zod";

const FrontendWriteOperationPlanSchema = z.object({
  operation: z.literal("write").default("write"),
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

const nullableText = z.string().trim().min(1).nullable();

const FrontendStructuralPatchIntentSchema = z.object({
  id: nullableText,
  kind: StructuralPatchOperationKindSchema,
  targetPath: z.string().trim().min(1),
  targetSymbolId: nullableText,
  targetSymbolName: nullableText,
  targetSymbolKind: AstSymbolKindSchema.nullable(),
  position: StructuralPatchInsertionPositionSchema.nullable(),
  content: z.string().nullable(),
  newName: nullableText,
  importSource: nullableText,
  namedImports: z.array(z.string().trim().min(1)),
  defaultImport: nullableText,
  namespaceImport: nullableText,
  rationale: nullableText,
});

export const CodeAwareFrontendOutputSchema = z
  .object({
    summary: z.string().trim().min(1),
    previewHtml: z.string().nullable(),
    operations: z.array(FrontendOperationPlanSchema),
    structuralPatchIntents: z.array(FrontendStructuralPatchIntentSchema),
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

export function normalizeFrontendStructuralPatchIntent(
  intent: z.infer<typeof FrontendStructuralPatchIntentSchema>,
  index: number
): StructuralPatchIntent {
  const normalized: Record<string, unknown> = {
    id: intent.id ?? `front-structural-${index + 1}`,
    kind: intent.kind,
    targetPath: intent.targetPath,
    namedImports: intent.namedImports,
  };

  if (intent.targetSymbolId) normalized.targetSymbolId = intent.targetSymbolId;
  if (intent.targetSymbolName) normalized.targetSymbolName = intent.targetSymbolName;
  if (intent.targetSymbolKind) normalized.targetSymbolKind = intent.targetSymbolKind;
  if (intent.position) normalized.position = intent.position;
  if (intent.content !== null) normalized.content = intent.content;
  if (intent.newName) normalized.newName = intent.newName;
  if (intent.importSource) normalized.importSource = intent.importSource;
  if (intent.defaultImport) normalized.defaultImport = intent.defaultImport;
  if (intent.namespaceImport) normalized.namespaceImport = intent.namespaceImport;
  if (intent.rationale) normalized.rationale = intent.rationale;

  return StructuralPatchIntentSchema.parse(normalized);
}

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
