import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { AgentProfileSchema } from "@u-build/shared";
import {
  AgentProfileRegistry,
  AgentToolAccessDeniedError,
} from "../dist/application/services/AgentProfileRegistry.js";
import {
  AgentToolNotRegisteredError,
  AgentToolRegistry,
} from "../dist/application/services/AgentToolRegistry.js";

test("AgentProfileRegistry declares every specialist profile", () => {
  const registry = new AgentProfileRegistry();
  const profiles = registry.listProfiles();

  assert.deepEqual(
    profiles.map((profile) => profile.id).sort(),
    [
      "chat_agent",
      "curator_agent",
      "front_agent",
      "odin_agent",
      "qa_agent",
      "spec_agent",
    ]
  );
  for (const profile of profiles) {
    assert.doesNotThrow(() => AgentProfileSchema.parse(profile));
    assert.ok(profile.allowedTools.length > 0);
    assert.ok(profile.outputContract.length > 0);
  }
});

test("AgentToolRegistry executes allowed registered tools", async () => {
  const tools = new AgentToolRegistry(new AgentProfileRegistry());
  tools.register({
    toolName: "search_code_readonly",
    mutatesState: false,
    inputSchema: z.object({ query: z.string().min(1) }),
    outputSchema: z.object({ ok: z.literal(true), input: z.object({ query: z.string() }) }),
    handler: async (input) => ({
      ok: true,
      input,
    }),
  });

  const result = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "search_code_readonly",
    input: { query: "App.tsx" },
  });

  assert.deepEqual(result, { ok: true, input: { query: "App.tsx" } });
});

test("AgentToolRegistry validates input and output schemas", async () => {
  const tools = new AgentToolRegistry(new AgentProfileRegistry());
  tools.register({
    toolName: "search_code_readonly",
    mutatesState: false,
    inputSchema: z.object({ query: z.string().min(1) }),
    outputSchema: z.object({ ok: z.literal(true) }),
    handler: async () => ({ ok: false }),
  });

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "front_agent",
        toolName: "search_code_readonly",
        input: { query: "" },
      }),
    /too_small/
  );

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "front_agent",
        toolName: "search_code_readonly",
        input: { query: "App.tsx" },
      }),
    /Invalid literal value/
  );
});

test("AgentToolRegistry records redacted audit events", async () => {
  const events = [];
  const tools = new AgentToolRegistry(new AgentProfileRegistry(), {
    record: async (event) => {
      events.push(event);
    },
  });
  tools.register({
    toolName: "search_code_readonly",
    mutatesState: false,
    inputSchema: z.object({ query: z.string(), apiKey: z.string() }),
    outputSchema: z.object({ token: z.string(), content: z.string() }),
    handler: async () => ({ token: "sk-abcdefghijklmnop", content: "ok" }),
  });

  const result = await tools.execute({
    agentProfileId: "front_agent",
    toolName: "search_code_readonly",
    input: { query: "App.tsx", apiKey: "sk-abcdefghijklmnop" },
  });

  assert.equal(result.token, "sk-abcdefghijklmnop");
  assert.equal(events.length, 2);
  assert.equal(events[0].status, "started");
  assert.equal(events[0].input.apiKey, "[REDACTED]");
  assert.equal(events[1].status, "succeeded");
  assert.equal(events[1].output.token, "[REDACTED]");
});

test("AgentToolRegistry denies forbidden tools before handler lookup", async () => {
  const tools = new AgentToolRegistry(new AgentProfileRegistry());

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "chat_agent",
        toolName: "write_file",
        input: {},
      }),
    AgentToolAccessDeniedError
  );
});

test("AgentToolRegistry rejects unknown registered surface by schema", async () => {
  const tools = new AgentToolRegistry(new AgentProfileRegistry());

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "front_agent",
        toolName: "made_up_tool",
        input: {},
      }),
    /Invalid enum value/
  );
});

test("AgentToolRegistry rejects allowed but unregistered tools", async () => {
  const tools = new AgentToolRegistry(new AgentProfileRegistry());

  await assert.rejects(
    () =>
      tools.execute({
        agentProfileId: "front_agent",
        toolName: "search_code_readonly",
        input: {},
      }),
    AgentToolNotRegisteredError
  );
});
