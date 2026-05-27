import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type {
  CodeChangeSet,
  DesignContextBundle,
  RuntimeValidationEvidence,
  Spec,
  VisualGateIssue,
  VisualGateIssueSeverity,
  VisualGateResult,
  VisualGateScreenshotEvidence,
  VisualGateViewport,
} from "@u-build/shared";
import {
  RuntimeValidationEvidenceSchema,
  VisualGateResultSchema,
} from "@u-build/shared";

export interface VisualGateInput {
  spec: Spec;
  html: string;
  codeChangeSet?: CodeChangeSet | undefined;
  projectRootPath?: string | undefined;
  workflowThreadId?: string | undefined;
  userStoryId?: string | undefined;
  projectId?: string | undefined;
  designContext?: DesignContextBundle | undefined;
}

export interface VisualCaptureInput extends VisualGateInput {
  artifacts: VisualInspectableArtifact[];
}

export interface VisualInspectableArtifact {
  id: string;
  path: string;
  content: string;
}

export interface VisualCaptureAdapter {
  capture(input: VisualCaptureInput): Promise<VisualGateScreenshotEvidence[]>;
}

const VIEWPORTS: Array<{
  viewport: VisualGateViewport;
  width: number;
  height: number;
}> = [
  { viewport: "desktop", width: 1440, height: 960 },
  { viewport: "mobile", width: 390, height: 844 },
];

const SCORE_THRESHOLD = 86;

export class StaticVisualCaptureAdapter implements VisualCaptureAdapter {
  async capture(
    input: VisualCaptureInput
  ): Promise<VisualGateScreenshotEvidence[]> {
    const combined = combineArtifactContent(input.artifacts);
    const textLength = visibleTextLength(combined);
    const interactiveElementCount = countMatches(
      combined,
      /<button|<a\s|role=["']button|input|select|textarea/gi
    );
    const surfaceFrameCount = countMatches(
      combined,
      /\b(card|panel|frame|surface|box-shadow|border\s*:|outline\s*:)/gi
    );
    const fixedWidthRisks = findFixedWidthRisks(combined);
    const colorCount = extractColors(combined).length;
    const contentHash = createHash("sha256").update(combined).digest("hex").slice(0, 16);

    return VIEWPORTS.map((viewport) => ({
      id: `static-dom:${contentHash}:${viewport.viewport}`,
      viewport: viewport.viewport,
      width: viewport.width,
      height: viewport.height,
      captureKind: "static_dom",
      artifactPath: null,
      artifactUrl: null,
      nonBlank: textLength > 8,
      diagnostics: {
        textLength,
        interactiveElementCount,
        surfaceFrameCount,
        fixedWidthRisks,
        colorCount,
      },
    }));
  }
}

export class PlaywrightVisualCaptureAdapter implements VisualCaptureAdapter {
  async capture(
    input: VisualCaptureInput
  ): Promise<VisualGateScreenshotEvidence[]> {
    const playwright = await importOptionalPlaywright();
    if (!playwright) return [];

    const browser = await playwright.chromium.launch({ headless: true });
    const outputDir = join(tmpdir(), "horus-visual-gate");
    await mkdir(outputDir, { recursive: true });
    try {
      const html = input.html.trim() || renderArtifactsAsHtml(input.artifacts);
      const contentHash = createHash("sha256").update(html).digest("hex").slice(0, 16);
      const screenshots: VisualGateScreenshotEvidence[] = [];
      for (const viewport of VIEWPORTS) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
        });
        try {
          await page.setContent(html, { waitUntil: "networkidle" });
          const bodyText = await page.locator("body").innerText({ timeout: 1000 });
          const artifactPath = join(
            outputDir,
            `${contentHash}-${viewport.viewport}.png`
          );
          const bytes = await page.screenshot({
            path: artifactPath,
            fullPage: true,
          });
          const fixedWidthRisks = await page.evaluate(() => {
            const risks: string[] = [];
            const runtime = globalThis as unknown as {
              document: {
                querySelectorAll(selector: string): ArrayLike<{
                  tagName: string;
                }>;
              };
              window: {
                innerWidth: number;
                getComputedStyle(element: unknown): {
                  width: string;
                  minWidth: string;
                };
              };
            };
            Array.from(runtime.document.querySelectorAll("*")).forEach((element) => {
              const style = runtime.window.getComputedStyle(element);
              const width = Number.parseFloat(style.width);
              const minWidth = Number.parseFloat(style.minWidth);
              if (
                width > runtime.window.innerWidth ||
                minWidth > runtime.window.innerWidth
              ) {
                risks.push(
                  `${element.tagName.toLowerCase()} ${Math.round(width || minWidth)}px`
                );
              }
            });
            return risks.slice(0, 8);
          });
          screenshots.push({
            id: `browser-screenshot:${contentHash}:${viewport.viewport}`,
            viewport: viewport.viewport,
            width: viewport.width,
            height: viewport.height,
            captureKind: "browser_screenshot",
            artifactPath,
            artifactUrl: null,
            nonBlank: bodyText.trim().length > 8 && bytes.length > 1024,
            diagnostics: {
              textLength: bodyText.trim().length,
              fixedWidthRisks,
              bytes: bytes.length,
            },
          });
        } finally {
          await page.close();
        }
      }
      return screenshots;
    } finally {
      await browser.close();
    }
  }
}

