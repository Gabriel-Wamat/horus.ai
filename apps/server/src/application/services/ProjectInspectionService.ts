import { promises as fs } from "node:fs";
import { join } from "node:path";
import type {
  ProjectEntrypoint,
  ProjectFramework,
  ProjectInspectionProfile,
  ProjectPackageManager,
  ProjectRoute,
  ProjectScript,
  ProjectScriptCategory,
  RepositoryFileEntry,
  RepositoryScanSnapshot,
} from "@u-build/shared";
import { ProjectInspectionProfileSchema } from "@u-build/shared";
import type { RepositoryScannerPort } from "../ports/RepositoryRetrievalPort.js";

export interface ProjectInspectionInput {
  projectId?: string | undefined;
  projectRootPath: string;
  maxEditableFiles?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface ProjectInspectorPort {
  inspect(input: ProjectInspectionInput): Promise<ProjectInspectionProfile>;
}

interface PackageJsonFile {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

const DEFAULT_MAX_EDITABLE_FILES = 80;

const PACKAGE_MANAGER_LOCKFILES: Array<{
  name: Exclude<ProjectPackageManager, "unknown">;
  path: string;
}> = [
  { name: "pnpm", path: "pnpm-lock.yaml" },
  { name: "yarn", path: "yarn.lock" },
  { name: "npm", path: "package-lock.json" },
  { name: "bun", path: "bun.lockb" },
  { name: "bun", path: "bun.lock" },
];

const EDITABLE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".css",
  ".scss",
  ".html",
  ".json",
  ".md",
]);

export class ProjectInspectionService implements ProjectInspectorPort {
  constructor(private readonly scanner: RepositoryScannerPort) {}

  async inspect(input: ProjectInspectionInput): Promise<ProjectInspectionProfile> {
    const scan = await this.scanner.scan({
      projectRootPath: input.projectRootPath,
      budget: {
        maxFiles: 2_000,
        maxDepth: 20,
        maxBytesPerFile: 256_000,
      },
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const packageJson = await readPackageJson(scan.projectRootPath);
    const readableFiles = scan.files.filter((file) => file.safety === "readable");
    const warnings = [...scan.notes];
    if (!packageJson) warnings.push("package.json was not found or could not be parsed.");

    const packageManager = detectPackageManager(scan.files, warnings);
    const framework = detectFramework(scan.files, packageJson);
    const scripts = detectScripts(packageJson);
    const roots = detectRoots(readableFiles);
    const entrypoints = detectEntrypoints(scan.files);
    const routes = detectRoutes(scan.files, framework.name);
    if (routes.length === 0) {
      warnings.push("No route evidence detected from known React/Vite/Next patterns.");
    }

    return ProjectInspectionProfileSchema.parse({
      ...(input.projectId ? { projectId: input.projectId } : {}),
      projectRootPath: scan.projectRootPath,
      packageManager,
      framework,
      scripts,
      roots,
      entrypoints,
      routes,
      editableFiles: detectEditableFiles(
        readableFiles,
        input.maxEditableFiles ?? DEFAULT_MAX_EDITABLE_FILES
      ),
      protectedPaths: await detectProtectedPaths(scan.files, scan.projectRootPath),
      unsafePaths: scan.files.filter((file) => file.safety !== "readable"),
      warnings: uniqueSorted(warnings),
      stats: scan.stats,
      generatedAt: scan.generatedAt,
    });
  }
}

async function readPackageJson(projectRootPath: string): Promise<PackageJsonFile | null> {
  try {
    const raw = await fs.readFile(join(projectRootPath, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      scripts: stringRecord(parsed["scripts"]),
      dependencies: stringRecord(parsed["dependencies"]),
      devDependencies: stringRecord(parsed["devDependencies"]),
    };
  } catch {
    return null;
  }
}

function detectPackageManager(
  files: readonly RepositoryFileEntry[],
  warnings: string[]
): ProjectInspectionProfile["packageManager"] {
  const paths = new Set(files.map((file) => file.path));
  const matches = PACKAGE_MANAGER_LOCKFILES.filter((lockfile) =>
    paths.has(lockfile.path)
  );
  const uniqueNames = [...new Set(matches.map((match) => match.name))];
  if (matches.length === 0) {
    return { name: "unknown", status: "unknown", evidence: [] };
  }
  if (uniqueNames.length > 1) {
    warnings.push(
      `Multiple package manager lockfiles detected: ${matches.map((item) => item.path).join(", ")}.`
    );
  }
  const selected = matches[0];
  if (!selected) return { name: "unknown", status: "unknown", evidence: [] };
  return {
    name: selected.name,
    status: uniqueNames.length > 1 ? "ambiguous" : "detected",
    evidence: matches.map((match) => ({
      path: match.path,
      reason: `${match.name} lockfile detected.`,
    })),
  };
}

function detectFramework(
  files: readonly RepositoryFileEntry[],
  packageJson: PackageJsonFile | null
): ProjectInspectionProfile["framework"] {
  const paths = new Set(files.map((file) => file.path));
  const deps = new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {}),
  ]);
  const evidence: ProjectInspectionProfile["framework"]["evidence"] = [];
  const hasNext = deps.has("next") || hasAnyPath(paths, ["next.config.js", "next.config.mjs", "next.config.ts"]);
  const hasVite = deps.has("vite") || hasAnyPath(paths, ["vite.config.js", "vite.config.ts", "vite.config.mjs"]);
  const hasReact = deps.has("react") || readablePathMatches(files, /^src\/App\.(tsx|jsx|ts|js)$/u);

