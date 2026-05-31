import type {
  PreviewProjectListVisibility,
  PreviewRuntimePort,
} from "../ports/PreviewRuntimePort.js";

export class ListFrontendProjectsUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimePort) {}

  async execute(input: { visibility?: PreviewProjectListVisibility } = {}) {
    return this.previewRuntime.listProjects(input.visibility ?? "visible");
  }
}
