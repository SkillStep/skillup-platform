import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export type SkillUpDatabase = NodePgDatabase<typeof schema>;

export type DatabaseClient = Readonly<{
  db: SkillUpDatabase;
  pool: Pool;
  close: () => Promise<void>;
  ping: () => Promise<boolean>;
}>;

export type DatabaseClientOptions = Readonly<{
  connectionString: string;
  maxConnections?: number;
  applicationName?: string;
}>;

export function requireDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const value = environment.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required.");

  const parsed = new URL(value);
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the postgresql:// or postgres:// protocol.");
  }

  return value;
}

export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    application_name: options.applicationName ?? "skillup-platform",
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
  });

  const db = drizzle({ client: pool, schema });

  return {
    db,
    pool,
    close: async () => pool.end(),
    ping: async () => {
      const result = await pool.query<{ ok: number }>("select 1 as ok");
      return result.rows[0]?.ok === 1;
    },
  };
}

export * from "./schema.js";
