# Local Spec Changelog

## 1.107.0 - 2026-06-08

- Added professionalization planning specs 109-114: master plan, live preview/file-tree execution spine, runtime visual Curator and DesignBrief evaluator, surface pattern library, Docker/CI/release hardening, and operations/recovery observability control plane.

## 1.106.0 - 2026-05-28

- Implemented feature spec 103: added shared AgentRunbookEntry contracts, deterministic AgentRunbookService projection from operational-session and workflow events, workflow-thread session replay for run snapshots, runbookEntries on HorusRunSnapshot, Agent Flow runbook rendering, preview-progress runbook helpers and focused shared/server/frontend coverage.

## 1.105.0 - 2026-05-28

- Implemented feature spec 102: added shared AgentToolProfile/ToolCapability contracts, capability-backed AgentProfileRegistry summaries and validation, least-privilege Front/QA/Curator/ODIN tool matrices, registration mutability drift checks, runtime mutability evidence from the registry, startup availability validation for active runtime profiles, Agent Flow capability diagnostics and focused shared/server policy coverage.

## 1.104.0 - 2026-05-28

- Implemented feature spec 101: added shared ProjectInspectionProfile contracts, RepositoryScanner-backed ProjectInspectionService, read-only `inspect_project` agent tool, agent profile/server registration wiring, AgentToolLoop inspection-before-mutation behavior, operational-session inspection evidence and focused shared/server regression coverage for generated project inspection.

## 1.103.0 - 2026-05-28

- Implemented feature spec 100: added canonical FileMutationPreflightApplier for create/update/delete mutations with path/writeRoot/symlink/protected-delete checks, stale hash/mtime/size/baseVersion validation, structured failure reasons, planned and actual diff evidence, atomic writes, rollback on partial apply failure, CodeChangeSet compatibility wiring, server tool registration wiring and focused regression coverage for applier, CodeChangeSet and agent tool mutation behavior.

## 1.102.0 - 2026-05-28

- Implemented feature spec 99: added shared AgentOperationalSession/AgentOperationEvent/projection contracts, durable file/Postgres operational-session repositories, Postgres migration 016, AgentToolLoop session/event recording for tool calls/files/commands/diffs/terminal status, seeded read-before-write evidence from session projections and operationalSessionId exposure in workflow/tool-loop metadata.

## 1.101.0 - 2026-05-28

- Implemented feature spec 98: added shared ShellCommand contracts, ShellCommandRuntimePort, ShellCommandRuntime over the existing SafeCliRunner policy substrate, bounded stdout/stderr streaming callbacks, governed `run_command` agent tool, Front/QA capability registration, server startup wiring and focused shell/runtime/policy regression coverage.

## 1.100.0 - 2026-05-28

- Implemented feature spec 97: added shared incremental edit and write-file tool contracts, read-before-edit evidence in `AgentToolRuntime`, exact `oldString`/`newString` replacement with `replaceAll`, stale hash/version checks, line-ending normalization, create-only `write_file`, AgentToolLoop read -> edit/create routing, profile/tool registration updates, and focused shared/server regression coverage.

## 1.99.0 - 2026-05-28

- Added `spec/notes/opencode-source-reuse-map.md` to make specs 97-108 explicitly implementation-oriented around copying or adapting the strongest reusable opencode modules while preserving Horus contracts, shared schemas, runtime ports, profile gates, observability and validation requirements.

## 1.98.0 - 2026-05-28

- Added feature specs 97-108 for the opencode-inspired agent code execution runtime: incremental read-before-write editing, governed shell runtime, operational session ledger, robust mutation preflight/applier, generated project inspection, per-agent tool profiles, automatic runbook projection, semantic command classifier, isolated worktrees, context compaction, advanced REPL/notebook extension gates and live frontend code/tool activity visualization.

## 1.97.0 - 2026-05-28

- Implemented feature spec 96: added repository index manifest/invalidation/cleanup contracts, context budget contracts, task-scoped ephemeral memory via `codingTaskId`, RepositoryIndexLifecycleService, ContextBudgeter, optional ChatCodingPlanner packed-context integration controlled by explicit environment budget, and focused regression coverage for index lifecycle, context packing, task memory isolation and planner budget evidence.

## 1.96.0 - 2026-05-28

- Implemented feature spec 95: added shared semantic retrieval contracts, AST-aware repository chunking, injected embedding/vector store ports, local configurable semantic infrastructure with no hardcoded embedding model id, hybrid lexical/vector/symbol/graph ranking evidence, ChatCodingPlanner semantic context merge, and focused regression coverage for contracts, chunking, ranking, semantic indexing and planner integration.

## 1.95.0 - 2026-05-28

- Implemented feature spec 94: added shared RepositoryGraph contracts, RepositoryGraphBuilderPort and GraphAwareRetrievalPort, deterministic graph construction for files/symbols/imports/exports/package scopes/LSP references, graph-aware bounded neighborhoods with related source-test candidate expansion, disconnected new-file intent detection before patch planning, ChatCodingPlanner graph integration and focused shared/server regression coverage.

## 1.94.0 - 2026-05-28

- Implemented feature spec 93: added shared SymbolIndex contracts, LspClientPort and SymbolIndexPort, a local TypeScript semantic LSP-shaped client for document symbols/definitions/references/diagnostics, SymbolIndexService with timeout/shutdown behavior, ChatCodingPlanner symbol evidence integration and rename safety blocking, plus focused shared/server regression coverage.

## 1.93.0 - 2026-05-28

- Implemented feature spec 92: added shared Horus chat coding evidence contracts, deterministic ChatCodingPlannerPort/ChatCodingPlanner backed by repository retrieval and Tree-sitter AST evidence, automatic chat-to-CodingRuntimeOrchestrator execution with structuralPatchIntents metadata, durable diff/validation/apply evidence in chat, Preview chat coding evidence rendering, and focused backend/frontend validation coverage.

## 1.92.0 - 2026-05-28

- Added Phase 2 Repository Intelligence Layer specs 92-96: chat-to-structural-intent runtime bridge, LSP symbol index/navigation, repository symbol graph/dependency map, embeddings/vector hybrid retrieval/ranking, and index/memory lifecycle with context budgeting. The plan explicitly carries the validation command gate for `test`, `build`, `type-check`, `lint` or `check`, and the chat/planner bridge to generate real structural intents, run the coding runtime automatically and return diff/apply evidence in chat.

## 1.91.0 - 2026-05-28

