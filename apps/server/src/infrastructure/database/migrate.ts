import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PgPool } from "./pool.js";

export interface AppliedMigration {
  id: string;
  appliedAt: string;
}

const COMPILED_MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations"
);
const SOURCE_MIGRATIONS_DIR = join(
  process.cwd(),
  "src",
  "infrastructure",
  "database",
  "migrations"
);

export async function runMigrations(pool: PgPool): Promise<AppliedMigration[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = await resolveMigrationsDir();
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const applied: AppliedMigration[] = [];
  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const existing = await pool.query(
      "SELECT id FROM schema_migrations WHERE id = $1",
      [id]
    );
    if (existing.rowCount && existing.rowCount > 0) continue;

    const sql = await fs.readFile(join(migrationsDir, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      const result = await client.query<{ id: string; applied_at: Date }>(
        "INSERT INTO schema_migrations (id) VALUES ($1) RETURNING id, applied_at",
        [id]
      );
      await client.query("COMMIT");
      const row = result.rows[0]!;
      applied.push({ id: row.id, appliedAt: row.applied_at.toISOString() });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return applied;
}

async function resolveMigrationsDir(): Promise<string> {
  try {
    await fs.access(COMPILED_MIGRATIONS_DIR);
    return COMPILED_MIGRATIONS_DIR;
  } catch {
    await fs.access(SOURCE_MIGRATIONS_DIR);
    return SOURCE_MIGRATIONS_DIR;
  }
}
