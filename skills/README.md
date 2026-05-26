# Horus.AI Agent Skills

Version: 0.2.0
Status: active
Last updated: 2026-05-26

This folder stores project-local skills used by Horus.AI agents at runtime. These are not Codex skills; they are product instructions that become part of the relevant agent prompts.

## Skill Index

1. `agents/front-design-frontend/SKILL.md`
2. `agents/qa-frontend-testing/SKILL.md`
3. `agents/curator-quality-gate/SKILL.md`

## Structure

Each skill follows the complete software-skill protocol:

- `SKILL.md` with frontmatter, trigger rules, workflow, architecture rules, validation, mitigation, and final contract.
- `agents/openai.yaml` with UI/display metadata.
- `references/` with architecture, examples, and validation notes when useful.

Shared validation script:

```bash
python3 skills/scripts/quick_validate.py skills/agents
```

## Versioning Rules

- Keep a `version` field in each skill metadata block.
- Record every meaningful change in `skills/CHANGELOG.md`.
- Preserve the 10 foundations section in every agent skill.
- Keep skills specific to the agent responsibility; do not create one large generic prompt.
- Do not put secrets, provider keys, or generated customer data in this folder.
