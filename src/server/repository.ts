import { randomUUID } from "node:crypto";
import type { DB } from "../db/database.js";
import type { Audit } from "../shared/types.js";
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export async function put<T extends { id: string }>(
  db: DB,
  w: string,
  kind: string,
  data: T,
) {
  await db.query(
    "INSERT INTO records(workspace_id,kind,id,data) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,kind,id) DO UPDATE SET data=excluded.data",
    [w, kind, data.id, JSON.stringify(data)],
  );
  return data;
}
export async function get<T>(
  db: DB,
  w: string,
  kind: string,
  key: string,
): Promise<T | undefined> {
  return (
    await db.query<{ data: T }>(
      "SELECT data FROM records WHERE workspace_id=$1 AND kind=$2 AND id=$3",
      [w, kind, key],
    )
  ).rows[0]?.data;
}
export async function list<T>(
  db: DB,
  w: string,
  kind: string,
  limit = 100,
): Promise<T[]> {
  return (
    await db.query<{ data: T }>(
      "SELECT data FROM records WHERE workspace_id=$1 AND kind=$2 ORDER BY created_at DESC,id DESC LIMIT $3",
      [w, kind, Math.min(limit, 500)],
    )
  ).rows.map((r) => r.data);
}
export async function audit(
  db: DB,
  w: string,
  actor: string,
  action: string,
  detail: string,
) {
  return put<Audit>(db, w, "audit", {
    id: id(),
    actor,
    action,
    detail,
    createdAt: now(),
  });
}
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function required<T>(
  db: DB,
  w: string,
  kind: string,
  key: string,
): Promise<T> {
  const value = await get<T>(db, w, kind, key);
  if (!value)
    throw new AppError(
      404,
      "NOT_FOUND",
      "This record is not available in your workspace.",
    );
  return value;
}
