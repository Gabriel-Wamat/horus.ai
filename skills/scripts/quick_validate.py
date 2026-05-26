#!/usr/bin/env python3
from pathlib import Path
import re
import sys

REQUIRED_SECTIONS = [
    "## Purpose",
    "## When To Use",
    "## Required Inputs",
    "## Operating Principles",
    "## Workflow",
    "## 10 Foundations",
    "## Agent Error Mitigation",
    "## Architecture Checklist",
    "## Testing Checklist",
    "## Final Report Contract",
]


def validate_skill(path: Path) -> list[str]:
    errors: list[str] = []
    skill_md = path / "SKILL.md"
    agent_yaml = path / "agents" / "openai.yaml"

    if not skill_md.exists():
        return [f"{path}: missing SKILL.md"]

    text = skill_md.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        errors.append(f"{skill_md}: missing frontmatter")
    if not re.search(r"^name:\s*\S+", text, re.M):
        errors.append(f"{skill_md}: missing frontmatter name")
    if not re.search(r"^description:\s*.+", text, re.M):
        errors.append(f"{skill_md}: missing frontmatter description")

    for section in REQUIRED_SECTIONS:
        if section not in text:
            errors.append(f"{skill_md}: missing section {section}")

    foundations = re.findall(r"^\d+\.\s+", text, re.M)
    if len(foundations) < 10:
        errors.append(f"{skill_md}: expected at least 10 numbered foundations")

    if not agent_yaml.exists():
        errors.append(f"{path}: missing agents/openai.yaml")
    else:
        agent_text = agent_yaml.read_text(encoding="utf-8")
        for key in ["display_name:", "short_description:", "default_prompt:"]:
            if key not in agent_text:
                errors.append(f"{agent_yaml}: missing {key}")

    return errors


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("skills/agents")
    skill_dirs = sorted(path for path in root.iterdir() if path.is_dir())
    errors: list[str] = []

    for skill_dir in skill_dirs:
        errors.extend(validate_skill(skill_dir))

    if errors:
        for error in errors:
            print(error)
        return 1

    print(f"validated {len(skill_dirs)} skills")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
