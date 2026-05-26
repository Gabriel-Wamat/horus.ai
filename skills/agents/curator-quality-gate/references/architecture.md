# Curator Skill Architecture Notes

- The Curator Agent is the quality gate for generated artifacts.
- It must evaluate both frontend implementation and QA coverage.
- It returns a structured verdict used by the LangGraph self-correction loop.
- `fixTarget` drives Odin routing, so it must identify the failing responsibility.
- The Curator must not create new product scope or rewrite the spec.