  if (hasNext) {
    if (deps.has("next")) evidence.push({ path: "package.json", reason: "next dependency detected." });
    for (const path of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
      if (paths.has(path)) evidence.push({ path, reason: "Next config detected." });
    }
    return { name: "next", status: "detected", confidence: 0.95, evidence };
  }

  if (hasVite && hasReact) {
    if (deps.has("vite") || deps.has("react")) {
      evidence.push({ path: "package.json", reason: "React/Vite dependencies detected." });
    }
    for (const path of ["vite.config.js", "vite.config.ts", "vite.config.mjs"]) {
      if (paths.has(path)) evidence.push({ path, reason: "Vite config detected." });
    }
    return { name: "react-vite", status: "detected", confidence: 0.95, evidence };
  }

  if (hasReact) {
    evidence.push({ path: deps.has("react") ? "package.json" : "src/App.tsx", reason: "React evidence detected." });
    return { name: "react", status: "partial", confidence: 0.65, evidence };
  }

  if (packageJson && Object.keys(packageJson.scripts).length > 0) {
    return {
      name: "node",
      status: "partial",
      confidence: 0.45,
      evidence: [{ path: "package.json", reason: "Node package scripts detected." }],
    };
  }

  return { name: "unknown", status: "unknown", confidence: 0, evidence: [] };
}

function detectScripts(packageJson: PackageJsonFile | null): ProjectScript[] {
  const scripts = packageJson?.scripts ?? {};
  return Object.entries(scripts)
    .map(([name, command]) => ({
      name,
      command,
      category: classifyScript(name, command),
    }))
    .sort((left, right) => {
      const priority = scriptPriority(left.category) - scriptPriority(right.category);
      return priority === 0 ? left.name.localeCompare(right.name) : priority;
    });
}

function detectRoots(files: readonly RepositoryFileEntry[]): ProjectInspectionProfile["roots"] {
  const sourceRoots = rootCandidates(files, (path) =>
    /^(src|app|pages|components|lib|features)\//u.test(path)
  );
  const testRoots = rootCandidates(files, (path) =>
    /(^|\/)(__tests__|tests?|spec)\//u.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/u.test(path)
  );
  const publicRoots = rootCandidates(files, (path) =>
    /^(public|static|assets)\//u.test(path)
  );
  const editableRoots = sourceRoots.length > 0 ? sourceRoots : rootCandidates(files, isEditablePath);
  return {
    sourceRoots,
    testRoots,
    publicRoots,
    editableRoots,
  };
}