- Implemented feature spec 91: added shared CodingValidation contracts, deterministic ValidationCommandSelector, CodingValidationRunner, SafeCliValidationCommandRunner, isolated CodeChangeSetValidationWorkspace, CodingPatchApplier, coding runtime failed-artifact stop semantics, server runtime wiring and focused tests for command selection, policy rejection, validation pass/fail/timeout/skipped behavior, patch apply blocking and runtime no-apply-on-validation-failure.

## 1.90.0 - 2026-05-28

- Implemented feature spec 90: added shared StructuralPatch contracts, PatchPlannerPort, AstPatchPlanner, deterministic DiffBuilder, AstPatchValidationGate, structural preconditions in CodeChangeSet file planning, content-hash conflict rejection, rollback regression coverage, server coding runtime wiring and focused structural patch/diff/rollback validation tests.

## 1.89.0 - 2026-05-28

- Implemented feature spec 89: added shared AST contracts, AstAnalyzerPort, AstAnalysisService, Tree-sitter TypeScript/TSX/JS/JSX parser adapter, deterministic symbol/range extraction, parse/unsupported diagnostics, coding runtime AST artifact wiring, parser dependencies and focused AST/runtime integration tests.

## 1.88.0 - 2026-05-28

- Implemented feature spec 88: added shared repository scan/retrieval contracts, safe RepositoryScanner and TextRepositoryRetriever ports/services, centralized read-only repository access policy, blocked/no-match/partial retrieval states, routing hints, coding runtime scan/retrieval wiring, ReadOnlyCodeContextService delegation, and focused scanner/retriever/context regression tests.

## 1.87.0 - 2026-05-28

- Implemented feature spec 87: added shared CodingRuntime contracts, deterministic coding state machine, coding runtime orchestrator with port-owned steps, file/Postgres coding task persistence, `/api/coding` lifecycle routes, runtime config wiring, Postgres migration 015, and Horus chat fallback integration that can create coding tasks through the orchestrator without bypassing lifecycle state.

## 1.86.0 - 2026-05-28

- Added feature specs 87-91 for Phase 1 of the lightweight coding assistant roadmap: deterministic coding runtime/state machine, repository scanner/text retrieval, Tree-sitter AST analysis spine, AST patch/diff/safe apply/rollback, and validation runner/command policy.

## 1.85.0 - 2026-05-28

- Fixed the feature spec 85 chat incident: moved the local Horus backend/proxy default away from the occupied `localhost:3000`, added stream-empty fallback to avoid completed blank/generic assistant replies, skipped code retrieval cards for direct conversational replies, and validated a real in-browser chat response with no `Failed to fetch`.

## 1.84.0 - 2026-05-28

- Hardened feature spec 85 phase 5 after the no-mock runtime correction: removed the fabricated idle Agent Flow run/zero UUID path, preserved persisted specs through real workspace state instead of synthetic `WorkflowState`, and documented that chat/preview validation must use real runtime/API state or explicit empty/error UI.

## 1.83.0 - 2026-05-28

- Implemented feature spec 85 phase 5 without adding mock chat/project fixtures: made the Vite API proxy target configurable, extended the real Preview browser smoke to validate chat panel/composer/scope readiness plus desktop/mobile overflow, and recorded live stack validation against real Horus API/project state.

## 1.82.0 - 2026-05-28

- Implemented feature spec 85 phase 4: added bounded Horus chat context assembly with compact summary reuse, connected responder prompts to the budgeted context, improved code-context ranking with explicit path hints and capped content scans, exposed retrieval status/notes through shared contracts and Preview evidence UI, and added focused regression coverage for context budget and retrieval grounding.

## 1.81.0 - 2026-05-28

- Implemented feature spec 85 phase 3: added product-grade chat scope/status/timeline rendering, retry/copy-details affordances, code/file/evidence rendering, composer readiness copy, responsive Preview stacking below 900px, and fixed the unstable project-scope callback loop that kept chat loading indefinitely.

## 1.80.0 - 2026-05-28

- Implemented feature spec 85 phase 2: extracted Preview chat scope, session loading, polling, submit/cancel, stream event mutation and workflow progress replay out of `VisualPreviewConsole` into focused visual-preview hooks/utilities, reducing the component from 896 to 252 lines and updating frontend guards for the new boundaries.

## 1.79.0 - 2026-05-28

- Implemented feature spec 85 phase 1: added durable chat turn lifecycle metadata, idempotent duplicate-submit replay, cooperative cancellation from UI to server/responder, visible cancelled/failed terminal records, sequence-safe file/Postgres chat persistence, Postgres idempotency guard migration and focused validation coverage.

## 1.78.0 - 2026-05-28

- Added feature spec 85: Chat Experience Product Hardening, evaluating 3 to 7 remediation phases and selecting a five-phase plan for chat turn safety, runtime decomposition, product UX, context/retrieval quality and behavior-level validation.

## 1.77.0 - 2026-05-28

- Added feature spec 84: Production Critical Closure, planning the next P0/P1 remediation slice for the verified remaining blockers: local secret hygiene, route-level RBAC, rate limiting, persistence/projection failure semantics, release gates, dependency audit closure, readiness checks, observability minimums and tightly scoped decomposition.

## 1.76.0 - 2026-05-28

- Added feature spec 83: Provider Port Decoupling, mapping direct coupling across LLM providers, repository contracts, preview runtime, workflow orchestration, embeddings, vector DB, storage and queue boundaries.
- Implemented the first feature spec 83 slice: added application ports for LLM, embeddings, vector store, queue and storage; added a LangChain LLM adapter; added a runtime LLM settings store port; refactored Horus/Odin intent classification to receive a model provider through composition; and added boundary regression coverage.
- Extended feature spec 83 implementation: moved repository contracts to application ports, added preview/project service ports, removed remaining direct infrastructure imports from application/domain, and strengthened boundary tests against future regressions.

## 1.75.0 - 2026-05-28

- Added feature spec 82: Production Boundary Release Readiness, identifying the remaining SPEC 78/77 cuts and planning fail-closed CORS/auth/tenant boundaries, file-driver production guardrails, readiness, secret scanning, CI, Docker and release hygiene implementation.
- Implemented feature spec 82: added production fail-closed CORS/auth/tenant guards, file-driver production safety flag, `/ready`, secret scanning and `verify:ci`, GitHub Actions CI, Docker base artifacts, Vite manual chunking and Turbo docs outputs.

## 1.74.0 - 2026-05-28

- Added feature spec 81: Agentic LLM Tool Abort And Distributed Breaker, planning the closure of SPEC 80 residual risks by threading AbortSignal into LLM/tool execution and persisting circuit breaker state through the runtime repository composition root.

