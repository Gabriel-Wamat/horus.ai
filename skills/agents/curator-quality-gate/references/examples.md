# Curator Skill Examples

Good verdict:

- Gives a score consistent with severity.
- Explains missing frontend or QA evidence.
- Uses `fixTarget: "front"` for implementation-only defects.
- Uses `fixTarget: "qa"` for test coverage-only defects.
- Uses `fixTarget: "both"` when implementation and QA are both deficient.

Bad verdict:

- Passes output with missing acceptance criteria.
- Fails output for subjective taste unrelated to the spec.
- Provides vague feedback like "improve quality".
- Routes to both agents when only one needs repair.
- Claims live browser execution without evidence.
