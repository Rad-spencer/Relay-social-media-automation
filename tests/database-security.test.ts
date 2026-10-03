import { expect, it } from "vitest";
import { createDatabase } from "../src/db/database";
it("blocks non-owner direct table access even if table SELECT is granted", async () => {
  const db = await createDatabase("memory://");
  try {
    const unprotected = await db.query<{ count: string }>(
      "SELECT count(*) count FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity",
    );
    expect(Number(unprotected.rows[0].count)).toBe(0);
    await db.query("CREATE ROLE relay_api_probe");
    await db.query("GRANT USAGE ON SCHEMA public TO relay_api_probe");
    await db.query(
      "GRANT SELECT ON ALL TABLES IN SCHEMA public TO relay_api_probe",
    );
    await db.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES('private','private@example.test','Private','test-hash')",
    );
    await db.query("SET ROLE relay_api_probe");
    expect((await db.query("SELECT * FROM users")).rows).toEqual([]);
    await db.query("RESET ROLE");
    expect((await db.query("SELECT * FROM users")).rows).toHaveLength(1);
  } finally {
    await db.close();
  }
}, 30000);
