import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import type { Spec } from "@u-build/shared";

const CuratorOutputSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  notes: z.string(),
  missingItems: z.array(z.string()),
  // Reflection pattern: directs which agent(s) need to retry
  fixTarget: z.enum(["front", "qa", "both"]),
});

export type CuratorOutput = z.infer<typeof CuratorOutputSchema>;

const model = new ChatAnthropic({
  model: "gpt-4.1-mini",
  temperature: 1,
}).withStructuredOutput(CuratorOutputSchema);

export async function validateOutput(
  spec: Spec,
  html: string
): Promise<CuratorOutput> {
  const components = spec.components
    .map((c) => `- ${c.name} (${c.type}): ${c.description}`)
    .join("\n");
  const criteria = spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const htmlPreview = html;

  const prompt = `You are a software quality curator. Analyze the generated HTML and verify whether it meets the technical specification.

# Technical Specification

**Expected components:**
${components}

**Acceptance Criteria:**
${criteria}

# Generated HTML
\`\`\`html
${htmlPreview}
\`\`\`

## Evaluation Instructions
- score: 0–100 indicating spec coverage (how well the HTML implements the spec)
- passed: true if score >= 70
- notes: an objective 1–2 sentence summary of the evaluation
- missingItems: list of spec items that are absent or incomplete (empty array if passed)
- fixTarget: if failed, indicate which agent should fix it:
  - "front" → visual or structural problem in the HTML/CSS/JS
  - "qa" → acceptance criteria misinterpreted in the tests
  - "both" → both need to be redone`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await model.invoke(prompt);
    } catch (err) {
      console.warn(`[CuratorAgent] Attempt ${attempt} failed to parse output:`, err);
      if (attempt === 2) {
        console.error("[CuratorAgent] All retries exhausted — marking as failed");
        return {
          passed: false,
          score: 0,
          notes: "Curator could not evaluate the output (parsing failure).",
          missingItems: ["Manual evaluation required"],
          fixTarget: "both",
        };
      }
    }
  }

  return {
    passed: false,
    score: 0,
    notes: "Curator could not evaluate the output.",
    missingItems: [],
    fixTarget: "both",
  };
}