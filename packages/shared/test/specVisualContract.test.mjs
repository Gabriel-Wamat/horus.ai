import assert from "node:assert/strict";
import test from "node:test";
import {
  DesignContextBundleSchema,
  SpecSchema,
  VisualContractSchema,
} from "../dist/entities/Spec.js";

const baseSpec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: "11111111-1111-4111-8111-111111111111",
  version: 1,
  summary: "Painel inicial",
  technicalApproach: "Editar o frontend existente.",
  components: [
    {
      name: "HomePanel",
      type: "ui",
      description: "Renderiza o painel inicial.",
      dependencies: [],
    },
  ],
  apiEndpoints: [],
  dataModels: ["HomeState"],
  acceptanceCriteria: ["A tela deve exibir o painel inicial."],
  generatedAt: "2026-05-27T00:00:00.000Z",
};

test("SpecSchema keeps old specs compatible without visualContract", () => {
  const parsed = SpecSchema.parse(baseSpec);

  assert.equal(parsed.visualContract, undefined);
  assert.equal(parsed.summary, "Painel inicial");
});

test("SpecSchema accepts a structured visualContract", () => {
  const visualContract = VisualContractSchema.parse({
    mode: "preserve_identity",
    designSource: "project_files",
    layoutArchetype: "dark operational console",
    density: "compact",
    tone: "Escuro, tecnico e discreto.",
    colorPolicy: {
      background: ["#0b0e0c"],
      surface: ["#121714"],
      text: ["#e5ece8"],
      accent: ["#14c77b"],
      forbidden: ["high-saturation purple"],
      usageRules: ["Use green only for status and primary actions."],
    },
    typography: {
      families: ["Inter"],
      scaleRules: ["Compact panels use restrained headings."],
    },
    spacingAndShape: {
      spacingScale: ["8px", "12px", "16px"],
      radiusRules: ["Use radius <= 8px for cards."],
      strokeRules: ["Use subtle gray strokes."],
      shadowRules: ["Avoid decorative glow."],
    },
    componentPolicy: {
      preferExistingComponents: true,
      allowedLibraries: ["lucide-react"],
      requiredPatterns: ["icon + label buttons"],
      forbiddenPatterns: ["nested cards"],
    },
    states: ["default", "loading", "error", "success"],
    responsiveRules: ["No text overflow on mobile."],
    accessibilityRules: ["Focus states must be visible."],
    antiPatterns: ["No excessive frames."],
    referenceFiles: ["ID_VISUAL.md", "src/index.css"],
  });

  const parsed = SpecSchema.parse({
    ...baseSpec,
    visualContract,
  });

  assert.equal(parsed.visualContract?.mode, "preserve_identity");
  assert.equal(parsed.visualContract?.colorPolicy.accent[0], "#14c77b");
});

test("DesignContextBundleSchema accepts compact design evidence", () => {
  const parsed = DesignContextBundleSchema.parse({
    projectId: "project-1",
    sourceFiles: ["ID_VISUAL.md", "src/index.css"],
    tokens: {
      "--background": "#0b0e0c",
      "--accent": "#14c77b",
    },
    components: [
      {
        name: "Button",
        path: "src/components/Button.tsx",
        purpose: "Existing UI primitive.",
      },
    ],
    visualSummary: "Dark operational visual system.",
    constraints: ["Use gray surfaces first."],
    antiPatterns: ["Avoid high saturation highlights."],
    warnings: [],
    generatedAt: "2026-05-27T00:00:00.000Z",
  });

  assert.equal(parsed.tokens["--accent"], "#14c77b");
  assert.equal(parsed.components[0].name, "Button");
});
