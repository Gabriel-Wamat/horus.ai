# Agent Skills Changelog

## 0.1.0 - 2026-05-26

- Created project-local agent skills workspace.
- Added Front Agent design/frontend quality skill.
- Added QA Agent frontend testing skill.
- Connected runtime agents to load skill text from this folder.

## 0.2.0 - 2026-05-26

- Reworked Front Agent and QA Agent skills using the complete software-skill template.
- Added Curator Agent quality gate skill.
- Added `agents/openai.yaml` metadata for all three agent skills.
- Added architecture, examples, and validation references for all three agent skills.
- Added `skills/scripts/quick_validate.py` to validate required skill structure.
- Connected CuratorAgent runtime prompt to `curator-quality-gate`.
