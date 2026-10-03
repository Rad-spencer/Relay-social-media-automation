import type { Express, Request, Response, NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import type { DB } from "../db/database.js";
import type { SessionUser } from "../shared/types.js";
import { AppError, id } from "./repository.js";
import {
  cookieToken,
  hash,
  passwordHash,
  passwordMatches,
} from "./security.js";
import { authInput } from "./validation.js";
import { createSession, setSessionCookie } from "./session.js";
import { emptyProfile, seedDemo } from "./seed.js";
// Express request augmentation follows the library’s declaration-merging interface.
declare module "express-serve-static-core" {
  interface Request {
    user: SessionUser;
  }
}
export function installAuth(app: Express, db: DB) {
  const limit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });
  async function session(res: Response, userId: string, w: string) {
    setSessionCookie(res, await createSession(db, userId, w));
  }
  app.post("/api/auth/register", limit, async (req, res) => {
    const input = authInput.parse(req.body);
    const password = await passwordHash(input.password);
    const userId = id(),
      w = id();
    if (
      (await db.query("SELECT id FROM users WHERE email=$1", [input.email]))
        .rows.length
    )
      throw new AppError(
        409,
        "EMAIL_EXISTS",
        "An account already exists with this email. Sign in instead.",
      );
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
        [userId, input.email, input.name || "Owner", password],
      );
      await tx.query(
        "INSERT INTO workspaces(id,name,profile) VALUES($1,$2,$3)",
        [
          w,
          input.workspaceName || "My workspace",
          JSON.stringify({
            ...emptyProfile,
            businessName: input.workspaceName || "My business",
          }),
        ],
      );
      await tx.query("INSERT INTO members VALUES($1,$2,$3)", [
        w,
        userId,
        "owner",
      ]);
    });
    await session(res, userId, w);
    res.json({ ok: true });
  });
  app.post("/api/auth/login", limit, async (req, res) => {
    const input = authInput.parse(req.body);
    const u = (
      await db.query<{ id: string; password_hash: string }>(
        "SELECT id,password_hash FROM users WHERE email=$1",
        [input.email],
      )
    ).rows[0];
    if (!u || !(await passwordMatches(input.password, u.password_hash)))
      throw new AppError(
        401,
        "INVALID_LOGIN",
        "Email or password is incorrect.",
      );
    const m = (
      await db.query<{ workspace_id: string }>(
        "SELECT workspace_id FROM members WHERE user_id=$1 LIMIT 1",
        [u.id],
      )
    ).rows[0];
    await session(res, u.id, m.workspace_id);
    res.json({ ok: true });
  });
  app.post(
    "/api/auth/demo",
    rateLimit({
      windowMs: 3600000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    async (_req, res) => {
      if (process.env.ALLOW_DEMO === "false")
        throw new AppError(
          403,
          "DEMO_DISABLED",
          "Demo workspaces are disabled.",
        );
      const userId = id(),
        w = id();
      await db.transaction(async (tx) => {
        await tx.query("INSERT INTO users VALUES($1,$2,$3,$4)", [
          userId,
          `demo-${userId}@example.invalid`,
          "Alex",
          "!disabled",
        ]);
        await tx.query(
          "INSERT INTO workspaces(id,name,demo,profile) VALUES($1,$2,true,$3)",
          [w, "Studio North", JSON.stringify(emptyProfile)],
        );
        await tx.query("INSERT INTO members VALUES($1,$2,$3)", [
          w,
          userId,
          "owner",
        ]);
        await seedDemo(tx, w);
      });
      await session(res, userId, w);
      res.json({ ok: true });
    },
  );
  app.use("/api", async (req: Request, _res: Response, next: NextFunction) => {
    const t = cookieToken(req);
    if (!t)
      throw new AppError(401, "SIGN_IN_REQUIRED", "Sign in to your workspace.");
    const row = (
      await db.query<{
        id: string;
        name: string;
        email: string;
        workspace_id: string;
        workspace_name: string;
        role: SessionUser["role"];
        demo: boolean;
        csrf: string;
      }>(
        "SELECT u.id,u.name,u.email,s.workspace_id,w.name workspace_name,m.role,w.demo,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id JOIN workspaces w ON w.id=s.workspace_id JOIN members m ON m.workspace_id=w.id AND m.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
        [hash(t)],
      )
    ).rows[0];
    if (!row)
      throw new AppError(
        401,
        "SESSION_EXPIRED",
        "Your session expired. Sign in again.",
      );
    req.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      role: row.role,
      demo: row.demo,
      csrf: row.csrf,
    };
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== row.csrf
    )
      throw new AppError(
        403,
        "CSRF_REJECTED",
        "Refresh the page before trying this action again.",
      );
    next();
  });
  app.get("/api/session", (req, res) => res.json(req.user));
  app.post("/api/auth/logout", async (req, res) => {
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      hash(cookieToken(req) || ""),
    ]);
    res.clearCookie("relay_session", { path: "/" });
    res.json({ ok: true });
  });
}
