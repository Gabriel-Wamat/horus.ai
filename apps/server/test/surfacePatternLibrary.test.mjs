import assert from "node:assert/strict";
import test from "node:test";
import { DesignSurfaceTypeSchema } from "@u-build/shared";
import {
  SURFACE_PATTERN_LIBRARY,
  formatSurfacePatternLibraryForPrompt,
  getSurfacePattern,
} from "../dist/infrastructure/design/SurfacePatternLibrary.js";

test("surface pattern library covers every DesignBrief surfaceType", () => {
  const registeredSurfaceTypes = new Set(
    SURFACE_PATTERN_LIBRARY.map((item) => item.surfaceType)
  );

  for (const surfaceType of DesignSurfaceTypeSchema.options) {
    assert.equal(
      registeredSurfaceTypes.has(surfaceType),
      true,
      `missing surface pattern for ${surfaceType}`
    );
    const pattern = getSurfacePattern(surfaceType);
    assert.equal(pattern.surfaceType, surfaceType);
    assert.equal(pattern.componentInventory.length > 0, true);
    assert.equal(pattern.requiredStates.includes("mobile"), true);
  }
});

test("surface pattern library maps key surfaces to canonical frontend patterns", () => {
  assert.equal(getSurfacePattern("crud").patternId, "form-crud-tool");
  assert.equal(getSurfacePattern("settings").patternId, "form-crud-tool");
  assert.equal(getSurfacePattern("chat-preview").patternId, "chat-preview-workbench");
  assert.equal(getSurfacePattern("workflow-map").patternId, "workflow-map");
  assert.equal(getSurfacePattern("file-browser").patternId, "operational-dashboard");
  assert.equal(getSurfacePattern("editor-canvas").patternId, "custom-product-surface");

  const promptBlock = formatSurfacePatternLibraryForPrompt();
  assert.equal(promptBlock.includes("version:"), true);
  assert.equal(promptBlock.includes("crud -> form-crud-tool"), true);
  assert.equal(promptBlock.includes("chat-preview -> chat-preview-workbench"), true);
  assert.equal(promptBlock.includes("mock/fake runtime data"), true);
});
