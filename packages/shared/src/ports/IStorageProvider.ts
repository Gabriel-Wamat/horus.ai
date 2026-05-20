import type { WorkflowState } from "../entities/WorkflowState.js";

export interface IStorageProvider {
  save(state: WorkflowState): Promise<void>;

  load(threadId: string): Promise<WorkflowState | null>;

  list(): Promise<string[]>;

  delete(threadId: string): Promise<void>;
}