export class VisualDesignGateService {
  constructor(
    private readonly captureAdapter: VisualCaptureAdapter = new StaticVisualCaptureAdapter()
  ) {}

  async validate(input: VisualGateInput): Promise<VisualGateResult> {
    const startedAt = new Date().toISOString();
    const start = Date.now();
    const artifacts = collectInspectableArtifacts(input);

    if (artifacts.length === 0) {
      return VisualGateResultSchema.parse({
        id: uuidv4(),
        status: "inconclusive",
        score: 0,
        threshold: SCORE_THRESHOLD,
        summary:
          "Visual gate inconclusivo: nenhuma UI candidata foi encontrada para inspeção.",
        issues: [
          issue({
            severity: "critical",
            category: "capture_unavailable",
            location: "candidate",
            observed: "Não há HTML ou CodeChangeSet inspecionável.",
            expected:
              "Front Agent deve produzir uma alteração visual concreta antes da entrega.",
          }),
        ],
        screenshots: [],
        previewUrl: null,
        captureUnavailableReason: "missing_candidate_artifact",
        designSystemSourceFiles: input.designContext?.sourceFiles ?? [],
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      });
    }

    const screenshots = await this.captureAdapter.capture({ ...input, artifacts });
    const issues = evaluateVisualIssues(input, artifacts, screenshots);
    const score = scoreIssues(issues);
    const hasBlockingIssue = issues.some(
      (item) => item.severity === "critical" || item.severity === "high"
    );
    const status =
      screenshots.length === 0
        ? "inconclusive"
        : hasBlockingIssue || score < SCORE_THRESHOLD
          ? "failed"
          : "passed";
    const topIssue = issues[0];

    return VisualGateResultSchema.parse({
      id: uuidv4(),
      status,
      score,
      threshold: SCORE_THRESHOLD,
      summary:
        status === "passed"
          ? "Visual aprovado: tela candidata tem conteúdo, não indica overflow crítico e segue o contrato visual disponível."
          : topIssue
            ? `Visual reprovado: ${topIssue.observed}`
            : "Visual gate inconclusivo: não foi possível capturar evidência visual.",
      issues,
      screenshots,
      previewUrl: null,
      captureUnavailableReason: screenshots.length === 0 ? "capture_adapter_empty" : null,
      designSystemSourceFiles: input.designContext?.sourceFiles ?? [],
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    });
  }
}

export function visualGateFeedbackItems(result: VisualGateResult): string[] {
  if (result.issues.length === 0) return [`[front:visual] ${result.summary}`];
  return result.issues.map(
    (item) =>
      `[front:visual] ${item.location}: ${item.observed} Esperado: ${item.expected}`
  );
}

