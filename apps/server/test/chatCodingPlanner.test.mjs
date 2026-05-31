import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ChatCodingPlanner } from "../dist/application/coding/ChatCodingPlanner.js";
import { ContextBudgeter } from "../dist/application/coding/ContextBudgeter.js";
import { GraphAwareRetrievalService } from "../dist/application/coding/GraphAwareRetrievalService.js";
import { HybridRetrievalRanker } from "../dist/application/coding/HybridRetrievalRanker.js";
import { RepositoryChunker } from "../dist/application/coding/RepositoryChunker.js";
import { RepositoryGraphBuilder } from "../dist/application/coding/RepositoryGraphBuilder.js";
import { RepositoryScanner } from "../dist/application/coding/RepositoryScanner.js";
import { SemanticRepositoryIndexer } from "../dist/application/coding/SemanticRepositoryIndexer.js";
import { TextRepositoryRetriever } from "../dist/application/coding/TextRepositoryRetriever.js";
import { LocalHashEmbeddingProvider } from "../dist/infrastructure/embeddings/LocalHashEmbeddingProvider.js";
import { TreeSitterAstAnalyzer } from "../dist/infrastructure/ast/TreeSitterAstAnalyzer.js";
import { InMemoryVectorStore } from "../dist/infrastructure/vector/InMemoryVectorStore.js";

async function createProject() {
  const rootPath = await mkdtemp(join(tmpdir(), "horus-chat-planner-"));
  await mkdir(join(rootPath, "src"), { recursive: true });
  await writeFile(
    join(rootPath, "src", "App.tsx"),
    [
      "export function App() {",
      "  return <main>User stories</main>;",
      "}",
      "",
    ].join("\n"),
    "utf-8"
  );
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Planner Test Project",
    slug: "planner-test-project",
    rootPath,
    defaultRoute: "/",
    devCommand: null,
    previewCommandId: null,
    commandCatalog: [],
    previewUrl: null,
    createdAt: "2026-05-28T10:00:00.000Z",
    projectKind: "generated",
    lifecycleStatus: "published",
    visibility: "visible",
    healthStatus: "healthy",
    healthReasons: [],
    canonicalProjectId: null,
    projectWorkspaceId: null,
    appFingerprint: null,
    lastHealthCheckedAt: null,
    archivedAt: null,
    archivedReason: null,
  };
}

async function createGraphProject() {
  const project = await createProject();
  await writeFile(
    join(project.rootPath, "src", "helpers.ts"),
    "export function formatTitle(value: string) { return value.toUpperCase(); }\n",
    "utf-8"
  );
  await writeFile(
    join(project.rootPath, "src", "App.tsx"),
    [
      'import { formatTitle } from "./helpers";',
      "export function App() {",
      '  return <main>{formatTitle("home")}</main>;',
      "}",
      "",
    ].join("\n"),
    "utf-8"
  );
  await writeFile(
    join(project.rootPath, "src", "App.test.tsx"),
    'import { App } from "./App";\ntest("App", () => App());\n',
    "utf-8"
  );
  return project;
}

function createPlanner() {
  return createPlannerWith();
}

function createPlannerWith(symbolIndex) {
  return new ChatCodingPlanner(
    new RepositoryScanner(),
    new TextRepositoryRetriever(),
    new TreeSitterAstAnalyzer(),
    (() => {
      let index = 0;
      return () => `intent-${++index}`;
    })(),
    symbolIndex
  );
}

function createGraphPlanner() {
  return new ChatCodingPlanner(
    new RepositoryScanner(),
    new TextRepositoryRetriever(),
    new TreeSitterAstAnalyzer(),
    (() => {
      let index = 0;
      return () => `intent-${++index}`;
    })(),
    undefined,
    new RepositoryGraphBuilder(() => new Date("2026-05-28T23:45:00.000Z")),
    new GraphAwareRetrievalService()
  );
}

