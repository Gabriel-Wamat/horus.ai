import { promises as fs } from "node:fs";
import { basename, join, relative } from "node:path";
import type { DesignContextBundle, HorusProjectManifest } from "@u-build/shared";
import { DesignContextBundleSchema } from "@u-build/shared";
import { ProjectManifestService } from "../project/ProjectManifestService.js";
import {
  ProjectPathSafetyError,
  resolveInsideRoot,
} from "../project/ProjectPathSafety.js";

export interface BuildDesignContextInput {
  projectRootPath: string;
  projectId?: string | undefined;
  manifest?: HorusProjectManifest | null | undefined;
  maxFiles?: number | undefined;
  maxBytesPerFile?: number | undefined;
  maxTotalBytes?: number | undefined;
}

interface ReadDesignFile {
  path: string;
  content: string;
}

const DEFAULT_REFERENCE_FILES = [
  "ID_VISUAL.md",
  "DESIGN.md",
  "STYLEGUIDE.md",
  "src/styles/tokens.css",
  "src/styles/app.css",
  "src/index.css",
  "src/App.css",
  "src/App.tsx",
  "src/main.tsx",
  "package.json",
];

const DEFAULT_DENY_PATHS = new Set([
  ".env",
  ".env.local",
  ".git",
  "node_modules",
  "dist",
  "build",
  ".turbo",
  "coverage",
]);

const DEFAULT_SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]/iu,
  /secret\s*[:=]/iu,
  /token\s*[:=]/iu,
  /password\s*[:=]/iu,
  /private[_-]?key/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
];

export class DesignContextService {
  constructor(private readonly manifestService = new ProjectManifestService()) {}

  async build(input: BuildDesignContextInput): Promise<DesignContextBundle> {
    const startedAt = Date.now();
    const projectRoot = await fs.realpath(input.projectRootPath);
    const manifest =
      input.manifest === undefined
        ? await this.manifestService.read(projectRoot)
        : input.manifest;
    const maxFiles = input.maxFiles ?? 12;
    const maxBytesPerFile = input.maxBytesPerFile ?? 12_000;
    const maxTotalBytes = input.maxTotalBytes ?? 48_000;
    const warnings: string[] = [];
    const sourceFiles: ReadDesignFile[] = [];
    let totalBytes = 0;

    const candidates = buildCandidatePaths(manifest);
    for (const candidate of candidates) {
      if (sourceFiles.length >= maxFiles) break;
      if (isDeniedPath(candidate, manifest)) {
        warnings.push(`Referencia visual ignorada por politica de caminho: ${candidate}`);
        continue;
      }

      let absolutePath: string;
      try {
        absolutePath = resolveInsideRoot(projectRoot, candidate);
      } catch (err) {
        if (err instanceof ProjectPathSafetyError) {
          warnings.push(`Referencia visual fora da raiz do projeto: ${candidate}`);
          continue;
        }
        throw err;
      }

      const stat = await fs.stat(absolutePath).catch(() => null);
      if (!stat) {
        if (manifest?.designSystem.referenceFiles.includes(candidate)) {
          warnings.push(`Referencia visual nao encontrada: ${candidate}`);
        }
        continue;
      }
      if (!stat.isFile()) continue;
      if (!isTextDesignFile(candidate)) continue;

      const bytesToRead = Math.min(stat.size, maxBytesPerFile);
      if (totalBytes + bytesToRead > maxTotalBytes) {
        warnings.push(`Referencia visual omitida por limite de contexto: ${candidate}`);
        continue;
      }

      const raw = (await fs.readFile(absolutePath, "utf-8")).slice(
        0,
        maxBytesPerFile
      );
      sourceFiles.push({
        path: normalizeRelativePath(relative(projectRoot, absolutePath)),
        content: redactSecrets(raw),
      });
      totalBytes += Buffer.byteLength(raw, "utf-8");
    }

    const allContent = sourceFiles.map((file) => file.content).join("\n\n");
    const tokens = extractTokens(sourceFiles);
    const components = await extractComponentHints(projectRoot, manifest);
    const constraints = [
      ...(manifest?.designSystem.notes ?? []),
      ...(manifest?.agentRules.uiStyle ?? []),
      ...deriveConstraints(allContent, tokens),
    ].filter(dedupe).slice(0, 12);
    const antiPatterns = [
      ...(manifest?.agentRules.forbiddenPatterns ?? []),
      ...deriveAntiPatterns(allContent),
    ].filter(dedupe).slice(0, 12);
    const visualSummary = buildVisualSummary({
      manifest,
      sourceFiles: sourceFiles.map((file) => file.path),
      tokens,
      constraints,
      warnings,
    });

    const bundle = DesignContextBundleSchema.parse({
      ...(input.projectId ? { projectId: input.projectId } : {}),
      sourceFiles: sourceFiles.map((file) => file.path),
      tokens,
      components,
      visualSummary,
      constraints,
      antiPatterns,
      warnings,
      generatedAt: new Date().toISOString(),
    });

    console.log(
      `[DesignContextService] design_context_extracted project=${input.projectId ?? "unknown"} sources=${bundle.sourceFiles.length} tokens=${Object.keys(bundle.tokens).length} components=${bundle.components.length} warnings=${bundle.warnings.length} durationMs=${Date.now() - startedAt}`
    );

    return bundle;
  }
}