export function visualGateToRuntimeEvidence(input: {
  result: VisualGateResult;
  workflowThreadId?: string | null;
  userStoryId?: string | null;
  projectId?: string | null;
}): RuntimeValidationEvidence {
  const screenshotPath =
    input.result.screenshots[0]?.artifactPath ??
    input.result.screenshots[0]?.id ??
    null;
  return RuntimeValidationEvidenceSchema.parse({
    id: input.result.id,
    workflowThreadId: input.workflowThreadId ?? null,
    constructionRunId: null,
    userStoryId: input.userStoryId ?? null,
    projectId: input.projectId ?? null,
    status: input.result.status === "passed" ? "passed" : "failed",
    skippedReason:
      input.result.status === "inconclusive"
        ? (input.result.captureUnavailableReason ?? "visual_gate_inconclusive")
        : null,
    commands: [],
    preview: {
      status: input.result.status === "passed" ? "passed" : "failed",
      url: input.result.previewUrl,
      message: input.result.summary,
      evidence: {
        title: "Visual gate",
        bodySnippet: input.result.issues[0]?.observed ?? input.result.summary,
        screenshotPath,
      },
    },
    createdAt: input.result.finishedAt,
  });
}

function collectInspectableArtifacts(input: VisualGateInput): VisualInspectableArtifact[] {
  const artifacts: VisualInspectableArtifact[] = [];
  if (input.html.trim()) {
    artifacts.push({
      id: "curator-html",
      path: "curator/html",
      content: input.html,
    });
  }

  for (const operation of input.codeChangeSet?.operations ?? []) {
    if (isFrontendVisualPath(operation.targetPath)) {
      artifacts.push({
        id: operation.targetPath,
        path: operation.targetPath,
        content: operation.afterContent,
      });
    }
  }

  return artifacts.filter((artifact) => artifact.content.trim().length > 0);
}

function evaluateVisualIssues(
  input: VisualGateInput,
  artifacts: VisualInspectableArtifact[],
  screenshots: VisualGateScreenshotEvidence[]
): VisualGateIssue[] {
  const issues: VisualGateIssue[] = [];
  const combined = combineArtifactContent(artifacts);
  const screenshotIds = screenshots.map((screenshot) => screenshot.id);

  if (screenshots.length === 0) {
    issues.push(
      issue({
        severity: "critical",
        category: "capture_unavailable",
        location: "visual capture",
        observed: "Nenhum viewport retornou evidência de renderização.",
        expected: "Capturar pelo menos desktop e mobile antes de aprovar a entrega.",
      })
    );
  }

  for (const screenshot of screenshots) {
    if (!screenshot.nonBlank) {
      issues.push(
        issue({
          severity: "critical",
          category: "blank_render",
          location: screenshot.viewport,
          observed: "A tela candidata parece vazia ou sem texto útil.",
          expected: "Renderizar conteúdo visível relacionado à user story.",
          evidenceIds: [screenshot.id],
        })
      );
    }

    const fixedWidthRisks = toStringArray(screenshot.diagnostics["fixedWidthRisks"]);
    if (screenshot.viewport === "mobile" && fixedWidthRisks.length > 0) {
      issues.push(
        issue({
          severity: "high",
          category: "responsive_overflow",
          location: "mobile viewport",
          observed: `Há largura fixa com risco de overflow: ${fixedWidthRisks
            .slice(0, 3)
            .join(", ")}.`,
          expected: "Usar constraints responsivas e evitar larguras fixas acima do viewport.",
          evidenceIds: [screenshot.id],
        })
      );
    }
  }

  const excessiveFrames = detectExcessiveFrames(input, combined, screenshotIds);
  if (excessiveFrames) issues.push(excessiveFrames);

  const colorIssue = detectColorIdentityDrift(input, combined, screenshotIds);
  if (colorIssue) issues.push(colorIssue);

  const stateIssue = detectMissingStates(input, combined, screenshotIds);
  if (stateIssue) issues.push(stateIssue);

  return issues;
}

