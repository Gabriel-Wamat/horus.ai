import type {
  AgentFileOperationStatus,
  AgentFileOperationType,
} from "@u-build/shared";

export interface TimelineRow {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
}

export interface OperationalTraceRow {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: "running" | "failed" | "success" | "muted";
  agent: string;
  traceId: string | null;
  toolCallId: string | null;
  steps: OperationalTraceStep[];
}

export interface OperationalTraceStep {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: "running" | "failed" | "success" | "muted";
}

export interface ConsoleFileRow {
  id: string;
  path: string;
  operationType: AgentFileOperationType;
  status: AgentFileOperationStatus;
  source: string;
  sequence: number;
  timestamp: string;
  additions: number | null;
  deletions: number | null;
  diffPreview: string;
}

export interface ContextReceiptRow {
  id: string;
  agent: string;
  profile: string;
  snapshotId: string;
  timestamp: string;
  confidence: number;
  selectedFiles: string[];
  omittedFiles: number;
  selectedBytes: number;
  channels: string[];
  reasons: string[];
}

export interface ValidationChainRow {
  id: string;
  title: string;
  status: string;
  tone: "running" | "failed" | "success" | "muted";
  timestamp: string;
  agent: string;
  traceId: string | null;
  steps: ValidationChainStep[];
}

export interface ValidationChainStep {
  id: string;
  commandId: string;
  taskId: string | null;
  label: string;
  status: string;
  tone: "running" | "failed" | "success" | "muted";
}
