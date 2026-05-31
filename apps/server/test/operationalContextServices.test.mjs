import assert from "node:assert/strict";
import test from "node:test";
import { OperationalMemoryProjector } from "../dist/application/services/OperationalMemoryProjector.js";
import { SpecTraceabilityService } from "../dist/application/services/SpecTraceabilityService.js";
import { AgentContextProfileService } from "../dist/application/services/AgentContextProfileService.js";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const USER_STORY_ID = "22222222-2222-4222-8222-222222222222";
const SPEC_ID = "33333333-3333-4333-8333-333333333333";
const CHANGE_SET_ID = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-05-29T00:00:00.000Z");

test("OperationalMemoryProjector derives run memory from agent results and curator decision", () => {
  const memory = new OperationalMemoryProjector().build({
    workflowThreadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
    retryCount: 2,
    now,
    agentResults: [
      {
        status: "success",
        agentName: "front",
        userStoryId: USER_STORY_ID,
        completedAt: now.toISOString(),
        executionTimeMs: 10,
        output: {
          inspectedFiles: ["src/App.tsx"],
          toolLoop: {
            changedFiles: ["src/App.tsx"],
            validationCommandIds: ["build"],
            operationalSession: {
              id: "55555555-5555-4555-8555-555555555555",
              filesRead: ["src/App.tsx"],
              filesChanged: ["src/App.tsx"],
              commandIds: ["build"],
              errors: ["Adjacent JSX elements must be wrapped"],
            },
          },
        },
      },
      {
        status: "success",
        agentName: "curator",
        userStoryId: USER_STORY_ID,
        completedAt: now.toISOString(),
        executionTimeMs: 5,
        output: {
          passed: false,
          score: 40,
          fixTarget: "front",
          notes: "Build failed.",
          missingItems: ["runtime build must pass"],
        },
      },
    ],
    curatorFeedback: {
      passed: false,
      score: 40,
      fixTarget: "front",
      notes: "Build failed.",
      missingItems: ["runtime build must pass"],
    },
  });

  assert.deepEqual(
    memory.filesRead.map((file) => file.path),
    ["src/App.tsx"]
  );
  assert.deepEqual(
    memory.filesChanged.map((file) => file.path),
    ["src/App.tsx"]
  );
  assert.equal(memory.errorsSeen.some((error) => error.message.includes("Adjacent JSX")), true);
  assert.equal(memory.nextStep.recommendedAgent, "front");
});

test("SpecTraceabilityService links requirements to code changes and QA tests", () => {
  const report = new SpecTraceabilityService().build({
    now,
    spec: buildSpec(),
    codeChangeSet: {
      id: CHANGE_SET_ID,
      workflowThreadId: THREAD_ID,
      userStoryId: USER_STORY_ID,
      sourceAgent: "front",
      status: "proposed",
      operations: [
        {
          changeType: "update",
          targetPath: "src/App.tsx",
          beforeContent: "Home",
          afterContent: "Início",
          diff: "Troca o texto do botão Home para Início no componente App.",
          preconditions: [],
          metadata: {},
        },
      ],
      validation: [],
      createdAt: now.toISOString(),
    },
    qaOutput: {
      testCases: [
        {
          id: "TC-01",
          criterion: "O botão Home deve aparecer como Início.",
          steps: ["Abrir a página inicial."],
          expected: "O texto visível do botão é Início.",
        },
      ],
    },
  });

  const acceptance = report.records.find(
    (record) => record.requirement.kind === "acceptance_criterion"
  );
  assert.equal(acceptance.status, "covered");
  assert.equal(acceptance.evidence.some((item) => item.type === "test_case"), true);
  assert.equal(acceptance.evidence.some((item) => item.type === "code_file"), true);
});

test("AgentContextProfileService creates distinct context envelopes per agent", () => {
  const service = new AgentContextProfileService();
  const operationalMemory = new OperationalMemoryProjector().build({
    workflowThreadId: THREAD_ID,
    userStoryId: USER_STORY_ID,
    retryCount: 0,
    now,
  });

  const front = service.build({
    agentName: "front",
    agentProfileId: "front_agent",
    spec: buildSpec(),
    operationalMemory,
    now,
  });
  const odin = service.build({
    agentName: "odin",
    agentProfileId: "odin_agent",
    spec: buildSpec(),
    operationalMemory,
    routingDecision: ["frontAgent"],
    workflowStatus: "running",
    retryCount: 1,
    now,
  });

  assert.equal(front.includeSections.includes("code_context"), true);
  assert.equal(front.excludeSections.includes("status_decision"), true);
  assert.equal(odin.includeSections.includes("status_decision"), true);
  assert.equal(odin.excludeSections.includes("code_context"), true);
  assert.equal(odin.sections.some((section) => section.kind === "status_decision"), true);
});

function buildSpec() {
  return {
    id: SPEC_ID,
    userStoryId: USER_STORY_ID,
    version: 1,
    summary: "Atualizar a navegação principal.",
    technicalApproach: "Editar o componente React que renderiza os botões de navegação.",
    components: [
      {
        name: "App",
        type: "ui",
        description: "Componente principal com navegação Home, Tarefas e Calendário.",
        dependencies: [],
      },
    ],
    apiEndpoints: [],
    dataModels: [],
    acceptanceCriteria: ["O botão Home deve aparecer como Início."],
    generatedAt: now.toISOString(),
  };
}