function detectExcessiveFrames(
  input: VisualGateInput,
  content: string,
  evidenceIds: string[]
): VisualGateIssue | null {
  const antiPatterns = [
    ...(input.spec.visualContract?.antiPatterns ?? []),
    ...(input.designContext?.antiPatterns ?? []),
  ].join(" ");
  const caresAboutFrames = /frame|card|painel|panel|borda|border/i.test(antiPatterns);
  const frameCount = countMatches(
    content,
    /\b(card|panel|frame|surface|box-shadow|border\s*:|outline\s*:)/gi
  );
  if (!caresAboutFrames || frameCount < 20) return null;

  return issue({
    severity: frameCount > 34 ? "high" : "medium",
    category: "excessive_frames",
    location: "layout",
    observed: `Foram detectados ${frameCount} sinais de frames, bordas ou sombras na UI candidata.`,
    expected: "Reduzir molduras e usar hierarquia por espaçamento, contraste e agrupamento.",
    evidenceIds,
  });
}

function detectColorIdentityDrift(
  input: VisualGateInput,
  content: string,
  evidenceIds: string[]
): VisualGateIssue | null {
  const allowedColors = new Set(
    [
      ...Object.values(input.designContext?.tokens ?? {}),
      ...(input.spec.visualContract?.colorPolicy.background ?? []),
      ...(input.spec.visualContract?.colorPolicy.surface ?? []),
      ...(input.spec.visualContract?.colorPolicy.text ?? []),
      ...(input.spec.visualContract?.colorPolicy.accent ?? []),
    ]
      .map(normalizeColor)
      .filter(Boolean)
  );
  const forbiddenText = [
    ...(input.spec.visualContract?.colorPolicy.forbidden ?? []),
    ...(input.designContext?.antiPatterns ?? []),
    ...(input.spec.visualContract?.antiPatterns ?? []),
  ].join(" ");
  const strictSaturation = /high[-\s]?light|saturad|neon|glow/i.test(forbiddenText);
  const highSaturationColors = extractColors(content)
    .map((color) => ({ color, normalized: normalizeColor(color) }))
    .filter((entry) => entry.normalized && !allowedColors.has(entry.normalized))
    .filter((entry) => isHighSaturationHex(entry.normalized!));

  if (highSaturationColors.length === 0) return null;

  const uniqueColors = [...new Set(highSaturationColors.map((entry) => entry.color))];
  if (!strictSaturation && uniqueColors.length < 5) return null;

  return issue({
    severity: strictSaturation || uniqueColors.length >= 6 ? "high" : "medium",
    category: "visual_identity_drift",
    location: "color system",
    observed: `Cores saturadas fora do contrato visual: ${uniqueColors
      .slice(0, 6)
      .join(", ")}.`,
    expected: "Usar tons do contrato visual e reservar o accent para estados/ações.",
    evidenceIds,
  });
}

function detectMissingStates(
  input: VisualGateInput,
  content: string,
  evidenceIds: string[]
): VisualGateIssue | null {
  const requiredStates = input.spec.visualContract?.states ?? [];
  if (requiredStates.length === 0) return null;
  const missing = requiredStates.filter((state) => {
    if (state === "default") return false;
    return !new RegExp(`\\b${escapeRegExp(state)}\\b`, "i").test(content);
  });
  if (missing.length === 0) return null;
  return issue({
    severity: "low",
    category: "missing_state",
    location: "ui states",
    observed: `Não há sinal explícito dos estados: ${missing.join(", ")}.`,
    expected: "Evidenciar estados previstos no VisualContract quando a tela depender deles.",
    evidenceIds,
  });
}

function scoreIssues(issues: VisualGateIssue[]): number {
  const penalties: Record<VisualGateIssueSeverity, number> = {
    low: 5,
    medium: 15,
    high: 32,
    critical: 55,
  };
  const totalPenalty = issues.reduce(
    (total, item) => total + penalties[item.severity],
    0
  );
  return Math.max(0, 100 - totalPenalty);
}

function issue(input: {
  severity: VisualGateIssueSeverity;
  category: VisualGateIssue["category"];
  location: string;
  observed: string;
  expected: string;
  evidenceIds?: string[];
}): VisualGateIssue {
  return {
    id: `visual-${createHash("sha1")
      .update(
        `${input.severity}:${input.category}:${input.location}:${input.observed}`
      )
      .digest("hex")
      .slice(0, 12)}`,
    severity: input.severity,
    category: input.category,
    location: input.location,
    observed: input.observed,
    expected: input.expected,
    fixTarget: "front",
    evidenceIds: input.evidenceIds ?? [],
  };
}

