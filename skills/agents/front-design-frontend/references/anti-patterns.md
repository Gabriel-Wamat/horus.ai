# Frontend Anti-Patterns

Version: 1.0.0
Owner: Horus Front Agent and Curator Agent
Purpose: make subjective UI failures observable enough for generation, review, and retry.

## Universal Reject List

- Generic landing page for an app/tool/workbench request.
- One-note palette dominated by one hue family without hierarchy.
- High-saturation highlight colors used as surface, background, or repeated decoration.
- Gradient/orb/bokeh decoration when it does not express the product object or gameplay.
- Card nested inside card or repeated frames that create visual clutter.
- Hero-scale typography inside compact panels, cards, dashboards, drawers, or chat.
- Text overflow, button label clipping, content overlap, or layout shift on hover.
- Icon-only actions without accessible labels.
- External CDN, unverified package import, or invented asset/API.
- Static HTML implementation for a reachable framework project.
- Orphan component/file not imported by the app entrypoint.
- Mock/fake adapter in runtime project code.

## Pattern-Specific Checks

operational-dashboard:
- No marketing hero.
- No oversized decorative metric grid as the primary interface.
- No uncontrolled accent color spam.
- Controls must be scannable and grouped.

chat-preview-workbench:
- No message overlap.
- No large repeated progress blocks.
- No activity UI that pushes the composer away from a stable position.
- Streaming/thinking states must be visually distinct and compact.

workflow-map:
- No unreadable node text.
- No edge clutter without simplified/full mode when edge count is high.
- No color-only status.
- Avoid unnecessary edge labels.

form-crud-tool:
- No unlabeled inputs.
- No missing validation state.
- No destructive action styled as a primary action.
- No ambiguous save/cancel placement.

content-landing:
- No gradient-only hero.
- No generic SaaS layout for a specific venue/person/product.
- No dark blurred stock-like media when the object should be inspectable.
- No hero text inside a floating card when immersive presentation is required.

## Curator Feedback Format

When rejecting a visual or component-policy issue, use concrete prefixes:
- `[front:pattern] selected pattern was not followed`
- `[front:component] component policy was violated`
- `[front:visual] visual identity or hierarchy drift`
- `[responsive] overflow or mobile/desktop layout failure`
- `[accessibility] missing labels, landmarks, focus, or contrast`

Every missing item should name the observable failure and the expected correction.
