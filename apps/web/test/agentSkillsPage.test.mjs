import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

function read(relativePath) {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

test("Skills mode remains reachable by URL without a sidebar shortcut", () => {
  const navigation = read("src/app/useAppNavigation.ts");
  const shell = read("src/components/Shell.tsx");
  const app = read("src/App.tsx");

  assert.match(navigation, /"skills"/);
  assert.match(navigation, /mode === "skills"/);
  assert.doesNotMatch(shell, /aria-label="Skills"/);
  assert.doesNotMatch(shell, /title="Skills"/);
  assert.doesNotMatch(shell, /onChangeMode\("skills"\)/);
  assert.doesNotMatch(shell, /<Icon name="skills" \/>/);
  assert.match(app, /<AgentSkillsPage \/>/);
});

test("Agent skills API client uses backend contracts without local sample data", () => {
  const api = read("src/api/agentSkillsApi.ts");

  assert.match(api, /\/api\/agent-skills/);
  assert.match(api, /listAgentProfiles/);
  assert.match(api, /validateDraft/);
  assert.match(api, /publishRevision/);
  assert.match(api, /archiveSkill/);
  assert.match(api, /CreateAgentSkillInput/);
  assert.doesNotMatch(api, /mockSkills|sampleSkills|fakeSkills/);
});

test("Agent skills page has catalog, detail, builder and validation surfaces", () => {
  const page = read("src/features/agent-skills/AgentSkillsPage.tsx");
  const catalog = read("src/features/agent-skills/SkillCatalog.tsx");
  const detail = read("src/features/agent-skills/SkillDetailPanel.tsx");
  const builder = read("src/features/agent-skills/SkillBuilder.tsx");

  assert.match(page, /SkillCatalog/);
  assert.match(page, /SkillDetailPanel/);
  assert.match(page, /SkillBuilder/);
  assert.match(catalog, /Buscar skill/);
  assert.match(catalog, /Filtrar por agente/);
  assert.match(detail, /SKILL\.md/);
  assert.match(detail, /ValidationReport/);
  assert.match(builder, /Criar e publicar/);
  assert.match(builder, /bindingAgentProfileIds/);
});

test("Agent skills styling stays in Horus gray system with restrained green", () => {
  const css = read("src/features/agent-skills/styles/agent-skills.css");

  assert.match(css, /var\(--s1\)/);
  assert.match(css, /var\(--bd/);
  assert.match(css, /rgba\(20, 199, 123, 0\.07\)/);
  assert.doesNotMatch(css, /#3b82f6|#2563eb|blueviolet|purple/i);
});
