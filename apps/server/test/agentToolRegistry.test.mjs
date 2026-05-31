import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { AgentProfileRegistry } from "../dist/application/services/AgentProfileRegistry.js";
import {
  AgentToolAbortedError,
  AgentToolRegistry,
} from "../dist/application/services/AgentToolRegistry.js";

test("AgentToolRegistry denies tools outside the agent profile capability matrix", async () => {
  const registry = new AgentToolRegistry(new AgentProfileRegistry());
  registry.register({
    toolName: "edit_file",
    mutatesState: true,
    inputSchema: z.object({ projectId: z.string(), path: z.string(), content: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async () => ({ ok: true }),
  });

  await assert.rejects(
    () =>
      registry.execute({
        agentProfileId: "qa_agent",
        toolName: "edit_file",
        input: {
          projectId: "33333333-3333-4333-8333-333333333333",
          path: "src/App.tsx",
          content: "x",
        },
      }),
    /not allowed/
  );
});

test("AgentToolRegistry exposes registered tool names for startup validation", () => {
  const registry = new AgentToolRegistry(new AgentProfileRegistry());
  const profiles = new AgentProfileRegistry();
  registry.register({
    toolName: "read_file",
    mutatesState: false,
    inputSchema: z.object({ projectId: z.string(), path: z.string() }),
    outputSchema: z.object({ content: z.string().nullable() }),
    handler: async () => ({ content: null }),
  });

  assert.equal(registry.hasTool("read_file"), true);
  assert.deepEqual(registry.listRegisteredTools(), ["read_file"]);
  assert.doesNotThrow(() =>
    profiles.validateRegisteredToolReferences({
      registeredTools: registry.listRegisteredTools(),
      profileIds: ["front_agent"],
      toolNames: ["read_file"],
    })
  );
  assert.throws(
    () =>
      profiles.validateRegisteredToolReferences({
        registeredTools: registry.listRegisteredTools(),
        profileIds: ["front_agent"],
        toolNames: ["edit_file"],
      }),
    /unregistered tool/
  );
});

test("AgentToolRegistry passes AbortSignal to handlers and blocks pre-aborted tools", async () => {
  const registry = new AgentToolRegistry(new AgentProfileRegistry());
  const controller = new AbortController();
  let receivedSignal;
  registry.register({
    toolName: "read_file",
    mutatesState: false,
    inputSchema: z.object({ projectId: z.string(), path: z.string() }),
    outputSchema: z.object({ content: z.string().nullable() }),
    handler: async (_input, context) => {
      receivedSignal = context.signal;
      return { content: null };
    },
  });

  await registry.execute({
    agentProfileId: "front_agent",
    toolName: "read_file",
    input: {
      projectId: "33333333-3333-4333-8333-333333333333",
      path: "src/App.tsx",
    },
    signal: controller.signal,
  });

  assert.equal(receivedSignal, controller.signal);
  controller.abort();

  await assert.rejects(
    () =>
      registry.execute({
        agentProfileId: "front_agent",
        toolName: "read_file",
        input: {
          projectId: "33333333-3333-4333-8333-333333333333",
          path: "src/App.tsx",
        },
        signal: controller.signal,
      }),
    (err) => err instanceof AgentToolAbortedError
  );
});
