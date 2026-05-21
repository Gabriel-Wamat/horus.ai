import { ChatAnthropic } from "@langchain/anthropic";
import { v4 as uuidv4 } from "uuid";
import { SpecSchema, type Spec, type UserStory } from "@u-build/shared";

// Schema sem campos que o LLM não deve gerar — serão preenchidos aqui
const LlmSpecSchema = SpecSchema.omit({
  id: true,
  userStoryId: true,
  generatedAt: true,
  approvedAt: true,
  approvedBy: true,
});

const model = new ChatAnthropic({
  model: "private-model-haiku-4-5-20251001",
}).withStructuredOutput(LlmSpecSchema);

export async function generateSpec(userStory: UserStory): Promise<Spec> {
  const prompt = buildPrompt(userStory);
  const raw = await model.invoke(prompt);

  return SpecSchema.parse({
    ...raw,
    id: uuidv4(),
    userStoryId: userStory.id,
    generatedAt: new Date().toISOString(),
  });
}

function buildPrompt(us: UserStory): string {
  return `You are a senior software architect specializing in static web delivery and UX. Analyze the user story below and produce a comprehensive, actionable technical specification that a developer could implement without any additional context.

# User Story
**Title:** ${us.title}

**Description:**
${us.description}

**Acceptance Criteria:**
${us.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

# Instructions

## summary
Write 2–3 sentences covering: (1) what the page does and what value it delivers, (2) who the primary user is, and (3) the main technical challenge or design consideration.

## technicalApproach
Describe the full implementation strategy. You MUST cover all of the following:
- **File structure:** single self-contained \`index.html\` with all CSS inside \`<style>\` and all JS inside \`<script>\` — no external files
- **CSS architecture:** CSS custom properties for theming (e.g. \`--color-primary\`, \`--color-bg\`, \`--font-size-base\`), Flexbox/Grid layout strategy per section, mobile-first responsive breakpoints at 640px, 768px, and 1024px
- **JavaScript architecture:** use an IIFE or module pattern; describe how data is initialized, how the DOM is queried, and how events are delegated
- **Performance:** no external HTTP requests; use inline SVG for icons if needed; keep render-blocking code minimal

## components
List all page sections and interactive widgets as individual components. For each component:
- \`name\`: PascalCase (e.g. \`HeroSection\`, \`FilterBar\`, \`ProductCard\`)
- \`type\`: always \`"ui"\` for static sites
- \`description\`: what the component renders, what data it displays, and its key interactive behavior (hover states, click handlers, dynamic updates)
- \`dependencies\`: names of other components it references or that must render before it (empty array if none)

## apiEndpoints
Always return \`[]\`. This is a static site with no backend — all data is mock data embedded in JS.

## dataModels
List every domain entity that appears in the UI. For each model, include all fields with their JS types and a concrete example value. Format:
\`EntityName: { fieldName: type (example: value), ... }\`
Example: \`MenuItem: { id: string (example: "item-1"), name: string (example: "Margherita"), price: number (example: 12.9), category: string (example: "pizza"), available: boolean (example: true) }\`
Provide at least one model per visible domain entity.

## acceptanceCriteria
Reframe each user-story criterion as a testable technical assertion. Do NOT simply restate the original. Use this format:
\`Given [initial DOM/app state], when [user action or page load event], then [specific observable DOM or behavior outcome].\`
Every criterion from the user story must have a corresponding technical assertion.

## Quality Gate
The specification must be complete enough that a developer with zero knowledge of the original user story can implement the page solely from this spec.`;
}