export function formatDesignContextForPrompt(
  designContext: DesignContextBundle | undefined
): string {
  if (!designContext) {
    return [
      "# Contexto visual do projeto",
      "Nenhum DesignContextBundle foi encontrado. Use defaults discretos e registre que a identidade local nao foi provada.",
    ].join("\n");
  }

  const tokens = Object.entries(designContext.tokens)
    .slice(0, 28)
    .map(([name, value]) => `- ${name}: ${value}`)
    .join("\n") || "- N/A";
  const components =
    designContext.components
      .slice(0, 12)
      .map((component) => {
        const path = component.path ? ` (${component.path})` : "";
        const purpose = component.purpose ? `: ${component.purpose}` : "";
        return `- ${component.name}${path}${purpose}`;
      })
      .join("\n") || "- N/A";
  const constraints =
    designContext.constraints.map((item) => `- ${item}`).join("\n") || "- N/A";
  const antiPatterns =
    designContext.antiPatterns.map((item) => `- ${item}`).join("\n") || "- N/A";
  const warnings =
    designContext.warnings.map((item) => `- ${item}`).join("\n") || "- N/A";

  return [
    "# Contexto visual do projeto",
    designContext.visualSummary,
    "",
    "## Evidencias lidas",
    designContext.sourceFiles.map((path) => `- ${path}`).join("\n") || "- N/A",
    "",
    "## Tokens detectados",
    tokens,
    "",
    "## Componentes existentes",
    components,
    "",
    "## Regras obrigatorias",
    constraints,
    "",
    "## Anti-padroes a evitar",
    antiPatterns,
    "",
    "## Avisos de extracao",
    warnings,
  ].join("\n");
}

function buildCandidatePaths(
  manifest: HorusProjectManifest | null | undefined
): string[] {
  return [
    ...(manifest?.designSystem.referenceFiles ?? []),
    ...(manifest?.architecture.routeFiles ?? []),
    ...(manifest?.architecture.componentRoots ?? []),
    ...DEFAULT_REFERENCE_FILES,
  ]
    .map((path) => normalizeRelativePath(path.replace(/^\.?\//u, "")))
    .filter(Boolean)
    .filter(dedupe);
}

function isDeniedPath(
  relativePath: string,
  manifest: HorusProjectManifest | null | undefined
): boolean {
  const parts = relativePath.split("/");
  const denied = new Set([
    ...DEFAULT_DENY_PATHS,
    ...(manifest?.rootPathPolicy.deniedPaths ?? []),
    ...(manifest?.security.denyPaths ?? []),
  ]);
  return parts.some((part) => denied.has(part));
}

function isTextDesignFile(path: string): boolean {
  return /\.(css|html|json|md|mjs|js|jsx|ts|tsx|yaml|yml)$/iu.test(path);
}

function redactSecrets(value: string): string {
  return value
    .split("\n")
    .map((line) =>
      DEFAULT_SECRET_PATTERNS.some((pattern) => pattern.test(line))
        ? "[REDACTED_SECRET_LINE]"
        : line
    )
    .join("\n");
}

function extractTokens(files: ReadDesignFile[]): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const file of files) {
    if (!/\.(css|tsx?|jsx?|html)$/iu.test(file.path)) continue;
    for (const match of file.content.matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;}\n]+)/giu)) {
      const name = match[1];
      const value = match[2];
      if (!name || !value) continue;
      tokens[name] = value.trim().slice(0, 80);
    }
    for (const match of file.content.matchAll(/#(?:[0-9a-f]{3,8})\b/giu)) {
      tokens[`color:${match[0].toLowerCase()}`] = match[0].toLowerCase();
    }
  }
  return Object.fromEntries(Object.entries(tokens).slice(0, 48));
}

