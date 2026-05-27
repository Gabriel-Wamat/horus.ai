import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { PgPool } from "../database/pool.js";

export const checkpointer = new MemorySaver();

export interface WorkflowCheckpointerOptions {
  driver: "file" | "postgres";
  pool?: PgPool;
}

export async function createWorkflowCheckpointer(
  options: WorkflowCheckpointerOptions
): Promise<BaseCheckpointSaver> {
  if (options.driver === "postgres") {
    if (!options.pool) {
      throw new Error(
        "Postgres workflow checkpointer requires the configured repository pool."
      );
    }

    const postgresSaver = new PostgresSaver(options.pool);
    await postgresSaver.setup();
    return postgresSaver;
  }

  return new MemorySaver();
}
