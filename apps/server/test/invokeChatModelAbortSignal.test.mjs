import assert from "node:assert/strict";
import test from "node:test";
import { invokeChatModel } from "../dist/infrastructure/llm/invokeChatModel.js";
import { runWithAgentRuntimeIsolationContext } from "../dist/infrastructure/langgraph/AgentRuntimeIsolationContext.js";

test("invokeChatModel passes the active isolated AbortSignal to LangChain invoke", async () => {
  const controller = new AbortController();
  let capturedOptions;
  const model = {
    async invoke(_input, options) {
      capturedOptions = options;
      return { content: "ok" };
    },
  };

  const response = await runWithAgentRuntimeIsolationContext(
    {
      agentProfileId: "front_agent",
      attempt: 1,
      signal: controller.signal,
    },
    () => invokeChatModel(model, "prompt")
  );

  assert.equal(response.content, "ok");
  assert.equal(capturedOptions.signal, controller.signal);
});
