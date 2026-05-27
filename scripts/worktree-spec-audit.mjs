#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WORKTREE_GROUP_RULES = [
  {
    group: "browser-validation-worktree-hygiene",
    specs: ["63"],
    reason: "arquivo esperado para a entrega de validação visual e higiene de worktree",
    exactPaths: [
      "package.json",
      "pnpm-lock.yaml",
      "scripts/preview-browser-smoke.mjs",
      "scripts/worktree-spec-audit.mjs",
      "scripts/worktree-spec-audit.test.mjs",
      "spec/features/63-browser-visual-validation-and-worktree-hygiene.md",
    ],
  },
  {
    group: "preview-registry-hygiene",
    specs: ["62"],
    reason: "arquivo relacionado à higiene do registry de preview",
    pathHints: [
      "PreviewProjectHealthService",
      "frontendProjectRegistry",
      "previewProjectHealthService",
      "007_preview_project_registry_hygiene",
    ],
  },
  {
    group: "agent-skill-system",
    specs: ["60", "61"],
    reason: "arquivo relacionado ao catálogo/registro de skills",
    pathHints: [
      "AgentSkill",
      "agentSkill",
      "agent_skill",
      "agent-skill",
      "skill-catalog",
      "skillRegistry",
      "skills/",
    ],
  },
];

const SHARED_REVIEW_PATHS = new Set([
  "apps/server/src/infrastructure/http/server.ts",
  "apps/server/src/infrastructure/repositories/createRepositories.ts",
  "packages/shared/src/index.ts",
  "apps/web/src/App.tsx",
  "apps/web/src/components/Shell.tsx",
  "apps/web/src/app/useAppNavigation.ts",
]);

export function parseStatusLines(rawStatus) {
  return rawStatus
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const renamedPath = rawPath.includes(" -> ")
        ? rawPath.split(" -> ").at(-1)?.trim() ?? rawPath
        : rawPath;

      return {
        status,
        path: renamedPath,
        staged: status[0] !== " " && status[0] !== "?",
        unstaged: status[1] !== " " && status[0] !== "?",
        untracked: status === "??",
      };
    });
}

export function classifyPath(path) {
  for (const rule of WORKTREE_GROUP_RULES) {
    const exactMatch = rule.exactPaths?.includes(path);
    const hintMatch = rule.pathHints?.some((hint) => path.includes(hint));
    if (exactMatch || hintMatch) {
      return {
        group: rule.group,
        specs: rule.specs,
        reason: rule.reason,
      };
    }
  }

  if (path === "spec/README.md" || path === "spec/CHANGELOG.md") {
    return {
      group: "local-spec-index",
      reason: "índice local de specs; revisar junto com a spec implementada",
      manualReview: true,
    };
  }

  if (path.startsWith("spec/")) {
    return {
      group: "local-specs",
      reason: "spec local ignorada pelo Git, mas deve manter versão coerente",
      manualReview: true,
    };
  }

  if (SHARED_REVIEW_PATHS.has(path)) {
    return {
      group: "shared-manual-review",
      reason: "arquivo compartilhado entre múltiplas features; revisar hunk por hunk",
      manualReview: true,
    };
  }

  if (path.startsWith("apps/web/src/") || path.startsWith("apps/server/src/")) {
    return {
      group: "unknown-app-change",
      reason: "mudança em código de aplicação sem associação automática segura",
      manualReview: true,
    };
  }

  return {
    group: "unknown",
    reason: "sem regra de classificação confiável",
    manualReview: true,
  };
}

function normalizeSpecGroup(spec) {
  if (!spec) return null;
  const normalized = String(spec).replace(/^spec[-_]?/i, "");
  const rule = WORKTREE_GROUP_RULES.find((entry) => entry.specs.includes(normalized));
  if (rule) return rule.group;
  return `spec-${normalized}`;
}

