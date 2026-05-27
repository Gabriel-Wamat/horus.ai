import "dotenv/config";
import { createPgPool, readDatabaseConfig } from "./pool.js";
import { runMigrations } from "./migrate.js";

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
