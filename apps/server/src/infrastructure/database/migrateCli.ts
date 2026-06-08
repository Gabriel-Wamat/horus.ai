import "dotenv/config";
import { createPgPool, readDatabaseConfig } from "./pool.js";
import { runMigrations } from "./migrate.js";

const persistenceDriver = process.env["PERSISTENCE_DRIVER"]?.trim() || "file";
if (persistenceDriver !== "postgres") {
  console.log(
    `[db:migrate] Skipping migrations for PERSISTENCE_DRIVER=${persistenceDriver}.`
  );
  process.exit(0);
}

const pool = createPgPool(readDatabaseConfig());

try {
  const applied = await runMigrations(pool);
  if (applied.length === 0) {
    console.log("[db:migrate] No pending migrations.");
  } else {
    for (const migration of applied) {
      console.log(`[db:migrate] Applied ${migration.id} at ${migration.appliedAt}`);
    }
  }
} finally {
  await pool.end();
}
