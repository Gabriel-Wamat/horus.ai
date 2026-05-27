import { ChatAnthropic } from "@langchain/anthropic";
import type { Spec, UserStory } from "@u-build/shared";
import type { CuratorFeedback } from "../langgraph/state.js";

export interface FrontendOutput {
  html: string;
}

const model = new ChatAnthropic({
  model: "gpt-4.1-mini",
  temperature: 0.2,
  maxTokens: 8192,
});

export async function generateFrontend(
  userStory: UserStory,
  spec: Spec,
  curatorFeedback?: CuratorFeedback
): Promise<FrontendOutput> {
  const components = spec.components
    .map((c) => `- ${c.name} (${c.type}): ${c.description}`)
    .join("\n");
  const criteria = spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
  const dataModels =
    spec.dataModels.length > 0 ? spec.dataModels.join("\n") : "N/A";

  // Reflection: include curator feedback when retrying so the agent self-corrects
  const reflectionBlock =
    curatorFeedback && !curatorFeedback.passed
      ? `
# Curator Feedback (previous attempt — YOU MUST FIX these issues)
**Previous score:** ${curatorFeedback.score}/100
**Evaluation:** ${curatorFeedback.notes}
**Missing items:**
${curatorFeedback.missingItems.map((m) => `- ${m}`).join("\n")}

You MUST address every item above in this new implementation.
`
      : "";

  const prompt = `You are an expert frontend developer. Generate a complete and fully functional HTML page based on the technical specification below.
${reflectionBlock}
# User Story
**Title:** ${userStory.title}

# Technical Specification
**Summary:** ${spec.summary}

**Technical Approach:** ${spec.technicalApproach}

**Components/Sections:**
${components}

**Data Models:**
${dataModels}

**Acceptance Criteria:**
${criteria}

# Implementation Rules
- Use only HTML, CSS, and vanilla JavaScript (no frameworks, no external CDNs)
- All CSS must be inside a <style> tag and all JS inside a <script> tag — everything embedded in one HTML file
- Responsive design using CSS Flexbox and/or Grid with media queries
- Use CSS custom properties (--color-primary, --color-bg, etc.) for theming
- Include realistic mock data in JavaScript to populate the UI
- The code must be complete, functional, and openable directly in a browser
- Return ONLY the complete HTML code, starting with <!DOCTYPE html>
- Do not include explanations, markdown code fences, or any text outside the HTML`;

  const response = await model.invoke(prompt);
  const content =
    typeof response.content === "string"
      ? response.content
      : response.content
          .map((c) => ("text" in c ? c.text : ""))
          .join("");

  const html = content
    .replace(/^```html\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  return { html };
}