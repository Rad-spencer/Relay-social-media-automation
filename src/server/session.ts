import type { Response } from "express";
import type { DB } from "../db/database.js";
import { hash, token } from "./security.js";
export async function createSession(
  db: DB,
  userId: string,
  workspaceId: string,
) {
  const value = token();
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,workspace_id,csrf,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')",
    [hash(value), userId, workspaceId, token()],
  );
  return value;
}
export function setSessionCookie(res: Response, value: string) {
  res.cookie("relay_session", value, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" ||
      process.env.APP_URL?.startsWith("https:"),
    maxAge: 7 * 86400000,
    path: "/",
  });
}
