import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepositoryScanner } from "../apps/server/dist/application/coding/RepositoryScanner.js";
import { TextRepositoryRetriever } from "../apps/server/dist/application/coding/TextRepositoryRetriever.js";
import {
  ContextRetrievalEvaluationService,
  contextRetrievalCandidateFromSnapshot,
} from "../apps/server/dist/application/services/ContextRetrievalEvaluationService.js";
import { ProjectContextEngine } from "../apps/server/dist/application/services/ProjectContextEngine.js";
import { ProjectIndexManifestStore } from "../apps/server/dist/application/services/ProjectIndexManifestStore.js";
import { ProjectInspectionService } from "../apps/server/dist/application/services/ProjectInspectionService.js";
import { ReadOnlyCodeContextService } from "../apps/server/dist/application/services/ReadOnlyCodeContextService.js";
import { ValidationStrategyRegistry } from "../apps/server/dist/application/services/ValidationStrategyRegistry.js";
import { TreeSitterAstAnalyzer } from "../apps/server/dist/infrastructure/ast/TreeSitterAstAnalyzer.js";

const fixtures = [
  {
    id: "settings-react",
    create: createSettingsFixture,
    cases: [
      {
        id: "settings-react/edit-settings-panel",
        query:
          "qual arquivo editar para mudar o componente SettingsPanel e o label de salvar preferencias",
        expectedFiles: ["src/components/SettingsPanel.tsx"],
        expectedEditFiles: ["src/components/SettingsPanel.tsx"],
        expectedTestFiles: ["src/settings/saveSettings.test.ts"],
        expectedSymbols: ["SettingsPanel"],
        tags: ["edit", "component"],
      },
      {
        id: "settings-react/test-save-settings",
        query: "qual teste cobre saveSettings quando salva preferencias",
        expectedFiles: ["src/settings/saveSettings.ts"],
        expectedEditFiles: ["src/settings/saveSettings.ts"],
        expectedTestFiles: ["src/settings/saveSettings.test.ts"],
        expectedSymbols: ["saveSettings"],
        tags: ["qa", "test"],
      },
      {
        id: "settings-react/runtime-settings-panel",
        query:
          "erro terminal SettingsPanel import quebrado em src/components/SettingsPanel.tsx",
        expectedFiles: ["src/components/SettingsPanel.tsx"],
        expectedEditFiles: ["src/components/SettingsPanel.tsx"],
        expectedTestFiles: [],
        expectedSymbols: ["SettingsPanel"],
        terminalErrorPath: "src/components/SettingsPanel.tsx",
        tags: ["runtime"],
      },
    ],
  },
  {
    id: "metrics-dashboard",
    create: createDashboardFixture,
    cases: [
      {
        id: "metrics-dashboard/edit-dashboard-page",
        query: "qual componente renderiza o painel de metricas e lista ciclos ativos",
        expectedFiles: ["src/pages/DashboardPage.tsx"],
        expectedEditFiles: ["src/pages/DashboardPage.tsx"],
        expectedTestFiles: ["src/data/loadMetrics.test.ts"],
        expectedSymbols: ["DashboardPage"],
        tags: ["edit", "component"],
      },
      {
        id: "metrics-dashboard/test-load-metrics",
        query: "qual teste cobre loadMetrics e a ordenacao de ciclos ativos",
        expectedFiles: ["src/data/loadMetrics.ts"],
        expectedEditFiles: ["src/data/loadMetrics.ts"],
        expectedTestFiles: ["src/data/loadMetrics.test.ts"],
        expectedSymbols: ["loadMetrics"],
        tags: ["qa", "test"],
      },
      {
        id: "metrics-dashboard/runtime-dashboard-page",
        query: "erro terminal DashboardPage falhou em src/pages/DashboardPage.tsx",
        expectedFiles: ["src/pages/DashboardPage.tsx"],
        expectedEditFiles: ["src/pages/DashboardPage.tsx"],
        expectedTestFiles: [],
        expectedSymbols: ["DashboardPage"],
        terminalErrorPath: "src/pages/DashboardPage.tsx",
        tags: ["runtime"],
      },
    ],
  },
];

const allCases = [];
const candidates = [];
const manifests = [];

