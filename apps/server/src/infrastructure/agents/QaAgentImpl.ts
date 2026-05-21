import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import type { Spec, UserStory } from "@u-build/shared";
import type { CuratorFeedback } from "../langgraph/state.js";

const TestCaseSchema = z.object({
  id: z.string(),
  criterion: z.string(),
  steps: z.array(z.string()),
  expected: z.string(),
});

const QaOutputSchema = z.object({
  testCases: z.array(TestCaseSchema),
});

export type QaOutput = z.infer<typeof QaOutputSchema>;

const model = new ChatAnthropic({
  model: "private-model-sonnet-4-6",
  temperature: 1,
}).withStructuredOutput(QaOutputSchema);

export async function generateQaTests(
  userStory: UserStory,
  spec: Spec,
  curatorFeedback?: CuratorFeedback
): Promise<QaOutput> {
  const criteria = spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
  const components = spec.components
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n");

  const reflectionBlock =
    curatorFeedback && !curatorFeedback.passed
      ? `
# Curator Feedback (previous attempt — REFINE the test cases)
**Evaluation:** ${curatorFeedback.notes}
**Items with insufficient coverage:**
${curatorFeedback.missingItems.map((m) => `- ${m}`).join("\n")}

Ensure the new test cases cover all the items above with greater precision.
`
      : "";

  const prompt = `You are a QA engineer specializing in web interface testing. Generate detailed manual test cases for validation.
${reflectionBlock}
# User Story
${userStory.title}

# Page Components
${components}

# Acceptance Criteria
${criteria}

Generate one test case per acceptance criterion. Each case must have clear, objective steps and a specific expected result.
IDs must be TC-01, TC-02, etc.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await model.invoke(prompt);
    } catch (err) {
      console.warn(`[QaAgent] Attempt ${attempt} failed to parse output:`, err);
      if (attempt === 2) {
        console.error("[QaAgent] All retries exhausted — returning empty test cases");
        return { testCases: [] };
      }
    }
  }

  return { testCases: [] };
}