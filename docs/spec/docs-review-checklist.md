# Documentation Review Checklist

Status legend:

- `[ ]` pending
- `[~]` in progress
- `[x]` done

## Public Entry Points

- [x] Update `README.md` so the Fumadocs site is the primary documentation entry point.
- [x] Replace the pending documentation deployment text with the approved deployed URL.
- [x] Align `apps/docs/lib/theme-config.ts` `siteConfig.url` with the deployed docs URL.
- [x] Update docs deployment and chronology pages so they no longer describe Vercel deploy as merely planned.

## Configuration Accuracy

- [x] Align generated project workspace defaults with `.env.example`.
- [x] Document runtime env vars currently missing from the docs.
- [x] Clarify that Quick Start env examples should be written to `.env`, not run as shell commands.
- [x] Reconsider model examples so they are clearly configurable and not implied as universally available.
- [x] Fix reset commands so they cannot expand an empty `HORUS_DATA_DIR` dangerously.

## Architecture Coverage

- [x] Complete route ownership coverage for `/api/events`, `/api/agent-runs`, and `/api/project-construction`.
- [x] Add an API reference page for routes, request purpose, response shape, SSE, and errors.
- [x] Add a security/secrets page covering credential storage, redaction, logs, and `HORUS_SECRET_KEY`.
- [x] Add a testing/quality gates page explaining each validation command and when to run it.
- [x] Add a preview runtime page for preview project seeding, session lifecycle, process/runtime state, and failure modes.

## Diagrams

- [x] Add a real workflow sequence diagram.
- [x] Add a repository/persistence ownership diagram.
- [x] Add a preview runtime lifecycle diagram.
- [x] Add a documentation deployment/runtime diagram that reflects current deployment status.
- [x] Remove non-Horus colors from diagram tones unless they are intentionally semantic.

## Visual Consistency

- [x] Standardize every MDX table with the approved Horus table treatment.
- [x] Remove leftover template visual classes from cards, accordions, code blocks, sidebar optional links, and callouts.
- [x] Remove scaffold comments such as "Logo placeholder" from public docs code.
- [x] Ensure tables, cards, diagrams, accordions, code blocks, and search controls all use Horus visual tokens.

## Validation

- [x] Run `pnpm --filter @u-build/docs build`.
- [x] Check the docs for private local filenames or accidentally exposed operator-only details.
- [x] Do not deploy until the revised docs are reviewed and approved.
