import { afterEach, expect, it, vi } from "vitest";
import { postgresConfig, databaseSchema } from "../src/db/postgres";
afterEach(() => vi.unstubAllEnvs());
it("requires verified TLS remotely even when URL requests no verification", () => {
  const config = postgresConfig(
    "postgresql://user:secret@db.example.com:5432/postgres?sslmode=no-verify",
  );
  expect(config.ssl).toEqual({ rejectUnauthorized: true });
  expect(config.connectionString).not.toContain("sslmode");
  expect(config.max).toBe(5);
});
it("accepts only PostgreSQL direct/session connections", () => {
  expect(() => postgresConfig("https://example.supabase.co")).toThrow(
    /PostgreSQL/,
  );
  expect(() =>
    postgresConfig("postgresql://user:secret@pool.example.com:6543/postgres"),
  ).toThrow(/session/);
  expect(
    postgresConfig("postgresql://localhost:5432/test").ssl,
  ).toBeUndefined();
});
it("keeps Relay out of exposed or reserved schemas", () => {
  for (const value of [
    "public",
    "auth",
    "storage",
    "pg_catalog",
    'relay";drop schema auth;--',
  ]) {
    vi.stubEnv("DATABASE_SCHEMA", value);
    expect(() => databaseSchema()).toThrow(/private/);
  }
  vi.stubEnv("DATABASE_SCHEMA", "relay");
  expect(databaseSchema()).toBe("relay");
});
