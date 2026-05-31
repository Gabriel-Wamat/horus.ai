import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  AgentMemoryItemSchema,
  AgentMemoryLinkSchema,
  AgentMemorySummarySchema,
  type AgentMemoryItem,
  type AgentMemoryLink,
  type AgentMemoryScope,
  type AgentMemorySummary,
} from "@u-build/shared";
import {
  readJsonFileRaw,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";
import type { AgentMemoryRepository } from "./contracts.js";

const ITEMS_FILE = "agent-memory-items.json";
const SUMMARIES_FILE = "agent-memory-summaries.json";
const LINKS_FILE = "agent-memory-links.json";

export class FileAgentMemoryRepository implements AgentMemoryRepository {
  constructor(private readonly baseDir = "./data/agent-memory") {}

  async appendItem(item: AgentMemoryItem): Promise<AgentMemoryItem> {
    const validated = AgentMemoryItemSchema.parse(item);
    const existing = await this.readArray(ITEMS_FILE, AgentMemoryItemSchema);
    await this.writeArray(ITEMS_FILE, [
      ...existing.filter((entry) => entry.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async listItems(
    filter: Parameters<AgentMemoryRepository["listItems"]>[0] = {}
  ): Promise<AgentMemoryItem[]> {
    const nowMs = Date.now();
    let items = await this.readArray(ITEMS_FILE, AgentMemoryItemSchema);
    items = items.filter((item) => {
      if (filter.kind && item.kind !== filter.kind) return false;
      if (filter.agentProfileId && item.scope.agentProfileId !== filter.agentProfileId) {
        return false;
      }
      if (!filter.includeStale) {
        if (item.supersededByMemoryId) return false;
        if (item.staleAt && Date.parse(item.staleAt) <= nowMs) return false;
      }
      return matchesScope(item.scope, filter.scope);
    });
    return items
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, filter.limit ?? items.length);
  }

  async upsertSummary(
    summary: AgentMemorySummary
  ): Promise<AgentMemorySummary> {
    const validated = AgentMemorySummarySchema.parse(summary);
    const existing = await this.readArray(SUMMARIES_FILE, AgentMemorySummarySchema);
    await this.writeArray(SUMMARIES_FILE, [
      ...existing.filter((entry) => entry.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async listSummaries(
    filter: Parameters<AgentMemoryRepository["listSummaries"]>[0] = {}
  ): Promise<AgentMemorySummary[]> {
    let summaries = await this.readArray(SUMMARIES_FILE, AgentMemorySummarySchema);
    summaries = summaries.filter((summary) => {
      if (
        filter.agentProfileId &&
        summary.scope.agentProfileId !== filter.agentProfileId
      ) {
        return false;
      }
      return matchesScope(summary.scope, filter.scope);
    });
    return summaries
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, filter.limit ?? summaries.length);
  }

  async appendLink(link: AgentMemoryLink): Promise<AgentMemoryLink> {
    const validated = AgentMemoryLinkSchema.parse(link);
    const existing = await this.readArray(LINKS_FILE, AgentMemoryLinkSchema);
    await this.writeArray(LINKS_FILE, [
      ...existing.filter((entry) => entry.id !== validated.id),
      validated,
    ]);
    return validated;
  }

  async listLinks(memoryId: string): Promise<AgentMemoryLink[]> {
    return (await this.readArray(LINKS_FILE, AgentMemoryLinkSchema))
      .filter(
        (link) => link.fromMemoryId === memoryId || link.toMemoryId === memoryId
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private async readArray<T>(
    filename: string,
    schema: { parse(value: unknown): T }
  ): Promise<T[]> {
    await this.ensureBaseDir();
    try {
      const parsed = await readJsonFileRaw(join(this.baseDir, filename));
      return Array.isArray(parsed) ? parsed.map((item) => schema.parse(item)) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return [];
    }
  }

  private async writeArray(filename: string, value: unknown[]): Promise<void> {
    await writeJsonFileAtomic(join(this.baseDir, filename), value, {
      trailingNewline: true,
    });
  }
}

function matchesScope(
  itemScope: AgentMemoryScope,
  filterScope: Partial<AgentMemoryScope> | undefined
): boolean {
  if (!filterScope) return true;
  for (const key of Object.keys(filterScope) as Array<keyof AgentMemoryScope>) {
    const expected = filterScope[key];
    if (expected === undefined) continue;
    if (itemScope[key] !== expected) return false;
  }
  return true;
}
