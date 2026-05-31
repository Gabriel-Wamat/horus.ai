#!/usr/bin/env node
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DEFAULT_BASE_URL = "http://localhost:5174";
const SCREENSHOT_TIMEOUT_MS = Number(process.env.HORUS_PREVIEW_SMOKE_TIMEOUT_MS ?? 45000);

function inferApiBaseUrl(pageBaseUrl) {
  const parsed = new URL(pageBaseUrl);
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    return `${parsed.protocol}//${parsed.hostname}:3000`;
  }
  return pageBaseUrl;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function makeArtifactDir() {
  return resolve(
    process.env.HORUS_PREVIEW_SMOKE_ARTIFACT_DIR ??
      join(".horus", "artifacts", "browser-smoke", timestamp())
  );
}

function makeUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadChromium() {
  try {
    const playwright = await import("playwright");
    return playwright.chromium;
  } catch (error) {
    throw new Error(
      [
        "Playwright não está disponível neste repositório.",
        "Execute `pnpm install` e tente novamente.",
        error instanceof Error ? error.message : String(error),
      ].join("\n")
    );
  }
}

async function readJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${url} falhou (${response.status}): ${text || response.statusText}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `GET ${url} não retornou JSON válido: ${text.slice(0, 160).replace(/\s+/g, " ")}`
    );
  }
}

function projectIsVisible(project) {
  return (
    project.visibility === "visible" &&
    project.healthStatus !== "blocked" &&
    project.lifecycleStatus !== "superseded" &&
    project.lifecycleStatus !== "failed" &&
    project.lifecycleStatus !== "archived"
  );
}

function projectIsInvalid(project) {
  return (
    project.visibility === "hidden" ||
    project.healthStatus === "blocked" ||
    project.lifecycleStatus === "superseded" ||
    project.lifecycleStatus === "failed" ||
    project.lifecycleStatus === "archived"
  );
}

function chooseCanonicalProject(projects) {
  return (
    projects.find((project) => project.healthStatus === "healthy") ??
    projects.find((project) => project.healthStatus === "warning") ??
    projects[0]
  );
}

async function screenshot(pageOrLocator, artifactDir, name) {
  const path = join(artifactDir, `${name}.png`);
  await pageOrLocator.screenshot({ path });
  const fileStat = await stat(path);
  check(fileStat.size > 1500, `Screenshot ${name} parece vazia (${fileStat.size} bytes).`);
  return path;
}

async function writeReport(artifactDir, report) {
  const reportPath = join(artifactDir, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function ensureProjectOptions(page, projects) {
  const optionTexts = await page.locator("#preview-project option").allTextContents();
  const optionValues = await page
    .locator("#preview-project option")
    .evaluateAll((options) => options.map((option) => option.value));

  const listedInvalidProjects = projects
    .filter(projectIsInvalid)
    .filter((project) => optionValues.includes(project.id));

  check(
    listedInvalidProjects.length === 0,
    `Projetos inválidos apareceram no seletor padrão: ${listedInvalidProjects
      .map((project) => project.name)
      .join(", ")}`
  );

  return { optionTexts, optionValues };
}

async function clickStart(page) {
  const startButton = page.getByRole("button", { name: /iniciar/i });
  await startButton.waitFor({ state: "visible", timeout: SCREENSHOT_TIMEOUT_MS });
  await startButton.click({ timeout: SCREENSHOT_TIMEOUT_MS });
}

async function readChatSurfaceState(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".preview-conversation-panel");
    const composer = document.querySelector(".visual-composer");
    const textarea = document.querySelector(".visual-composer-input");
    const status = document.querySelector(".composer-status-row span");
    const history = document.querySelector(".preview-chat-message-list");
    const empty = document.querySelector(".preview-chat-empty");
    const scopeBar = document.querySelector(".preview-chat-scope-bar");
    const panelBox = panel?.getBoundingClientRect();

    return {
      hasPanel: Boolean(panel),
      hasComposer: Boolean(composer),
      hasScopeBar: Boolean(scopeBar),
      statusText: status?.textContent?.trim() ?? "",
      textareaDisabled: textarea instanceof HTMLTextAreaElement
        ? textarea.disabled
        : null,
      textareaPlaceholder: textarea instanceof HTMLTextAreaElement
        ? textarea.placeholder
        : "",
      messageCount: history?.querySelectorAll(".preview-chat-message").length ?? 0,
      emptyText: empty?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      panelBox: panelBox
        ? {
            width: Math.round(panelBox.width),
            height: Math.round(panelBox.height),
          }
        : null,
    };
  });
}

