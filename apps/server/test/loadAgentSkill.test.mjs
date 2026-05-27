import assert from "node:assert/strict";
import test from "node:test";
import { loadAgentSkill } from "../dist/infrastructure/agentSkills/loadAgentSkill.js";

test("loadAgentSkill loads the Front Agent skill from the project skills folder", () => {
  const skill = loadAgentSkill("front-design-frontend");

  assert.match(skill, /id: "front-design-frontend"/);
  assert.match(skill, /name: front-design-frontend/);
  assert.match(skill, /## 10 Foundations/);
  assert.match(skill, /## Agent Error Mitigation/);
  assert.match(skill, /## Final Report Contract/);
  assert.match(skill, /Return ProjectExecutionPlan operations for real projects/);
  assert.match(skill, /complete HTML document/);
  assert.match(skill, /# Skill References/);
  assert.match(skill, /Reference: pattern-library\.md/);
  assert.match(skill, /operational-dashboard/);
  assert.match(skill, /chat-preview-workbench/);
  assert.match(skill, /workflow-map/);
  assert.match(skill, /Reference: component-policy\.md/);
  assert.match(skill, /Existing Project First/);
  assert.match(skill, /Reference: anti-patterns\.md/);
  assert.match(skill, /excessive frames/i);
});

test("loadAgentSkill loads the Spec Agent skill from the project skills folder", () => {
  const skill = loadAgentSkill("spec-frontend-sdd");

  assert.match(skill, /id: "spec-frontend-sdd"/);
  assert.match(skill, /name: spec-frontend-sdd/);
  assert.match(skill, /## Purpose/);
  assert.match(skill, /## 10 Foundations/);
  assert.match(skill, /## Agent Error Mitigation/);
  assert.match(skill, /## Final Output Contract/);
  assert.match(skill, /frontend-first/);
  assert.match(skill, /backend route/i);
  assert.match(skill, /Allowed pattern ids/);
  assert.match(skill, /Pattern: <id>/);
  assert.match(skill, /component reuse discipline/i);
});

test("loadAgentSkill loads the QA Agent skill from the project skills folder", () => {
  const skill = loadAgentSkill("qa-frontend-testing");

  assert.match(skill, /id: "qa-frontend-testing"/);
  assert.match(skill, /name: qa-frontend-testing/);
  assert.match(skill, /## 10 Foundations/);
  assert.match(skill, /## Agent Error Mitigation/);
  assert.match(skill, /## Final Report Contract/);
  assert.match(skill, /Trace every acceptance criterion/);
});

test("loadAgentSkill loads the Curator Agent skill from the project skills folder", () => {
  const skill = loadAgentSkill("curator-quality-gate");

  assert.match(skill, /id: "curator-quality-gate"/);
  assert.match(skill, /name: curator-quality-gate/);
  assert.match(skill, /## 10 Foundations/);
  assert.match(skill, /## Agent Error Mitigation/);
  assert.match(skill, /## Final Report Contract/);
  assert.match(skill, /fixTarget/);
  assert.match(skill, /\[front:pattern\]/);
  assert.match(skill, /selected frontend pattern/i);
  assert.match(skill, /Component policy is respected/i);
});
