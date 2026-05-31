import { dirname, join } from "node:path";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  HorusRunEventSnapshotSchema,
  type HorusRunEventSnapshot,
  type WorkflowEvent,
} from "@u-build/shared";
import { mapWorkflowEvent } from "../../application/services/horusRunFlowMapping.js";
import { readJsonFile } from "../storage/JsonFileStore.js";
import type { WorkflowEventLogRepository } from "./contracts.js";

export class FileWorkflowEventLogRepository
  implements WorkflowEventLogRepository
{
  constructor(private readonly baseDir = "./data/workflow-events") {}

  async append(event: WorkflowEvent): Promise<HorusRunEventSnapshot> {
    return withFileLock(this.lockPath(event.threadId), async () => {
      const nextSequence = (await this.maxSequence(event.threadId)) + 1;
      const snapshot = HorusRunEventSnapshotSchema.parse(
        mapWorkflowEvent(event, nextSequence)
      );
      await appendWorkflowEventLine(this.eventLogPath(event.threadId), snapshot);
      return snapshot;
    });
  }

  async list(threadId: string): Promise<HorusRunEventSnapshot[]> {
    const [legacyEvents, appendOnlyEvents] = await Promise.all([
      this.listLegacyJsonEvents(threadId),
      readWorkflowEventLines(this.eventLogPath(threadId)),
    ]);
    return [...legacyEvents, ...appendOnlyEvents].sort(
      (left, right) => left.sequence - right.sequence
    );
  }

  async listAfter(
    threadId: string,
    sequence: number
  ): Promise<HorusRunEventSnapshot[]> {
    return (await this.list(threadId)).filter((event) => event.sequence > sequence);
  }

  private async maxSequence(threadId: string): Promise<number> {
    const events = await this.list(threadId);
    return events.reduce((max, item) => Math.max(max, item.sequence), 0);
  }

  private async listLegacyJsonEvents(
    threadId: string
  ): Promise<HorusRunEventSnapshot[]> {
    try {
      return await readJsonFile(
        this.legacyEventPath(threadId),
        HorusRunEventSnapshotSchema.array()
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  private legacyEventPath(threadId: string): string {
    return join(this.baseDir, `${threadId}.json`);
  }

  private eventLogPath(threadId: string): string {
    return join(this.baseDir, `${threadId}.jsonl`);
  }

  private lockPath(threadId: string): string {
    return join(this.baseDir, `${threadId}.lock`);
  }
}

async function appendWorkflowEventLine(
  path: string,
  event: HorusRunEventSnapshot
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "a");
  try {
    await handle.writeFile(`${JSON.stringify(event)}\n`, "utf-8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readWorkflowEventLines(
  path: string
): Promise<HorusRunEventSnapshot[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const events: HorusRunEventSnapshot[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    events.push(HorusRunEventSnapshotSchema.parse(JSON.parse(trimmed)));
  }
  return events;
}

async function withFileLock<T>(
  path: string,
  operation: () => Promise<T>
): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  const lock = await acquireFileLock(path);
  try {
    return await operation();
  } finally {
    await lock.close();
    await rm(path, { force: true }).catch(() => undefined);
  }
}

async function acquireFileLock(path: string): Promise<Awaited<ReturnType<typeof open>>> {
  const started = Date.now();
  const timeoutMs = 5_000;
  for (;;) {
    try {
      return await open(path, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for workflow event lock: ${path}`);
      }
      await delay(25);
    }
  }
}
