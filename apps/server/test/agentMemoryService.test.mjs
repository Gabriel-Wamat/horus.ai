import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentMemoryService } from "../dist/application/services/AgentMemoryService.js";
import { FileAgentMemoryRepository } from "../dist/infrastructure/repositories/FileAgentMemoryRepository.js";

test("AgentMemoryService stores scoped memories and excludes stale entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-agent-memory-"));
  const service = new AgentMemoryService(new FileAgentMemoryRepository(root));
  const scope = {
    workspaceFolderId: "11111111-1111-4111-8111-111111111111",
    userStoryId: "22222222-2222-4222-8222-222222222222",
    projectId: null,
    chatSessionId: null,
    workflowThreadId: "33333333-3333-4333-8333-333333333333",
    agentProfileId: "front_agent",
  };

  await service.recordMemory({
    kind: "preference",
    scope,
    content: "Use subtle gray surfaces.",
    sourceRefs: [{ type: "manual", id: "note-1" }],
  });
  await service.recordMemory({
    kind: "preference",
    scope,
    content: "Stale preference.",
    staleAt: new Date(Date.now() - 1000).toISOString(),
    sourceRefs: [{ type: "manual", id: "note-2" }],
  });

  const result = await service.retrieveForPrompt({
    scope,
    agentProfileId: "front_agent",
  });

  assert.equal(result.memories.length, 1);
  assert.equal(result.memories[0].content, "Use subtle gray surfaces.");
});

test("AgentMemoryService isolates ephemeral memories by coding task id", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-agent-memory-task-"));
  const service = new AgentMemoryService(new FileAgentMemoryRepository(root));
  const scope = {
    workspaceFolderId: "11111111-1111-4111-8111-111111111111",
    userStoryId: null,
    projectId: null,
    chatSessionId: null,
    workflowThreadId: null,
    agentProfileId: "coding_runtime",
  };

  await service.recordEphemeralTaskMemory({
    codingTaskId: "22222222-2222-4222-8222-222222222222",
    scope,
    content: "First task patch touched src/App.tsx.",
    sourceRefs: [{ type: "manual", id: "task-note-1" }],
    ttlMs: 60_000,
  });
  await service.recordEphemeralTaskMemory({
    codingTaskId: "33333333-3333-4333-8333-333333333333",
    scope,
    content: "Second task patch touched src/Other.tsx.",
    sourceRefs: [{ type: "manual", id: "task-note-2" }],
    ttlMs: 60_000,
  });

  const result = await service.retrieveEphemeralTaskMemory({
    codingTaskId: "22222222-2222-4222-8222-222222222222",
    scope: { workspaceFolderId: scope.workspaceFolderId },
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].scope.codingTaskId, "22222222-2222-4222-8222-222222222222");
  assert.equal(result[0].content, "First task patch touched src/App.tsx.");
});
