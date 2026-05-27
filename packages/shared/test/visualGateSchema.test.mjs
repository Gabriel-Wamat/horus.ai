import assert from "node:assert/strict";
import test from "node:test";
import { VisualGateResultSchema } from "../dist/entities/ProjectConstruction.js";

test("VisualGateResultSchema accepts compact screenshot evidence and issues", () => {
  const result = VisualGateResultSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    status: "failed",
    score: 64,
    threshold: 86,
    summary: "Visual reprovado: overflow mobile.",
    issues: [
      {
        id: "visual-overflow",
        severity: "high",
        category: "responsive_overflow",
        location: "mobile viewport",
        observed: "width:1200px",
        expected: "layout responsivo",
        fixTarget: "front",
        evidenceIds: ["static-dom:abc:mobile"],
      },
    ],
    screenshots: [
      {
        id: "static-dom:abc:mobile",
        viewport: "mobile",
        width: 390,
        height: 844,
        captureKind: "static_dom",
        nonBlank: true,
        diagnostics: { fixedWidthRisks: ["width:1200px"] },
      },
    ],
    previewUrl: null,
    captureUnavailableReason: null,
    designSystemSourceFiles: ["ID_VISUAL.md"],
    startedAt: "2026-05-27T00:00:00.000Z",
    finishedAt: "2026-05-27T00:00:01.000Z",
    durationMs: 1000,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.screenshots[0].artifactPath, null);
  assert.equal(result.issues[0].fixTarget, "front");
});
