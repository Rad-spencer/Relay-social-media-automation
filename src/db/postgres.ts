import pg from "pg";
import { readFileSync } from "node:fs";
import type { DB } from "./database.js";

export function postgresConfig(value: string): pg.PoolConfig {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error(
      "Use the PostgreSQL connection string from Supabase Connect, not its API URL.",
    );
  if (url.port === "6543")
    throw new Error(
      "Use Supabase's session pooler on port 5432 or a direct connection, not transaction mode.",
    );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // URL SSL parameters can override pg's explicit certificate verification.
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("ssl")) url.searchParams.delete(key);
  }
  const ca = process.env.DATABASE_SSL_CA?.replaceAll("\\n", "\n");
  return {
    connectionString: url.href,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    ssl: local
      ? undefined
      : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
}
export function databaseSchema() {
  const schema = process.env.DATABASE_SCHEMA || "relay";
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(schema) ||
    ["public", "auth", "storage", "extensions", "information_schema"].includes(
      schema,
    ) ||
    schema.startsWith("pg_")
  )
    throw new Error(
      "DATABASE_SCHEMA must name a private Relay schema, such as relay.",
    );
  return schema;
}
export async function connectPostgres(url: string): Promise<DB> {
  const schema = databaseSchema();
  const pool = new pg.Pool(postgresConfig(url));
  pool.on("error", () =>
    console.error("PostgreSQL idle connection error; the pool will reconnect."),
  );
  const withClient = async <T>(
    fn: (c: pg.PoolClient) => Promise<T>,
  ): Promise<T> => {
    const c = await pool.connect();
    try {
      await c.query(`SET search_path TO "${schema}"`);
      return await fn(c);
    } finally {
      c.release();
    }
  };
  const scoped = (c: pg.PoolClient): DB => ({
    query: async <T>(sql: string, params: unknown[] = []) => ({
      rows: (await c.query(sql, params)).rows as T[],
    }),
    transaction: async () => {
      throw new Error("Nested transaction unavailable");
    },
    close: async () => {},
  });
  const db: DB = {
    query: <T>(sql: string, params: unknown[] = []) =>
      withClient((c) => scoped(c).query<T>(sql, params)),
    transaction: <T>(fn: (tx: DB) => Promise<T>) =>
      withClient(async (c) => {
        await c.query("BEGIN");
        try {
          const result = await fn(scoped(c));
          await c.query("COMMIT");
          return result;
        } catch (error) {
          await c.query("ROLLBACK");
          throw error;
        }
      }),
    close: () => pool.end(),
  };
  try {
    await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `relay-schema:${schema}`,
      ]);
      await tx.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await tx.query(`REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC`);
      // Supabase API roles must never access Relay's password hashes or sessions.
      const roles = (
        await tx.query<{ rolname: string }>(
          "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')",
        )
      ).rows;
      for (const { rolname } of roles)
        await tx.query(`REVOKE ALL ON SCHEMA "${schema}" FROM "${rolname}"`);
      await tx.query(
        readFileSync(new URL("./migration.sql", import.meta.url), "utf8"),
      );
    });
    return db;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
