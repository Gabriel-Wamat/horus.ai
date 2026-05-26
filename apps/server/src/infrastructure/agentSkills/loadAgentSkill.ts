import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const cache = new Map<string, string>();

export function loadAgentSkill(skillId: string): string {
  const cached = cache.get(skillId);
  if (cached !== undefined) return cached;

  const root = findProjectRoot(process.cwd());
  const path = join(root, "skills", "agents", skillId, "SKILL.md");
  const content = readFileSync(path, "utf8").trim();
  cache.set(skillId, content);
  return content;
}

function findProjectRoot(start: string): string {
  let current = start;

  while (true) {
    if (
      existsSync(join(current, "package.json")) &&
      existsSync(join(current, "skills"))
    ) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Could not find project root with skills/ from ${start}`);
    }
    current = parent;
  }
}
