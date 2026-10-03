import type { Express, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { DB } from "../../db/database.js";
import { oauthProviders } from "../../shared/oauth.js";
import { AppError, id } from "../repository.js";
import { authorize, cookieToken, hash, token } from "../security.js";
import { createSession, setSessionCookie } from "../session.js";
import { emptyProfile } from "../seed.js";
import {
  authorizationUrl,
  exchange,
  identity,
  provider,
  providerStatuses,
} from "./providers.js";
import { encrypt } from "./storage.js";
const providerId = z.enum(oauthProviders);
interface Attempt {
  provider: string;
  verifier: string;
  nonce: string;
  mode: "login" | "connect";
  session_hash: string | null;
  user_id: string | null;
  workspace_id: string | null;
}
export function installSocialAuth(app: Express, db: DB, origin: string) {
  const limit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Please try again later." },
  });
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(origin).protocol === "https:",
    path: "/api/auth/social",
    maxAge: 10 * 60000,
  };
  async function start(req: Request, res: Response, mode: "login" | "connect") {
    const p = provider(providerId.parse(req.params.provider));
    if (!providerStatuses(origin).find((v) => v.id === p.id)?.enabled)
      throw new AppError(
        503,
        "OAUTH_UNAVAILABLE",
        "This login provider needs administrator setup.",
      );
    // Anonymous login starts also need an explicit same-origin request.
    if (req.header("origin") !== new URL(origin).origin)
      throw new AppError(
        403,
        "ORIGIN_REJECTED",
        "Start social login from Relay.",
      );
    if (mode === "connect") {
      authorize(req.user.role, "configure");
      if (req.user.demo)
        throw new AppError(
          400,
          "DEMO_WORKSPACE",
          "Create a real workspace before connecting a social profile.",
        );
    }
    const state = token(),
      binding = token(),
      verifier = token(),
      nonce = token();
    await db.query("DELETE FROM oauth_attempts WHERE expires_at < now()");
    await db.query(
      "INSERT INTO oauth_attempts(state_hash,binding_hash,provider,verifier,nonce,mode,session_hash,user_id,workspace_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '10 minutes')",
      [
        hash(state),
        hash(binding),
        p.id,
        verifier,
        nonce,
        mode,
        mode === "connect" ? hash(cookieToken(req) || "") : null,
        mode === "connect" ? req.user.id : null,
        mode === "connect" ? req.user.workspaceId : null,
      ],
    );
    res.cookie(`relay_oauth_${p.id}`, binding, options);
    res.json({
      url: authorizationUrl(
        p,
        origin,
        state,
        verifier,
        nonce,
        mode === "connect",
      ),
    });
  }
  app.get("/api/auth/providers", (_req, res) =>
    res.json({ providers: providerStatuses(origin) }),
  );
  app.post("/api/auth/social/:provider/start", limit, (req, res) =>
    start(req, res, "login"),
  );
  app.get("/api/auth/social/:provider/callback", limit, async (req, res) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    const parsed = providerId.safeParse(req.params.provider);
    if (!parsed.success) return res.redirect("/?oauth=unavailable");
    const p = provider(parsed.data);
    const binding = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`relay_oauth_${p.id}=`))
      ?.split("=")[1];
    const state =
      typeof req.query.state === "string" && req.query.state.length <= 128
        ? req.query.state
        : "";
    if (!state || !binding) return res.redirect("/?oauth=expired");
    const attempt = (
      await db.query<Attempt>(
        "DELETE FROM oauth_attempts WHERE state_hash=$1 AND binding_hash=$2 AND provider=$3 AND expires_at>now() RETURNING *",
        [hash(state), hash(binding), p.id],
      )
    ).rows[0];
    if (!attempt) return res.redirect("/?oauth=expired");
    res.clearCookie(`relay_oauth_${p.id}`, { ...options, maxAge: undefined });
    const redirect = (status: string) =>
      res.redirect(
        `/?oauth=${status}${attempt.mode === "connect" ? "&page=accounts" : ""}`,
      );
    if (req.query.error) return redirect("cancelled");
    if (!providerStatuses(origin).find((v) => v.id === p.id)?.enabled)
      return redirect("unavailable");
    if (typeof req.query.code !== "string" || req.query.code.length > 4096)
      return redirect("failed");
    try {
      if (
        attempt.mode === "connect" &&
        hash(cookieToken(req) || "") !== attempt.session_hash
      )
        return redirect("session");
      const tokens = await exchange(
        p,
        origin,
        req.query.code,
        attempt.verifier,
      );
      const profile = await identity(
        p,
        tokens,
        attempt.nonce,
        attempt.mode === "connect",
      );
      const session = await db.transaction(async (tx) => {
        // Serialize identity creation/linking to avoid concurrent first-login races.
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `oauth:${p.id}:${profile.subject}`,
        ]);
        const existing = (
          await tx.query<{ user_id: string }>(
            "SELECT user_id FROM social_identities WHERE provider=$1 AND subject=$2",
            [p.id, profile.subject],
          )
        ).rows[0];
        let userId = existing?.user_id;
        let workspaceId: string;
        if (attempt.mode === "connect") {
          const member = (
            await tx.query<{ workspace_id: string }>(
              "SELECT s.workspace_id FROM sessions s JOIN members m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id WHERE s.token_hash=$1 AND s.user_id=$2 AND s.workspace_id=$3 AND s.expires_at>now() AND m.role IN ('owner','admin')",
              [attempt.session_hash, attempt.user_id, attempt.workspace_id],
            )
          ).rows[0];
          if (!member || !attempt.user_id) throw new Error("SESSION");
          if (existing && existing.user_id !== attempt.user_id)
            throw new Error("CONFLICT");
          userId = attempt.user_id;
          workspaceId = member.workspace_id;
        } else if (userId) {
          const member = (
            await tx.query<{ workspace_id: string }>(
              "SELECT workspace_id FROM members WHERE user_id=$1 ORDER BY workspace_id LIMIT 1",
              [userId],
            )
          ).rows[0];
          if (!member) throw new Error("SESSION");
          workspaceId = member.workspace_id;
        } else {
          if (
            profile.email &&
            (
              await tx.query("SELECT id FROM users WHERE email=$1", [
                profile.email,
              ])
            ).rows.length
          )
            throw new Error("CONFLICT");
          userId = id();
          workspaceId = id();
          const email =
            profile.emailVerified && profile.email
              ? profile.email
              : `${userId}@social.relay.invalid`;
          await tx.query(
            "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,'!social')",
            [userId, email, profile.name],
          );
          await tx.query(
            "INSERT INTO workspaces(id,name,profile) VALUES($1,$2,$3)",
            [
              workspaceId,
              `${profile.name}'s workspace`,
              JSON.stringify(emptyProfile),
            ],
          );
          await tx.query("INSERT INTO members VALUES($1,$2,'owner')", [
            workspaceId,
            userId,
          ]);
        }
        await tx.query(
          "INSERT INTO social_identities(provider,subject,user_id,name) VALUES($1,$2,$3,$4) ON CONFLICT(provider,subject) DO UPDATE SET name=EXCLUDED.name",
          [p.id, profile.subject, userId, profile.name],
        );
        if (attempt.mode === "connect") {
          const externalId = profile.accountId || profile.subject;
          const context = `${workspaceId}:${p.id}:${externalId}`;
          await tx.query(
            "INSERT INTO social_connections(id,workspace_id,user_id,provider,subject,external_id,name,encrypted_tokens,expires_at,publishing_requested) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(workspace_id,provider,external_id) DO UPDATE SET encrypted_tokens=EXCLUDED.encrypted_tokens,expires_at=EXCLUDED.expires_at,name=EXCLUDED.name,connected_at=now(),user_id=EXCLUDED.user_id,publishing_requested=EXCLUDED.publishing_requested",
            [
              id(),
              workspaceId,
              userId,
              p.id,
              profile.subject,
              externalId,
              profile.accountName || profile.name,
              encrypt(tokens, context),
              tokens.expires_in
                ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
                : null,
              ["x", "linkedin", "threads"].includes(p.id),
            ],
          );
          return null;
        }
        return createSession(tx, userId, workspaceId);
      });
      if (session) setSessionCookie(res, session);
      return redirect(attempt.mode === "connect" ? "connected" : "signed_in");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Never send provider errors, codes or tokens to the client or logs.
      return redirect(
        message === "CONFLICT"
          ? "conflict"
          : message === "SESSION"
            ? "session"
            : message === "NO_CHANNEL"
              ? "no_channel"
              : "failed",
      );
    }
  });
  // Install after the application's authenticated session + CSRF middleware.
  return () => {
    app.post("/api/social/:provider/connect", limit, (req, res) =>
      start(req, res, "connect"),
    );
    app.get("/api/social/connections", async (req, res) => {
      const rows = (
        await db.query(
          "SELECT id,provider,name,external_id,expires_at,connected_at,CASE WHEN expires_at<=now() THEN 'expired' ELSE 'connected' END status FROM social_connections WHERE workspace_id=$1 ORDER BY connected_at DESC",
          [req.user.workspaceId],
        )
      ).rows;
      res.json({
        connections: rows,
        providers: providerStatuses(origin),
        canConnect:
          ["owner", "admin"].includes(req.user.role) && !req.user.demo,
      });
    });
    app.delete("/api/social/connections/:id", async (req, res) => {
      authorize(req.user.role, "configure");
      await db.query(
        "DELETE FROM social_connections WHERE workspace_id=$1 AND id=$2",
        [req.user.workspaceId, req.params.id],
      );
      res.json({ ok: true });
    });
  };
}
