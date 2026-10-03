import { createHash, createHmac } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import {
  oauthProviders,
  type OAuthProvider,
  type ProviderStatus,
} from "../../shared/oauth.js";
export interface Provider {
  id: OAuthProvider;
  name: string;
  platform: ProviderStatus["platform"];
  authorize: string;
  token: string;
  profile: string;
  scopes: string[];
  pkce?: boolean;
  separator?: string;
  https?: boolean;
  oidc?: { issuer: string | string[]; jwks: string };
}
const metaVersion = () =>
  /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION || "")
    ? process.env.META_GRAPH_VERSION
    : "v0.0";
export function provider(id: OAuthProvider): Provider {
  const definitions: Record<OAuthProvider, Provider> = {
    google: {
      id,
      name: "Google",
      platform: "youtube",
      authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
      profile: "https://openidconnect.googleapis.com/v1/userinfo",
      scopes: ["openid", "profile", "email"],
      pkce: true,
      oidc: {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        jwks: "https://www.googleapis.com/oauth2/v3/certs",
      },
    },
    facebook: {
      id,
      name: "Facebook",
      platform: "facebook",
      authorize: `https://www.facebook.com/${metaVersion()}/dialog/oauth`,
      token: `https://graph.facebook.com/${metaVersion()}/oauth/access_token`,
      profile: `https://graph.facebook.com/${metaVersion()}/me?fields=id,name,email`,
      scopes: ["public_profile", "email"],
      separator: ",",
      https: true,
    },
    instagram: {
      id,
      name: "Instagram",
      platform: "instagram",
      authorize: "https://www.instagram.com/oauth/authorize",
      token: "https://api.instagram.com/oauth/access_token",
      profile: "https://graph.instagram.com/me?fields=user_id,username",
      scopes: ["instagram_business_basic"],
      separator: ",",
      https: true,
    },
    tiktok: {
      id,
      name: "TikTok",
      platform: "tiktok",
      authorize: "https://www.tiktok.com/v2/auth/authorize/",
      token: "https://open.tiktokapis.com/v2/oauth/token/",
      profile:
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
      scopes: ["user.info.basic"],
      separator: ",",
      https: true,
    },
    x: {
      id,
      name: "X",
      platform: "x",
      authorize: "https://x.com/i/oauth2/authorize",
      token: "https://api.x.com/2/oauth2/token",
      profile: "https://api.x.com/2/users/me",
      scopes: ["tweet.read", "users.read"],
      pkce: true,
    },
    linkedin: {
      id,
      name: "LinkedIn",
      platform: "linkedin",
      authorize: "https://www.linkedin.com/oauth/v2/authorization",
      token: "https://www.linkedin.com/oauth/v2/accessToken",
      profile: "https://api.linkedin.com/v2/userinfo",
      scopes: ["openid", "profile", "email"],
      oidc: {
        issuer: "https://www.linkedin.com/oauth",
        jwks: "https://www.linkedin.com/oauth/openid/jwks",
      },
    },
    threads: {
      id,
      name: "Threads",
      platform: "threads",
      authorize: "https://www.threads.com/oauth/authorize",
      token: "https://graph.threads.com/oauth/access_token",
      profile: "https://graph.threads.com/me?fields=id,username",
      scopes: ["threads_basic"],
      separator: ",",
      https: true,
    },
  };
  return definitions[id];
}
export function credentials(id: OAuthProvider) {
  return {
    clientId: process.env[`${id.toUpperCase()}_CLIENT_ID`] || "",
    clientSecret: process.env[`${id.toUpperCase()}_CLIENT_SECRET`] || "",
  };
}
export function callbackUrl(origin: string, id: OAuthProvider) {
  return `${new URL(origin).origin}/api/auth/social/${id}/callback`;
}
export function providerStatuses(origin: string): ProviderStatus[] {
  return oauthProviders.map((id) => {
    const p = provider(id),
      c = credentials(id),
      url = new URL(origin);
    const setupIssues: string[] = [];
    if (!c.clientId)
      setupIssues.push(
        `${p.name} ${id === "tiktok" ? "Client Key" : "client ID"} is missing.`,
      );
    if (!c.clientSecret)
      setupIssues.push(`${p.name} client secret is missing.`);
    if (!/^[a-f0-9]{64}$/i.test(process.env.OAUTH_ENCRYPTION_KEY || ""))
      setupIssues.push("Secure token storage needs setup");
    if (
      (p.https ||
        process.env.NODE_ENV === "production" ||
        !["localhost", "127.0.0.1"].includes(url.hostname)) &&
      url.protocol !== "https:"
    )
      setupIssues.push("An HTTPS app address is required");
    if (id === "facebook" && metaVersion() === "v0.0")
      setupIssues.push("Meta API version needs setup");
    const reason =
      !c.clientId || !c.clientSecret
        ? "Administrator setup required"
        : setupIssues[0] || "";
    return {
      id,
      name: p.name,
      platform: p.platform,
      enabled: !reason,
      reason,
      setupIssues,
      callbackUrl: callbackUrl(origin, id),
    };
  });
}
export function authorizationUrl(
  p: Provider,
  origin: string,
  state: string,
  verifier: string,
  nonce: string,
  connect: boolean,
) {
  const u = new URL(p.authorize);
  const scopes = [...p.scopes];
  if (connect && p.id === "google")
    scopes.push("https://www.googleapis.com/auth/youtube.readonly");
  if (connect && p.id === "x") scopes.push("tweet.write");
  if (connect && p.id === "linkedin") scopes.push("w_member_social");
  if (connect && p.id === "threads") scopes.push("threads_content_publish");
  u.search = new URLSearchParams({
    [p.id === "tiktok" ? "client_key" : "client_id"]: credentials(p.id)
      .clientId,
    redirect_uri: callbackUrl(origin, p.id),
    response_type: "code",
    state,
    scope: scopes.join(p.separator || " "),
  }).toString();
  if (p.pkce) {
    u.searchParams.set(
      "code_challenge",
      createHash("sha256").update(verifier).digest("base64url"),
    );
    u.searchParams.set("code_challenge_method", "S256");
  }
  if (p.oidc) u.searchParams.set("nonce", nonce);
  if (p.id === "google") u.searchParams.set("prompt", "select_account");
  return u.toString();
}
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().positive().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});
export type ProviderTokens = z.infer<typeof tokenSchema>;
const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
async function json(url: string, init: RequestInit) {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!res.ok) throw new Error("Provider request failed");
  return res.json();
}
export async function exchange(
  p: Provider,
  origin: string,
  code: string,
  verifier: string,
) {
  const c = credentials(p.id);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(origin, p.id),
    [p.id === "tiktok" ? "client_key" : "client_id"]: c.clientId,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (p.id === "x")
    headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(c.clientId)}:${encodeURIComponent(c.clientSecret)}`).toString("base64")}`;
  else body.set("client_secret", c.clientSecret);
  if (p.pkce) body.set("code_verifier", verifier);
  // Instagram's code exchange documents multipart form data.
  let payload: BodyInit = body;
  if (p.id === "instagram") {
    const form = new FormData();
    body.forEach((v, k) => form.set(k, v));
    payload = form;
    delete headers["Content-Type"];
  }
  const response = await json(p.token, {
    method: "POST",
    headers,
    body: payload,
  });
  // Accept either a direct token object or a single Instagram data envelope.
  const parsed =
    p.id === "instagram" && Array.isArray(response?.data)
      ? z.object({ data: z.array(tokenSchema).length(1) }).parse(response)
          .data[0]
      : tokenSchema.parse(response);
  return parsed;
}
export interface Identity {
  subject: string;
  name: string;
  email?: string;
  emailVerified: boolean;
  accountId?: string;
  accountName?: string;
}
export async function identity(
  p: Provider,
  tokens: ProviderTokens,
  nonce: string,
  connect: boolean,
): Promise<Identity> {
  let subject: string | undefined;
  if (p.oidc) {
    if (!tokens.id_token) throw new Error("Missing identity token");
    let keys = keysets.get(p.oidc.jwks);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(p.oidc.jwks));
      keysets.set(p.oidc.jwks, keys);
    }
    const { payload } = await jwtVerify(tokens.id_token, keys, {
      issuer: p.oidc.issuer,
      audience: credentials(p.id).clientId,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "iat", "exp", "nonce"],
    });
    if (
      payload.nonce !== nonce ||
      (payload.azp !== undefined && payload.azp !== credentials(p.id).clientId)
    )
      throw new Error("Invalid identity token");
    subject = payload.sub;
  }
  const url = new URL(p.profile);
  if (["facebook", "threads"].includes(p.id))
    url.searchParams.set(
      "appsecret_proof",
      createHmac("sha256", credentials(p.id).clientSecret)
        .update(tokens.access_token)
        .digest("hex"),
    );
  const headers = {
    Authorization: `Bearer ${tokens.access_token}`,
    Accept: "application/json",
  };
  const raw = await json(url.toString(), { headers });
  const profile =
    p.id === "tiktok" ? raw.data?.user : p.id === "x" ? raw.data : raw;
  const schema = z.object({
    sub: z.string().optional(),
    id: z.string().optional(),
    user_id: z.union([z.string(), z.number()]).optional(),
    open_id: z.string().optional(),
    name: z.string().optional(),
    username: z.string().optional(),
    display_name: z.string().optional(),
    email: z.email().nullish(),
    email_verified: z.boolean().optional(),
  });
  const value = schema.parse(profile);
  const sub =
    value.sub ||
    value.open_id ||
    (value.user_id !== undefined ? String(value.user_id) : value.id);
  if (!sub || (subject && sub !== subject))
    throw new Error("Invalid profile subject");
  const result: Identity = {
    subject: sub,
    name: (
      value.name ||
      value.display_name ||
      value.username ||
      `${p.name} member`
    ).slice(0, 120),
    email: value.email?.toLowerCase(),
    emailVerified: value.email_verified === true,
  };
  if (connect && p.id === "google") {
    const channels = await json(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=1",
      { headers },
    );
    const item = z
      .object({
        items: z.array(
          z.object({
            id: z.string(),
            snippet: z.object({ title: z.string() }),
          }),
        ),
      })
      .parse(channels).items[0];
    if (!item) throw new Error("NO_CHANNEL");
    result.accountId = item.id;
    result.accountName = item.snippet.title;
  }
  return result;
}
