import { randomBytes } from "node:crypto";
import { safeUrl } from "../server/security.js";
import express, { type Express, type Request, type Response } from "express";
import type { DB } from "../db/database.js";
import { authorize } from "../server/security.js";
import { AppError, id } from "../server/repository.js";
export function mediaType(b: Buffer): string | undefined {
  if (b.length < 16) return;
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (
    b.toString("ascii", 4, 8) === "ftyp" &&
    /^(isom|iso2|mp41|mp42|avc1|M4V )$/.test(b.toString("ascii", 8, 12))
  )
    return "video/mp4";
}
export function installMedia(app: Express, db: DB) {
  app.post(
    "/api/media",
    (req, _res, next) => {
      authorize(req.user.role, "configure");
      next();
    },
    express.raw({ type: "application/octet-stream", limit: "25mb" }),
    async (req, res) => {
      const bytes = req.body;
      const mime = Buffer.isBuffer(bytes) ? mediaType(bytes) : undefined;
      if (!mime)
        throw new AppError(
          422,
          "INVALID_MEDIA",
          "Choose a JPEG, PNG, WebP image or MP4 video (maximum 25 MB).",
        );
      const assetId = id();
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [
          req.user.workspaceId,
        ]);
        const usage = (
          await tx.query<{ total: string }>(
            "SELECT COALESCE(sum(size),0) total FROM post_media WHERE workspace_id=$1",
            [req.user.workspaceId],
          )
        ).rows[0];
        if (Number(usage.total) + bytes.length > 100 * 1024 * 1024)
          throw new AppError(
            413,
            "MEDIA_QUOTA",
            "This workspace has reached its 100 MB media storage limit.",
          );
        await tx.query(
          "INSERT INTO post_media(id,workspace_id,mime,size,body) VALUES($1,$2,$3,$4,$5)",
          [
            assetId,
            req.user.workspaceId,
            mime,
            bytes.length,
            bytes.toString("base64"),
          ],
        );
      });
      res.status(201).json({ id: assetId, mime, size: bytes.length });
    },
  );
  app.get("/api/media/:id", async (req, res) => {
    const asset = (
      await db.query<{ mime: string; body: string }>(
        "SELECT mime,body FROM post_media WHERE id=$1 AND workspace_id=$2",
        [req.params.id, req.user.workspaceId],
      )
    ).rows[0];
    if (!asset) throw new AppError(404, "MEDIA_NOT_FOUND", "Media not found.");
    res.setHeader("Content-Type", asset.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    sendMedia(req, res, Buffer.from(asset.body, "base64"));
  });
}

export function mediaHostingReason() {
  return safeUrl(process.env.APP_URL || "")
    ? ""
    : "Uploaded media needs a public HTTPS APP_URL so the provider can fetch it. Localhost cannot deliver uploaded files.";
}
export async function deliveryUrl(db: DB, workspace: string, mediaId: string) {
  if (mediaHostingReason()) return undefined;
  const token = randomBytes(32).toString("hex");
  const inserted = await db.query(
    "INSERT INTO media_delivery_tokens(token,media_id,expires_at) SELECT $1,id,now()+interval '1 hour' FROM post_media WHERE id=$2 AND workspace_id=$3 RETURNING token",
    [token, mediaId, workspace],
  );
  if (!inserted.rows.length) return undefined;
  await db.query("DELETE FROM media_delivery_tokens WHERE expires_at < now()");
  return new URL(`/media-delivery/${token}`, process.env.APP_URL!).href;
}
export function installMediaDelivery(app: Express, db: DB) {
  app.get("/media-delivery/:token", async (req, res) => {
    const asset = (
      await db.query<{ mime: string; body: string }>(
        "SELECT m.mime,m.body FROM post_media m JOIN media_delivery_tokens t ON t.media_id=m.id WHERE t.token=$1 AND t.expires_at>now()",
        [req.params.token],
      )
    ).rows[0];
    if (!asset) throw new AppError(404, "MEDIA_NOT_FOUND", "Media not found.");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", asset.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    sendMedia(req, res, Buffer.from(asset.body, "base64"));
  });
}

function sendMedia(req: Request, res: Response, bytes: Buffer) {
  res.setHeader("Accept-Ranges", "bytes");
  const range = req.header("range");
  if (!range) {
    res.send(bytes);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start = 0,
    end = bytes.length - 1;
  if (match && (match[1] || match[2])) {
    if (!match[1]) start = Math.max(0, bytes.length - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
  } else start = bytes.length;
  if (
    start > end ||
    start >= bytes.length ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end)
  ) {
    res.setHeader("Content-Range", `bytes */${bytes.length}`);
    res.status(416).end();
    return;
  }
  res.setHeader("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
  res.status(206).send(bytes.subarray(start, end + 1));
}
