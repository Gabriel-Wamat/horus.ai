# Horus Local Spec Changelog

## 2026-05-29

- Implemented feature 78 with shared operational memory, spec traceability, role-specific context profiles, LangGraph prompt integration, and focused schema/service tests.
- Added feature 78, `Operational Memory, Spec Traceability, And Agent Context Profiles`, to focus the next implementation on replayable run memory, requirement coverage, and role-specific context envelopes.
- Implemented feature 77 with structural patch few-shot prompting, CodeChangeSet structural metadata, telemetry projection/UI details, Redis live smoke, chat-preview E2E smoke, and production hardening smoke.
- Added feature 77, `Agentic Editing Hardening, E2E, And Observability`, to close the remaining post-feature-76 product hardening tasks.
- Implemented feature 76 with Front Agent `StructuralPatchIntent` output support, LangGraph structural patch compilation to CodeChangeSet, and optional Redis-backed code context cache with memory fallback.
- Added feature 76, `Structural Patch Intents And Redis Cache`, to connect AST patch planning into the main Front Agent flow and introduce optional Redis caching without sacrificing portability.
- Implemented feature 75 with front-agent `replace_file_range` permission, delete read-evidence in the tool loop, minimal line-range update translation, replace-range telemetry bookkeeping, and compact AST/semantic context in `search_code`.
- Added feature 75, `AST Context And Full Edit Powers`, after auditing that front/chat executors have edit tools but still need delete read-evidence wiring, minimal update translation, and AST/semantic context in generic code search.
- Implemented feature 74 with automatic project inspection, protected path context, validation-driven targeted file reads, bounded repair continuation, stricter read-before-write mutation policy, and commandId-based governed command resolution.
- Added feature 74, `Runtime Context And Technical Reflection Loop`, to make runtime evidence, read-before-write, structural project maps, and bounded repair loops first-class in the chat agent.
- Implemented feature 73 with shared file-operation telemetry contracts, backend replay/SSE routes, a dedicated frontend telemetry screen, and focused regression coverage.
- Added feature 73, `Dedicated Real-Time Agent File Telemetry Screen`, to specify granular live file-read/file-change telemetry for agent runs.
- Recreated the local-only `spec/` index because the directory was absent in the current checkout while `.gitignore` and `.git/info/exclude` still ignore it.
