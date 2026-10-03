import { PGlite } from "@electric-sql/pglite";
import { connectPostgres } from "./postgres.js";
import { readFileSync, mkdirSync } from "node:fs";
export interface DB {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function createDatabase(url?: string): Promise<DB> {
  if (url?.startsWith("postgres")) return connectPostgres(url);
  if (url && !url.startsWith("memory://") && /^[a-z]+:\/\//i.test(url))
    throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
  const location = url || ".data/postgres";
  if (!location.startsWith("memory://"))
    mkdirSync(location, { recursive: true });
  const p = new PGlite(location);
  await p.waitReady;
  await p.exec(
    readFileSync(new URL("./migration.sql", import.meta.url), "utf8"),
  );
  const db: DB = {
    query: <T>(sql: string, params: unknown[] = []) => p.query<T>(sql, params),
    transaction: (fn) =>
      p.transaction((tx) =>
        fn({
          query: <T>(s: string, v: unknown[] = []) => tx.query<T>(s, v),
          transaction: () => {
            throw new Error("Nested transaction unavailable");
          },
          close: async () => {},
        }),
      ),
    close: () => p.close(),
  };
  return db;
}
