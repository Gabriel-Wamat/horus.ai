import {
  getLatestSuccessfulAgentResult,
  type WorkflowState,
} from "@u-build/shared";

export interface WorkflowArtifactFile {
  name: string;
  content: string;
}

export function slugifyArtifactFolder(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "story"
  );
}

export function buildWorkflowArtifactFiles(
  state: WorkflowState
): WorkflowArtifactFile[] {
  const files: WorkflowArtifactFile[] = [];

  for (const story of state.userStories) {
    const folder = slugifyArtifactFolder(story.title);
    const results = state.agentResults[story.id] ?? [];

    const frontResult = getLatestSuccessfulAgentResult(results, "front");
    const frontHtml = frontResult?.output["html"] as string | undefined;
    if (frontHtml) {
      files.push({ name: `${folder}/page.html`, content: frontHtml });
    }

    const qaResult = getLatestSuccessfulAgentResult(results, "qa");
    const testCases = qaResult?.output["testCases"];
    if (testCases) {
      files.push({
        name: `${folder}/test-cases.json`,
        content: JSON.stringify(testCases, null, 2),
      });
    }
  }

  return files;
}