function createSemanticPlanner() {
  return new ChatCodingPlanner(
    new RepositoryScanner(),
    new TextRepositoryRetriever(),
    new TreeSitterAstAnalyzer(),
    (() => {
      let index = 0;
      return () => `intent-${++index}`;
    })(),
    undefined,
    new RepositoryGraphBuilder(() => new Date("2026-05-28T23:59:00.000Z")),
    new GraphAwareRetrievalService(),
    new SemanticRepositoryIndexer(
      new LocalHashEmbeddingProvider({
        dimensions: 64,
        tokenAliases: new Map([
          ["conversation", ["chat"]],
          ["reply", ["message"]],
        ]),
      }),
      new InMemoryVectorStore(),
      new RepositoryChunker(),
      new HybridRetrievalRanker(),
      () => new Date("2026-05-28T23:59:00.000Z")
    )
  );
}

function createBudgetedPlanner() {
  return new ChatCodingPlanner(
    new RepositoryScanner(),
    new TextRepositoryRetriever(),
    new TreeSitterAstAnalyzer(),
    (() => {
      let index = 0;
      return () => `intent-${++index}`;
    })(),
    undefined,
    new RepositoryGraphBuilder(() => new Date("2026-05-28T23:59:00.000Z")),
    new GraphAwareRetrievalService(),
    undefined,
    new ContextBudgeter(() => new Date("2026-05-28T23:59:00.000Z")),
    {
      maxTokens: 96,
      reserveTokens: 8,
      maxItemTokens: 48,
    }
  );
}

test("ChatCodingPlanner converts explicit file, symbol and code into structural patch intent", async () => {
  const project = await createProject();
  const planner = createPlanner();

  const result = await planner.plan({
    project,
    chatSessionId: "22222222-2222-4222-8222-222222222222",
    sourceMessageId: "33333333-3333-4333-8333-333333333333",
    message: [
      "Substitua o componente App em src/App.tsx por:",
      "```tsx",
      "export function App() {",
      "  return <main>Dashboard real</main>;",
      "}",
      "```",
    ].join("\n"),
  });

  assert.equal(result.intents.length, 1);
  assert.equal(result.intents[0].kind, "replace");
  assert.equal(result.intents[0].targetPath, "src/App.tsx");
  assert.equal(result.intents[0].targetSymbolName, "App");
  assert.match(result.intents[0].content ?? "", /Dashboard real/);
  assert.deepEqual(result.selectedPaths, ["src/App.tsx"]);
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    false
  );
});

test("ChatCodingPlanner blocks ambiguous chat edits instead of inventing file changes", async () => {
  const project = await createProject();
  const planner = createPlanner();

  const result = await planner.plan({
    project,
    chatSessionId: "22222222-2222-4222-8222-222222222222",
    sourceMessageId: "33333333-3333-4333-8333-333333333333",
    message: "Deixe a interface mais bonita.",
  });

  assert.equal(result.intents.length, 0);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.severity === "error"));
  assert.ok(
    result.diagnostics.some((diagnostic) => diagnostic.code === "missing_code_block")
  );
});

test("ChatCodingPlanner exposes symbol index evidence and blocks implicit global rename", async () => {
  const project = await createProject();
  const planner = createPlannerWith({
    buildIndex: async ({ projectRootPath, ast }) => ({
      projectRootPath,
      status: "complete",
      entries: ast.documents.flatMap((document) =>
        document.symbols
          .filter((symbol) => symbol.name === "App")
          .map((symbol) => ({
            symbol,
            location: {
              path: symbol.path,
              range: symbol.nameRange ?? symbol.range,
            },
            definitionLocations: [
              {
                path: symbol.path,
                range: symbol.nameRange ?? symbol.range,
              },
            ],
            referenceCount: 2,
            referenceLocations: [
              {
                path: symbol.path,
                range: symbol.nameRange ?? symbol.range,
              },
            ],
            referenceResolution: "complete",
          }))
      ),
      diagnostics: [],
      summary: {
        documentCount: ast.documents.length,
        indexedSymbolCount: 1,
        diagnosticCount: 0,
        unresolvedSymbolCount: 0,
      },
      notes: [],
      generatedAt: "2026-05-28T23:00:00.000Z",
    }),
  });

  const result = await planner.plan({
    project,
    chatSessionId: "22222222-2222-4222-8222-222222222222",
    sourceMessageId: "33333333-3333-4333-8333-333333333333",
    message: "Renomeie o componente App para RootApp em src/App.tsx.",
  });

  assert.equal(result.intents.length, 0);
  assert.equal(result.symbolIndex?.status, "complete");
  assert.ok(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "global_rename_requires_explicit_review"
    )
  );
});