async function extractComponentHints(
  projectRoot: string,
  manifest: HorusProjectManifest | null | undefined
): Promise<DesignContextBundle["components"]> {
  const roots = [
    ...(manifest?.architecture.componentRoots ?? []),
    "src/components",
    "src/features",
  ].filter(dedupe);
  const components: DesignContextBundle["components"] = [];

  for (const root of roots) {
    let absoluteRoot: string;
    try {
      absoluteRoot = resolveInsideRoot(projectRoot, root);
    } catch (err) {
      if (err instanceof ProjectPathSafetyError) continue;
      throw err;
    }
    const entries = await fs.readdir(absoluteRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (components.length >= 20) return components;
      const path = normalizeRelativePath(join(root, entry.name));
      if (entry.isDirectory()) {
        components.push({
          name: titleFromFileName(entry.name),
          path,
          purpose: "Pasta de componente/feature existente.",
        });
      } else if (entry.isFile() && /\.(tsx|jsx|ts|js)$/iu.test(entry.name)) {
        components.push({
          name: titleFromFileName(basename(entry.name).replace(/\.[^.]+$/u, "")),
          path,
          purpose: "Componente ou modulo de UI existente.",
        });
      }
    }
  }

  return components.filter((item, index, list) =>
    list.findIndex((other) => other.path === item.path) === index
  );
}

function deriveConstraints(
  content: string,
  tokens: Record<string, string>
): string[] {
  const lower = content.toLowerCase();
  const constraints = [
    "Preserve a identidade visual comprovada por arquivos locais antes de propor novo estilo.",
    "Use cinzas e superficies discretas como base; acentos devem ser controlados.",
  ];
  if (Object.keys(tokens).length > 0) {
    constraints.push("Reutilize tokens CSS detectados em vez de criar paleta paralela.");
  }
  if (lower.includes("dark") || lower.includes("#0b") || lower.includes("background")) {
    constraints.push("Priorize tema escuro quando a base do projeto ja for escura.");
  }
  if (lower.includes("compact") || lower.includes("dense")) {
    constraints.push("Mantenha densidade operacional compacta e escaneavel.");
  }
  return constraints;
}

function deriveAntiPatterns(content: string): string[] {
  const lower = content.toLowerCase();
  const antiPatterns = [
    "Nao usar cores high-light saturadas se elas nao existirem no contexto visual.",
    "Nao criar excesso de frames, cards aninhados ou decoracao sem funcao.",
    "Nao trocar a identidade do projeto por uma landing page generica.",
  ];
  if (lower.includes("minimal") || lower.includes("minimalista")) {
    antiPatterns.push("Evitar excesso de texto instrucional na interface.");
  }
  return antiPatterns;
}

function buildVisualSummary(input: {
  manifest: HorusProjectManifest | null | undefined;
  sourceFiles: string[];
  tokens: Record<string, string>;
  constraints: string[];
  warnings: string[];
}): string {
  if (input.sourceFiles.length === 0) {
    return "Nenhum arquivo visual confiavel foi encontrado; use defaults neutros e registre baixa confianca.";
  }
  const stack = input.manifest
    ? `${input.manifest.stack.frontend}/${input.manifest.stack.language}`
    : "stack desconhecida";
  return [
    `Contexto visual extraido de ${input.sourceFiles.length} arquivo(s) reais do projeto (${stack}).`,
    `${Object.keys(input.tokens).length} token(s) detectados.`,
    input.constraints[0] ?? "Preserve os padroes locais existentes.",
    input.warnings.length > 0 ? `${input.warnings.length} aviso(s) de extracao.` : "Sem avisos de extracao.",
  ].join(" ");
}

function titleFromFileName(value: string): string {
  return value
    .replace(/[-_]+/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase())
    .trim();
}

function normalizeRelativePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function dedupe<T>(value: T, index: number, values: T[]): boolean {
  return values.indexOf(value) === index;
}
