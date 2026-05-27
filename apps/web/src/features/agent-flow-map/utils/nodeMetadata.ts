import type { FlowNodeKind, FlowStage } from "../types/flow.types.js";
import type { HorusWorkflowNodeId } from "../types/api.types.js";

export type WorkflowNodeDefinition = {
  id: HorusWorkflowNodeId;
  label: string;
  shortLabel: string;
  description: string;
  stage: FlowStage;
  kind: FlowNodeKind;
  position: { x: number; y: number };
};

export type WorkflowEdgeDefinition = {
  id: string;
  source: HorusWorkflowNodeId;
  target: HorusWorkflowNodeId;
  label?: string;
  route?: "primary" | "loop" | "failure" | "conditional" | "agentExecution";
};

export const HORUS_NODE_BY_AGENT = {
  spec: "specAgent",
  odin: "odinAgent",
  front: "frontAgent",
  qa: "qaAgent",
  curator: "curatorAgent",
} as const satisfies Record<string, HorusWorkflowNodeId>;

export const MICRO_WORKFLOW_NODE_DEFINITIONS: WorkflowNodeDefinition[] = [
  {
    id: "specAgent",
    label: "Spec Agent",
    shortLabel: "Spec",
    description: "Gera ou reaproveita a especificação SDD da user story atual.",
    stage: "spec",
    kind: "workflow",
    position: { x: 620, y: 20 },
  },
  {
    id: "hitlCheckpoint",
    label: "Human review",
    shortLabel: "HITL",
    description: "Interrompe a execução para aprovação, edição ou rejeição da spec.",
    stage: "spec",
    kind: "approval",
    position: { x: 620, y: 170 },
  },
  {
    id: "odinAgent",
    label: "Odin router",
    shortLabel: "Odin",
    description: "Decide quais especialistas devem atuar e coordena retries.",
    stage: "supervision",
    kind: "decision",
    position: { x: 620, y: 330 },
  },
  {
    id: "frontAgent",
    label: "Front Agent",
    shortLabel: "Front",
    description: "Produz ou ajusta a implementação frontend da história.",
    stage: "execution",
    kind: "workflow",
    position: { x: 370, y: 540 },
  },
  {
    id: "qaAgent",
    label: "QA Agent",
    shortLabel: "QA",
    description: "Gera testes e evidências de validação para a entrega.",
    stage: "verification",
    kind: "workflow",
    position: { x: 870, y: 540 },
  },
  {
    id: "curatorAgent",
    label: "Curator Agent",
    shortLabel: "Curator",
    description: "Audita qualidade, aderência à spec e decide retry ou avanço.",
    stage: "curation",
    kind: "decision",
    position: { x: 620, y: 750 },
  },
  {
    id: "retryCheckpoint",
    label: "Retry approval",
    shortLabel: "Retry",
    description: "Ponto HITL quando o loop de autocorreção excede o limite.",
    stage: "curation",
    kind: "approval",
    position: { x: 620, y: 980 },
  },
  {
    id: "finalize",
    label: "Finalizado",
    shortLabel: "Done",
    description: "Estado visual terminal para runs concluídas.",
    stage: "terminal",
    kind: "terminal",
    position: { x: 300, y: 980 },
  },
  {
    id: "fail",
    label: "Falha",
    shortLabel: "Fail",
    description: "Estado visual terminal para runs com erro ou cancelamento.",
    stage: "terminal",
    kind: "terminal",
    position: { x: 940, y: 980 },
  },
];

export const MACRO_WORKFLOW_NODE_DEFINITIONS: WorkflowNodeDefinition[] = [
  {
    id: "specAgent",
    label: "Spec generation",
    shortLabel: "Spec",
    description: "Agrupa geração da spec e preparação do contrato da história.",
    stage: "spec",
    kind: "workflow",
    position: { x: 600, y: 40 },
  },
  {
    id: "hitlCheckpoint",
    label: "Human review",
    shortLabel: "Review",
    description: "Aprovação humana da spec antes da execução.",
    stage: "spec",
    kind: "approval",
    position: { x: 600, y: 190 },
  },
  {
    id: "odinAgent",
    label: "Odin routing",
    shortLabel: "Odin",
    description: "Planeja a execução e decide o próximo especialista.",
    stage: "supervision",
    kind: "decision",
    position: { x: 600, y: 350 },
  },
  {
    id: "frontAgent",
    label: "Front Agent",
    shortLabel: "Front",
    description: "Produz ou ajusta a implementação frontend da história.",
    stage: "execution",
    kind: "workflow",
    position: { x: 360, y: 560 },
  },
  {
    id: "qaAgent",
    label: "QA Agent",
    shortLabel: "QA",
    description: "Gera testes e evidências de validação para a entrega.",
    stage: "verification",
    kind: "workflow",
    position: { x: 840, y: 560 },
  },
  {
    id: "curatorAgent",
    label: "Curator validation",
    shortLabel: "Curator",
    description: "Valida a entrega e decide avançar, retry ou escalonar.",
    stage: "curation",
    kind: "decision",
    position: { x: 600, y: 770 },
  },
  {
    id: "retryCheckpoint",
    label: "Retry gate",
    shortLabel: "Retry",
    description: "Aprovação humana quando retries automáticos esgotam.",
    stage: "curation",
    kind: "approval",
    position: { x: 600, y: 990 },
  },
  {
    id: "finalize",
    label: "Finalizado",
    shortLabel: "Done",
    description: "Estado visual terminal para runs concluídas.",
    stage: "terminal",
    kind: "terminal",
    position: { x: 290, y: 990 },
  },
  {
    id: "fail",
    label: "Falha",
    shortLabel: "Fail",
    description: "Estado visual terminal para runs com erro ou cancelamento.",
    stage: "terminal",
    kind: "terminal",
    position: { x: 910, y: 990 },
  },
];