async function ensureChatSurfaceSettled(page, artifactDir, screenshotName) {
  await page.locator(".visual-composer").waitFor({
    state: "visible",
    timeout: SCREENSHOT_TIMEOUT_MS,
  });
  await page.waitForFunction(
    () => {
      const status = document
        .querySelector(".composer-status-row span")
        ?.textContent?.trim() ?? "";
      return (
        status.length > 0 &&
        !/Preparando a memória isolada|Carregando o contexto/i.test(status)
      );
    },
    null,
    { timeout: SCREENSHOT_TIMEOUT_MS }
  );
  const state = await readChatSurfaceState(page);
  check(state.hasPanel, "Painel de chat do Preview não foi renderizado.");
  check(state.hasComposer, "Composer do chat não foi renderizado.");
  check(state.hasScopeBar, "Barra de escopo do chat não foi renderizada.");
  check(
    state.statusText.length > 0,
    "Composer do chat não expõe status ou motivo de bloqueio."
  );
  check(
    !/Preparando a memória isolada|Carregando o contexto/i.test(state.statusText),
    `Chat permaneceu em estado transitório: ${state.statusText}`
  );
  check(!state.horizontalOverflow, "Chat gerou overflow horizontal no viewport.");
  const screenshotPath = await screenshot(page.locator(".preview-conversation-panel"), artifactDir, screenshotName);
  return { ...state, screenshotPath };
}

async function stopIfRunning(page) {
  const stopButton = page.getByRole("button", { name: /parar/i });
  if ((await stopButton.count()) === 0) return;
  if (await stopButton.isEnabled().catch(() => false)) {
    await stopButton.click({ timeout: 10000 });
    await page.waitForTimeout(500);
  }
}

