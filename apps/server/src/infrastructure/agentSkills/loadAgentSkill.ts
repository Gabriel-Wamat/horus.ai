import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RuntimeAgentSkill } from "@u-build/shared";

const cache = new Map<string, string>();
const MAX_REFERENCE_BYTES = 12_000;
const MAX_TOTAL_REFERENCE_BYTES = 36_000;

export function loadAgentSkill(skillId: string): string {
  const cached = cache.get(skillId);
  if (cached !== undefined) return cached;

  const root = findProjectRoot(process.cwd());
  const skillDir = join(root, "skills", "agents", skillId);
  const path = join(skillDir, "SKILL.md");
  const content = [
    readFileSync(path, "utf8").trim(),
    loadSkillReferences(skillDir),
  ]
    .filter(Boolean)
    .join("\n\n");
  cache.set(skillId, content);
  return content;
}

export function appendRuntimeAgentSkills(
  baseSkillContent: string,
  runtimeSkills: RuntimeAgentSkill[]
): string {
  const dynamicContent = formatRuntimeAgentSkills(runtimeSkills);
  return [baseSkillContent.trim(), dynamicContent].filter(Boolean).join("\n\n");
}

export function formatRuntimeAgentSkills(
  runtimeSkills: RuntimeAgentSkill[]
): string {
  if (runtimeSkills.length === 0) return "";
  return [
    "# Active Project Skills",
    ...runtimeSkills.map((skill) =>
      [
        `## ${skill.displayName}`,
        `skill_id: ${skill.skillId}`,
        `revision_id: ${skill.revisionId}`,
        `content_hash: ${skill.contentHash}`,
        skill.skillMd.trim(),
        formatRuntimeSkillFiles(skill),
      ]
        .filter(Boolean)
        .join("\n\n")
    ),
  ].join("\n\n");
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

function loadSkillReferences(skillDir: string): string {
  const referencesDir = join(skillDir, "references");
  if (!existsSync(referencesDir)) return "";

  const references: string[] = [];
  let totalBytes = 0;
  const files = readdirSync(referencesDir)
    .filter((file) => file.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const path = join(referencesDir, file);
    const stats = lstatSync(path);
    if (!stats.isFile()) continue;
    const remainingBytes = MAX_TOTAL_REFERENCE_BYTES - totalBytes;
    if (remainingBytes <= 0) break;
    const content = readFileSync(path, "utf8").trim();
    const clipped = clipByBytes(
      content,
      Math.min(MAX_REFERENCE_BYTES, remainingBytes)
    );
    totalBytes += Buffer.byteLength(clipped, "utf8");
    references.push(`## Reference: ${file}\n${clipped}`);
  }

  if (references.length === 0) return "";
  return ["# Skill References", ...references].join("\n\n");
}

function clipByBytes(content: string, maxBytes: number): string {
  if (Buffer.byteLength(content, "utf8") <= maxBytes) return content;
  const clipped = Buffer.from(content, "utf8")
    .subarray(0, Math.max(0, maxBytes - 80))
    .toString("utf8")
    .replace(/\uFFFD$/u, "");
  return `${clipped}\n\n[Reference clipped by loadAgentSkill byte limit]`;
}

function formatRuntimeSkillFiles(skill: RuntimeAgentSkill): string {
  const files = skill.files.filter((file) => file.contentText);
  if (files.length === 0) return "";
  return [
    "### Skill Support Files",
    ...files.map(
      (file) => `#### ${file.relativePath}\n${file.contentText?.trim() ?? ""}`
    ),
  ].join("\n\n");
}
