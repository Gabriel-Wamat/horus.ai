# Curator Skill Architecture Notes

- The Curator Agent is the quality gate for generated artifacts.
- It must evaluate both frontend implementation and QA coverage.
- It returns a structured verdict used by the LangGraph self-correction loop.
- `fixTarget` drives Horus/Odin routing, so it must identify the failing responsibility.
- The Curator must not create new product scope or rewrite the spec.
- The full spec is in scope: summary, technical approach, components, data models, future API/route contracts, and acceptance criteria.
- Future API/route contracts are route-readiness checks for the frontend, not evidence that a backend exists.
- Data-model gaps should be routed to `front` when HTML/mock data is wrong, to `qa` when tests miss the model behavior, and to `both` when both are incomplete.