function isFrontendVisualPath(path: string): boolean {
  return /\.(html|css|tsx|jsx|ts|js)$/i.test(path);
}

function combineArtifactContent(artifacts: VisualInspectableArtifact[]): string {
  return artifacts.map((artifact) => artifact.content).join("\n\n");
}

function renderArtifactsAsHtml(artifacts: VisualInspectableArtifact[]): string {
  const body = artifacts
    .map(
      (artifact) =>
        `<section><h2>${escapeHtml(artifact.path)}</h2><pre>${escapeHtml(
          artifact.content.slice(0, 12000)
        )}</pre></section>`
    )
    .join("\n");
  return `<!doctype html><html><body>${body}</body></html>`;
}

function visibleTextLength(content: string): number {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[{}()[\];:.,'"`#.=<>/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function countMatches(content: string, pattern: RegExp): number {
  return content.match(pattern)?.length ?? 0;
}

function findFixedWidthRisks(content: string): string[] {
  const risks: string[] = [];
  const widthPattern = /(?<![-\w])(?:width|min-width)\s*:\s*(\d{3,4})px/gi;
  for (const match of content.matchAll(widthPattern)) {
    const value = Number(match[1]);
    if (value > 390) risks.push(match[0]);
  }
  const classPattern = /\b(?:w|min-w)-\[(\d{3,4})px\]/gi;
  for (const match of content.matchAll(classPattern)) {
    const value = Number(match[1]);
    if (value > 390) risks.push(match[0]);
  }
  return [...new Set(risks)].slice(0, 8);
}

function extractColors(content: string): string[] {
  const colors = [
    ...(content.match(/#[0-9a-f]{3,8}\b/gi) ?? []),
    ...(content.match(/rgb[a]?\([^)]+\)/gi) ?? []),
  ];
  return [...new Set(colors.map((color) => color.toLowerCase()))];
}

function normalizeColor(color: string): string | null {
  const trimmed = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}\b/.test(trimmed)) return trimmed.slice(0, 7);
  if (/^#[0-9a-f]{3}\b/.test(trimmed)) {
    const [, r, g, b] = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])/) ?? [];
    if (!r || !g || !b) return null;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function isHighSaturationHex(color: string): boolean {
  const rgb = hexToRgb(color);
  if (!rgb) return false;
  const { saturation, lightness } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return saturation >= 0.68 && lightness >= 0.28 && lightness <= 0.76;
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const match = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return {
    r: Number.parseInt(match[1]!, 16),
    g: Number.parseInt(match[2]!, 16),
    b: Number.parseInt(match[3]!, 16),
  };
}

function rgbToHsl(
  rValue: number,
  gValue: number,
  bValue: number
): { saturation: number; lightness: number } {
  const r = rValue / 255;
  const g = gValue / 255;
  const b = bValue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { saturation: 0, lightness };
  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  return { saturation, lightness };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function importOptionalPlaywright(): Promise<
  | {
      chromium: {
        launch(input: { headless: boolean }): Promise<{
          newPage(input: {
            viewport: { width: number; height: number };
          }): Promise<{
            setContent(
              html: string,
              options: { waitUntil: "networkidle" }
            ): Promise<void>;
            locator(selector: string): {
              innerText(options: { timeout: number }): Promise<string>;
            };
            screenshot(input: {
              path: string;
              fullPage: boolean;
            }): Promise<Uint8Array>;
            evaluate<T>(fn: () => T): Promise<T>;
            close(): Promise<void>;
          }>;
          close(): Promise<void>;
        }>;
      };
    }
  | null
> {
  try {
    const dynamicImport = new Function(
      "specifier",
      "return import(specifier)"
    ) as (specifier: string) => Promise<unknown>;
    return (await dynamicImport("playwright")) as Awaited<
      ReturnType<typeof importOptionalPlaywright>
    >;
  } catch {
    return null;
  }
}
