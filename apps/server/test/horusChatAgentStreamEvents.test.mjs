import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkText,
  mergeToolStep,
  streamEventToToolStep,
} from "../dist/application/services/HorusChatAgentStreamEvents.js";

test("HorusChatAgentStreamEvents chunks assistant text deterministically", () => {
  assert.deepEqual(chunkText("abcdef", 2), ["ab", "cd", "ef"]);
});

test("HorusChatAgentStreamEvents merges tool lifecycle events by title and tool", () => {
  const started = streamEventToToolStep({
    type: "tool_started",
    tool: "read_file",
    title: "Lendo arquivo: src/App.tsx",
  });
  const succeeded = streamEventToToolStep({
    type: "tool_succeeded",
    tool: "read_file",
    title: "Lendo arquivo: src/App.tsx",
    detail: "Trecho lido.",
  });

  assert.deepEqual(mergeToolStep([started], succeeded), [
    {
      tool: "read_file",
      title: "Lendo arquivo: src/App.tsx",
      phase: "succeeded",
      filePaths: [],
      commandIds: [],
      taskId: null,
      fileOperations: [],
      detail: "Trecho lido.",
    },
  ]);
});

test("HorusChatAgentStreamEvents preserves command task ids for console follow-up", () => {
  const started = streamEventToToolStep({
    type: "tool_started",
    tool: "run_command",
    title: "Executando comando: dev",
    commandIds: ["dev"],
  });
  const succeeded = streamEventToToolStep({
    type: "tool_succeeded",
    tool: "run_command",
    title: "Executando comando: dev",
    commandIds: ["dev"],
    taskId: "dev-task-1",
  });

  assert.equal(mergeToolStep([started], succeeded)[0].taskId, "dev-task-1");
});