## 1.73.0 - 2026-05-28

- Added feature spec 80: Agentic Isolation Cancellation And Breaker Store, planning the closure of SPEC 79 residual risks by adding cooperative AbortSignal context and a circuit breaker store port before broader LLM/tool cancellation work.

## 1.72.0 - 2026-05-28

- Added feature spec 79: Agentic Runtime Isolation, defining the remediation plan for single-responsibility agent runtime policies, centralized graph node isolation, deterministic timeout/retry/circuit breaker behavior and stale-lease dead-letter queue semantics.

## 1.71.0 - 2026-05-28

- Added feature spec 78: Production Readiness P0 Remediation, turning the latest production-grade audit into a sequenced remediation plan and starting the first implementation slice for workflow status persistence, Preview env safety, broken docs tests and follow-on security/concurrency/release phases.

## 1.70.0 - 2026-05-28

- Implemented feature spec 76: hardened durable restart recovery by retrying failed file/Postgres outbox rows, completing terminal `workflow.start` replays without rerunning the graph, adding restart/chaos regression coverage for file checkpointer continuity, terminal outbox recovery and dead-letter evidence, and documenting the recovery runbook.

## 1.69.0 - 2026-05-28

- Implemented feature spec 75: split VisualPreviewConsole helpers into visual-preview feature modules, extracted FrontAgent structured-output schemas and deterministic fallback templates/CSS, decomposed index.css into feature-level stylesheets, updated regression guards for moved modules, and documented explicit remaining line-budget exceptions for the next decomposition pass.

## 1.68.0 - 2026-05-28

- Implemented feature spec 74: added shared Horus error taxonomy and recovery decision contracts, policy-based recovery classification, typed recovery/fallback workflow events, chat/memory/Preview projection, artifact evidence recovery emission, blocked-tool fallback emission and focused validation coverage.

## 1.67.0 - 2026-05-28

- Added feature specs 73, 74, 75, 76 and 77 for product-grade hardening: workflow/chat/memory contract spine, typed error taxonomy and recovery engine, monolith decomposition, durable restart/chaos validation, and production observability/release hygiene.
- Started feature spec 73 by adding the shared WorkflowEvent -> HorusRunEventSnapshot projection contract, migrating server/web run-flow consumers to it, and adding focused golden coverage for workflow event projection.

## 1.66.0 - 2026-05-28

- Implemented feature spec 69: repaired the docs lint gate with ESLint flat config and hook-safe docs components, hardened SafeCliRunner environment inheritance, kept CodeChangeSet preflight isolated while excluding install/dev/start from curator validation, extracted WorkflowOrchestrator event projection/state persistence/CodeChangeSet lifecycle services, and recorded focused plus full validation evidence.

## 1.65.0 - 2026-05-28

- Implemented feature spec 72: added shared workflow tool events, AgentToolLoop, Front Agent tool-mode execution through governed edit/delete/diff tools, startup profile/tool validation, run-flow and Preview progress projection, selected-project chat filtering, and focused backend/frontend regression coverage.

## 1.64.0 - 2026-05-28

- Added feature spec 72: Agent Tool Runtime ReAct Loop And E2E Closure, defining the plan to close remaining runtime gaps after spec 71, including bounded agent tool loops, durable tool events, project-scoped chat switching, startup capability validation, frontend progress projection and browser E2E proof.

## 1.63.0 - 2026-05-27

- Added feature spec 70: CodeChangeSet Delete And Safe File Mutation Semantics, defining first-class create/update/delete operation contracts, delete-safe preflight/apply behavior, rollback semantics, path safety, persistence roundtrip and validation requirements.
- Added feature spec 71: Agent Tool Runtime With Governed Edit Save Delete Update, defining the plan for real agent tool access through governed edit/save/delete/update capabilities, per-agent policy boundaries, optional ReAct tool mode, durable tool evidence, chat/Preview status projection and safety validation.

## 1.62.0 - 2026-05-27

- Added feature spec 69: Release Hardening And Orchestrator Modularization, defining the executable plan for the four highest-severity audit findings: repairing the broken docs lint gate, isolating CodeChangeSet preflight away from the real project root, sanitizing SafeCliRunner environment inheritance, and extracting WorkflowOrchestrator responsibilities behind stable LangGraph-compatible contracts.

## 1.61.0 - 2026-05-27

- Implemented feature spec 68: added stale running workflow reconciliation, legacy workflow_state repair for rows without ledger runs, explicit error terminalization for orphaned runs, persisted event-history evidence for recovery, project/workspace context rejection before mutable Preview chat work, safe SSE parsing for Preview and Agent Flow clients, node-completed/error activity replay, and focused regression validation.

## 1.60.0 - 2026-05-27

- Added feature spec 68: Preview Chat Durable Workflow Recovery, defining the fix plan for accepted Preview chat actions that remain stuck without terminal status, including durable ledger/outbox ownership for chat code-change workflows, stale-run recovery, project context guards, safe SSE parsing, persisted chat/progress projection, frontend activity mapping and focused validation.

## 1.59.0 - 2026-05-27

- Implemented feature spec 67: added artifact candidate/evidence/trace schemas, CodeChangeSet candidate lineage, file/Postgres artifact control-plane persistence, migration 011, candidate/evidence services, self-healing classification, Curator candidate propagation, approved-candidate application and focused validation coverage for stale candidate selection, failed apply blocking and Postgres schema integrity.

## 1.58.0 - 2026-05-27

- Implemented feature spec 66: added shared agent memory/prompt-context contracts, file/Postgres memory repositories, Postgres migration 010, AgentMemoryService, PromptContextAssembler, runtime skill injection/auditing for Spec/Odin/Front/QA/Curator, workflow episodic memory, compact chat summaries, prompt diagnostics and focused/full validation coverage.

## 1.57.0 - 2026-05-27

- Implemented feature spec 65: added ordered event-sourced chat metadata, Postgres migration 009, file/Postgres repository cursor reads, workflow-event-to-chat projection, compact user-visible progress messages, developer-only trace persistence, SSE IDs/heartbeat handling, frontend replay from persisted chat messages and regression coverage for message sequencing and progress dedupe.

## 1.56.0 - 2026-05-27

