import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  HorusOdinIntentRouter,
  LlmHorusIntentClassifier,
} from "../dist/application/services/HorusOdinIntentRouter.js";

const context = {
  session: {
    id: "11111111-1111-4111-8111-111111111111",
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
    userStoryId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-05-26T10:00:00.000Z",
    updatedAt: "2026-05-26T10:00:00.000Z",
  },
  messages: [{ role: "user", body: "Oi" }],
  activeUserStory: {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Story",
    description: "Description",
    acceptanceCriteria: ["Criterion"],
    priority: "medium",
    labels: [],
    createdAt: "2026-05-26T10:00:00.000Z",
  },
  artifactContext: {
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
  },
  previousAgentResults: [],
};

test("LlmHorusIntentClassifier depends on an injected model provider", async () => {
  const calls = [];
  const provider = {
    createStructuredModel(input) {
      calls.push(input);
      return {
        async invoke(prompt) {
          assert.match(prompt, /Mensagem atual/);
          return {
            kind: "answer_question",
            mode: "chat",
            confidence: 0.99,
            rationale: "Injected provider classified the turn.",
            previewAction: null,
          };
        },
      };
    },
    createChat() {
      throw new Error("not used");
    },
  };

  const router = new HorusOdinIntentRouter(new LlmHorusIntentClassifier(provider));
  const result = await router.classify({
    message: "Explique o projeto.",
    context,
  });

  assert.equal(result.kind, "answer_question");
  assert.equal(result.mode, "chat");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].role, "horus");
  assert.equal(calls[0].defaults.temperature, 0);
});

test("application intent router has no direct infrastructure LLM import", async () => {
  const source = await readFile(
    new URL("../src/application/services/HorusOdinIntentRouter.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /infrastructure\/llm/);
  assert.doesNotMatch(source, /createChatModel/);
  assert.doesNotMatch(source, /invokeChatModel/);
});

test("application and domain layers do not import infrastructure LLM modules", async () => {
  const roots = [
    new URL("../src/application/", import.meta.url),
    new URL("../src/domain/", import.meta.url),
  ];

  for (const fileUrl of await listTypeScriptFiles(roots)) {
    const source = await readFile(fileUrl, "utf8");
    assert.doesNotMatch(
      source,
      /from\s+["'][^"']*infrastructure\/llm[^"']*["']/,
      fileUrl.pathname
    );
  }
});

test("application and domain layers do not import infrastructure modules directly", async () => {
  const roots = [
    new URL("../src/application/", import.meta.url),
    new URL("../src/domain/", import.meta.url),
  ];

  for (const fileUrl of await listTypeScriptFiles(roots)) {
    const source = await readFile(fileUrl, "utf8");
    assert.doesNotMatch(
      source,
      /from\s+["'][^"']*(?:\.\.\/)+infrastructure\/[^"']*["']/,
      fileUrl.pathname
    );
  }
});

async function listTypeScriptFiles(roots) {
  const files = [];
  for (const root of roots) {
    await collect(root, files);
  }
  return files;
}

async function collect(directoryUrl, files) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  for (const entry of entries) {
    const child = new URL(
      entry.isDirectory() ? `${entry.name}/` : entry.name,
      directoryUrl
    );
    if (entry.isDirectory()) {
      await collect(child, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(child);
    }
  }
}
