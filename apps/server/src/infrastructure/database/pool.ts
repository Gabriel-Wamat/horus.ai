import pg from "pg";

const { Pool } = pg;

export interface DatabaseConfig {
  connectionString: string;
  ssl?: boolean;
}

export function readDatabaseConfig(
  env: Record<string, string | undefined> = process.env
): DatabaseConfig {
  const connectionString = env["DATABASE_URL"]?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when PERSISTENCE_DRIVER=postgres.");
  }

  return {
    connectionString,
    ssl: env["DATABASE_SSL"] === "true",
  };
}

export function createPgPool(config: DatabaseConfig): pg.Pool {
  return new Pool({
    connectionString: config.connectionString,
    ...(config.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

export type PgPool = pg.Pool;
export type PgClient = pg.PoolClient | pg.Pool;
