import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createDatabase, type DB } from "../src/db/database";
import { createApp, errorHandler } from "../src/server/app";
import { exchange, identity } from "../src/server/oauth/providers";
import { decrypt, encrypt } from "../src/server/oauth/storage";
import { hash } from "../src/server/security";
vi.mock("../src/server/oauth/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/oauth/providers")>()),
  exchange: vi.fn(),
  identity: vi.fn(),
}));
const origin = "https://relay.example.test";
let db: DB, app: Express;
beforeAll(async () => {
  db = await createDatabase("memory://");
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("OAUTH_ENCRYPTION_KEY", "ab".repeat(32));
  app = createApp(db, origin);
  app.use(errorHandler);
  vi.mocked(exchange).mockResolvedValue({
    access_token: "provider-secret-token",
    expires_in: 3600,
    scope: "openid profile",
  });
  vi.mocked(identity).mockResolvedValue({
    subject: "google-new-user",
    name: "Social Owner",
    emailVerified: false,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
async function start() {
  const r = await request(app)
    .post("/api/auth/social/google/start")
    .set("Origin", origin)
    .send({});
  expect(r.status).toBe(200);
  const url = new URL(r.body.url);
  return {
    state: url.searchParams.get("state")!,
    cookie: r.headers["set-cookie"][0].split(";")[0],
    url,
  };
}
async function callback(
  a: { state: string; cookie: string },
  extraCookie = "",
) {
  return request(app)
    .get("/api/auth/social/google/callback")
    .query({ state: a.state, code: "test-code" })
    .set("Cookie", [a.cookie, extraCookie].filter(Boolean).join("; "));
}
async function owner(email: string) {
  const r = await request(app).post("/api/auth/register").send({
    email,
    password: "test-only-password",
    name: "Owner",
    workspaceName: "Workspace",
  });
  const cookie = r.headers["set-cookie"][0].split(";")[0];
  const s = await request(app).get("/api/session").set("Cookie", cookie);
  return { cookie, user: s.body };
}
describe("social authentication", () => {
  it("lists seven providers without exposing credentials and blocks unconfigured starts", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const r = await request(app).get("/api/auth/providers");
    expect(r.body.providers).toHaveLength(7);
    expect(JSON.stringify(r.body)).not.toContain("test-secret");
    expect(
      (
        await request(app)
          .post("/api/auth/social/google/start")
          .set("Origin", origin)
      ).status,
    ).toBe(503);
  });
  it("requires same-origin starts, stores hashed state, and sends PKCE without the verifier", async () => {
    expect(
      (await request(app).post("/api/auth/social/google/start")).status,
    ).toBe(403);
    const a = await start();
    const row = (
      await db.query<{ verifier: string }>(
        "SELECT verifier FROM oauth_attempts WHERE state_hash=$1",
        [hash(a.state)],
      )
    ).rows[0];
    expect(row.verifier).toBeTruthy();
    expect(a.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(a.url.toString()).not.toContain(row.verifier);
    expect(a.url.searchParams.get("redirect_uri")).toBe(
      `${origin}/api/auth/social/google/callback`,
    );
  });
  it("rejects wrong browsers and provider mix-ups before exchanging a code", async () => {
    const a = await start();
    const wrong = await callback({ ...a, cookie: "relay_oauth_google=wrong" });
    expect(wrong.headers.location).toContain("oauth=expired");
    const mix = await request(app)
      .get("/api/auth/social/x/callback")
      .query({ state: a.state, code: "code" })
      .set("Cookie", a.cookie.replace("google", "x"));
    expect(mix.headers.location).toContain("oauth=expired");
    expect(exchange).not.toHaveBeenCalled();
  });
  it("creates one persisted account, permits returning login, and rejects callback replay", async () => {
    const a = await start(),
      first = await callback(a);
    expect(first.headers.location).toBe("/?oauth=signed_in");
    const cookie = (first.headers["set-cookie"] as unknown as string[])
      .find((s: string) => s.startsWith("relay_session="))!
      .split(";")[0];
    const session = await request(app)
      .get("/api/session")
      .set("Cookie", cookie);
    expect(session.body.name).toBe("Social Owner");
    expect(session.body.demo).toBe(false);
    const dashboard = await request(app)
      .get("/api/dashboard")
      .set("Cookie", cookie);
    expect(dashboard.body.metrics.messages).toBe(0);
    expect((await callback(a)).headers.location).toContain("oauth=expired");
    const second = await callback(await start());
    expect(second.headers.location).toContain("signed_in");
    const rows = (
      await db.query(
        "SELECT * FROM social_identities WHERE provider='google' AND subject='google-new-user'",
      )
    ).rows;
    expect(rows).toHaveLength(1);
  });
  it("handles denied consent and expired attempts without a provider call", async () => {
    const a = await start();
    const denied = await request(app)
      .get("/api/auth/social/google/callback")
      .query({
        state: a.state,
        error: "access_denied",
        error_description: "secret unsafe text",
      })
      .set("Cookie", a.cookie);
    expect(denied.headers.location).toBe("/?oauth=cancelled");
    const b = await start();
    await db.query(
      "UPDATE oauth_attempts SET expires_at=now()-interval '1 minute' WHERE state_hash=$1",
      [hash(b.state)],
    );
    expect((await callback(b)).headers.location).toContain("expired");
    expect(exchange).not.toHaveBeenCalled();
  });
  it("never automatically merges users by email", async () => {
    await owner("existing@example.test");
    vi.mocked(identity).mockResolvedValue({
      subject: "another-id",
      name: "Other",
      email: "existing@example.test",
      emailVerified: true,
    });
    expect((await callback(await start())).headers.location).toContain(
      "conflict",
    );
    expect(
      (
        await db.query(
          "SELECT * FROM social_identities WHERE subject='another-id'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("requires CSRF and a live matching session to connect; keeps tokens encrypted and tenant isolated", async () => {
    const a = await owner("connect@example.test");
    expect(
      (
        await request(app)
          .post("/api/social/google/connect")
          .set("Cookie", a.cookie)
          .set("Origin", origin)
      ).status,
    ).toBe(403);
    vi.mocked(identity).mockResolvedValue({
      subject: "connection-id",
      name: "Channel Owner",
      emailVerified: false,
      accountId: "channel-1",
      accountName: "My Channel",
    });
    const begin = async () => {
      const r = await request(app)
        .post("/api/social/google/connect")
        .set("Cookie", a.cookie)
        .set("X-CSRF-Token", a.user.csrf)
        .set("Origin", origin)
        .send({});
      expect(r.status).toBe(200);
      const url = new URL(r.body.url);
      expect(url.searchParams.get("scope")).toContain("youtube.readonly");
      return {
        state: url.searchParams.get("state")!,
        cookie: r.headers["set-cookie"][0].split(";")[0],
      };
    };
    expect((await callback(await begin())).headers.location).toContain(
      "oauth=session",
    );
    expect(
      (await callback(await begin(), a.cookie)).headers.location,
    ).toContain("oauth=connected");
    const connections = await request(app)
      .get("/api/social/connections")
      .set("Cookie", a.cookie);
    expect(connections.body.connections[0].name).toBe("My Channel");
    expect(JSON.stringify(connections.body)).not.toContain(
      "provider-secret-token",
    );
    const stored = (
      await db.query<{ encrypted_tokens: string }>(
        "SELECT encrypted_tokens FROM social_connections WHERE workspace_id=$1",
        [a.user.workspaceId],
      )
    ).rows[0];
    expect(stored.encrypted_tokens).not.toContain("provider-secret-token");
    expect(
      decrypt(
        stored.encrypted_tokens,
        `${a.user.workspaceId}:google:channel-1`,
      ),
    ).toMatchObject({ access_token: "provider-secret-token" });
    const other = await owner("isolated@example.test");
    const otherData = await request(app)
      .get("/api/social/connections")
      .set("Cookie", other.cookie);
    expect(otherData.body.connections).toHaveLength(0);
    const connectionId = connections.body.connections[0].id;
    await request(app)
      .delete(`/api/social/connections/${connectionId}`)
      .set("Cookie", other.cookie)
      .set("X-CSRF-Token", other.user.csrf);
    expect(
      (
        await db.query("SELECT id FROM social_connections WHERE id=$1", [
          connectionId,
        ])
      ).rows,
    ).toHaveLength(1);
    await request(app)
      .delete(`/api/social/connections/${connectionId}`)
      .set("Cookie", a.cookie)
      .set("X-CSRF-Token", a.user.csrf);
    expect(
      (
        await db.query("SELECT id FROM social_connections WHERE id=$1", [
          connectionId,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "SELECT user_id FROM social_identities WHERE subject='connection-id'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("does not expose provider failure details", async () => {
    vi.mocked(exchange).mockRejectedValue(new Error("secret provider token"));
    const r = await callback(await start());
    expect(r.headers.location).toBe("/?oauth=failed");
    expect(r.text).not.toContain("secret");
  });
  it("authenticates encryption context and detects tampering", () => {
    const value = encrypt({ access_token: "sensitive" }, "workspace-a");
    expect(() => decrypt(value, "workspace-b")).toThrow();
    const parts = value.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), "workspace-a")).toThrow();
  });
});