- Added research catalog `spec/notes/ai-agent-engineering-strategy-catalog.md`, summarizing durable execution, event-sourced chat, memory taxonomy, runtime skills, ACI, self-healing, observability and human-in-the-loop strategies for Horus agent reliability.
- Added feature spec 64: Durable Agent Execution Ledger And Outbox, defining turn/run/attempt/outbox/lease persistence, idempotent workflow start, startup recovery and explicit terminal-state rules.
- Added feature spec 65: Event-Sourced Chat And Progress Streaming, defining persisted chat events, resumable SSE, compact progress messages, replay after reload and server-side workflow progress projection.
- Added feature spec 66: Agent Memory And Runtime Skills Governance, defining scoped working/episodic/semantic/procedural memory, prompt budget assembly, runtime skill injection and skill usage audit.
- Added feature spec 67: Artifact Validation Self-Healing And Observability Control Plane, defining candidate artifact IDs, validation evidence lineage, self-healing retry policy, true success semantics and structured traces.

## 1.55.0 - 2026-05-27

- Implemented feature spec 63: added repo-local Playwright browser validation for Preview screenshots/API/DOM checks, plus a read-only worktree spec audit command with fixture tests and focused staging guidance.

## 1.54.0 - 2026-05-27

- Added feature spec 63: Browser Visual Validation And Worktree Hygiene, defining a repo-local browser validation plan for Preview screenshots/DOM checks and a read-only worktree audit plan to separate mixed spec changes before commit/push.

## 1.53.0 - 2026-05-27

- Implemented feature spec 62: added preview project lifecycle/health/canonical metadata, Postgres migration 007, Postgres/file repository support, runtime health auditing, default curated project listing, explicit hidden/all visibility filtering, unhealthy preview start blocking, wrong-owner preview URL evidence and compact Preview UI health controls.
- Validated the implementation with `pnpm test`, `pnpm --filter @u-build/web test:guards`, API smoke checks for visible/all project lists, canonical preview start and hidden scaffold start blocking.

## 1.52.0 - 2026-05-27

- Added feature spec 62: Preview Project Registry Hygiene And Canonical Delivery, defining the cleanup plan for duplicate, stale, scaffold-only and wrong-port preview projects, plus health/lifecycle metadata, canonical selection, runtime ownership checks, UI filtering and repair validation.
- Updated the local spec index to include feature specs 59, 60, 61 and 62.

## 1.51.0 - 2026-05-27

- Implemented feature spec 58: added a versioned frontend pattern library, component policy and anti-pattern references, bounded skill reference loading, Spec/Front/Curator prompt enforcement for selected patterns, and regression coverage for pattern guidance in runtime prompts.

## 1.50.0 - 2026-05-27

- Implemented feature spec 57: added shared VisualGateResult contracts, a mockable VisualDesignGateService, Curator visual blocking before LLM approval, Front Agent retry feedback tagged as visual, compact Preview chat visual validation messaging, and shared/server/web validation coverage.

## 1.49.0 - 2026-05-27

- Implemented feature spec 56: added shared visualContract and DesignContextBundle contracts, bounded/redacted design context extraction from real project files, prompt wiring for Spec/Front/QA/Curator agents, compact spec review rendering, agent skill updates, and schema/server/web validation coverage.

## 1.48.0 - 2026-05-27

- Added feature spec 56: Visual Contract And Design System Context For Generated Frontends, defining the shared visual identity contract, project design context extraction, agent prompt injection, persistence, tests and rollout plan for consistent generated UI.
- Added feature spec 57: Screenshot-Based Visual Curator Gate For Generated Frontends, defining rendered screenshot validation, objective visual anti-pattern checks, curator/Odin integration, evidence persistence and failure feedback before applying generated frontend changes.
- Added feature spec 58: Frontend Pattern Library And Agent Skill Upgrade, defining reusable frontend patterns, agent skill upgrades, pattern selection, prompt rubrics, validation and tests to raise first-pass generated UI quality.

## 1.47.0 - 2026-05-27

- Implemented feature spec 55: added secure project ZIP export through ProjectArchiveService, Project Files download route, toolbar download action with dirty-editor guard, backend ZIP content tests, route attachment test, frontend guard coverage and browser smoke validation.

## 1.46.0 - 2026-05-27

- Added feature spec 55: Project Files Download ZIP, defining a secure backend-streamed ZIP export for the selected generated project, with safe root resolution, archive exclusion rules, dirty-editor UX, toolbar integration, validation commands, observability, and ZIP content inspection requirements.

## 1.45.0 - 2026-05-27

- Added feature spec 54: Professional Project Documentation, defining a rigorous documentation package with a robust root README, architecture docs, runbook, configuration reference, chronological engineering history, contributing guide, validation checks, and evidence rules.

## 1.44.0 - 2026-05-27

- Added feature spec 53: Portable Docker Runtime, defining a rigorous Dockerization plan for cross-OS app execution, file-mode and Postgres persistence, env contracts, volumes, health checks, generated preview constraints, and validation evidence without machine-specific hardcodes.

## 1.43.0 - 2026-05-27

- Added feature spec 52: Local Persistence Hardening Completion, narrowing the remaining SPEC 51 gaps into atomic JSON writes, safe legacy data handling, checkpoint API inspection, and validation requirements before claiming full file-mode durability.

## 1.42.0 - 2026-05-27

- Added feature spec 51: Local Persistence Portability, defining the executable plan to centralize file-mode persistence under `HORUS_DATA_DIR`, preserve Postgres mode, remove machine-specific paths, make preview runtime state restart-safe, address file-mode workflow checkpoint behavior, and validate macOS/Windows/Linux portability.

## 1.41.0 - 2026-05-27

- Added feature spec 50: Preview Chat Command Center With Real Streaming, defining a real backend-to-frontend streaming architecture for immediate chat submission, typed stream events, optimistic reconciliation, action lifecycle cards, evidence rendering, validation and recovery.

## 1.40.0 - 2026-05-27

- Implemented feature spec 49: replaced the Project Files textarea/highlight surface with a Monaco-based IDE editor, local language mapping, status bar, Cmd/Ctrl+S save command, dirty/conflict state preservation and frontend regression guard coverage.

## 1.39.0 - 2026-05-27

- Added feature spec 49: Project Files IDE experience, planning the replacement of the current file viewer/textarea surface with an IDE-like editor, stable explorer, tabs, status bar, Monaco-style editing, safe Cmd/Ctrl+S persistence, conflict handling and regression guardrails.

## 1.38.0 - 2026-05-26

- Added feature spec 48: frontend architecture remediation plan, decomposing the negative frontend findings into executable specs for App shell boundaries, User Stories componentization, design-system/CSS modularization, Project Files editor stability, unified live data, Agent Flow interaction policy and frontend regression guardrails.
- Implemented the spec 48 remediation sequence: extracted App navigation/workspace/workflow runtime boundaries, isolated story creation dialog focus handling, added shared UI primitives, stabilized User Stories folder expansion, made Project Files dirty state path-scoped, paused syntax highlighting during editing, centralized SSE stream handling, hardened Agent Flow manual interaction policy and added frontend regression guard tests.