for (const fixture of fixtures) {
  const root = await mkdtemp(join(tmpdir(), `horus-context-${fixture.id}-`));
  try {
    await fixture.create(root);
    const scanner = new RepositoryScanner();
    const engine = new ProjectContextEngine({
      inspector: new ProjectInspectionService(scanner),
      codeContext: new ReadOnlyCodeContextService(
        undefined,
        undefined,
        undefined,
        scanner,
        new TextRepositoryRetriever(),
        new TreeSitterAstAnalyzer()
      ),
      validationStrategy: new ValidationStrategyRegistry(),
      manifestStore: new ProjectIndexManifestStore(),
      now: () => new Date("2026-06-09T12:00:00.000Z"),
    });
    const projectId = randomUUID();
    for (const item of fixture.cases) {
      const snapshot = await engine.buildSnapshot({
        projectId,
        projectRootPath: root,
        query: item.query,
        agentProfileId: item.tags.includes("qa") ? "qa_agent" : "front_agent",
        ...(item.terminalErrorPath
          ? {
              runtimeHints: [
                {
                  kind: "build_error",
                  source: "terminal",
                  message: `Cannot resolve symbol at ${item.terminalErrorPath}`,
                  path: item.terminalErrorPath,
                  line: 3,
                },
              ],
            }
          : {}),
      });
      allCases.push(item);
      candidates.push(contextRetrievalCandidateFromSnapshot(item.id, snapshot));
    }
    const manifest = JSON.parse(
      await readFile(join(root, ".horus", "index-manifest.json"), "utf8")
    );
    manifests.push({
      id: fixture.id,
      fileCount: manifest.fileCount,
      chunkCount: manifest.repositoryIndex?.chunks?.length ?? 0,
      merkleRoot: manifest.repositoryIndex?.freshness?.merkleRoot ?? null,
      freshness: manifest.repositoryIndex?.freshness?.status ?? null,
      retrievalFusion: manifest.repositoryIndex?.retrievalFusion ?? [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const report = new ContextRetrievalEvaluationService().evaluate({
  cases: allCases,
  candidates,
  k: 5,
  now: new Date("2026-06-09T12:00:00.000Z"),
});
const payload = {
  fixtureCount: fixtures.length,
  manifests,
  report,
};

console.log(JSON.stringify(payload, null, 2));

if (
  report.caseCount < 6 ||
  report.averageRecallAtK < 0.5 ||
  report.editFileHitRate < 0.67 ||
  manifests.some((manifest) => manifest.chunkCount < 3 || !manifest.merkleRoot)
) {
  process.exitCode = 1;
}

async function createSettingsFixture(projectRoot) {
  await mkdir(join(projectRoot, "src", "components"), { recursive: true });
  await mkdir(join(projectRoot, "src", "settings"), { recursive: true });
  await writePackage(projectRoot);
  await writeFile(join(projectRoot, ".gitignore"), "node_modules\ndist\n");
  await writeFile(join(projectRoot, ".horusignore"), "secrets.json\n");
  await writeFile(
    join(projectRoot, "src", "App.tsx"),
    [
      "import { SettingsPanel } from './components/SettingsPanel';",
      "export function App() {",
      "  return <SettingsPanel userId=\"demo-user\" />;",
      "}",
      "",
    ].join("\n")
  );
  await writeFile(
    join(projectRoot, "src", "components", "SettingsPanel.tsx"),
    [
      "import { saveSettings } from '../settings/saveSettings';",
      "export function SettingsPanel({ userId }: { userId: string }) {",
      "  return <button onClick={() => saveSettings(userId)}>Salvar preferencias</button>;",
      "}",
      "",
    ].join("\n")
  );
  await writeFile(
    join(projectRoot, "src", "settings", "saveSettings.ts"),
    [
      "export function saveSettings(userId: string): string {",
      "  return `settings saved for ${userId}`;",
      "}",
      "",
    ].join("\n")
  );
  await writeFile(
    join(projectRoot, "src", "settings", "saveSettings.test.ts"),
    [
      "import { describe, expect, it } from 'vitest';",
      "import { saveSettings } from './saveSettings';",
      "describe('saveSettings', () => {",
      "  it('returns a persisted settings message', () => {",
      "    expect(saveSettings('demo-user')).toContain('demo-user');",
      "  });",
      "});",
      "",
    ].join("\n")
  );
}

async function createDashboardFixture(projectRoot) {
  await mkdir(join(projectRoot, "src", "pages"), { recursive: true });
  await mkdir(join(projectRoot, "src", "data"), { recursive: true });
  await writePackage(projectRoot);
  await writeFile(join(projectRoot, ".gitignore"), "node_modules\ndist\n");
  await writeFile(join(projectRoot, ".horusignore"), "secrets.json\n");
  await writeFile(
    join(projectRoot, "src", "App.tsx"),
    [
      "import { DashboardPage } from './pages/DashboardPage';",
      "export function App() {",
      "  return <DashboardPage />;",
      "}",
      "",
    ].join("\n")
  );
  await writeFile(
    join(projectRoot, "src", "pages", "DashboardPage.tsx"),
    [
      "import { loadMetrics } from '../data/loadMetrics';",
      "export function DashboardPage() {",
      "  const metrics = loadMetrics();",
      "  return <section>{metrics.activeCycles.map((cycle) => <strong key={cycle}>{cycle}</strong>)}</section>;",
      "}",
      "",
    ].join("\n")
  );
  await writeFile(
    join(projectRoot, "src", "data", "loadMetrics.ts"),
    [
      "export function loadMetrics(): { activeCycles: string[] } {",
      "  return { activeCycles: ['cycle-a', 'cycle-b'].sort() };",
      "}",
      "",
    ].join("\n")
  );
  await writeFile(
    join(projectRoot, "src", "data", "loadMetrics.test.ts"),
    [
      "import { describe, expect, it } from 'vitest';",
      "import { loadMetrics } from './loadMetrics';",
      "describe('loadMetrics', () => {",
      "  it('returns sorted active cycles', () => {",
      "    expect(loadMetrics().activeCycles).toEqual(['cycle-a', 'cycle-b']);",
      "  });",
      "});",
      "",
    ].join("\n")
  );
}

async function writePackage(projectRoot) {
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({
      scripts: {
        build: "vite build",
        test: "vitest run",
      },
      dependencies: {
        "@vitejs/plugin-react": "latest",
        react: "latest",
        "react-dom": "latest",
      },
      devDependencies: {
        typescript: "latest",
        vite: "latest",
        vitest: "latest",
      },
    })
  );
}
