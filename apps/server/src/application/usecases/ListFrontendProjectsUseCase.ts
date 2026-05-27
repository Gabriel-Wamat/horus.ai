import type { PreviewRuntimeManager } from "../../infrastructure/preview/PreviewRuntimeManager.js";

export class ListFrontendProjectsUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimeManager) {}

  async execute() {
    return this.previewRuntime.listProjects();
  }
}