## 1.37.0 - 2026-05-26

- Implemented feature spec 41: runtime QA validation and agent observability foundation.
- Added shared `RuntimeValidationEvidence` schemas for command evidence, preview smoke evidence, skipped reasons and pass/fail state.
- Added `validation_evidence` workflow events and exposed runtime evidence in Horus run-flow snapshots.
- Extended QA output to carry executable runtime evidence derived from real preview smoke checks.
- Extended Curator prompt and hard prechecks so failed runtime evidence blocks approval before LLM scoring.
- Added `ProjectQualityGateService` runtime evidence output for command validation and explicit skipped evidence when no validation commands exist.
- Fixed code-context fallback file selection so older projects are not forced to read React scaffold files that do not exist.
- Recorded shared/server/web type-checks, server build and focused runtime-evidence, chat, preview, curator and workflow tests.

## 1.36.0 - 2026-05-26

- Implemented feature spec 40: generated frontend multi-framework architecture foundation.
- Added a stack adapter contract with React/Vite/TypeScript and explicit HTML/CSS/JS support, plus clear errors for contract-only future stacks.
- Replaced the default generated project scaffold with a modular React/Vite/TypeScript app structure.
- Updated preview project registration to use the generated project command catalog instead of a hardcoded static dev server.
- Hardened FrontAgent prompt and front-design skill to require project-aware source operations instead of standalone HTML in framework projects.
- Extended frontend quality gate to reject standalone HTML artifacts for React projects and check source syntax for changed TS/JS files.
- Recorded server/web type-checks, server build, focused scaffold/quality-gate/front-agent tests, and skill validation.

## 1.35.0 - 2026-05-26

- Implemented feature spec 39: agentic orchestration integrity and post-Curator apply.
- Added explicit CodeChangeSet lifecycle states for proposed, curator rejected, curator approved and applied.
- Routed project construction through the multiagent workflow instead of direct project-plan execution.
- Added Postgres migration coverage for the new workflow mode and CodeChangeSet statuses.
- Added focused tests proving FrontAgent output is not applied before Curator approval, approved changes are applied, rejected changes are blocked, and project construction delegates selected user stories/specs to the workflow.

## 1.34.0 - 2026-05-26

- Added feature spec 42: agentic execution loop with persisted phases, normalized events, retries tied to failed evidence and strict completion transitions.
- Added feature spec 43: specialized subagents and tool boundaries with agent profiles, allowed/forbidden tools and deny-by-default enforcement.
- Added feature spec 44: project agent manifest and progressive context, defining a machine-readable project manifest that orients agents without replacing real code evidence.
- Added feature spec 45: structured agent tools without free shell, wrapping read/search/save/apply/validate/diff operations behind schemas, permissions and audit events.
- Added feature spec 46: agent progress UX and evidence panel, covering per-agent activity, files, tools, validation, errors and stable interaction state.
- Added feature spec 47: validation gates and true success semantics, preventing completed status unless required gates pass or unverified/skipped gates are explicitly disclosed.
- Implemented feature spec 42: normalized agentic run phases/events, patch proposed/applied events, currentPhase snapshots, drawer phase timeline and focused run-flow tests.
- Implemented feature spec 43: specialized agent profiles, deny-by-default tool registry, profile metadata in run snapshots and drawer capability summaries.
- Implemented feature spec 44: versioned Horus project manifest persisted in project roots, exposed by API and loaded as non-authorizing progressive code context.
- Implemented feature spec 45: structured agent tools with Zod input/output contracts, permission enforcement, audit/redaction, file/search/save/diff/change-set/validation wrappers and raw-shell rejection.
- Implemented feature spec 46: agent evidence summaries and drawer panel for files, tools, commands, validation gates and errors.
- Implemented feature spec 47: validation gate contracts, derived final success semantics and UI status handling for unverified, failed validation and blocked states.

## 1.33.0 - 2026-05-26

- Implemented feature spec 28: QA preview smoke validation.
- Added bounded preview reachability validation for running sessions with runtime evidence.
- Attached QA smoke evidence to QA output and Curator input.
- Made Curator reject QA output when preview smoke evidence exists and did not pass.
- Forwarded `previewSessionId` from Horus chat code-change requests into workflow state.
- Recorded server build, required spec 28 tests, and focused chat/curator regression validation.

## 1.32.0 - 2026-05-26

- Added feature spec 39: agentic orchestration integrity and post-Curator CodeChangeSet apply.
- Added feature spec 40: generated frontend multi-framework architecture, with React/TypeScript/Vite as the first mandatory adapter and explicit support path for React, Vue, Svelte, Angular, Next.js, Nuxt, Astro, Remix, Vite vanilla, HTML/CSS/JavaScript and TypeScript variants.
- Added feature spec 41: runtime QA validation and agent observability.
- Split the correction plan into three executable SDDs so orchestration integrity, frontend architecture, and validation/observability can be implemented independently without mixing responsibilities.

## 1.31.0 - 2026-05-26

- Added feature spec 38: grounded chat code intelligence.
- Documented current chat gaps: code contents are read but not injected into the prompt, retrieval is path-term based, response evidence is too weak, UI hides consulted files, and no-match behavior is not explicit.
- Required line-numbered code excerpts, stronger retrieval, evidence-aware chat outcomes, frontend source rendering, ASK/ACTION safety checks and a rigorous completion checklist.

## 1.30.0 - 2026-05-26

- Rewrote feature spec 37: real project file write layer.
- Added the verified reference-implementation finding that its code screen is read-only and exposes only tree/file GET routes.
- Specified the Horus write contract in detail: `PUT /api/project-files/projects/:projectId/file`, shared version schemas, SHA-256 conflict checks, path safety, sensitive/binary/truncated-file rejection, atomic temp-file rename, save UX states, cache refresh and focused test matrix.

## 1.28.0 - 2026-05-26

- Added feature spec 35: project Code Intelligence AST backend.
- Planned an AST-backed backend module separate from the file browser, inspired by reference file-intelligence patterns.
- Required shared project/run root resolution with spec 33, TypeScript/JavaScript AST parsing, dependency graph, impact analysis, route contracts, security limits and focused tests.

## 1.26.0 - 2026-05-26

