# Curator Skill Validation

Runtime validation is performed by schema parsing and workflow routing.

Manual validation checklist:

- Score matches the stated gaps.
- `passed` is false for critical frontend or QA omissions.
- `missingItems` are concrete and actionable.
- `fixTarget` matches the failing responsibility.
- Notes are concise and explain the decision.
- Data model requirements are checked against both HTML and QA cases.
- Future apiEndpoints are checked as frontend route-readiness, not live backend execution.
