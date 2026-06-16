# AI Agent Engineering Strategy Catalog

Created at UTC: 2026-05-27T17:09:18Z
Source skill: agentic-sdd-spec
Status: research-backed planning note

## Original Request

```text
pesquise quais são melhores práticas de engenharia de IA(no arxiv, medium, github, fóruns, reddit) para resolver esse tipo de problema, após isso catalogue as estratégias. em seguida, use a skill de criar spec para planeja a solução desse problema, (analise quantas specs são necessárias, para que você consiga detalhar rigorosamente e ter o máximo de contexto para solucionar de forma cirúrgica)
```

## Problem Frame

The Horus failure class is not a single bug. It is a platform reliability gap across:

- durable agent execution;
- chat turn persistence;
- streamed user-visible progress;
- workflow event replay;
- agent memory and context budgeting;
- dynamic skill use;
- artifact/version selection;
- validation, self-healing and observability.

Trying to fix all of that in one implementation spec would create a high-risk mega-refactor. The solution should be split into four implementation specs.

## Researched Strategy Catalog

| Strategy | Source Pattern | Why It Matters For Horus | Applied In Spec |
| --- | --- | --- | --- |
| Durable execution ledger | LangGraph persistence, Inngest durable steps, Temporal durable workflows | Every agent run must survive process restarts and resume from a known checkpoint instead of relying on fire-and-forget async calls. | 64 |
| Idempotent turn/run starts | Durable workflow and agent idempotency practice | A user message must not create duplicate agent runs or lose the assistant response if the HTTP stream breaks. | 64, 65 |
| Outbox event handoff | Durable backend/event-driven architecture | Persist user intent and enqueue workflow start in one transaction; workers consume after commit. | 64 |
| Event-sourced chat projection | OpenHands conversation persistence and event stream design | Chat UI should replay persisted messages/progress from an ordered event log instead of relying on frontend-only synthetic messages. | 65 |
| Separate base state from event history | OpenHands persistence structure | State snapshots and append-only events solve different problems; mixing them causes replay and audit ambiguity. | 64, 65 |
| Resumable SSE with cursor | Production streaming and OpenAI/Agents trace style | If the browser reloads, it should resume from `lastEventId`/sequence without losing progress. | 65 |
| Memory as multiple stores | GitHub MemoryOps, AI memory surveys, Microsoft multi-agent reference architecture | Conversation, episodic events, semantic facts, procedural skills and working state should not be one unbounded chat array. | 66 |
| Scoped retrieval and summarization | Agent memory survey / long-term context discussions | Agents need recent context, durable facts and project constraints with token budgets, not raw unlimited history. | 66 |
| Dynamic procedural skills | Codex/Claude style skill files, GitHub memory/workflow practices | User-created skills must become active runtime context for the correct agent profiles, not just database records. | 66 |
| Agent-computer interface | SWE-agent paper and docs | Coding agents need constrained search/read/edit/validate tools with feedback, not raw shell or oversized file dumps. | 67 |
| Pre-execution validation/reviewer | Reinforced Agent / self-healing agent literature | Mutating actions should be checked before execution and recovered with bounded retries after failure. | 67 |
| Candidate artifact IDs | Software-agent event/state patterns | Curator, QA and apply must reference the same candidate, attempt and evidence, avoiding stale array scans. | 67 |
| Structured traces and sensitive-data policy | OpenAI Agents SDK tracing | Debugging requires spans for LLM calls, tools, handoffs, guardrails and custom events, with control over sensitive data. | 67 |
| Human-in-the-loop only at high-risk boundaries | HITL agent discussions and LangGraph interrupt model | HITL should pause for judgment or retry-limit escalation, not compensate for missing state machinery. | 64, 67 |

## Source Map

### Academic / Arxiv

- `SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering` (`arxiv.org/abs/2405.15793`): tuned ACI, lint-before-edit, concise file/search tools, recovery from failed edits.
- `Rethinking Memory in AI: Taxonomy, Operations, Topics, and Future Directions` (`arxiv.org/abs/2505.00675`): memory should be decomposed by operation and representation, not treated as a single context window.
- `Human-inspired Perspectives: A Survey on AI Long-term Memory` (`arxiv.org/abs/2411.00489`): long-term memory requires lifecycle, relevance, and retrieval management.
- `Reinforced Agent: Inference-Time Feedback for Tool-Calling Agents` (`arxiv.org/abs/2604.27233`): reviewer/evaluator at inference time before tool execution.
- `Sovereign Agentic Loops` (`arxiv.org/abs/2604.22136`): decouple stochastic reasoning from deterministic execution.

### Framework / GitHub / Product Docs

- LangGraph persistence docs: checkpointer, `thread_id`, checkpoints, pending writes, interrupt/resume.
- OpenHands SDK persistence docs: `base_state.json` plus append-only event files; immediate autosave; lazy event restoration.
- SWE-agent ACI docs: controlled commands, syntactic edit validation, concise file views/search results.
- GitHub Agentic Workflows MemoryOps: multiple memory stores and workflow-level memory practice.
- OpenAI Agents SDK tracing docs: traces/spans for LLM generations, tool calls, handoffs, guardrails and custom events.
- Inngest durable AI agents blog: each LLM/tool step is a durable, observable, retryable step.
- Temporal durable execution material: long-running workflows, crash recovery, activities, human signals.

### Forums / Community Signal

- Reddit/Temporal and Reddit/AI agents threads repeatedly converge on the same production pain: partial completion, non-idempotent retries, missing state checks, and the need to persist progress before streaming it.
- Community memory discussions repeatedly separate project memory, conversation history, summaries, retrieval indexes and decision logs.

## Chosen Spec Split

1. **64 - Durable Agent Execution Ledger And Outbox**
   - foundation for runs, turns, attempts, idempotency, outbox and durable worker handoff.
2. **65 - Event-Sourced Chat And Progress Streaming**
   - user-visible chat/progress protocol, persisted message projections, SSE replay and UX states.
3. **66 - Agent Memory And Runtime Skills Governance**
   - long-term memory, scoped retrieval, summaries, semantic/episodic/procedural stores and dynamic skills.
4. **67 - Artifact Validation, Self-Healing And Observability Control Plane**
   - candidate artifacts, ACI/tool contracts, validation gates, terminal recovery, traces and operator debugging.

## Cross-Spec Invariants

- No workflow can be marked `completed` unless required validation gates passed or the status explicitly says `completed_unverified`.
- No agent applies a patch without a stable `candidateArtifactId`.
- No chat turn starts mutable execution without a persisted `turnId`.
- No stream event is the only source of truth; every durable event must be replayable.
- No dynamic skill becomes active without validation, binding and audit.
- No user-visible message should expose raw internal thread IDs unless in an explicit developer/debug surface.
- No fallback should silently convert a failed validation into success.