- Added feature spec 31: agentic system hardening roadmap.
- Recorded all known agentic-system correction phases: structured routing, persistent checkpoint, real patch executor, code-aware Front Agent, runtime QA, evidence-based Curator, executable spec generation, chat context anchoring, agent observability, and code context retrieval.
- Implemented phase 1 of spec 31 by replacing regex-based Horus/Odin chat intent routing with an async LLM structured classifier.
- Added shared `previewAction` contract for controlled preview lifecycle decisions.
- Removed regex lifecycle inference from `SubmitHorusChatTurnUseCase`.
- Recorded shared build, server type-check/build, and focused router/chat/provider tests.

## 1.25.0 - 2026-05-26

- Implemented feature spec 27: preview runtime observability.
- Added sanitized bounded runtime evidence for preview success and failure events.
- Split successful preview startup timeline into `preview_started` and `preview_ready`.
- Added concise runtime evidence display to the Preview timeline UI.
- Added tests for evidence persistence, truncation, secret redaction, and existing preview lifecycle compatibility.
- Recorded server build, web build, focused spec 27 tests, and preview adapter/command policy regression tests.

## 1.24.0 - 2026-05-26

- Implemented feature spec 26: preview command policy and catalog.
- Added additive shared `previewCommandId` and `commandCatalog` metadata for frontend projects.
- Added backend `PreviewCommandResolver` so preview execution resolves command ids to structured command specs.
- Preserved legacy `devCommand` as a migration fallback while removing direct raw command parsing from the process adapter.
- Hardened command policy to reject network transfer executables.
- Added focused tests for command id resolution, policy denial, shared schema compatibility, and adapter integration.
- Recorded shared build, server build, and spec 26 focused test validation.

## 1.23.0 - 2026-05-26

- Implemented feature spec 25: process-backed browser preview adapter.
- Added `ProcessBrowserPreviewAdapter` with real process start/stop, readiness polling, process evidence, and startup failure handling.
- Wired preview runtime in `server.ts` to use the process-backed adapter.
- Updated `PreviewRuntimeManager` to persist `error` state and emit `preview_error` when startup fails.
- Added focused adapter lifecycle tests and recorded server build plus CLI/preview lifecycle validation.
- Noted local runtime smoke constraint: an existing Vite process was already occupying `localhost:5174`, so the adapter now includes post-readiness process stability protection.

## 1.22.0 - 2026-05-26

- Implemented feature spec 24: real CLI capability gate.
- Added backend `SafeCliRunner` and `CliCommandPolicy`.
- Added tests proving real spawned CLI execution, command evidence capture, blocked dangerous commands, blocked non-allowlisted executables, and timeout handling.
- Recorded `pnpm --filter @u-build/server build` and focused CLI gate test validation.

## 1.21.0 - 2026-05-26

- Created root `tools/` workspace for project-owned safe tool planning.
- Added feature spec 24: mandatory real CLI capability gate.
- Added feature spec 25: process-backed browser preview adapter.
- Added feature spec 26: preview command policy and catalog.
- Added feature spec 27: preview runtime observability.
- Added feature spec 28: QA preview smoke validation.
- Added feature spec 29: chat runtime evidence integration.
- Marked real CLI capability validation as the mandatory first implementation priority for the whole tool sequence.

## 0.1.0 - 2026-05-26

- Created local-only `spec/` workspace.
- Added one correction spec per planned remediation item.
- Added folder-level versioning and implementation logging conventions.

## 0.2.0 - 2026-05-26

- Implemented correction 01: latest successful agent artifact selection.
- Added regression coverage for correction 01.
- Recorded `pnpm type-check`, `pnpm build`, and `pnpm test` validation for correction 01.

## 0.3.0 - 2026-05-26

- Implemented correction 02: curador now receives QA test cases with latest HTML.
- Added regression coverage for curator input selection.
- Recorded `pnpm type-check` and `pnpm test` validation for correction 02.

## 0.4.0 - 2026-05-26

- Implemented correction 03: spec rejection now resumes backend and terminates as `cancelled`.
- Added regression coverage for HITL approval resolution.
- Recorded `pnpm type-check` and `pnpm test` validation for correction 03.

## 0.5.0 - 2026-05-26

- Implemented correction 04 short-term guard: non-resumable in-memory checkpoints now return clear 409 responses.
- Added pure checkpoint detection helper and regression coverage.
- Recorded `pnpm type-check` and `pnpm test` validation for correction 04.

## 0.6.0 - 2026-05-26

- Implemented correction 05: focused offline regression coverage.
- Added test coverage for artifact generation and QA-only Odin routing.
- Implemented correction 06: validation runbook updated with executed offline checks.
- Recorded `pnpm type-check` and `pnpm test` validation for correction 05 and 06.

## 0.7.0 - 2026-05-26

- Added feature spec 07: multiprovider LLM support for OpenAI, OpenRouter, and Groq.
- Planned a bottom-up implementation path before runtime changes.
- Revised feature spec 07 after checking LangChain JS provider support: prefer ready provider wrappers `ChatOpenAI`, `ChatOpenRouter`, and `ChatGroq` behind a local factory.

## 0.8.0 - 2026-05-26

- Implemented feature spec 07: multiprovider LLM runtime.
- Added server LLM config and chat model factory layers.
- Refactored Spec, Front, QA, and Curator agents to use the centralized factory.
- Installed required LangChain provider dependencies and removed unused Anthropic dependency.
- Added `.env.example` provider documentation and offline provider config tests.
- Recorded `pnpm type-check` and `pnpm test` validation for spec 07.

## 0.9.0 - 2026-05-26

- Added feature spec 08: frontend LLM settings modal opened from the sidebar configuration button.
- Planned the UI and backend/shared contract required for user-provided provider, API key, and model settings.
- Added explicit secret-handling rules to avoid persisting API keys in workflow state, events, artifacts, or logs.

## 1.0.0 - 2026-05-26

- Implemented feature spec 08: frontend LLM settings modal.
- Added shared LLM settings schema and optional workflow start payload.
- Added thread-scoped in-memory backend runtime settings for UI-provided provider/model/API key.
- Wired all LLM-backed agents to consume the runtime settings snapshot through the existing factory.
- Added modal UI with provider/model/API-key controls and icon-based show/hide toggle.
- Added offline tests for shared schema, start payload validation, runtime settings store, and runtime provider override.
- Added regression coverage confirming `StartWorkflowUseCase` forwards UI-provided LLM settings to the orchestrator.
- Recorded `pnpm type-check`, `pnpm test`, `pnpm build`, and Chrome visual validation for spec 08.

## 1.1.0 - 2026-05-26

