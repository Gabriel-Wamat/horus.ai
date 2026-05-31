import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { AgentProfileRegistry } from "../dist/application/services/AgentProfileRegistry.js";
import { AgentToolRegistry } from "../dist/application/services/AgentToolRegistry.js";
import { AgentToolRuntime } from "../dist/application/services/AgentToolRuntime.js";

test("AgentToolRuntime blocks out-of-profile mutation tools before handler execution", async () => {
  let handlerCalled = false;
  const registry = new AgentToolRegistry(new AgentProfileRegistry());
  registry.register({
    toolName: "edit_file",
    mutatesState: true,
    inputSchema: z.object({ projectId: z.string(), path: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async () => {
      handlerCalled = true;
      return { ok: true };
    },
  });

  const runtime = new AgentToolRuntime(registry, {
    agentProfileId: "qa_agent",
    projectId: "33333333-3333-4333-8333-333333333333",
  });

  await assert.rejects(
    () =>
      runtime.execute({
        toolName: "edit_file",
        input: { path: "src/App.tsx" },
        reason: "QA should not mutate files.",
      }),
    /not allowed/
  );

  const events = runtime.getEvents();
  assert.equal(handlerCalled, false);
  assert.equal(events[0].toolName, "edit_file");
  assert.equal(events[0].mutatesState, true);
  assert.equal(events.at(-1).status, "blocked");
  assert.equal(events.at(-1).mutatesState, true);
});

test("AgentToolRuntime reports mutability from the capability registry", async () => {
  const registry = new AgentToolRegistry(new AgentProfileRegistry());
  registry.register({
    toolName: "run_command",
    mutatesState: false,
    inputSchema: z.object({ projectId: z.string(), executable: z.string() }),
    outputSchema: z.object({ exitCode: z.number().nullable() }),
    handler: async () => ({ exitCode: 0 }),
  });

  const runtime = new AgentToolRuntime(registry, {
    agentProfileId: "qa_agent",
    projectId: "33333333-3333-4333-8333-333333333333",
  });

  await runtime.execute({
    toolName: "run_command",
    input: { executable: "pnpm" },
    reason: "Run governed validation.",
  });

  assert.equal(runtime.getEvents()[0].mutatesState, false);
  assert.equal(runtime.getEvents().at(-1).status, "succeeded");
});
