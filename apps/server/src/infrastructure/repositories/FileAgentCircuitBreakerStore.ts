import { join } from "node:path";
import { z } from "zod";
import {
  AgentProfileIdSchema,
  type AgentProfileId,
} from "@u-build/shared";
import type {
  AgentCircuitBreakerStore,
  AgentCircuitState,
} from "../../application/services/AgentCircuitBreakerStore.js";
import {
  readJsonFileRaw,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";

const CIRCUIT_BREAKER_FILE = "agent-circuit-breakers.json";

const AgentCircuitStateSchema = z.object({
  failureCount: z.number().int().min(0),
  openedAtMs: z.number().int().min(0).nullable(),
  updatedAt: z.string().optional(),
});

const CircuitBreakerDocumentSchema = z.object({
  circuits: z.record(AgentProfileIdSchema, AgentCircuitStateSchema),
});

type CircuitBreakerDocument = z.infer<typeof CircuitBreakerDocumentSchema>;

const emptyDocument = (): CircuitBreakerDocument => ({ circuits: {} });

export class FileAgentCircuitBreakerStore implements AgentCircuitBreakerStore {
  constructor(private readonly baseDir = "./data/agent-circuit-breakers") {}

  async get(
    agentProfileId: AgentProfileId
  ): Promise<AgentCircuitState | undefined> {
    const document = await this.read();
    const state = document.circuits[agentProfileId];
    return state
      ? {
          failureCount: state.failureCount,
          openedAtMs: state.openedAtMs,
        }
      : undefined;
  }

  async set(
    agentProfileId: AgentProfileId,
    state: AgentCircuitState
  ): Promise<void> {
    const profileId = AgentProfileIdSchema.parse(agentProfileId);
    await this.update((document) => ({
      circuits: {
        ...document.circuits,
        [profileId]: {
          failureCount: state.failureCount,
          openedAtMs: state.openedAtMs,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  }

  async clear(agentProfileId: AgentProfileId): Promise<void> {
    const profileId = AgentProfileIdSchema.parse(agentProfileId);
    await this.update((document) => {
      const circuits = { ...document.circuits };
      delete circuits[profileId];
      return { circuits };
    });
  }

  private async read(): Promise<CircuitBreakerDocument> {
    return CircuitBreakerDocumentSchema.parse(
      await readJsonFileRaw(this.filePath(), { defaultValue: emptyDocument() })
    );
  }

  private async update(
    updateDocument: (document: CircuitBreakerDocument) => CircuitBreakerDocument
  ): Promise<void> {
    const next = CircuitBreakerDocumentSchema.parse(
      updateDocument(await this.read())
    );
    await writeJsonFileAtomic(this.filePath(), next, { trailingNewline: true });
  }

  private filePath(): string {
    return join(this.baseDir, CIRCUIT_BREAKER_FILE);
  }
}
