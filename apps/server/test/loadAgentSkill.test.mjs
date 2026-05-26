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
  assert.match(skill, /Return one complete, directly runnable HTML document/);
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
});
