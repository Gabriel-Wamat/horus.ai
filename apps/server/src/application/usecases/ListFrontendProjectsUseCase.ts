import type { PreviewRuntimeManager } from "../../infrastructure/preview/PreviewRuntimeManager.js";
import type { PreviewProjectListVisibility } from "../../infrastructure/preview/PreviewProjectHealthService.js";

export class ListFrontendProjectsUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimeManager) {}

  async execute(input: { visibility?: PreviewProjectListVisibility } = {}) {
    return this.previewRuntime.listProjects(input.visibility ?? "visible");
  }
}