export const MICRO_WORKFLOW_EDGE_DEFINITIONS: WorkflowEdgeDefinition[] = [
  { id: "spec-hitl", source: "specAgent", target: "hitlCheckpoint" },
  { id: "spec-finalize", source: "specAgent", target: "finalize", label: "spec only", route: "conditional" },
  { id: "hitl-odin", source: "hitlCheckpoint", target: "odinAgent" },
  { id: "hitl-finalize", source: "hitlCheckpoint", target: "finalize", label: "cancel", route: "conditional" },
  { id: "odin-front", source: "odinAgent", target: "frontAgent", label: "front", route: "conditional" },
  { id: "odin-qa", source: "odinAgent", target: "qaAgent", label: "qa", route: "conditional" },
  { id: "front-curator", source: "frontAgent", target: "curatorAgent" },
  { id: "qa-curator", source: "qaAgent", target: "curatorAgent" },
  { id: "curator-spec", source: "curatorAgent", target: "specAgent", label: "next story", route: "loop" },
  { id: "curator-odin", source: "curatorAgent", target: "odinAgent", label: "verdict", route: "loop" },
  { id: "curator-retry", source: "curatorAgent", target: "retryCheckpoint", label: "HITL", route: "conditional" },
  { id: "retry-odin", source: "retryCheckpoint", target: "odinAgent", label: "continue", route: "loop" },
  { id: "retry-finalize", source: "retryCheckpoint", target: "finalize", label: "stop", route: "conditional" },
  { id: "odin-finalize", source: "odinAgent", target: "finalize", label: "done", route: "conditional" },
  { id: "curator-fail", source: "curatorAgent", target: "fail", label: "error", route: "failure" },
];

export const MACRO_WORKFLOW_EDGE_DEFINITIONS: WorkflowEdgeDefinition[] = [
  { id: "macro-spec-hitl", source: "specAgent", target: "hitlCheckpoint" },
  { id: "macro-spec-finalize", source: "specAgent", target: "finalize", label: "spec only", route: "conditional" },
  { id: "macro-hitl-odin", source: "hitlCheckpoint", target: "odinAgent" },
  { id: "macro-hitl-finalize", source: "hitlCheckpoint", target: "finalize", label: "cancel", route: "conditional" },
  { id: "macro-odin-front", source: "odinAgent", target: "frontAgent", label: "front", route: "conditional" },
  { id: "macro-odin-qa", source: "odinAgent", target: "qaAgent", label: "qa", route: "conditional" },
  { id: "macro-front-curator", source: "frontAgent", target: "curatorAgent" },
  { id: "macro-qa-curator", source: "qaAgent", target: "curatorAgent" },
  { id: "macro-curator-odin", source: "curatorAgent", target: "odinAgent", label: "verdict", route: "loop" },
  { id: "macro-curator-spec", source: "curatorAgent", target: "specAgent", label: "next", route: "loop" },
  { id: "macro-curator-retry", source: "curatorAgent", target: "retryCheckpoint", label: "HITL", route: "conditional" },
  { id: "macro-retry-odin", source: "retryCheckpoint", target: "odinAgent", label: "continue", route: "loop" },
  { id: "macro-retry-finalize", source: "retryCheckpoint", target: "finalize", label: "stop", route: "conditional" },
  { id: "macro-odin-finalize", source: "odinAgent", target: "finalize", label: "done", route: "conditional" },
  { id: "macro-curator-fail", source: "curatorAgent", target: "fail", label: "error", route: "failure" },
];
