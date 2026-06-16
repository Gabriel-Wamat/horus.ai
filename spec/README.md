# Horus Local Implementation Specs

This directory is a local-only planning workspace for implementation specs that should not be committed to the public repository.

## Active Specs

| ID | Title | Status | File |
| --- | --- | --- | --- |
| 78 | Operational Memory, Spec Traceability, And Agent Context Profiles | implemented | [features/78-operational-memory-traceability-context-profiles.md](features/78-operational-memory-traceability-context-profiles.md) |
| 77 | Agentic Editing Hardening, E2E, And Observability | implemented | [features/77-agentic-editing-hardening-e2e-observability.md](features/77-agentic-editing-hardening-e2e-observability.md) |
| 76 | Structural Patch Intents And Redis Cache | implemented | [features/76-structural-patch-intents-and-redis-cache.md](features/76-structural-patch-intents-and-redis-cache.md) |
| 75 | AST Context And Full Edit Powers | implemented | [features/75-ast-context-and-full-edit-powers.md](features/75-ast-context-and-full-edit-powers.md) |
| 73 | Dedicated Real-Time Agent File Telemetry Screen | implemented | [features/73-dedicated-agent-file-telemetry.md](features/73-dedicated-agent-file-telemetry.md) |
| 74 | Runtime Context And Technical Reflection Loop | implemented | [features/74-runtime-context-and-technical-reflection-loop.md](features/74-runtime-context-and-technical-reflection-loop.md) |

## Operating Rules

- Keep one numbered feature file per implementation scope.
- Keep feature IDs sequential.
- Update this index and `CHANGELOG.md` whenever a local spec is added, changed, implemented, or retired.
- Treat specs as source-of-truth for the current approved scope; future phases remain planning only until explicitly approved.
- Validate `spec/` stays ignored before finishing spec work.
