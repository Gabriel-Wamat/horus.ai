import { StructuralPatchIntentSchema } from "@u-build/shared";
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
  afterContent: z.null().optional(),
  rationale: z.string().trim().min(1),
});

const FrontendOperationPlanSchema = z.union([
  FrontendWriteOperationPlanSchema,
  FrontendDeleteOperationPlanSchema,
]);

const FrontendStructuralPatchIntentSchema = StructuralPatchIntentSchema.omit({
  id: true,
}).extend({
  id: z.string().trim().min(1).optional(),
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
