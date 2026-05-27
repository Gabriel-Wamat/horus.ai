import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAudit,
  classifyPath,
  formatAudit,
  parseStatusLines,
} from "./worktree-spec-audit.mjs";

test("parseStatusLines parses modified, staged and untracked files", () => {
  const entries = parseStatusLines(
    [
      " M package.json",
      "A  scripts/preview-browser-smoke.mjs",
      "?? scripts/worktree-spec-audit.mjs",
      "R  old/path.ts -> apps/server/src/infrastructure/preview/PreviewProjectHealthService.ts",
    ].join("\n")
  );

  assert.deepEqual(
    entries.map((entry) => ({
      status: entry.status,
      path: entry.path,
      staged: entry.staged,
      unstaged: entry.unstaged,
      untracked: entry.untracked,
    })),
    [
      {
        status: " M",
        path: "package.json",
        staged: false,
        unstaged: true,
        untracked: false,
      },
      {
        status: "A ",
        path: "scripts/preview-browser-smoke.mjs",
        staged: true,
        unstaged: false,
        untracked: false,
      },
      {
        status: "??",
        path: "scripts/worktree-spec-audit.mjs",
        staged: false,
        unstaged: false,
        untracked: true,
      },
      {
        status: "R ",
        path: "apps/server/src/infrastructure/preview/PreviewProjectHealthService.ts",
        staged: true,
        unstaged: false,
        untracked: false,
      },
    ]
  );
});

test("classifyPath maps spec 63 implementation files", () => {
  assert.equal(
    classifyPath("scripts/preview-browser-smoke.mjs").group,
    "browser-validation-worktree-hygiene"
  );
  assert.equal(
    classifyPath("scripts/worktree-spec-audit.test.mjs").group,
    "browser-validation-worktree-hygiene"
  );
});

test("buildAudit flags mixed feature groups and manual review files", () => {
  const audit = buildAudit(
    parseStatusLines(
      [
        " M package.json",
        " M apps/server/src/infrastructure/preview/PreviewProjectHealthService.ts",
        " M apps/server/src/infrastructure/http/server.ts",
      ].join("\n")
    )
  );

  assert.equal(audit.status, "warning");
  assert.ok(audit.warnings.some((warning) => warning.includes("grupos")));
  assert.deepEqual(audit.manualReviewFiles, [
    "apps/server/src/infrastructure/http/server.ts",
  ]);
});

test("buildAudit can focus staging suggestions on spec 63 only", () => {
  const audit = buildAudit(
    parseStatusLines(
      [
        " M package.json",
        " M pnpm-lock.yaml",
        " M apps/server/src/infrastructure/preview/PreviewProjectHealthService.ts",
      ].join("\n")
    ),
    { spec: "63" }
  );

  assert.deepEqual(Object.keys(audit.groups), [
    "browser-validation-worktree-hygiene",
  ]);
  assert.match(
    audit.recommendedCommands[0].command,
    /git add -- package\.json pnpm-lock\.yaml/
  );
});

test("formatAudit renders a human-readable staging plan", () => {
  const audit = buildAudit(parseStatusLines(" M package.json"));
  const formatted = formatAudit(audit);

  assert.match(formatted, /Horus worktree spec audit/);
  assert.match(formatted, /package\.json/);
  assert.match(formatted, /\[browser-validation-worktree-hygiene\] git add -- package\.json/);
});
