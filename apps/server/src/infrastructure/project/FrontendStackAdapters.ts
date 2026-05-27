export interface FrontendScaffoldFile {
  path: string;
  content: string;
}

export interface FrontendStackAdapter {
  id: string;
  displayName: string;
  aliases: readonly string[];
  status: "supported" | "contract_only";
  languages: readonly string[];
  entrypoints: readonly string[];
  allowedSourceExtensions: readonly string[];
  buildScaffold(input: { projectName: string; packageName: string }): FrontendScaffoldFile[];
}

export class UnsupportedFrontendStackError extends Error {
  constructor(projectStack: string, supportedStacks: readonly string[]) {
    super(
      `Unsupported frontend projectStack "${projectStack}". Fully supported stacks: ${supportedStacks.join(", ")}.`
    );
    this.name = "UnsupportedFrontendStackError";
  }
}

function normalizeStack(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

const reactViteAdapter: FrontendStackAdapter = {
  id: "typescript-react",
  displayName: "React + TypeScript + Vite",
  aliases: ["typescript-react", "react-vite", "react-typescript", "vite-react"],
  status: "supported",
  languages: ["typescript", "tsx", "css", "html"],
  entrypoints: ["index.html", "src/main.tsx", "src/App.tsx"],
  allowedSourceExtensions: [".ts", ".tsx", ".css", ".html", ".json"],
  buildScaffold: ({ projectName, packageName }) => [
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: packageName,
          private: true,
          version: "0.0.0",
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc -b && vite build",
            "type-check": "tsc --noEmit",
            test: "tsc --noEmit",
          },
          dependencies: {
            "@vitejs/plugin-react": "^4.3.4",
            vite: "^6.0.7",
            typescript: "^5.7.3",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
          },
          devDependencies: {
            "@types/react": "^19.0.2",
            "@types/react-dom": "^19.0.2",
          },
        },
        null,
        2
      )}\n`,
    },
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            useDefineForClassFields: true,
            lib: ["DOM", "DOM.Iterable", "ES2020"],
            allowJs: false,
            skipLibCheck: true,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            strict: true,
            forceConsistentCasingInFileNames: true,
            module: "ESNext",
            moduleResolution: "Bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: "react-jsx",
          },
          include: ["src"],
          references: [],
        },
        null,
        2
      )}\n`,
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
    },
    {
      path: "src/main.tsx",
      content: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/app.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`,
    },
    {
      path: "src/App.tsx",
      content: `import { WelcomeScreen } from "./features/welcome/components/WelcomeScreen";

export function App() {
  return <WelcomeScreen />;
}
`,
    },
    {
      path: "src/features/welcome/types.ts",
      content: `export interface WelcomeAction {
  label: string;
  intent: "primary" | "secondary";
}

export interface WelcomeContent {
  projectName: string;
  title: string;
  description: string;
  actions: WelcomeAction[];
}
`,
    },
    {
      path: "src/features/welcome/index.ts",
      content: `export { WelcomeScreen } from "./components/WelcomeScreen";
export type { WelcomeAction, WelcomeContent } from "./types";
`,
    },
    {
      path: "src/features/welcome/data/welcomeContent.ts",
      content: `import type { WelcomeContent } from "../types";

export const welcomeContent: WelcomeContent = {
  projectName: "${projectName}",
  title: "Workspace pronto para construção",
  description:
    "O Horus criou uma aplicação React/TypeScript modular. As próximas alterações dos agentes devem editar componentes, estilos e contratos reais deste projeto.",
  actions: [
    { label: "Ver projeto", intent: "primary" },
    { label: "Abrir arquivos", intent: "secondary" },
  ],
};
`,
    },
    {
      path: "src/features/welcome/components/WelcomeScreen.tsx",
      content: `import { welcomeContent } from "../data/welcomeContent";
import { formatProjectLabel } from "../../../lib/formatting";

export function WelcomeScreen() {
  return (
    <main className="app-shell">
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <p className="eyebrow">{formatProjectLabel(welcomeContent.projectName)}</p>
        <h1 id="welcome-title">{welcomeContent.title}</h1>
        <p className="lede">{welcomeContent.description}</p>
        <div className="action-row" aria-label="Ações do projeto">
          {welcomeContent.actions.map((action) => (
            <button className={\`button button--\${action.intent}\`} key={action.label} type="button">
              <span aria-hidden="true">▣</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
`,
    },
    {
      path: "src/lib/formatting.ts",
      content: `export function formatProjectLabel(value: string): string {
  return value.trim().replace(/\\s+/gu, " ");
}
`,
    },
    {
      path: "src/styles/tokens.css",
      content: `:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #060908;
  color: #effaf5;
  --color-bg: #060908;
  --color-panel: rgba(15, 23, 20, 0.86);
  --color-border: rgba(148, 163, 184, 0.2);
  --color-muted: #9fb2aa;
  --color-accent: #46d9b0;
  --color-accent-strong: #7fffd4;
  --radius-panel: 18px;
  --radius-control: 999px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background:
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    var(--color-bg);
  background-size: 32px 32px;
}

button,
input,
textarea,
select {
  font: inherit;
}
`,
    },
    {
      path: "src/styles/app.css",
      content: `.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: clamp(24px, 5vw, 72px);
}

.welcome-panel {
  width: min(100%, 860px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  padding: clamp(28px, 5vw, 48px);
  background: var(--color-panel);
  box-shadow: 0 24px 90px rgba(0, 0, 0, 0.34);
}

.eyebrow {
  margin: 0 0 16px;
  color: var(--color-accent);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  max-width: 720px;
  font-size: clamp(2rem, 5vw, 4.5rem);
  line-height: 0.95;
  letter-spacing: 0;
}

.lede {
  margin: 20px 0 0;
  max-width: 680px;
  color: var(--color-muted);
  font-size: clamp(1rem, 2vw, 1.2rem);
  line-height: 1.65;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}

.button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 0 18px;
  color: #eef7f2;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease;
}

.button:hover {
  border-color: rgba(70, 217, 176, 0.56);
  background: rgba(70, 217, 176, 0.1);
}

.button--primary {
  color: #06110e;
  border-color: rgba(127, 255, 212, 0.62);
  background: var(--color-accent-strong);
}

@media (max-width: 640px) {
  .action-row {
    flex-direction: column;
  }

  .button {
    width: 100%;
  }
}
`,
    },
  ],
};

const htmlCssJsAdapter: FrontendStackAdapter = {
  id: "html-css-js",
  displayName: "HTML + CSS + JavaScript",
  aliases: ["html-css-js", "vanilla", "vanilla-vite", "html", "javascript"],
  status: "supported",
  languages: ["html", "css", "javascript"],
  entrypoints: ["src/index.html"],
  allowedSourceExtensions: [".html", ".css", ".js", ".json"],
  buildScaffold: ({ projectName, packageName }) => [
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: packageName,
          private: true,
          type: "module",
          scripts: {
            dev: "node ./scripts/dev-server.mjs",
            test: "node --check ./scripts/dev-server.mjs",
            build: "node --check ./scripts/dev-server.mjs",
          },
        },
        null,
        2
      )}\n`,
    },
    {
      path: "src/index.html",
      content: `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #070b0a; color: #eef7f2; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 48px; }
      section { max-width: 860px; border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 18px; padding: 32px; background: rgba(15, 23, 20, 0.74); }
      h1 { margin: 0 0 12px; font-size: 32px; letter-spacing: 0; }
      p { margin: 0; color: #9fb2aa; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${projectName}</h1>
        <p>Projeto HTML inicial criado pelo Horus. Use esta stack apenas quando HTML/CSS/JS standalone for o alvo explícito.</p>
      </section>
    </main>
  </body>
</html>
`,
    },
    {
      path: "scripts/dev-server.mjs",
      content: buildStaticDevServer(),
    },
  ],
};

const contractOnlyAdapters: FrontendStackAdapter[] = [
  "vue-vite",
  "svelte",
  "sveltekit",
  "angular",
  "next",
  "nuxt",
  "astro",
  "remix",
].map((id) => ({
  id,
  displayName: id,
  aliases: [id],
  status: "contract_only" as const,
  languages: ["typescript", "javascript", "css", "html"],
  entrypoints: [],
  allowedSourceExtensions: [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".css", ".html"],
  buildScaffold: () => [],
}));

export const FRONTEND_STACK_ADAPTERS: readonly FrontendStackAdapter[] = [
  reactViteAdapter,
  htmlCssJsAdapter,
  ...contractOnlyAdapters,
];

export function getSupportedFrontendStackAdapters(): FrontendStackAdapter[] {
  return FRONTEND_STACK_ADAPTERS.filter((adapter) => adapter.status === "supported");
}

export function resolveFrontendStackAdapter(projectStack: string): FrontendStackAdapter {
  const normalized = normalizeStack(projectStack);
  const adapter = FRONTEND_STACK_ADAPTERS.find(
    (candidate) =>
      normalizeStack(candidate.id) === normalized ||
      candidate.aliases.some((alias) => normalizeStack(alias) === normalized)
  );
  if (!adapter || adapter.status !== "supported") {
    throw new UnsupportedFrontendStackError(
      projectStack,
      getSupportedFrontendStackAdapters().map((item) => item.id)
    );
  }
  return adapter;
}

function buildStaticDevServer(): string {
  return `import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const args = process.argv.slice(2);
const hostIndex = args.indexOf("--host");
const portIndex = args.indexOf("--port");
const host = hostIndex >= 0 ? args[hostIndex + 1] || "127.0.0.1" : "127.0.0.1";
const port = Number(portIndex >= 0 ? args[portIndex + 1] || "5174" : process.env.PORT || "5174");
const root = join(process.cwd(), "src");
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

createServer(async (req, res) => {
  const requested = normalize(decodeURIComponent((req.url || "/").split("?")[0] || "/"));
  const path = requested === "/" ? "index.html" : requested.replace(/^\\\\/+/, "");
  if (path.includes("..")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const file = join(root, path);
    const body = await readFile(file);
    res.writeHead(200, { "content-type": contentTypes.get(extname(file)) || "application/octet-stream" });
    res.end(body);
  } catch {
    const fallback = await readFile(join(root, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fallback);
  }
}).listen(port, host, () => {
  console.log(\`Horus generated project listening on http://\${host}:\${port}\`);
});
`;
}
