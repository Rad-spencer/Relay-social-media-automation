import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import pg from "pg";
import { createDatabase } from "../src/db/database.js";
import { postgresConfig, databaseSchema } from "../src/db/postgres.js";
if (existsSync(".env")) loadEnvFile(".env");
const url = process.env.DATABASE_URL;
try {
  if (!url) throw new Error("missing");
  if (process.argv[2] === "setup") {
    const db = await createDatabase(url);
    try {
      const result = await db.query<{ count: string }>(
        "SELECT count(*) count FROM schema_migrations",
      );
      console.log(
        `Relay schema initialized; ${result.rows[0].count} migration markers verified. Existing local data was not copied.`,
      );
    } finally {
      await db.close();
    }
  } else {
    const pool = new pg.Pool(postgresConfig(url));
    try {
      await pool.query("SELECT 1 AS connected");
      const result = await pool.query(
        "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS ready",
        [databaseSchema()],
      );
      console.log(
        `Database connection verified. Relay schema ${result.rows[0].ready ? "exists" : "not initialized; run npm run db:setup"}.`,
      );
    } finally {
      await pool.end();
    }
  }
} catch {
  console.error(
    "Database setup/check failed. Verify DATABASE_URL, database password, network access, session-pooler port 5432 and trusted TLS CA. No credentials have been printed. See docs/GITHUB_SUPABASE.md.",
  );
  process.exitCode = 1;
}
