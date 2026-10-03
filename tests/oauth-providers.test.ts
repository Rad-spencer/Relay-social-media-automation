import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import {
  authorizationUrl,
  exchange,
  identity,
  provider,
  providerStatuses,
} from "../src/server/oauth/providers";
import { oauthProviders } from "../src/shared/oauth";
const local = vi.hoisted(() => ({
  keys: undefined as ReturnType<typeof createLocalJWKSet> | undefined,
}));
vi.mock("jose", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jose")>()),
  createRemoteJWKSet: () => local.keys,
}));
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  privateKey = keys.privateKey;
  local.keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(keys.publicKey)), kid: "test" }],
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each(oauthProviders)(
  "builds a fixed HTTPS redirect and token exchange for %s",
  async (id) => {
    vi.stubEnv(`${id.toUpperCase()}_CLIENT_ID`, "client");
    vi.stubEnv(`${id.toUpperCase()}_CLIENT_SECRET`, "secret");
    vi.stubEnv("META_GRAPH_VERSION", "v25.0");
    const p = provider(id),
      url = new URL(
        authorizationUrl(
          p,
          "https://relay.example",
          "state",
          "verifier",
          "nonce",
          false,
        ),
      );
    expect(url.protocol).toBe("https:");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.toString()).not.toContain("secret");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ access_token: "token", expires_in: 3600 }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await exchange(p, "https://relay.example", "code", "verifier"),
    ).toMatchObject({ access_token: "token" });
    const [endpoint, init] = fetcher.mock.calls[0];
    expect(endpoint).toBe(p.token);
    expect(init.redirect).toBe("error");
    expect(init.body.get("redirect_uri")).toBe(
      `https://relay.example/api/auth/social/${id}/callback`,
    );
    if (id === "tiktok") {
      expect(init.body.get("client_key")).toBe("client");
      expect(init.body.get("client_id")).toBeNull();
    }
    if (p.pkce) expect(init.body.get("code_verifier")).toBe("verifier");
    if (id === "x") expect(init.headers.Authorization).toMatch(/^Basic /);
  },
);
it("blocks providers requiring HTTPS when APP_URL is localhost HTTP", () => {
  vi.stubEnv("TIKTOK_CLIENT_ID", "client");
  vi.stubEnv("TIKTOK_CLIENT_SECRET", "secret");
  vi.stubEnv("OAUTH_ENCRYPTION_KEY", "cd".repeat(32));
  const tiktok = providerStatuses("http://localhost:3000").find(
    (p) => p.id === "tiktok",
  );
  expect(tiktok?.enabled).toBe(false);
  expect(tiktok?.reason).toContain("HTTPS");
});
it.each([
  ["facebook", { id: "fb-id", name: "Facebook User" }, "fb-id"],
  ["instagram", { user_id: "ig-id", username: "creator" }, "ig-id"],
  ["threads", { id: "threads-id", username: "writer" }, "threads-id"],
  ["x", { data: { id: "x-id", name: "X User" } }, "x-id"],
  [
    "tiktok",
    { data: { user: { open_id: "tt-id", display_name: "TikTok User" } } },
    "tt-id",
  ],
] as const)(
  "reads %s identity from the authenticated profile endpoint",
  async (id, profile, subject) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(profile)));
    expect(
      await identity(provider(id), { access_token: "token" }, "nonce", false),
    ).toMatchObject({ subject, emailVerified: false });
  },
);
async function idToken(
  nonce = "nonce",
  issuer = "https://accounts.google.com",
  audience = "client",
) {
  return new SignJWT({ nonce })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setSubject("google-id")
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}
it("validates Google signatures, issuer, audience, nonce, and profile subject", async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  const fetcher = vi.fn().mockImplementation(async () =>
    Response.json({
      sub: "google-id",
      name: "Owner",
      email: "owner@example.test",
      email_verified: true,
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const p = provider("google");
  const tokens = { access_token: "token", id_token: await idToken() };
  expect(await identity(p, tokens, "nonce", false)).toMatchObject({
    subject: "google-id",
    emailVerified: true,
  });
  await expect(identity(p, tokens, "wrong", false)).rejects.toThrow();
  await expect(
    identity(
      p,
      { ...tokens, id_token: await idToken("nonce", "https://evil.example") },
      "nonce",
      false,
    ),
  ).rejects.toThrow();
  await expect(
    identity(
      p,
      {
        ...tokens,
        id_token: await idToken(
          "nonce",
          "https://accounts.google.com",
          "other-client",
        ),
      },
      "nonce",
      false,
    ),
  ).rejects.toThrow();
  const parts = tokens.id_token.split(".");
  parts[2] = Buffer.alloc(256).toString("base64url");
  await expect(
    identity(p, { ...tokens, id_token: parts.join(".") }, "nonce", false),
  ).rejects.toThrow();
  fetcher.mockResolvedValue(
    Response.json({ sub: "other-user", name: "Other" }),
  );
  await expect(identity(p, tokens, "nonce", false)).rejects.toThrow();
});
it("validates LinkedIn OIDC and refuses a missing ID token", async () => {
  vi.stubEnv("LINKEDIN_CLIENT_ID", "client");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ sub: "google-id", name: "Member" })),
  );
  expect(
    await identity(
      provider("linkedin"),
      {
        access_token: "token",
        id_token: await idToken("nonce", "https://www.linkedin.com/oauth"),
      },
      "nonce",
      false,
    ),
  ).toMatchObject({ name: "Member" });
  await expect(
    identity(provider("linkedin"), { access_token: "token" }, "nonce", false),
  ).rejects.toThrow("Missing identity token");
});

it("accepts a single Instagram token envelope and rejects ambiguous envelopes", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ data: [{ access_token: "ig-token" }] }));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await exchange(
      provider("instagram"),
      "https://relay.example",
      "code",
      "verifier",
    ),
  ).toMatchObject({ access_token: "ig-token" });
  fetcher.mockResolvedValue(
    Response.json({ data: [{ access_token: "one" }, { access_token: "two" }] }),
  );
  await expect(
    exchange(
      provider("instagram"),
      "https://relay.example",
      "code",
      "verifier",
    ),
  ).rejects.toThrow();
});