function detectEntrypoints(files: readonly RepositoryFileEntry[]): ProjectEntrypoint[] {
  const paths = new Set(files.map((file) => file.path));
  const entrypoints: ProjectEntrypoint[] = [];
  addEntrypoint(entrypoints, paths, "package.json", "package", "Package metadata and scripts.");
  addEntrypoint(entrypoints, paths, "index.html", "html", "Static HTML shell.");
  for (const path of ["vite.config.ts", "vite.config.js", "next.config.ts", "next.config.js", "next.config.mjs"]) {
    addEntrypoint(entrypoints, paths, path, "config", "Project framework configuration.");
  }
  for (const path of ["src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js", "src/index.tsx", "src/index.jsx"]) {
    addEntrypoint(entrypoints, paths, path, "app", "Client application entrypoint.");
  }
  for (const path of ["src/App.tsx", "src/App.jsx", "src/App.ts", "src/App.js", "app/page.tsx", "pages/index.tsx"]) {
    addEntrypoint(entrypoints, paths, path, "page", "Primary application page.");
  }
  for (const file of files) {
    if (/\.(test|spec)\.[cm]?[jt]sx?$/u.test(file.path)) {
      entrypoints.push({
        path: file.path,
        kind: "test",
        evidence: "Test entrypoint detected.",
      });
    }
  }
  return uniqueByPath(entrypoints).slice(0, 40);
}

function detectRoutes(
  files: readonly RepositoryFileEntry[],
  framework: ProjectFramework
): ProjectRoute[] {
  const routes: ProjectRoute[] = [];
  if (framework === "react-vite" || framework === "react") {
    const app = files.find((file) => /^src\/App\.(tsx|jsx|ts|js)$/u.test(file.path));
    const html = files.find((file) => file.path === "index.html");
    if (app || html) {
      routes.push({
        path: app?.path ?? "index.html",
        route: "/",
        kind: "static",
      });
    }
  }
  for (const file of files) {
    const appRoute = nextAppRoute(file.path);
    if (appRoute) routes.push({ path: file.path, route: appRoute, kind: "next-app" });
    const pagesRoute = nextPagesRoute(file.path);
    if (pagesRoute) routes.push({ path: file.path, route: pagesRoute, kind: "next-pages" });
  }
  return uniqueRoutes(routes).slice(0, 80);
}

function detectEditableFiles(
  files: readonly RepositoryFileEntry[],
  limit: number
): ProjectInspectionProfile["editableFiles"] {
  return files
    .filter((file) => file.safety === "readable" && isEditablePath(file.path))
    .sort((left, right) => editablePriority(left.path) - editablePriority(right.path) || left.path.localeCompare(right.path))
    .slice(0, Math.max(1, Math.trunc(limit)))
    .map((file) => ({
      path: file.path,
      language: file.language,
      sizeBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
    }));
}

async function detectProtectedPaths(
  files: readonly RepositoryFileEntry[],
  projectRootPath: string
): Promise<ProjectInspectionProfile["protectedPaths"]> {
  const protectedPaths: ProjectInspectionProfile["protectedPaths"] = [];
  for (const file of files) {
    const reason = protectedPathReason(file.path);
    if (!reason) continue;
    protectedPaths.push({ path: file.path, reason });
  }
  for (const path of [".env", ".env.local", ".env.development", ".env.production"]) {
    if (protectedPaths.some((item) => item.path === path)) continue;
    if (!(await pathExists(join(projectRootPath, path)))) continue;
    const reason = protectedPathReason(path);
    if (reason) protectedPaths.push({ path, reason });
  }
  return protectedPaths
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, 120);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function protectedPathReason(path: string): string | undefined {
  if (/^\.git(\/|$)/u.test(path)) return "Git metadata must not be edited by agents.";
  if (/^(\.env|.*\.env)(\.|$)/u.test(path) || /(^|\/)\.env(\.|$)/u.test(path)) {
    return "Environment files can contain local secrets or machine-specific values.";
  }
  if (/(^|\/)(node_modules|dist|build|coverage|\.turbo|\.next|\.vite)(\/|$)/u.test(path)) {
    return "Generated dependency/build/cache output must not be edited directly.";
  }
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json)$/u.test(path)) {
    return "Lockfiles are managed by the package manager and require explicit dependency intent.";
  }
  if (/(^|\/)(AGENTS\.md|CLAUDE\.md|ID_VISUAL\.md|UNPROTECT\.md)$/u.test(path)) {
    return "Private/local project guidance is not part of generated application edits.";
  }
  return undefined;
}

