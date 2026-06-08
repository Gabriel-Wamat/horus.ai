# Horus.AI Local Specs

Version: 1.107.0
Status: local-only
Last updated: 2026-06-08

This folder stores implementation specs for correction work discovered during project review. It is intentionally local-only and must not be committed to GitHub.

## Versioning Rules

- The folder has a global version in this README and in `CHANGELOG.md`.
- Each correction spec has its own `Spec version`.
- When code changes are made for a correction, update the matching spec's `Implementation log`.
- When a correction spec changes meaningfully, increment that spec version and add an entry to `CHANGELOG.md`.
- Use `0.x` versions while the correction plan is still evolving.

## Spec Index

1. `corrections/01-latest-attempt-artifacts.md`
2. `corrections/02-curator-qa-input.md`
3. `corrections/03-spec-rejection-flow.md`
4. `corrections/04-persistent-resume-checkpoint.md`
5. `corrections/05-focused-test-coverage.md`
6. `corrections/06-local-validation-runbook.md`
7. `features/07-multi-provider-llm.md`
8. `features/08-frontend-llm-settings-modal.md`
9. `features/09-user-story-spec-workspace.md`
10. `features/10-workspace-user-story-folders.md`
11. `features/11-user-story-folder-tree-ui.md`
12. `features/12-workspace-artifact-versioning.md`
13. `features/13-agent-workspace-context-consumption.md`
14. `features/14-chat-context-memory-change-requests.md`
15. `features/15-story-spec-generation-and-editing.md`
16. `features/16-visual-preview-backend-runtime.md`
17. `features/17-visual-preview-frontend-console.md`
18. `features/18-preview-chat-horus-contract.md`
19. `features/19-preview-chat-frontend-horus-ui.md`
20. `features/20-horus-odin-intent-router.md`
21. `features/21-isolated-code-memory-context-tools.md`
22. `features/22-chat-driven-agent-code-change-loop.md`
23. `features/23-chat-triggered-project-execution.md`
24. `features/24-real-cli-capability-gate.md`
25. `features/25-process-browser-preview-adapter.md`
26. `features/26-preview-command-policy-and-catalog.md`
27. `features/27-preview-runtime-observability.md`
28. `features/28-qa-preview-smoke-validation.md`
29. `features/29-chat-runtime-evidence-integration.md`
30. `features/30-postgres-persistence-repositories.md`
31. `features/31-agentic-system-hardening-roadmap.md`
32. `features/32-zup-style-project-construction-workspace.md`
33. `features/33-project-file-browser-backend.md`
34. `features/34-project-file-browser-frontend.md`
35. `features/35-project-code-intelligence-ast.md`
36. `features/36-user-stories-accessibility-visual-load.md`
37. `features/37-project-file-editing-persistence.md`
38. `features/38-grounded-chat-code-intelligence.md`
39. `features/39-agentic-orchestration-integrity.md`
40. `features/40-react-frontend-project-architecture.md`
41. `features/41-agentic-runtime-validation-observability.md`
42. `features/42-agentic-execution-loop.md`
43. `features/43-specialized-subagents-tool-boundaries.md`
44. `features/44-project-agent-manifest-context.md`
45. `features/45-structured-agent-tools-no-shell.md`
46. `features/46-agent-progress-ux-evidence.md`
47. `features/47-validation-gates-true-success.md`
48. `features/48-frontend-architecture-remediation-plan.md`
49. `features/49-project-files-ide-experience.md`
50. `features/50-preview-chat-command-streaming.md`
51. `features/51-local-persistence-portability.md`
52. `features/52-local-persistence-hardening-completion.md`
53. `features/53-portable-docker-runtime.md`
54. `features/54-professional-project-documentation.md`
55. `features/55-project-download-zip.md`
56. `features/56-visual-contract-design-system.md`
57. `features/57-visual-curator-screenshot-gate.md`
58. `features/58-frontend-pattern-library-and-agent-skill.md`
59. `features/59-agentic-project-construction-reliability.md`
60. `features/60-agent-skill-registry-backend.md`
61. `features/61-agent-skill-catalog-frontend.md`
62. `features/62-preview-project-registry-hygiene.md`
63. `features/63-browser-visual-validation-and-worktree-hygiene.md`
64. `features/64-durable-agent-execution-ledger-and-outbox.md`
65. `features/65-event-sourced-chat-and-progress-streaming.md`
66. `features/66-agent-memory-and-runtime-skills-governance.md`
67. `features/67-artifact-validation-self-healing-and-observability-control-plane.md`
68. `features/68-preview-chat-durable-workflow-recovery.md`
69. `features/69-release-hardening-and-orchestrator-modularization.md`
70. `features/70-code-change-set-delete-and-safe-file-mutations.md`
71. `features/71-agent-tool-runtime-governed-write-access.md`
72. `features/72-agent-tool-runtime-react-loop-and-e2e-closure.md`
73. `features/73-workflow-chat-memory-contract-spine.md`
74. `features/74-error-taxonomy-and-recovery-engine.md`
75. `features/75-monolith-decomposition.md`
76. `features/76-durable-restart-and-chaos-validation.md`
77. `features/77-production-observability-and-release-hygiene.md`
78. `features/78-production-readiness-p0-remediation.md`
79. `features/79-agentic-runtime-isolation.md`
80. `features/80-agentic-isolation-cancellation-and-breaker-store.md`
81. `features/81-agentic-llm-tool-abort-and-distributed-breaker.md`
82. `features/82-production-boundary-release-readiness.md`
83. `features/83-provider-port-decoupling.md`
84. `features/84-production-critical-closure.md`
85. `features/85-chat-experience-product-hardening.md`
87. `features/87-coding-runtime-orchestrator-state-machine.md`
88. `features/88-repository-scanner-and-text-retrieval.md`
89. `features/89-tree-sitter-ast-analysis-spine.md`
90. `features/90-ast-patch-planner-diff-safe-apply-rollback.md`
91. `features/91-validation-runner-and-command-policy.md`
92. `features/92-chat-planner-structural-intent-runtime-bridge.md`
93. `features/93-lsp-symbol-index-and-navigation.md`
94. `features/94-repository-symbol-graph-and-dependency-map.md`
95. `features/95-embeddings-vector-retrieval-and-ranking.md`
96. `features/96-index-memory-lifecycle-and-context-budget.md`
97. `features/97-incremental-edit-tool-read-before-write.md`
98. `features/98-governed-shell-runtime.md`
99. `features/99-agent-operational-session-ledger.md`
100. `features/100-robust-file-mutation-preflight-applier.md`
101. `features/101-generated-project-inspection-tool.md`
102. `features/102-agent-tool-profiles-capability-registry.md`
103. `features/103-agent-runbook-progress-projection.md`
104. `features/104-semantic-command-classifier-policy.md`
105. `features/105-worktree-isolation-per-agent-run.md`
106. `features/106-context-compaction-runtime-memory-budget.md`
107. `features/107-advanced-repl-notebook-tool-extensions.md`
108. `features/108-agent-tool-activity-code-visualization.md`
109. `features/109-professionalization-master-plan.md`
110. `features/110-live-preview-file-tree-execution-spine.md`
111. `features/111-runtime-visual-curator-design-evaluator.md`
112. `features/112-surface-pattern-library-design-intelligence.md`
113. `features/113-docker-ci-release-hardening.md`
114. `features/114-ops-recovery-observability-control-plane.md`

## Notes

- `notes/preview-chat-orchestrator-flow-report.md`
- `notes/ai-agent-engineering-strategy-catalog.md`
- `notes/opencode-source-reuse-map.md`

## Git Policy

This folder is ignored by:

- `.gitignore`
- `.git/info/exclude`

If a file in this folder appears in `git status`, stop and fix the ignore rules before committing.
