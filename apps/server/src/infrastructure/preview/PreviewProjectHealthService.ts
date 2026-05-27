import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  FrontendProjectSchema,
  type FrontendProject,
  type FrontendProjectHealthReason,
} from "@u-build/shared";

export type PreviewProjectListVisibility = "visible" | "all" | "archived";

export interface PreviewProjectHealthServiceOptions {
  now?: () => string;
}

export class PreviewProjectHealthError extends Error {
  constructor(
    message: string,
    readonly evidence: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "PreviewProjectHealthError";
  }
}

interface InspectedProject {
  project: FrontendProject;
  familyKey: string;
  createdAtMs: number;
}

const TERMINAL_HIDDEN_STATUSES = new Set<FrontendProject["lifecycleStatus"]>([
  "archived",
  "failed",
  "superseded",
]);

const SIGNIFICANT_FILES = [
  "src/App.tsx",
  "src/App.jsx",
  "src/main.tsx",
  "src/main.jsx",
  "src/index.html",
  "index.html",
  "package.json",
];

function addReason(
  reasons: Set<FrontendProjectHealthReason>,
  reason: FrontendProjectHealthReason
): void {
  reasons.add(reason);
}

function hasPreviewCommand(project: FrontendProject): boolean {
  if (project.previewCommandId) {
    return project.commandCatalog.some((command) => command.id === project.previewCommandId);
  }
  return project.commandCatalog.length > 0 || Boolean(project.devCommand);
}

function inferProjectKind(project: FrontendProject): FrontendProject["projectKind"] {
  if (project.projectKind !== "generated") return project.projectKind;
  if (project.slug === "user-stories" || project.name === "user_stories") {
    return "seed";
  }
  return "generated";
}

function familyKeyFor(project: FrontendProject): string {
  if (project.projectKind === "seed" || project.slug === "user-stories") {
    return `seed:${project.slug}`;
  }

  let family = project.slug;
  let previous = "";
  while (family !== previous) {
    previous = family;
    family = family
      .replace(/-spec\d+(?:-(?:retry|final|fixed|validated|clean|status))?$/u, "")
      .replace(/-(?:retry|final|fixed|validated|clean|status)$/u, "")
      .replace(/-v\d+$/u, "");
  }
  return family || project.slug;
}

function sortByHealthAndDate(a: InspectedProject, b: InspectedProject): number {
  const rank = (project: FrontendProject): number => {
    if (project.healthStatus === "healthy") return 0;
    if (project.healthStatus === "warning") return 1;
    if (project.healthStatus === "unknown") return 2;
    return 3;
  };
  const healthDiff = rank(a.project) - rank(b.project);
  if (healthDiff !== 0) return healthDiff;
  const dateDiff = b.createdAtMs - a.createdAtMs;
  if (dateDiff !== 0) return dateDiff;
  return a.project.name.localeCompare(b.project.name);
}

function withReasons(
  project: FrontendProject,
  reasons: Iterable<FrontendProjectHealthReason>,
  patch: Partial<FrontendProject> = {}
): FrontendProject {
  return FrontendProjectSchema.parse({
    ...project,
    ...patch,
    healthReasons: Array.from(new Set([...project.healthReasons, ...reasons])),
  });
}

