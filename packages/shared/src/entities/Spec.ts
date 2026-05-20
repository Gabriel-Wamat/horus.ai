import { z } from "zod";

export const ComponentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["ui", "api", "service", "model", "utility"]),
  description: z.string(),
  dependencies: z.array(z.string()).default([]),
  props: z.record(z.string(), z.unknown()).optional(),
});

export const ApiEndpointSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().startsWith("/"),
  description: z.string(),
  requestSchema: z.record(z.string(), z.unknown()).optional(),
  responseSchema: z.record(z.string(), z.unknown()).optional(),
});

export const SpecSchema = z.object({
  id: z.string().uuid(),
  userStoryId: z.string().uuid(),
  version: z.number().int().min(1).default(1),
  summary: z.string().min(1),
  technicalApproach: z.string().min(1),
  components: z.array(ComponentSchema).min(1),
  apiEndpoints: z.array(ApiEndpointSchema).default([]),
  dataModels: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).min(1),
  generatedAt: z.string().datetime(),
  approvedAt: z.string().datetime().optional(),
  approvedBy: z.enum(["human", "auto"]).optional(),
});

export type Spec = z.infer<typeof SpecSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>;
