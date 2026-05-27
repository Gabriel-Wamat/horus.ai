import { join } from "node:path";
import {
  HorusRunEventSnapshotSchema,
  type HorusRunEventSnapshot,
  type WorkflowEvent,
} from "@u-build/shared";
import { mapWorkflowEvent } from "../../application/services/horusRunFlowMapping.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";
import type { WorkflowEventLogRepository } from "./contracts.js";

export class FileWorkflowEventLogRepository
  implements WorkflowEventLogRepository
{
  constructor(private readonly baseDir = "./data/workflow-events") {}

  async append(event: WorkflowEvent): Promise<HorusRunEventSnapshot> {
    const events = await this.list(event.threadId);
    const nextSequence =
      events.reduce((max, item) => Math.max(max, item.sequence), 0) + 1;
    const snapshot = HorusRunEventSnapshotSchema.parse(
      mapWorkflowEvent(event, nextSequence)
    );
    await writeJsonFileAtomic(this.eventPath(event.threadId), [
      ...events,
      snapshot,
    ]);
    return snapshot;
  }

  async list(threadId: string): Promise<HorusRunEventSnapshot[]> {
    try {
      return (await readJsonFile(
        this.eventPath(threadId),
        HorusRunEventSnapshotSchema.array()
      ))
        .sort((left, right) => left.sequence - right.sequence);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async listAfter(
    threadId: string,
    sequence: number
  ): Promise<HorusRunEventSnapshot[]> {
    return (await this.list(threadId)).filter((event) => event.sequence > sequence);
  }

  private eventPath(threadId: string): string {
    return join(this.baseDir, `${threadId}.json`);
  }
}