function hasBlockedReason(project: FrontendProject): boolean {
  return project.healthReasons.some((reason) =>
    [
      "root_missing",
      "preview_command_missing",
      "preview_url_missing",
      "scaffold_only",
    ].includes(reason)
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readSmallText(path: string, maxBytes = 1_000_000): Promise<string | null> {
  try {
    const stat = await fs.stat(path);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return await fs.readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export class PreviewProjectHealthService {
  constructor(private readonly options: PreviewProjectHealthServiceOptions = {}) {}

  async listProjects(
    projects: readonly FrontendProject[],
    visibility: PreviewProjectListVisibility = "visible"
  ): Promise<FrontendProject[]> {
    const audited = await this.auditProjects(projects);
    if (visibility === "all") return audited;
    if (visibility === "archived") {
      return audited.filter(
        (project) =>
          project.visibility === "hidden" ||
          TERMINAL_HIDDEN_STATUSES.has(project.lifecycleStatus)
      );
    }
    return audited.filter(
      (project) =>
        project.visibility === "visible" &&
        !TERMINAL_HIDDEN_STATUSES.has(project.lifecycleStatus) &&
        project.healthStatus !== "blocked"
    );
  }

  async auditProject(
    project: FrontendProject,
    allProjects: readonly FrontendProject[] = [project]
  ): Promise<FrontendProject> {
    const audited = await this.auditProjects(allProjects);
    return audited.find((item) => item.id === project.id) ?? (await this.inspect(project)).project;
  }

  assertStartable(project: FrontendProject): void {
    if (
      project.visibility === "hidden" ||
      TERMINAL_HIDDEN_STATUSES.has(project.lifecycleStatus) ||
      project.healthStatus === "blocked"
    ) {
      const reason = project.healthReasons[0] ?? project.lifecycleStatus;
      throw new PreviewProjectHealthError(
        `Preview bloqueado para "${project.name}": ${humanReason(reason)}.`,
        {
          projectId: project.id,
          projectName: project.name,
          healthStatus: project.healthStatus,
          healthReasons: project.healthReasons,
          lifecycleStatus: project.lifecycleStatus,
          canonicalProjectId: project.canonicalProjectId,
          reason,
        }
      );
    }
  }

  async auditProjects(projects: readonly FrontendProject[]): Promise<FrontendProject[]> {
    const inspected = await Promise.all(projects.map((project) => this.inspect(project)));
    const canonicalByFamily = this.resolveCanonicalByFamily(inspected);
    const canonicalByUrl = this.resolveCanonicalByPreviewUrl(inspected, canonicalByFamily);

    return inspected
      .map((entry) => {
        const familyCanonical = canonicalByFamily.get(entry.familyKey);
        const urlCanonical = entry.project.previewUrl
          ? canonicalByUrl.get(entry.project.previewUrl)
          : undefined;
        const canonical = urlCanonical ?? familyCanonical;
        if (!canonical || canonical.project.id === entry.project.id) {
          return entry.project;
        }
        const reasons: FrontendProjectHealthReason[] = ["superseded_by_canonical"];
        if (
          entry.project.appFingerprint &&
          entry.project.appFingerprint === canonical.project.appFingerprint
        ) {
          reasons.push("duplicate_app_hash");
        }
        if (entry.project.previewUrl && urlCanonical) {
          reasons.push("preview_url_collision");
        }
        return withReasons(entry.project, reasons, {
          lifecycleStatus: "superseded",
          visibility: "hidden",
          healthStatus:
            entry.project.healthStatus === "blocked" ? "blocked" : "warning",
          canonicalProjectId: canonical.project.id,
          archivedAt: entry.project.archivedAt ?? this.now(),
          archivedReason: `Superseded by canonical preview project ${canonical.project.name}.`,
        });
      })
      .sort((a, b) => {
        const byCreatedAt =
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (byCreatedAt !== 0) return byCreatedAt;
        return a.name.localeCompare(b.name);
      });
  }

  private async inspect(project: FrontendProject): Promise<InspectedProject> {
    const reasons = new Set<FrontendProjectHealthReason>();
    const now = this.now();
    const projectKind = inferProjectKind(project);
    if (projectKind === "seed") addReason(reasons, "seed_project");

    let rootExists = false;
    try {
      const stat = await fs.stat(project.rootPath);
      rootExists = stat.isDirectory();
    } catch {
      rootExists = false;
    }
    if (!rootExists) addReason(reasons, "root_missing");

    const manifestProjectId = rootExists
      ? await this.readManifestProjectId(project.rootPath)
      : null;
    if (rootExists && !manifestProjectId && projectKind === "generated") {
      addReason(reasons, "manifest_missing");
    }
    if (!project.previewUrl) addReason(reasons, "preview_url_missing");
    if (!hasPreviewCommand(project)) addReason(reasons, "preview_command_missing");

    const legacyStatic =
      rootExists &&
      projectKind === "generated" &&
      !(await fileExists(join(project.rootPath, "package.json"))) &&
      ((await fileExists(join(project.rootPath, "index.html"))) ||
        (await fileExists(join(project.rootPath, "src", "index.html"))));
    if (legacyStatic) addReason(reasons, "legacy_static");

    const appFingerprint = rootExists
      ? await this.fingerprintProject(project.rootPath)
      : null;
    if (rootExists && projectKind === "generated" && (await this.isScaffoldOnly(project.rootPath))) {
      addReason(reasons, "scaffold_only");
    }

    const healthStatus = hasBlockedReason({
      ...project,
      healthReasons: Array.from(reasons),
    })
      ? "blocked"
      : reasons.size > 0
      ? "warning"
      : "healthy";

    const lifecycleStatus =
      project.lifecycleStatus === "draft" || project.lifecycleStatus === "running"
        ? project.lifecycleStatus
        : healthStatus === "blocked"
        ? "failed"
        : project.lifecycleStatus;

    const visibility =
      healthStatus === "blocked" || TERMINAL_HIDDEN_STATUSES.has(lifecycleStatus)
        ? "hidden"
        : project.visibility;

    const inspectedProject = FrontendProjectSchema.parse({
      ...project,
      projectKind: legacyStatic ? "legacy_static" : projectKind,
      lifecycleStatus,
      visibility,
      healthStatus,
      healthReasons: Array.from(reasons),
      projectWorkspaceId: project.projectWorkspaceId ?? manifestProjectId,
      appFingerprint,
      lastHealthCheckedAt: now,
      archivedAt:
        visibility === "hidden" && lifecycleStatus !== "published"
          ? project.archivedAt ?? now
          : project.archivedAt,
      archivedReason:
        visibility === "hidden" && !project.archivedReason
          ? `Preview hidden because ${Array.from(reasons).map(humanReason).join(", ")}.`
          : project.archivedReason,
    });

    return {
      project: inspectedProject,
      familyKey: familyKeyFor(inspectedProject),
      createdAtMs: new Date(project.createdAt).getTime(),
    };
  }

  private resolveCanonicalByFamily(
    inspected: readonly InspectedProject[]
  ): Map<string, InspectedProject> {
    const byFamily = new Map<string, InspectedProject[]>();
    for (const entry of inspected) {
      const entries = byFamily.get(entry.familyKey) ?? [];
      entries.push(entry);
      byFamily.set(entry.familyKey, entries);
    }
    const canonical = new Map<string, InspectedProject>();
    for (const [family, entries] of byFamily) {
      canonical.set(family, [...entries].sort(sortByHealthAndDate)[0]!);
    }
    return canonical;
  }

  private resolveCanonicalByPreviewUrl(
    inspected: readonly InspectedProject[],
    canonicalByFamily: Map<string, InspectedProject>
  ): Map<string, InspectedProject> {
    const byUrl = new Map<string, InspectedProject[]>();
    for (const entry of inspected) {
      if (!entry.project.previewUrl) continue;
      const entries = byUrl.get(entry.project.previewUrl) ?? [];
      entries.push(entry);
      byUrl.set(entry.project.previewUrl, entries);
    }
    const canonical = new Map<string, InspectedProject>();
    for (const [url, entries] of byUrl) {
      if (entries.length <= 1) continue;
      const candidates = entries
        .map((entry) => canonicalByFamily.get(entry.familyKey) ?? entry)
        .filter(
          (entry, index, array) =>
            array.findIndex((candidate) => candidate.project.id === entry.project.id) === index
        );
      canonical.set(url, [...candidates].sort(sortByHealthAndDate)[0]!);
    }
    return canonical;
  }

  private async readManifestProjectId(rootPath: string): Promise<string | null> {
    const raw = await readSmallText(join(rootPath, "horus.project.json"));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { projectId?: unknown };
      return typeof parsed.projectId === "string" && parsed.projectId.trim()
        ? parsed.projectId
        : null;
    } catch {
      return null;
    }
  }

  private async fingerprintProject(rootPath: string): Promise<string | null> {
    const hash = createHash("sha256");
    let found = false;
    for (const file of SIGNIFICANT_FILES) {
      const text = await readSmallText(join(rootPath, file));
      if (text === null) continue;
      found = true;
      hash.update(file);
      hash.update("\0");
      hash.update(text);
      hash.update("\0");
    }
    return found ? hash.digest("hex").slice(0, 16) : null;
  }

  private async isScaffoldOnly(rootPath: string): Promise<boolean> {
    const app = await readSmallText(join(rootPath, "src", "App.tsx"));
    if (!app) return false;
    const normalized = app.replace(/\s+/gu, " ");
    return (
      /WelcomeScreen/u.test(normalized) &&
      /function App|export function App|const App/u.test(normalized) &&
      !/Dashboard|Calendar|Task|Tarefa|Route|nav|aside|main className/u.test(normalized)
    );
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }
}

function humanReason(reason: string): string {
  const labels: Record<string, string> = {
    root_missing: "a pasta do projeto não existe mais",
    manifest_missing: "o manifesto do projeto não foi encontrado",
    preview_command_missing: "o comando de preview não está configurado",
    preview_url_missing: "a URL de preview não está configurada",
    preview_url_collision: "a URL de preview está compartilhada com outro projeto",
    wrong_owner_port: "a porta pertence a outro projeto",
    scaffold_only: "o projeto ainda está no scaffold padrão",
    duplicate_app_hash: "há outro projeto canônico com o mesmo front",
    superseded_by_canonical: "existe uma versão canônica mais confiável",
    stale_running_run: "a execução marcada como ativa está obsoleta",
    legacy_static: "o projeto é legado/estático",
    seed_project: "projeto seed do Horus",
  };
  return labels[reason] ?? reason;
}
