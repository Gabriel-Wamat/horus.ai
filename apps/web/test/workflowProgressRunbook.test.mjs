import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

function read(relativePath) {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

test("Preview progress and Agent Flow render runbook projection entries", () => {
  const workflowProgress = read("src/features/visual-preview/workflowProgress.ts");
  const drawer = read("src/features/agent-flow-map/components/RunFlowDrawer.tsx");
  const styles = read("src/features/agent-flow-map/styles/agent-flow-map.css");

  assert.match(workflowProgress, /AgentRunbookEntry/);
  assert.match(workflowProgress, /workflowActivityFromRunbookEntry/);
  assert.match(workflowProgress, /runbookEntry/);
  assert.match(drawer, /runbookEntries/);
  assert.match(drawer, /RunbookCard/);
  assert.match(drawer, /agent-flow-runbook-row/);
  assert.match(styles, /\.agent-flow-runbook-list/);
  assert.match(styles, /\.agent-flow-runbook-row\.is-succeeded/);
  assert.match(styles, /\.agent-flow-runbook-row\.is-waiting_for_decision/);
});
