import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  CodingRuntimeEventSchema,
  CodingRuntimeSnapshotSchema,
  CodingTaskSchema,
  type CodingRuntimeEvent,
  type CodingRuntimeSnapshot,
  type CodingTask,
} from "@u-build/shared";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";
import type {
  CodingTaskRepository,
  CreateCodingTaskRecordInput,
} from "../../application/ports/CodingRuntimePorts.js";

const CodingTaskFileRecordSchema = z.object({
  task: CodingTaskSchema,
  events: z.array(CodingRuntimeEventSchema),
});

type CodingTaskFileRecord = z.infer<typeof CodingTaskFileRecordSchema>;

export class FileCodingTaskRepository implements CodingTaskRepository {
  constructor(private readonly baseDir = "./data/coding-tasks") {}

  async findByIdempotencyKey(
    idempotencyKey: string
  ): Promise<CodingRuntimeSnapshot | null> {
    const records = await this.listRecords();
    const record = records.find(
      (item) => item.task.idempotencyKey === idempotencyKey
    );
    return record ? snapshotFromRecord(record) : null;
  }

  async getTask(taskId: string): Promise<CodingTask | null> {
    const record = await this.readRecord(taskId);
    return record?.task ?? null;
  }

  async getSnapshot(taskId: string): Promise<CodingRuntimeSnapshot | null> {
    const record = await this.readRecord(taskId);
    return record ? snapshotFromRecord(record) : null;
  }

  async listEvents(
    taskId: string,
    filter: { afterSequence?: number } = {}
  ): Promise<CodingRuntimeEvent[]> {
    const record = await this.readRecord(taskId);
    if (!record) return [];
    const afterSequence = filter.afterSequence ?? 0;
    return record.events.filter((event) => event.sequence > afterSequence);
  }

  async recordTransition(
    input: CreateCodingTaskRecordInput
  ): Promise<CodingRuntimeSnapshot> {
    const existing = await this.readRecord(input.task.id);
    const events = existing?.events ?? [];
    const event = CodingRuntimeEventSchema.parse({
      ...input.event,
      sequence: events.length + 1,
      createdAt: input.event.createdAt ?? new Date().toISOString(),
    });
    const record = CodingTaskFileRecordSchema.parse({
      task: input.task,
      events: [...events, event],
    });
    await writeJsonFileAtomic(this.taskPath(input.task.id), record, {
      trailingNewline: true,
    });
    return snapshotFromRecord(record);
  }

  private async listRecords(): Promise<CodingTaskFileRecord[]> {
    let entries;
    try {
      entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) =>
          readJsonFile(
            join(this.baseDir, entry.name),
            CodingTaskFileRecordSchema
          )
        )
    );
    return records.sort((left, right) =>
      left.task.createdAt.localeCompare(right.task.createdAt)
    );
  }

  private async readRecord(
    taskId: string
  ): Promise<CodingTaskFileRecord | null> {
    try {
      return await readJsonFile(
        this.taskPath(taskId),
        CodingTaskFileRecordSchema
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private taskPath(taskId: string): string {
    return join(this.baseDir, `${taskId}.json`);
  }
}

function snapshotFromRecord(record: CodingTaskFileRecord): CodingRuntimeSnapshot {
  return CodingRuntimeSnapshotSchema.parse({
    task: record.task,
    events: record.events,
    latestSequence: record.events.at(-1)?.sequence ?? 0,
  });
}
