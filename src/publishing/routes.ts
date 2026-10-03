import type { Express } from "express";
import { z } from "zod";
import type { DB } from "../db/database.js";
import { platforms } from "../shared/types.js";
import { authorize, safeUrl } from "../server/security.js";
import { AppError, audit, id } from "../server/repository.js";
import { options, connections, readPost, refreshStatus } from "./service.js";
import {
  connectionReason,
  contentReason,
  providerPlatform,
} from "./providers.js";
import { platformNames } from "../shared/publishing.js";
const url = z.union([
  z.literal(""),
  z.string().max(2000).refine(safeUrl, "Use a public HTTPS URL"),
]);
const input = z.object({
  title: z.string().trim().max(180),
  text: z.string().trim().max(10000),
  articleUrl: url,
  imageUrl: url,
  hashtags: z
    .string()
    .max(2000)
    .regex(
      /^[\p{L}\p{N}_#\s,]*$/u,
      "Use letters, numbers, underscores and spaces for hashtags",
    )
    .default(""),
  mediaId: z.uuid().nullable().optional(),
  targets: z
    .array(
      z.object({
        platform: z.enum(platforms),
        connectionId: z.string().max(100).nullable(),
      }),
    )
    .max(7)
    .refine(
      (v) => new Set(v.map((t) => t.platform)).size === v.length,
      "Choose each platform once",
    ),
  scheduledAt: z.iso.datetime().nullable(),
  timezone: z
    .string()
    .max(100)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid timezone"),
  intent: z.enum(["draft", "schedule"]),
  revision: z.number().int().min(0),
});
export function installPublishing(app: Express, db: DB) {
  app.get("/api/posts", async (req, res) => {
    const rows = (
      await db.query<{ id: string }>(
        "SELECT id FROM scheduled_posts WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
        [req.user.workspaceId],
      )
    ).rows;
    const posts = await Promise.all(
      rows.map((r) => readPost(db, req.user.workspaceId, r.id)),
    );
    res.json({
      posts,
      options: await options(db, req.user.workspaceId, req.user.demo),
      canManage: ["owner", "admin"].includes(req.user.role),
      demo: req.user.demo,
    });
  });
  app.put("/api/posts/:id", async (req, res) => {
    authorize(req.user.role, "configure");
    const postId = z.uuid().parse(req.params.id),
      body = input.parse(req.body),
      w = req.user.workspaceId;
    if (
      body.intent === "schedule" &&
      (!body.targets.length ||
        (!body.text && !body.articleUrl && !body.mediaId && !body.imageUrl))
    )
      throw new AppError(
        422,
        "POST_INCOMPLETE",
        "Add post text or an article link and choose at least one platform.",
      );
    if (
      body.intent === "schedule" &&
      (!body.scheduledAt ||
        new Date(body.scheduledAt).getTime() < Date.now() + 5000)
    )
      throw new AppError(
        422,
        "INVALID_SCHEDULE",
        "Choose a publishing time in the future.",
      );
    const media = body.mediaId
      ? (
          await db.query<{ id: string; mime: string; size: number }>(
            "SELECT id,mime,size FROM post_media WHERE id=$1 AND workspace_id=$2",
            [body.mediaId, w],
          )
        ).rows[0]
      : undefined;
    if (body.mediaId && !media)
      throw new AppError(
        422,
        "INVALID_MEDIA",
        "Choose media uploaded to this workspace.",
      );
    if (media && body.imageUrl)
      throw new AppError(
        422,
        "MULTIPLE_MEDIA",
        "Choose an uploaded file or an image URL, not both.",
      );
    const content = {
      media,
      hashtags: body.hashtags,
      title: body.title || "Untitled post",
      text: body.text,
      articleUrl: body.articleUrl,
      imageUrl: body.imageUrl,
    };
    await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `post:${postId}`,
      ]);
      const existing = await readPost(tx, w, postId);
      if (!existing && body.revision !== 0)
        throw new AppError(
          404,
          "NOT_FOUND",
          "Post not found in this workspace.",
        );
      if (existing && existing.revision !== body.revision)
        throw new AppError(
          409,
          "POST_CHANGED",
          "This post changed. Close the composer and reopen the latest version.",
        );
      if (existing) {
        // Lock targets in the same order as the worker. Do not overwrite an in-flight delivery.
        await tx.query(
          "SELECT id FROM post_targets WHERE post_id=$1 ORDER BY id FOR UPDATE",
          [postId],
        );
        const fresh = await readPost(tx, w, postId);
        if (
          fresh?.targets.some((t) =>
            ["publishing", "published", "simulated", "unknown"].includes(
              t.status,
            ),
          )
        )
          throw new AppError(
            409,
            "POST_LOCKED",
            "This post has delivery attempts that cannot be changed. Check its results before creating a new post.",
          );
      }
      const available = await connections(tx, w);
      const targets = body.targets.map((t) => {
        const demo = req.user.demo && t.connectionId === `demo:${t.platform}`;
        const connection = available.find(
          (c) =>
            c.id === t.connectionId &&
            providerPlatform(c.provider) === t.platform,
        );
        if (t.connectionId && !demo && !connection)
          throw new AppError(
            422,
            "INVALID_TARGET",
            "Choose an account belonging to this workspace and platform.",
          );
        const reason = demo
          ? ""
          : contentReason(t.platform, content) ||
            (!connection
              ? "Connect an account with publishing permission, then reschedule."
              : connectionReason(
                  connection,
                  new Date(body.scheduledAt || Date.now()).getTime(),
                ));
        return {
          ...t,
          demo,
          name: demo
            ? `${platformNames[t.platform]} demo`
            : connection?.name || platformNames[t.platform],
          status:
            body.intent === "draft"
              ? "draft"
              : reason
                ? "blocked"
                : "scheduled",
          reason: body.intent === "draft" ? "" : reason,
        };
      });
      if (existing) {
        await tx.query(
          "UPDATE scheduled_posts SET content=$3,status=$4,scheduled_at=$5,timezone=$6,revision=revision+1,author_id=$7,updated_at=now() WHERE workspace_id=$1 AND id=$2",
          [
            w,
            postId,
            JSON.stringify(content),
            body.intent === "draft" ? "draft" : "scheduled",
            body.intent === "draft" ? null : body.scheduledAt,
            body.timezone,
            req.user.id,
          ],
        );
        await tx.query("DELETE FROM post_targets WHERE post_id=$1", [postId]);
      } else {
        await tx.query(
          "INSERT INTO scheduled_posts(id,workspace_id,author_id,content,status,scheduled_at,timezone) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            postId,
            w,
            req.user.id,
            JSON.stringify(content),
            body.intent === "draft" ? "draft" : "scheduled",
            body.intent === "draft" ? null : body.scheduledAt,
            body.timezone,
          ],
        );
      }
      for (const target of targets)
        await tx.query(
          "INSERT INTO post_targets(id,post_id,platform,connection_id,name,demo,status,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            id(),
            postId,
            target.platform,
            target.connectionId,
            target.name,
            target.demo,
            target.status,
            target.reason,
          ],
        );
      await refreshStatus(tx, postId);
      await audit(
        tx,
        w,
        req.user.name,
        body.intent === "draft" ? "Post draft saved" : "Post schedule saved",
        `${content.title} · ${targets.length} platforms`,
      );
    });
    res.json(await readPost(db, w, postId));
  });
  app.post("/api/posts/:id/cancel", async (req, res) => {
    authorize(req.user.role, "configure");
    const revision = z
      .object({ revision: z.number().int() })
      .parse(req.body).revision;
    await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `post:${req.params.id}`,
      ]);
      const post = await readPost(tx, req.user.workspaceId, req.params.id);
      if (!post) throw new AppError(404, "NOT_FOUND", "Post not found.");
      if (post.revision !== revision)
        throw new AppError(
          409,
          "POST_CHANGED",
          "Refresh to load the latest version before cancelling.",
        );
      await tx.query(
        "UPDATE post_targets SET status='cancelled',detail='Cancelled by the workspace team.' WHERE post_id=$1 AND status IN ('draft','scheduled','blocked','failed')",
        [post.id],
      );
      await tx.query(
        "UPDATE scheduled_posts SET revision=revision+1 WHERE id=$1",
        [post.id],
      );
      await refreshStatus(tx, post.id);
      await audit(
        tx,
        req.user.workspaceId,
        req.user.name,
        "Post schedule cancelled",
        post.title,
      );
    });
    res.json({ ok: true });
  });
}
