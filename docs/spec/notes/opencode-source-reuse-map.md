# Opencode Source Reuse Map

Status: local-only planning reference  
Created: 2026-05-28  
Applies to: feature specs 97-108

This note defines how implementation agents should reuse code from the local opencode checkout while keeping Horus integrated, portable and consistent with its own architecture.

## Reference Root

```text
/Users/wamat/Desktop/My Apps/Códigos/opencode
```

Use this checkout as the primary reference for specs 97-108. The reference is MIT-licensed, so substantial copied portions must preserve the required copyright/license notice in an appropriate source header, NOTICE entry or third-party attribution file, depending on how much is copied.

## Reuse Rules

1. Prefer copying complete, generic leaf algorithms when the algorithm is already production-grade and not coupled to opencode runtime globals.
2. Prefer adapting architecture patterns when the source depends on opencode-specific services, UI framework, process model, global stores or API shape.
3. Do not import opencode package boundaries directly into Horus.
4. Do not copy local absolute paths, workspace assumptions, generated caches, build outputs, app branding, telemetry identifiers or unrelated product features.
5. Keep Horus contracts as the source of truth: `packages/shared` schemas first, application ports second, infrastructure adapters third, React consumers last.
6. Any copied code must be converted to Horus naming, error taxonomy, observability events, test style and portability requirements.
7. Every copied/adapted module must have targeted tests proving behavior inside Horus, not only structural similarity to the reference.
8. If opencode behavior conflicts with Horus safety rules, Horus wins.

## Copy/Adapt Targets By Spec

| Horus spec | Preferred opencode source targets | Reuse mode | What to keep |
|---|---|---|---|
| 97 - Incremental edit tool | `packages/opencode/src/tool/edit.ts`, `packages/opencode/src/tool/write.ts`, `packages/opencode/src/file/time.ts`, `packages/opencode/src/util/filesystem.ts` | Copy/adapt leaf algorithms | `oldString/newString`, `replaceAll`, line-ending normalization, stale file assertion pattern, diff metadata, post-edit diagnostics hook shape |
| 98 - Governed shell runtime | `packages/opencode/src/tool/bash.ts`, `packages/opencode/src/shell/shell.ts`, `packages/opencode/src/pty/index.ts`, `packages/opencode/src/pty/schema.ts` | Adapt architecture and selected parsing helpers | timeout defaults, output bounding, shell/provider separation, cwd/path extraction, PTY/session lifecycle concepts |
| 99 - Operational session ledger | `packages/opencode/src/session/index.ts`, `packages/opencode/src/session/message.ts`, `packages/opencode/src/session/message-v2.ts`, `packages/opencode/src/session/projectors.ts`, `packages/opencode/src/session/session.sql.ts`, `packages/opencode/src/bus/bus-event.ts` | Adapt architecture | session/message/part separation, projector pattern, event bus semantics, persisted session status |
| 100 - Robust mutation preflight/applier | `packages/opencode/src/tool/edit.ts`, `packages/opencode/src/tool/write.ts`, `packages/opencode/src/snapshot/index.ts`, `packages/opencode/src/session/revert.ts`, `packages/opencode/src/file/protected.ts` | Copy/adapt leaf algorithms and adapt rollback model | diff creation, file diff shape, protected file policy, revert/snapshot concepts |
| 101 - Generated project inspection | `packages/opencode/src/file/index.ts`, `packages/opencode/src/file/ignore.ts`, `packages/opencode/src/file/ripgrep.ts`, `packages/opencode/src/tool/glob.ts`, `packages/opencode/src/tool/grep.ts`, `packages/opencode/src/tool/ls.ts` | Copy/adapt scanners and ignore handling | gitignore-aware search, file tree/list behavior, bounded read/search results |
| 102 - Agent tool profiles | `packages/opencode/src/tool/registry.ts`, `packages/opencode/src/tool/tool.ts`, `packages/opencode/src/tool/schema.ts`, `packages/opencode/src/permission/schema.ts`, `packages/opencode/src/permission/evaluate.ts` | Adapt architecture | typed registry, permission evaluation, tool schema introspection |
| 103 - Runbook projection | `packages/opencode/src/session/projectors.ts`, `packages/opencode/src/session/status.ts`, `packages/ui/src/components/tool-status-title.tsx`, `packages/ui/src/components/tool-count-summary.tsx`, `packages/ui/src/components/basic-tool.tsx` | Adapt architecture/UI ideas | deterministic projection from session parts, compact tool status titles, grouped tool count summaries |
| 104 - Semantic command classifier | `packages/opencode/src/tool/bash.ts`, `packages/opencode/src/permission/arity.ts`, `packages/opencode/src/permission/evaluate.ts` | Copy/adapt command parsing helpers where isolated | command/path argument extraction, arity checks, permission decision model |
| 105 - Worktree isolation | `packages/opencode/src/project/instance.ts`, `packages/opencode/src/snapshot/index.ts`, `packages/opencode/src/session/revert.ts` | Adapt architecture | workspace/worktree distinction, snapshot/revert boundaries |
| 106 - Context compaction | `packages/opencode/src/session/compaction.ts`, `packages/opencode/src/session/overflow.ts`, `packages/opencode/src/session/summary.ts`, `packages/opencode/src/session/todo.ts` | Adapt architecture | compaction trigger, overflow handling, summary/todo preservation |
| 107 - REPL/notebook advanced tools | `packages/opencode/src/pty/index.ts`, `packages/opencode/src/server/routes/pty.ts`, `packages/opencode/src/tool/bash.ts` | Adapt architecture | process/session lifecycle, bounded streaming, route shape if Horus later exposes it |
| 108 - Tool activity visualization | `packages/ui/src/components/basic-tool.tsx`, `packages/ui/src/components/tool-status-title.tsx`, `packages/ui/src/components/tool-error-card.tsx`, `packages/ui/src/components/diff-changes.tsx`, `packages/ui/src/components/session-turn.tsx`, `packages/app/src/context/global-sync/event-reducer.ts`, `packages/app/src/context/sync.tsx` | Adapt UI structure and reducer patterns | live tool cards, diff rows, grouped session events, error cards, optimistic event reduction |

## Integration Checklist For Every Copied Module

- Read the Horus target file and downstream consumers before copying.
- Identify the smallest reusable unit from opencode.
- Remove opencode-specific globals and route through Horus dependency injection or application ports.
- Replace source schemas with Horus `packages/shared` schemas.
- Replace permission/event/session concepts with Horus profile, workflow and operational-session contracts.
- Preserve cross-platform behavior: no macOS-only shell, path or filesystem assumption.
- Add tests covering the copied behavior in Horus.
- Run focused package tests and `pnpm typecheck`.

## Anti-Patterns

- Copying whole package folders.
- Copying UI components without adapting them to Horus visual identity and CSS boundaries.
- Copying shell execution without the Horus command classifier and profile gates.
- Copying session state without connecting it to workflow run IDs, project IDs and chat scope.
- Copying file writes that bypass `FileMutationPreflightApplier`.

