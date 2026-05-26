# QA Skill Examples

Good test case:

- Has an ID like `TC-01`.
- Names the criterion being tested.
- Provides concrete browser steps.
- Defines an observable expected result.
- Covers a real user or layout risk.
- Covers data model fields or route-readiness when the spec includes them.

Bad test case:

- Says only "verify page loads".
- Uses vague expectations like "looks good".
- Tests behavior not present in the spec.
- Ignores mobile/responsive behavior for layout-heavy UI.
- Ignores accessibility for forms and icon controls.
- Assumes a real backend endpoint exists when the spec only defines a future contract.

Good route-readiness test:

- Criterion: `The frontend exposes adapter-backed loading and error states for GET /api/items.`
- Steps:
  1. Open the static page.
  2. Locate the item list region.
  3. Trigger the local demo/error state if the UI exposes one, or inspect the visible fallback state described by the spec.
- Expected: `The list renders mock data using the same fields described by the future route response and shows a clear empty/error fallback without layout shift.`
