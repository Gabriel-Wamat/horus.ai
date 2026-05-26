# Curator Skill Examples

Good verdict:

- Gives a score consistent with severity.
- Explains missing frontend or QA evidence.
- Uses `fixTarget: "front"` for implementation-only defects.
- Uses `fixTarget: "qa"` for test coverage-only defects.
- Uses `fixTarget: "both"` when implementation and QA are both deficient.
- Uses `[data]` or `[route]` prefixes when missing items involve data models or future route contracts.

Bad verdict:

- Passes output with missing acceptance criteria.
- Fails output for subjective taste unrelated to the spec.
- Provides vague feedback like "improve quality".
- Routes to both agents when only one needs repair.
- Claims live browser execution without evidence.
- Requires a live backend for an `apiEndpoints` contract that is only future route-readiness.

Good missing items:

- `[front:data] ProductCard does not render the preco field defined in ProdutoModel.`
- `[qa:route] No QA case covers the adapter error state for GET /api/produtos.`
- `[both:accessibility] The icon-only filter control lacks an accessible label and QA does not test keyboard focus.`