- Added feature spec 09: two-interface user story and spec workspace.
- Planned dedicated authoring and spec-inspection interfaces while preserving current story creation behavior.
- Added UX scenarios, visual identity constraints, component plan, state model, and validation protocol for the frontend redesign.

## 1.2.0 - 2026-05-26

- Implemented feature spec 09 frontend workspace changes.
- Added sidebar navigation for story authoring and specs while removing the unused sidebar activity button.
- Added a per-story spec workspace with story rail, selected detail, and User Story/SPEC (SDD) toggle.
- Preserved existing creation/spec-generation/HITL behavior without changing shared schemas, API payloads, or backend workflow contracts.
- Recorded `pnpm type-check`, `pnpm build`, `pnpm test`, and local HTTP smoke validation for spec 09.

## 1.3.0 - 2026-05-26

- Revised feature spec 09 implementation after clarification that creation and visualization must be on the same screen.
- Removed the separate sidebar Specs navigation mode and kept only the User Stories surface plus settings.
- Confirmed the revision stayed frontend-only with no shared schema, API, or backend contract changes.
- Recorded `pnpm type-check`, `pnpm build`, and `pnpm test` validation for the revised UI.

## 1.4.0 - 2026-05-26

- Revised feature spec 09 UI so user-story creation opens in a large modal from the main User Stories workspace.
- Removed visible non-actionable workflow/inspector panels from the interface.
- Preserved the reference-image structure with a story rail and selected story/spec detail while keeping Horus.AI visual identity.
- Recorded `pnpm type-check`, `pnpm build`, and `pnpm test` validation.

## 1.5.0 - 2026-05-26

- Added feature spec 10: workspace folders for user stories.
- Planned folder selection/creation inside the user-story modal.
- Planned server-side workspace storage where every submitted user story is saved in its own directory.

## 1.6.0 - 2026-05-26

- Implemented feature spec 10: workspace folders for user stories.
- Added shared workspace folder schemas, local file workspace storage, and workspace folder API routes.
- Updated workflow start to require `workspaceFolderId` and save each submitted user story into its own directory before orchestration.
- Added folder select and create-folder controls to the user-story modal.
- Added focused shared/server tests and recorded `pnpm type-check`, `pnpm build`, and `pnpm test` validation.
- Added runtime smoke evidence for folder creation and per-story directory persistence.

## 1.7.0 - 2026-05-26

- Added feature spec 11: folder tree UI with user stories indented under their workspace folder.
- Added feature spec 12: isolated revisioned workspace artifact layout for stories and specs.
- Added feature spec 13: agent consumption contract for workspace-scoped user story/spec context.
- Added feature spec 14: future chat context memory for iterative change requests.
- Added feature spec 15: explicit spec generation and editable user story/spec controls.
- Implemented the visible portion of spec 11: folder tree with indented user stories.
- Implemented the initial visible portion of spec 15: `Gerar specs` button on the User Stories screen.
- Refined spec 11 UI after reference-image review: folder cards, metrics, progress, and stronger action hierarchy.
- Extended spec 15 with visible icon actions and persisted user-story edit/delete endpoints.

## 1.8.0 - 2026-05-26

- Implemented feature spec 12: workspace artifact versioning for user stories and specs.
- Added per-story `active.json`, `manifest.json`, and append-only `revisions/*.json` files while preserving `user-story.json` compatibility.
- Added per-spec `active.json`, `manifest.json`, and append-only `revisions/*.json` under the owning story directory.
- Carried `workspaceFolderId` through workflow state so generated and HITL-edited specs persist into the correct workspace folder.
- Added additive revision metadata exposure through `/api/workspace/folders/:folderId/artifacts` and the existing user-stories list response.
- Added regression coverage for initial story revision creation, edit revision creation, spec revision creation, and cross-folder story/spec rejection.
- Recorded `pnpm type-check`, `pnpm test`, backend restart, API PATCH/list/artifacts smoke checks, disk inspection, and Chrome visual validation.

## 1.9.0 - 2026-05-26

- Implemented feature spec 13: agent workspace context consumption.
- Workflow start now resolves canonical active user-story revisions from the selected workspace folder before agent execution.
- Added workspace artifact context to workflow state, including workspace folder and consumed story/spec revision ids.
- Spec, Front, QA, and Curator agent results now record consumed artifact metadata when available.
- Prevented stale flat user-story payloads from overriding active workspace revisions unless they are first persisted as explicit workspace edits.
- Added regression coverage for active revision resolution, new-story persistence during workflow resolution, and AgentResult artifact metadata.
- Recorded `pnpm type-check`, `pnpm test`, backend restart, API smoke checks, and Chrome visual validation.

## 1.10.0 - 2026-05-26

- Implemented feature spec 14: chat context memory for iterative change requests.
- Added shared schemas for chat sessions, messages, context snapshots, append inputs, and agent context bundles.
- Added file-backed chat memory persistence scoped by workspace folder and user story.
- Added context snapshot capture for every appended chat message using current workspace artifact revisions.
- Added agent context builder that returns chat history, active story, active spec, artifact context, and previous workflow outputs.
- Added `/api/chat` routes for sessions, messages, and agent context retrieval.
- Added regression coverage for missing-story session rejection, snapshot persistence, and full agent context assembly.
- Recorded `pnpm type-check`, `pnpm test`, backend restart, chat API smoke checks, and Chrome visual validation.

## 1.11.0 - 2026-05-26

- Completed feature spec 15: explicit spec generation and editable user story/spec controls.
- Added persisted workspace spec update route and workspace store support for active spec reads/updates.
- Updated the User Stories workspace to load saved specs from folder artifacts and expose an editable SPEC (SDD) detail.
- Added frontend API support for loading story/spec artifacts and patching active specs.
- Added regression coverage for mismatched spec update rejection.
- Recorded `pnpm type-check`, `pnpm test`, backend/frontend runtime smoke checks, API artifact checks, and Chrome visual/accessibility validation.

## 1.12.0 - 2026-05-26

- Implemented feature spec 16: backend runtime for isolated visual preview sessions.
- Added shared preview schemas, a dedicated preview event-stream port, and backend preview lifecycle contracts.
- Added file-backed frontend project registry, preview session/timeline/draft storage, and a noop browser preview adapter.
- Added `/api/preview` routes for projects, sessions, lifecycle actions, timeline, SSE events, and visual instruction drafts.
- Kept preview state isolated from WorkflowState and user-story workspace folders.
- Added regression coverage for preview schemas, project-root isolation, session persistence, and lifecycle timeline behavior.
- Recorded `pnpm --filter @u-build/shared build`, `pnpm --filter @u-build/server build`, `pnpm --filter @u-build/web build`, `pnpm test`, backend restart, and preview API smoke checks.

