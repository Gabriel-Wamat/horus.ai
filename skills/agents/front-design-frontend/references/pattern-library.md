# Frontend Pattern Library

Version: 1.0.0
Owner: Horus Front Agent
Purpose: choose the product-surface pattern before writing UI code. Patterns describe structure and quality constraints; they are not fixed templates and must inherit the current visualContract and DesignContextBundle.

## Selection Protocol

1. Identify the product surface from the user story, execution brief, visualContract, existing files, and design context.
2. Choose exactly one primary pattern id and optionally one secondary pattern id.
3. Mention the selected pattern in the implementation summary or technical approach.
4. Apply the pattern through existing project components, tokens, density, and routing.
5. If no pattern fits, choose `custom-product-surface` and state the reason in one sentence.

## Patterns

### operational-dashboard

Use when the surface is monitoring, admin, CRM, observability, project control, file browsing, run control, analytics, internal tooling, data operations, or a repeated work console.

Layout rules:
- Prioritize dense but readable information, scan paths, compact controls, tables, lists, filters, segmented controls, and predictable navigation.
- Prefer neutral surfaces, subtle strokes, stable rows, and one controlled accent.
- Avoid hero sections, oversized marketing headings, decorative illustrations, and large metric cards unless the story explicitly needs them.

Expected states:
- loading, empty, error, success, selected, focus, disabled.

Common components:
- toolbar, path/filter bar, table/list/grid, detail drawer, status chips, command buttons, compact form controls.

Reject if:
- the UI becomes a landing page, one card per concept, a color-saturated dashboard, or a nested-card layout.

### chat-preview-workbench

Use when the surface combines chat, agent progress, live preview, visual editor, generated output, or execution controls.

Layout rules:
- Keep chat readable and stable while the preview remains primary.
- Use compact activity indicators rather than repeated verbose status cards.
- Keep input pinned and history scroll stable.
- Separate user messages, agent messages, progress, and evidence with spacing and restrained surfaces.

Expected states:
- thinking, streaming, running, retrying, failed, completed, offline, reconnecting.

Common components:
- chat list, composer, compact run activity, evidence details, preview toolbar, device toggle, reload/start/stop controls.

Reject if:
- messages overlap, progress floods the chat, status panels are oversized, or the preview is visually secondary without user intent.

### workflow-map

Use when the surface is an agent graph, dependency map, execution topology, flowchart, pipeline, or system state diagram.

Layout rules:
- Prefer top-to-bottom or grouped lanes when the process has phases.
- Offer simplified and complete edge modes without hiding nodes.
- Keep labels meaningful and sparse; avoid labeling every trivial edge.
- Use color plus shape/text, not color alone, for status.

Expected states:
- idle, active, completed, failed, waiting, skipped.

Common components:
- graph canvas, node cards, edge labels, minimap, zoom controls, inspector, toggle for simplified/full edges.

Reject if:
- edges cross excessively, nodes are tiny, labels are unreadable, or semantic status depends only on color.

### form-crud-tool

Use when the surface is settings, create/edit/delete, profile management, configuration, key management, table editing, or validation-heavy workflows.

Layout rules:
- Use clear field groups, labels, descriptions only where needed, validation messages, and primary/secondary action grouping.
- Keep destructive actions separated but not theatrical.
- Preserve dirty, saving, saved, validation error, and server error states.

Expected states:
- pristine, dirty, saving, saved, validation_error, server_error, disabled.

Common components:
- form sections, inputs, selects, toggles, inline validation, action bar, confirmation dialog, audit metadata.

Reject if:
- inputs are unlabeled, destructive and primary actions have the same weight, or validation state is hidden.

### content-landing

Use only when the story is public marketing, portfolio, product/venue/person page, launch page, or brand storytelling.

Layout rules:
- Use real or generated visual assets when available.
- The first viewport must signal the product/person/place/object.
- Use immersive hero treatment only when the story is actually about promotion or presentation.
- Keep a hint of next content visible in the first viewport.

Expected states:
- responsive_desktop, responsive_mobile, media_loaded, media_fallback.

Common components:
- hero, media background, primary CTA, proof/feature sections, gallery, details, footer.

Reject if:
- a SaaS hero is used for an operational tool, the hero is gradient-only, the image is generic/dark/blurred, or core content is hidden inside a floating card.

### custom-product-surface

Use when no known pattern fits. State why, then define:
- primary task;
- information hierarchy;
- interaction model;
- required states;
- anti-patterns to avoid.