export function buildAudit(entries, options = {}) {
  const targetGroup = normalizeSpecGroup(options.spec);
  const groups = new Map();
  const recommendedPathsByGroup = new Map();
  const manualReviewFiles = [];

  for (const entry of entries) {
    const classification = classifyPath(entry.path);
    const annotated = { ...entry, ...classification };

    if (targetGroup && annotated.group !== targetGroup) {
      continue;
    }

    if (!groups.has(annotated.group)) groups.set(annotated.group, []);
    groups.get(annotated.group).push(annotated);

    if (annotated.manualReview) {
      manualReviewFiles.push(annotated.path);
    } else {
      const current = recommendedPathsByGroup.get(annotated.group) ?? [];
      current.push(annotated.path);
      recommendedPathsByGroup.set(annotated.group, current);
    }
  }

  const grouped = Object.fromEntries(
    [...groups.entries()].map(([group, files]) => [
      group,
      files.sort((a, b) => a.path.localeCompare(b.path)),
    ])
  );
  const concreteGroups = Object.keys(grouped).filter(
    (group) =>
      !group.includes("manual") &&
      group !== "local-spec-index" &&
      group !== "local-specs" &&
      group !== "unknown" &&
      group !== "unknown-app-change"
  );

  const warnings = [];
  if (concreteGroups.length > 1) {
    warnings.push(
      `Worktree contém ${concreteGroups.length} grupos de feature/spec; separe commits por escopo.`
    );
  }
  if (manualReviewFiles.length > 0) {
    warnings.push(
      `${manualReviewFiles.length} arquivo(s) exigem revisão manual de hunk antes de staging.`
    );
  }

  const recommendedGroups = Object.fromEntries(
    [...recommendedPathsByGroup.entries()].map(([group, paths]) => [
      group,
      [...new Set(paths)].sort(),
    ])
  );
  const recommendedCommands = [];
  for (const [group, paths] of Object.entries(recommendedGroups)) {
    if (paths.length > 0) {
      recommendedCommands.push({
        group,
        command: `git add -- ${paths.join(" ")}`,
      });
    }
  }
  if (recommendedCommands.length > 0) {
    recommendedCommands.push({
      group: "review",
      command: "git diff --cached --stat",
    });
  }

  return {
    status: warnings.length > 0 ? "warning" : "clean",
    targetSpec: options.spec ? String(options.spec) : null,
    changedFileCount: Object.values(grouped).reduce((sum, files) => sum + files.length, 0),
    groups: grouped,
    warnings,
    manualReviewFiles,
    recommendedGroups,
    recommendedCommands,
  };
}

export function formatAudit(audit) {
  const lines = [];
  lines.push("Horus worktree spec audit");
  lines.push(`Status: ${audit.status}`);
  if (audit.targetSpec) lines.push(`Filtro: spec ${audit.targetSpec}`);
  lines.push(`Arquivos classificados: ${audit.changedFileCount}`);
  lines.push("");

  for (const [group, files] of Object.entries(audit.groups)) {
    lines.push(`[${group}]`);
    for (const file of files) {
      const flags = [
        file.staged ? "staged" : null,
        file.unstaged ? "unstaged" : null,
        file.untracked ? "untracked" : null,
        file.manualReview ? "manual-review" : null,
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`- ${file.status} ${file.path}${flags ? ` (${flags})` : ""}`);
      lines.push(`  motivo: ${file.reason}`);
    }
    lines.push("");
  }

  if (audit.warnings.length > 0) {
    lines.push("Avisos:");
    for (const warning of audit.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  if (audit.recommendedCommands.length > 0) {
    lines.push("Comandos sugeridos por grupo, somente depois de revisar o diff:");
    for (const item of audit.recommendedCommands) {
      lines.push(`- [${item.group}] ${item.command}`);
    }
  } else {
    lines.push("Nenhum comando de staging sugerido automaticamente.");
  }

  return lines.join("\n");
}

function parseArgs(argv) {
  const options = { json: false, spec: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--spec") {
      options.spec = argv[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith("--spec=")) {
      options.spec = arg.slice("--spec=".length);
    }
  }
  return options;
}

function readGitStatus() {
  return execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const audit = buildAudit(parseStatusLines(readGitStatus()), options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatAudit(audit)}\n`);
  }
  return audit.status === "clean" ? 0 : 1;
}

const executedFile = fileURLToPath(import.meta.url);
if (process.argv[1] === executedFile) {
  process.exitCode = runCli();
}