## 1.27.0 - 2026-05-26

- Added feature spec 33: backend for a safe, read-only project file browser, adapted from useful reference file-viewer patterns.
- Added feature spec 34: frontend for the Horus Arquivos screen with project selector, tree, file tabs, read-only editor, SPEC tab, and User Stories tab.
- Explicitly required improvements over the reference implementation: shared contracts, binary detection, symlink/path traversal tests, scoped CSS, lazy editor loading, and no direct absolute-path authority from the frontend.

## 1.29.0 - 2026-05-26

- Added feature spec 37: persistent project file editing from the Arquivos screen.
- Defined a safe full-content save endpoint with shared schemas, path/root safety, binary/sensitive-file rejection and optimistic conflict detection.
- Specified frontend dirty/saving/saved/conflict UX for CodeViewer without claiming git commits or agent QA execution.

## 1.13.0 - 2026-05-26

- Implemented feature spec 17: frontend visual preview console.
- Added a first-class `Preview` sidebar navigation button using the project button standard of icon plus name.
- Added typed preview API client, isolated preview SSE hook, project panel, toolbar, canvas iframe shell, timeline, device switcher, and draft-only visual instruction composer.
- Kept preview project/session state isolated from user-story workspace folders and workflow thread state.
- Removed the incorrect Calangos UI copy and kept the composer branded as Horus.
- Recorded `pnpm --filter @u-build/server build`, `pnpm --filter @u-build/web build`, `pnpm test`, preview endpoint smoke checks, and Chrome visual validation for stopped/running/SSE/timeline states.

## 1.14.0 - 2026-05-26

- Added short architecture report for the updated preview chat -> Horus/Odin flow.
- Added feature spec 18: isolated preview chat contract for Horus/Odin.
- Added feature spec 19: frontend preview chat UI connected to Horus chat turns.
- Added feature spec 20: Horus/Odin intent router for answer, code-change, run-project, and explicit spec requests.
- Added feature spec 21: isolated code-folder and chat-memory context tools.
- Added feature spec 22: chat-driven Front/QA/Curator code-change loop.
- Added feature spec 23: chat-triggered project execution through preview runtime.

## 1.15.0 - 2026-05-26

- Implemented feature spec 18: isolated preview chat contract for Horus/Odin.
- Added shared Horus chat schemas and exported them from `@u-build/shared`.
- Added backend `SubmitHorusChatTurnUseCase` with chat/workspace/story/project/preview context validation.
- Added `/api/horus/chat/turn` route and wired it into the Express app.
- Added regression coverage for valid Horus chat turns, workspace mismatch, missing project context, and preview/project mismatch.
- Recorded `pnpm --filter @u-build/shared build`, `pnpm --filter @u-build/server build`, `pnpm test`, and runtime API smoke validation.

## 1.16.0 - 2026-05-26

- Implemented feature spec 19: preview chat frontend connected to Horus chat turns.
- Added a typed Horus chat frontend API client and wired the Preview screen to isolated chat sessions/messages.
- Replaced draft-only visual instruction submission with `/api/horus/chat/turn` while preserving the preview controls.
- Added scrollable persisted chat history and Horus-branded composer copy.
- Tightened Horus intent detection so ordinary questions mentioning user stories do not trigger spec generation.
- Added regression coverage for explicit spec requests versus ordinary user-story explanation questions.
- Recorded `pnpm --filter @u-build/server build`, `pnpm --filter @u-build/web build`, `pnpm test`, and Chrome visual validation.

## 1.17.0 - 2026-05-26

- Implemented feature spec 20: Horus/Odin intent router.
- Added explicit Horus chat modes: `chat` for answering/clarifying and `executor` for acting through agents/runtime.
- Extracted deterministic intent classification into `HorusOdinIntentRouter`.
- Wired `SubmitHorusChatTurnUseCase` to consume the router through dependency injection.
- Added regression coverage for chat questions, code changes, project execution, explicit spec generation, and user-story mentions that must not become spec generation.
- Recorded `pnpm --filter @u-build/shared build`, `pnpm --filter @u-build/server build`, `pnpm test`, and runtime API smoke validation.

## 1.18.0 - 2026-05-26

- Implemented feature spec 21: isolated code-folder and chat-memory context tools.
- Added shared `CodeContext` schemas and source metadata on Horus chat outcomes.
- Added `ReadOnlyCodeContextService` with root-scoped reads, generated/vendor directory ignores, and file/byte limits.
- Wired `answer_question` turns to use isolated chat memory plus selected frontend project files.
- Added regression coverage for root escape rejection, ignored directories, context limits, and answer metadata.
- Recorded `pnpm --filter @u-build/shared build`, `pnpm --filter @u-build/server build`, `pnpm --filter @u-build/web build`, `pnpm test`, API smoke validation, and Chrome visual validation for the fixed chat frame.

## 1.19.0 - 2026-05-26

- Implemented feature spec 22: chat-driven code-change requests now hand off to Horus/Odin executor mode.
- Added `chat_code_change` workflow mode so chat-originated changes bypass SpecAgent and start at Odin with the active story/spec context.
- Threaded `chatSessionId`, source message id, execution brief, and workspace artifact context through Front, QA, Curator, workflow state, and agent result metadata.
- Added chat progress/error persistence back into the same isolated chat session.
- Tightened intent routing so informational code-change questions stay in chat mode while imperative change requests enter executor mode.
- Recorded shared/server builds, full test suite, API smoke validation, and chat error-surfacing validation.

## 1.20.0 - 2026-05-26

- Implemented feature spec 23: Horus chat can start, stop, and reload the selected preview project through the safe PreviewRuntimeManager lifecycle.
- Added automatic preview session creation for selected projects when the chat has no active preview session.
- Added project/preview session ids to chat message context snapshots so preview state can be restored from chat memory.
- Added arbitrary shell command rejection for chat execution requests.
- Improved Horus Ask vs Action detection with a robust routing policy, greeting handling, verification/read-only asks, safer action detection, and a chat-mode fallback.
- Recorded `pnpm test`, runtime API smoke checks, and Chrome visual validation for live chat-triggered preview start.

## 1.9.0 - 2026-05-26

- Added feature spec 16: backend runtime for isolated visual preview sessions.
- Added feature spec 17: frontend visual preview console consuming the backend preview contracts.
- Standardized both visual preview specs with local spec numbering, `source_skill`, `spec_version`, and `status` metadata.
- Linked the backend and frontend specs to each other so implementation agents can follow the integration contract without guessing.