function classifyScript(name: string, command: string): ProjectScriptCategory {
  const normalized = `${name} ${command}`.toLowerCase();
  if (name === "dev" || normalized.includes(" vite --host") || normalized.includes("next dev")) return "dev";
  if (name === "build" || normalized.includes("vite build") || normalized.includes("next build")) return "build";
  if (name === "test" || /^test[:_-]/u.test(name) || /\b(vitest|jest|playwright|node --test)\b/u.test(normalized)) return "test";
  if (/(typecheck|type-check|tsc\b)/u.test(normalized)) return "typecheck";
  if (/(^lint$|\beslint\b)/u.test(normalized)) return "lint";
  if (name === "check" || /^check[:_-]/u.test(name)) return "check";
  if (name === "preview" || normalized.includes("vite preview")) return "preview";
  return "other";
}

function rootCandidates(
  files: readonly RepositoryFileEntry[],
  predicate: (path: string) => boolean
): string[] {
  return uniqueSorted(
    files.filter((file) => predicate(file.path)).map((file) => firstRoot(file.path))
  );
}

function firstRoot(path: string): string {
  return path.includes("/") ? path.split("/")[0] ?? "." : ".";
}

function isEditablePath(path: string): boolean {
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/u.test(path)) return false;
  return EDITABLE_EXTENSIONS.has(extensionOf(path));
}

function extensionOf(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function editablePriority(path: string): number {
  if (/^(src|app|pages)\//u.test(path)) return 0;
  if (/^(components|features|lib)\//u.test(path)) return 1;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/u.test(path)) return 2;
  if (/^(public|static)\//u.test(path)) return 3;
  return 4;
}

function scriptPriority(category: ProjectScriptCategory): number {
  return ["dev", "build", "test", "typecheck", "lint", "check", "preview", "other"].indexOf(category);
}

function addEntrypoint(
  entrypoints: ProjectEntrypoint[],
  paths: Set<string>,
  path: string,
  kind: ProjectEntrypoint["kind"],
  evidence: string
): void {
  if (!paths.has(path)) return;
  entrypoints.push({ path, kind, evidence });
}

function nextAppRoute(path: string): string | null {
  const match = /^app\/(.+\/)?page\.[cm]?[jt]sx?$/u.exec(path);
  if (!match) return null;
  const segment = (match[1] ?? "").replace(/\/$/u, "");
  return routeFromSegments(segment);
}

function nextPagesRoute(path: string): string | null {
  const match = /^pages\/(.+)\.[cm]?[jt]sx?$/u.exec(path);
  if (!match || match[1]?.startsWith("_")) return null;
  return routeFromSegments(match[1] === "index" ? "" : match[1] ?? "");
}

function routeFromSegments(raw: string): string {
  if (!raw) return "/";
  const route = raw
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.+\)$/u.test(segment))
    .map((segment) => {
      if (segment === "index") return "";
      const dynamic = /^\[(.+)\]$/u.exec(segment);
      return dynamic ? `:${dynamic[1]}` : segment;
    })
    .filter(Boolean)
    .join("/");
  return route ? `/${route}` : "/";
}

function uniqueByPath(entrypoints: ProjectEntrypoint[]): ProjectEntrypoint[] {
  const seen = new Set<string>();
  return entrypoints.filter((entrypoint) => {
    if (seen.has(entrypoint.path)) return false;
    seen.add(entrypoint.path);
    return true;
  });
}

function uniqueRoutes(routes: ProjectRoute[]): ProjectRoute[] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = `${route.kind}:${route.route}:${route.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function hasAnyPath(paths: Set<string>, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => paths.has(candidate));
}

function readablePathMatches(
  files: readonly RepositoryFileEntry[],
  pattern: RegExp
): boolean {
  return files.some((file) => file.safety === "readable" && pattern.test(file.path));
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") output[key] = item;
  }
  return output;
}