async function run() {
  const baseUrl = process.env.HORUS_BASE_URL ?? DEFAULT_BASE_URL;
  const apiBaseUrl = process.env.HORUS_API_BASE_URL ?? inferApiBaseUrl(baseUrl);
  const artifactDir = makeArtifactDir();
  await mkdir(artifactDir, { recursive: true });

  const report = {
    status: "running",
    baseUrl,
    apiBaseUrl,
    artifactDir,
    startedAt: new Date().toISOString(),
    screenshots: {},
    checks: {},
    warnings: [],
    consoleErrors: [],
    pageErrors: [],
  };

  try {
    report.checks.health = await readJson(makeUrl(apiBaseUrl, "/health"));
    const visibleBody = await readJson(
      makeUrl(baseUrl, "/api/preview/projects?visibility=visible")
    );
    const allBody = await readJson(makeUrl(baseUrl, "/api/preview/projects?visibility=all"));
    const visibleProjects = visibleBody.projects ?? [];
    const allProjects = allBody.projects ?? [];

    check(visibleProjects.length > 0, "Nenhum projeto visível foi retornado pela API.");
    check(
      visibleProjects.every(projectIsVisible),
      "A API visibility=visible retornou projeto hidden/blocked/superseded."
    );

    const canonicalProject = chooseCanonicalProject(visibleProjects);
    const invalidProject = allProjects.find(projectIsInvalid) ?? null;
    report.checks.visibleProjects = visibleProjects.map((project) => ({
      id: project.id,
      name: project.name,
      visibility: project.visibility,
      lifecycleStatus: project.lifecycleStatus,
      healthStatus: project.healthStatus,
    }));
    report.checks.canonicalProject = {
      id: canonicalProject.id,
      name: canonicalProject.name,
      healthStatus: canonicalProject.healthStatus,
    };
    report.checks.invalidProject = invalidProject
      ? {
          id: invalidProject.id,
          name: invalidProject.name,
          visibility: invalidProject.visibility,
          lifecycleStatus: invalidProject.lifecycleStatus,
          healthStatus: invalidProject.healthStatus,
          healthReasons: invalidProject.healthReasons,
        }
      : null;

    if (!invalidProject) {
      const message =
        "Nenhum projeto inválido/oculto foi encontrado para testar o modo Ver inválidos.";
      if (process.env.HORUS_PREVIEW_SMOKE_REQUIRE_INVALID === "1") throw new Error(message);
      report.warnings.push(message);
    }

    const chromium = await loadChromium();
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new Error(
        [
          "Chromium do Playwright não está instalado.",
          "Execute `pnpm exec playwright install chromium` e rode `pnpm preview:smoke` novamente.",
          error instanceof Error ? error.message : String(error),
        ].join("\n")
      );
    }

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("console", (message) => {
      if (message.type() === "error") report.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => report.pageErrors.push(error.message));

    await page.goto(makeUrl(baseUrl, "/?mode=preview"), {
      waitUntil: "domcontentloaded",
      timeout: SCREENSHOT_TIMEOUT_MS,
    });
    await page.locator("#preview-project").waitFor({
      state: "visible",
      timeout: SCREENSHOT_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () => document.querySelectorAll("#preview-project option").length > 0,
      null,
      { timeout: SCREENSHOT_TIMEOUT_MS }
    );

    report.checks.defaultSelector = await ensureProjectOptions(page, allProjects);
    report.screenshots.defaultPreview = await screenshot(page, artifactDir, "01-default-preview");

    await page.selectOption("#preview-project", canonicalProject.id);
    report.checks.chatSurface = await ensureChatSurfaceSettled(
      page,
      artifactDir,
      "02-chat-surface"
    );
    report.screenshots.chatSurface = report.checks.chatSurface.screenshotPath;
    await stopIfRunning(page);
    await clickStart(page);
    await page.locator("iframe.preview-frame").waitFor({
      state: "visible",
      timeout: SCREENSHOT_TIMEOUT_MS,
    });
    const frameShell = page.locator(".preview-frame-shell").first();
    const frameBox = await frameShell.boundingBox();
    check(
      Boolean(frameBox && frameBox.width > 240 && frameBox.height > 240),
      "Preview frame não possui dimensão visual útil."
    );
    report.screenshots.runningPreview = await screenshot(
      page.locator(".preview-canvas"),
      artifactDir,
      "03-running-preview"
    );
    report.checks.runningPreview = {
      projectId: canonicalProject.id,
      frameBox,
      iframeSrc: await page.locator("iframe.preview-frame").first().getAttribute("src"),
    };

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    report.checks.mobileChatSurface = await ensureChatSurfaceSettled(
      page,
      artifactDir,
      "04-mobile-chat-surface"
    );
    report.screenshots.mobileChatSurface =
      report.checks.mobileChatSurface.screenshotPath;
    await page.setViewportSize({ width: 1280, height: 900 });

    if (invalidProject) {
      await page.getByRole("button", { name: /ver inválidos/i }).click({
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
      await page.waitForFunction(
        (projectId) =>
          [...document.querySelectorAll("#preview-project option")].some(
            (option) => option.value === projectId
          ),
        invalidProject.id,
        { timeout: SCREENSHOT_TIMEOUT_MS }
      );
      report.screenshots.allProjects = await screenshot(page, artifactDir, "05-all-projects");

      await page.selectOption("#preview-project", invalidProject.id);
      await clickStart(page);
      await page.waitForFunction(
        () =>
          /Preview bloqueado|Preview com erro|bloqueado|scaffold|sem comando|unreachable|timeout/i.test(
            document.body.innerText
          ),
        null,
        { timeout: SCREENSHOT_TIMEOUT_MS }
      );
      report.screenshots.blockedProject = await screenshot(
        page,
        artifactDir,
        "06-blocked-project"
      );
      report.checks.blockedProject = {
        projectId: invalidProject.id,
        visibleError: true,
      };
    }

    await browser.close();
    check(report.pageErrors.length === 0, `Page errors detectados: ${report.pageErrors.join("; ")}`);
    report.status = "passed";
    report.finishedAt = new Date().toISOString();
    report.reportPath = await writeReport(artifactDir, report);
    process.stdout.write(
      [
        "Preview browser smoke passed.",
        `Artifacts: ${artifactDir}`,
        `Report: ${report.reportPath}`,
      ].join("\n") + "\n"
    );
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    report.finishedAt = new Date().toISOString();
    report.reportPath = await writeReport(artifactDir, report);
    process.stderr.write(
      [
        "Preview browser smoke failed.",
        report.error,
        `Artifacts: ${artifactDir}`,
        `Report: ${report.reportPath}`,
      ].join("\n") + "\n"
    );
    process.exitCode = 1;
  }
}

await run();