test("ChatCodingPlanner expands selected paths with graph-aware related files", async () => {
  const project = await createGraphProject();
  const planner = createGraphPlanner();

  const result = await planner.plan({
    project,
    chatSessionId: "22222222-2222-4222-8222-222222222222",
    sourceMessageId: "33333333-3333-4333-8333-333333333333",
    message: [
      "Substitua o componente App em src/App.tsx por:",
      "```tsx",
      "export function App() {",
      "  return <main>Dashboard real</main>;",
      "}",
      "```",
    ].join("\n"),
  });

  assert.equal(result.intents.length, 1);
  assert.ok(result.repositoryGraph);
  assert.ok(result.graphContext);
  assert.ok(result.selectedPaths.includes("src/App.tsx"));
  assert.ok(result.selectedPaths.includes("src/App.test.tsx"));
  assert.ok(result.selectedPaths.includes("src/helpers.ts"));
});

test("ChatCodingPlanner reports disconnected new-file intents with graph evidence", async () => {
  const project = await createGraphProject();
  const planner = createGraphPlanner();

  const result = await planner.plan({
    project,
    chatSessionId: "22222222-2222-4222-8222-222222222222",
    sourceMessageId: "33333333-3333-4333-8333-333333333333",
    message: [
      "Aplique este intent:",
      "```json",
      JSON.stringify({
        structuralPatchIntents: [
          {
            id: "intent-new-file",
            kind: "insert",
            targetPath: "src/UnlinkedWidget.tsx",
            position: "file_end",
            content: "export const UnlinkedWidget = null;\\n",
          },
        ],
      }),
      "```",
    ].join("\n"),
  });

  assert.equal(result.intents.length, 0);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "disconnected_new_file_edit"
    )
  );
});

test("ChatCodingPlanner exposes semantic retrieval evidence without requiring a hardcoded model", async () => {
  const project = await createProject();
  await writeFile(
    join(project.rootPath, "src", "ChatPane.tsx"),
    [
      "export function ChatPane() {",
      "  return <section>message stream</section>;",
      "}",
      "",
    ].join("\n"),
    "utf-8"
  );
  const planner = createSemanticPlanner();

  const result = await planner.plan({
    project,
    chatSessionId: "22222222-2222-4222-8222-222222222222",
    sourceMessageId: "33333333-3333-4333-8333-333333333333",
    message: [
      "Substitua o componente ChatPane para conversa/resposta por:",
      "```tsx",
      "export function ChatPane() {",
      "  return <section>Conversation ready</section>;",
      "}",
      "```",
    ].join("\n"),
  });

  assert.equal(result.intents.length, 1);
  assert.equal(result.intents[0].targetPath, "src/ChatPane.tsx");
  assert.equal(result.semanticRetrieval?.summary.dimensions, 64);
  assert.equal(result.semanticRetrieval?.summary.embeddingModel, undefined);
  assert.ok(
    result.semanticRetrieval?.matches.some(
      (match) => match.chunk.path === "src/ChatPane.tsx"
    )
  );
});

test("ChatCodingPlanner returns packed context when a context budgeter is injected", async () => {
  const project = await createGraphProject();
  const planner = createBudgetedPlanner();

  const result = await planner.plan({
    project,
    chatSessionId: "22222222-2222-4222-8222-222222222222",
    sourceMessageId: "33333333-3333-4333-8333-333333333333",
    message: [
      "Substitua o componente App em src/App.tsx por:",
      "```tsx",
      "export function App() {",
      "  return <main>Budgeted context</main>;",
      "}",
      "```",
    ].join("\n"),
  });

  assert.equal(result.intents.length, 1);
  assert.ok(result.packedContext);
  assert.ok(result.packedContext.usedTokens <= result.packedContext.budget.maxTokens);
  assert.ok(
    result.diagnostics.some((diagnostic) => diagnostic.code === "context_budget")
  );
});
