import { z } from "zod";

export const CodeContextFileSchema = z.object({
  path: z.string().trim().min(1),
  bytes: z.number().int().nonnegative(),
  content: z.string(),
});

export const CodeContextLimitsSchema = z.object({
  maxFiles: z.number().int().positive(),
  maxBytesPerFile: z.number().int().positive(),
  maxTotalBytes: z.number().int().positive(),
});

export const CodeContextBundleSchema = z.object({
  projectId: z.string().uuid(),
  query: z.string().trim().min(1),
  inspectedFiles: z.array(z.string().trim().min(1)),
  files: z.array(CodeContextFileSchema),
  omittedFilesCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  limits: CodeContextLimitsSchema,
});

export type CodeContextFile = z.infer<typeof CodeContextFileSchema>;
export type CodeContextLimits = z.infer<typeof CodeContextLimitsSchema>;
export type CodeContextBundle = z.infer<typeof CodeContextBundleSchema>;
