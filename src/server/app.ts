import { installMedia, installMediaDelivery } from "../publishing/media.js";
import express from "express";
import { installPublishing } from "../publishing/routes.js";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import type { DB } from "../db/database.js";
import type {
  Account,
  Contact,
  Conversation,
  FAQ,
  Message,
  Notification,
  Resource,
  Rule,
} from "../shared/types.js";
import {
  AppError,
  audit,
  get,
  id,
  list,
  now,
  put,
  required,
} from "./repository.js";
import { authorize, safeUrl, verifySignature } from "./security.js";
import { installSocialAuth } from "./oauth/routes.js";
import { installAuth } from "./auth.js";
import { dashboard } from "./analytics.js";
import {
  contactInput,
  conversationInput,
  eventInput,
  faqInput,
  messageInput,
  profileInput,
  resourceInput,
  ruleInput,
} from "./validation.js";
import { ingest } from "../automation/engine.js";
import { matches, render } from "../automation/matching.js";
import { adapterFor, integrationDocs } from "../platforms/registry.js";
export function createApp(db: DB, appUrl = "http://localhost:3000") {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production" ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.get("/health", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true });
  });
  app.post(
    "/ingest/:workspaceId",
    express.raw({ type: "application/json", limit: "128kb" }),
    async (req, res) => {
      const secret = process.env.INGESTION_SECRET || "";
      if (secret.length < 32)
        throw new AppError(
          503,
          "INGESTION_DISABLED",
          "Signed ingestion has not been configured.",
        );
      if (
        !Buffer.isBuffer(req.body) ||
        !verifySignature(
          req.body,
          req.header("x-signature"),
          secret,
          req.header("x-timestamp") || "",
        )
      )
        throw new AppError(
          401,
          "INVALID_SIGNATURE",
          "Webhook signature or timestamp is invalid.",
        );
      let raw: unknown;
      try {
        raw = JSON.parse(req.body.toString());
      } catch {
        throw new AppError(
          400,
          "INVALID_JSON",
          "The event body must be valid JSON.",
        );
      }
      const event = eventInput.parse(raw);
      const account = await required<Account>(
        db,
        req.params.workspaceId,
        "accounts",
        event.accountId,
      );
      if (!account.demo)
        throw new AppError(
          501,
          "ADAPTER_UNCONFIGURED",
          "Live platform adapters are not enabled.",
        );
      res.status(202).json(await ingest(db, req.params.workspaceId, event));
    },
  );
  app.use(express.json({ limit: "128kb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  app.use("/api", (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.header("origin");
      if (origin && origin !== new URL(appUrl).origin)
        throw new AppError(
          403,
          "ORIGIN_REJECTED",
          "This request did not originate from this application.",
        );
      if (req.header("sec-fetch-site") === "cross-site")
        throw new AppError(
          403,
          "ORIGIN_REJECTED",
          "Cross-site requests are not accepted.",
        );
    }
    next();
  });
  app.get("/r/:id", async (req, res) => {
    const d = (
      await db.query<{
        url: string;
        workspace_id: string;
        resource_id: string;
        tracking: boolean;
      }>(
        "SELECT url,workspace_id,resource_id,tracking FROM deliveries WHERE id=$1",
        [req.params.id],
      )
    ).rows[0];
    if (!d || !safeUrl(d.url))
      throw new AppError(
        404,
        "LINK_UNAVAILABLE",
        "This resource link is unavailable.",
      );
    const r = await get<Resource>(
      db,
      d.workspace_id,
      "resources",
      d.resource_id,
    );
    if (!r?.active)
      throw new AppError(
        410,
        "RESOURCE_INACTIVE",
        "This resource is no longer available.",
      );
    if (d.tracking)
      await db.query("UPDATE deliveries SET clicks=clicks+1 WHERE id=$1", [
        req.params.id,
      ]);
    res.setHeader("Referrer-Policy", "no-referrer");
    res.redirect(302, d.url);
  });
  const installSocialConnections = installSocialAuth(app, db, appUrl);
  installMediaDelivery(app, db);
  installAuth(app, db);
  installSocialConnections();
  installMedia(app, db);
  installPublishing(app, db);
  app.get("/api/dashboard", async (req, res) =>
    res.json(await dashboard(db, req.user.workspaceId)),
  );
  app.get("/api/conversations", async (req, res) => {
    const q = z
      .object({
        search: z.string().max(200).default(""),
        filter: z.string().max(40).default("all"),
        cursor: z.string().max(100).optional(),
      })
      .parse(req.query);
    const rows = await db.query<{ data: Conversation }>(
      `SELECT data FROM records WHERE workspace_id=$1 AND kind='conversations' AND ($2='' OR data->>'name' ILIKE $3 OR data->>'username' ILIKE $3 OR data->>'lastMessage' ILIKE $3) AND ($4='all' AND data->>'status'='open' OR $4='archived' AND data->>'status'='archived' OR $4='human' AND data->>'handling'='human' AND data->>'status'='open' OR $4='unread' AND data->>'unread'='true' AND data->>'status'='open' OR $4='approval' AND data->>'suggestion' IS NOT NULL AND data->>'status'='open' OR data->>'platform'=$4 AND data->>'status'='open') AND ($5::text IS NULL OR (data->>'updatedAt'||'|'||id)<$5) ORDER BY data->>'updatedAt' DESC,id DESC LIMIT 31`,
      [
        req.user.workspaceId,
        q.search,
        `%${q.search}%`,
        q.filter,
        q.cursor || null,
      ],
    );
    const items = rows.rows.slice(0, 30).map((r) => r.data);
    res.json({
      items,
      nextCursor:
        rows.rows.length > 30
          ? `${items.at(-1)!.updatedAt}|${items.at(-1)!.id}`
          : null,
    });
  });
  app.get("/api/conversations/:id", async (req, res) => {
    const w = req.user.workspaceId,
      c = await required<Conversation>(db, w, "conversations", req.params.id);
    const before = z.string().max(100).optional().parse(req.query.before);
    const messages = (
      await db.query<{ data: Message }>(
        "SELECT data FROM records WHERE workspace_id=$1 AND kind='messages' AND data->>'conversationId'=$2 AND ($3::text IS NULL OR (data->>'createdAt'||'|'||id)<$3) ORDER BY data->>'createdAt' DESC,id DESC LIMIT 51",
        [w, c.id, before || null],
      )
    ).rows.map((r) => r.data);
    const page = messages.slice(0, 50);
    res.json({
      conversation: c,
      contact: await required<Contact>(db, w, "contacts", c.contactId),
      messages: page.reverse(),
      nextCursor:
        messages.length > 50
          ? `${messages[49].createdAt}|${messages[49].id}`
          : null,
    });
  });
  app.patch("/api/conversations/:id", async (req, res) => {
    authorize(req.user.role, "reply");
    const input = conversationInput.parse(req.body),
      w = req.user.workspaceId;
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [w]);
      const c = await required<Conversation>(
        tx,
        w,
        "conversations",
        req.params.id,
      );
      await put(tx, w, "conversations", {
        ...c,
        ...input,
        ...(input.handling ? { suggestion: undefined } : {}),
      });
      await audit(
        tx,
        w,
        req.user.name,
        input.handling === "human"
          ? "Human takeover"
          : input.handling === "rules"
            ? "Returned to rules"
            : "Conversation updated",
        c.name,
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/conversations/:id/messages", async (req, res) => {
    authorize(req.user.role, "reply");
    const input = messageInput.parse(req.body),
      w = req.user.workspaceId;
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [w]);
      const c = await required<Conversation>(
        tx,
        w,
        "conversations",
        req.params.id,
      );
      const a = await required<Account>(tx, w, "accounts", c.accountId);
      const contact = await required<Contact>(tx, w, "contacts", c.contactId);
      if (!input.note && contact.optedOut)
        throw new AppError(
          409,
          "OPTED_OUT",
          "This customer opted out. Add an internal note instead.",
        );
      if (!input.note && !adapterFor(a).getCapabilities().sendDMs)
        throw new AppError(
          409,
          "DM_UNAVAILABLE",
          "Direct messages are unavailable for this account.",
        );
      const m: Message = {
        id: id(),
        conversationId: c.id,
        text: input.text,
        direction: input.note ? "internal" : "outbound",
        sender: "human",
        kind: input.note ? "note" : "message",
        status: input.note ? "recorded" : "simulated",
        createdAt: now(),
      };
      await put(tx, w, "messages", m);
      if (!input.note) {
        c.lastMessage = input.text;
        c.updatedAt = now();
        c.handling = "human";
        delete c.suggestion;
      }
      await put(tx, w, "conversations", c);
      await audit(
        tx,
        w,
        req.user.name,
        input.note ? "Internal note added" : "Manual reply simulated",
        c.name,
      );
    });
    res.json({ ok: true });
  });
  app.get("/api/contacts", async (req, res) => {
    const q = z
      .object({
        search: z.string().max(200).default(""),
        cursor: z.string().max(100).optional(),
      })
      .parse(req.query);
    const rows = (
      await db.query<{ data: Contact }>(
        "SELECT data FROM records WHERE workspace_id=$1 AND kind='contacts' AND ($2='' OR data->>'name' ILIKE $3 OR data->>'username' ILIKE $3) AND ($4::text IS NULL OR id>$4) ORDER BY id LIMIT 51",
        [req.user.workspaceId, q.search, `%${q.search}%`, q.cursor || null],
      )
    ).rows.map((r) => r.data);
    res.json({
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    });
  });
  app.patch("/api/contacts/:id", async (req, res) => {
    authorize(req.user.role, "reply");
    const input = contactInput.parse(req.body);
    const w = req.user.workspaceId;
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [w]);
      const c = await required<Contact>(tx, w, "contacts", req.params.id);
      await put(tx, w, "contacts", { ...c, ...input });
      await audit(tx, w, req.user.name, "Contact updated", c.name);
    });
    res.json({ ok: true });
  });
  for (const kind of ["resources", "rules", "faqs"] as const) {
    app.post(`/api/${kind}`, async (req, res) => {
      authorize(req.user.role, "configure");
      const w = req.user.workspaceId;
      const input =
        kind === "resources"
          ? resourceInput.parse(req.body)
          : kind === "rules"
            ? ruleInput.parse(req.body)
            : faqInput.parse(req.body);
      if (kind === "rules" && "resourceId" in input && input.resourceId)
        await required(db, w, "resources", input.resourceId);
      const value = {
        ...input,
        id: id(),
        createdAt: now(),
        ...(kind === "rules" ? { version: 1, status: "draft" } : {}),
      };
      await db.transaction(async (tx) => {
        await put(tx, w, kind, value);
        if (kind === "rules")
          await put(tx, w, "versions", {
            ...value,
            id: `${value.id}:1`,
            ruleId: value.id,
          });
        await audit(
          tx,
          w,
          req.user.name,
          `${kind} created`,
          "name" in input
            ? input.name
            : "question" in input
              ? input.question
              : "",
        );
      });
      res.status(201).json(value);
    });
    app.put(`/api/${kind}/:id`, async (req, res) => {
      authorize(req.user.role, "configure");
      const w = req.user.workspaceId;
      const input =
        kind === "resources"
          ? resourceInput.parse(req.body)
          : kind === "rules"
            ? ruleInput.parse(req.body)
            : faqInput.parse(req.body);
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [w]);
        const old = await required<Rule | Resource | FAQ>(
          tx,
          w,
          kind,
          req.params.id,
        );
        if (kind === "rules" && "resourceId" in input && input.resourceId)
          await required(tx, w, "resources", input.resourceId);
        const value = {
          ...old,
          ...input,
          ...(kind === "rules"
            ? { version: ("version" in old ? old.version : 0) + 1 }
            : {}),
        };
        await put(tx, w, kind, value);
        if (kind === "rules" && "version" in value)
          await put(tx, w, "versions", {
            ...value,
            id: `${value.id}:${value.version}`,
            ruleId: value.id,
          });
        await audit(tx, w, req.user.name, `${kind} updated`, old.id);
      });
      res.json({ ok: true });
    });
  }
  app.put("/api/profile", async (req, res) => {
    authorize(req.user.role, "configure");
    const value = profileInput.parse(req.body);
    await db.transaction(async (tx) => {
      await tx.query("UPDATE workspaces SET profile=$2 WHERE id=$1", [
        req.user.workspaceId,
        JSON.stringify(value),
      ]);
      await audit(
        tx,
        req.user.workspaceId,
        req.user.name,
        "Business information updated",
        value.businessName,
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/simulate", async (req, res) => {
    authorize(req.user.role, "configure");
    const event = eventInput.parse(req.body);
    const a = await required<Account>(
      db,
      req.user.workspaceId,
      "accounts",
      event.accountId,
    );
    if (!a.demo)
      throw new AppError(
        403,
        "SIMULATION_ONLY",
        "Choose a simulated account for this test.",
      );
    res.status(202).json(await ingest(db, req.user.workspaceId, event));
  });
  app.post("/api/rules/:id/test", async (req, res) => {
    authorize(req.user.role, "configure");
    const r = await required<Rule>(
      db,
      req.user.workspaceId,
      "rules",
      req.params.id,
    );
    const { text } = z.object({ text: z.string().max(4000) }).parse(req.body);
    res.json({
      matched: matches(text, r),
      reply: render(r.privateReply, {
        first_name: "Test customer",
        resource_link: "[selected resource link]",
        username: "test",
        business_name: "Your business",
        platform: r.platforms[0],
      }),
      note: "Preview only. No contact, delivery, or run is created.",
    });
  });
  app.get("/api/integrations", async (req, res) => {
    const accounts = await list<Account>(db, req.user.workspaceId, "accounts");
    res.json({
      accounts: accounts.map((a) => ({
        ...a,
        capabilities: adapterFor(a).getCapabilities(),
      })),
      docs: integrationDocs,
      jobs: (
        await db.query<{ status: string; count: string }>(
          "SELECT status,count(*) count FROM jobs WHERE workspace_id=$1 GROUP BY status",
          [req.user.workspaceId],
        )
      ).rows,
    });
  });
  app.post("/api/notifications/:id/read", async (req, res) => {
    const n = await required<Notification>(
      db,
      req.user.workspaceId,
      "notifications",
      req.params.id,
    );
    await put(db, req.user.workspaceId, "notifications", { ...n, read: true });
    res.json({ ok: true });
  });
  app.get("/api/export/contacts", async (req, res) => {
    authorize(req.user.role, "export");
    const cell = (s: string) =>
      '"' +
      (/^\s*[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') +
      '"';
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="contacts.csv"');
    res.write("Name,Username,Platform,Status,Tags\r\n");
    let cursor = "";
    // Page through a repeatable-read snapshot rather than loading the whole
    // contact table or silently truncating large exports.
    try {
      await db.transaction(async (tx) => {
        await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        while (!res.destroyed) {
          const rows = (
            await tx.query<{ id: string; data: Contact }>(
              "SELECT id,data FROM records WHERE workspace_id=$1 AND kind='contacts' AND id>$2 ORDER BY id LIMIT 500",
              [req.user.workspaceId, cursor],
            )
          ).rows;
          if (!rows.length) break;
          const chunk =
            rows
              .map(({ data: c }) =>
                [c.name, c.username, c.platform, c.status, c.tags.join("; ")]
                  .map(cell)
                  .join(","),
              )
              .join("\r\n") + "\r\n";
          if (!res.write(chunk))
            await new Promise<void>((resolve) => {
              const done = () => {
                res.off("drain", done);
                res.off("close", done);
                resolve();
              };
              res.once("drain", done);
              res.once("close", done);
            });
          cursor = rows[rows.length - 1].id;
        }
      });
      res.end();
    } catch {
      // A partial download must fail instead of looking like a complete CSV.
      res.destroy();
    }
  });
  app.get("/api/events", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write("event: refresh\ndata: {}\n\n");
    const timer = setInterval(
      () => res.write("event: refresh\ndata: {}\n\n"),
      5000,
    );
    const expiry = setTimeout(() => res.end(), 60000);
    req.on("close", () => {
      clearInterval(timer);
      clearTimeout(expiry);
    });
  });
  app.use("/api", (_req, _res) => {
    throw new AppError(
      404,
      "ENDPOINT_NOT_FOUND",
      "This API endpoint is unavailable.",
    );
  });
  return app;
}
export const errorHandler: express.ErrorRequestHandler = (
  err: unknown,
  _req,
  res,
  _next,
) => {
  const requestId = id();
  if (
    err &&
    typeof err === "object" &&
    "type" in err &&
    err.type === "entity.too.large"
  ) {
    res
      .status(413)
      .json({
        error: "The upload or request exceeds the allowed size.",
        code: "TOO_LARGE",
        requestId,
      });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      code: "VALIDATION_ERROR",
      requestId,
    });
    return;
  }
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: err.message, code: err.code, requestId });
    return;
  }
  console.error(
    JSON.stringify({
      requestId,
      errorCode: "INTERNAL_ERROR",
      errorType: err instanceof Error ? err.name : "Unknown",
    }),
  );
  res.status(500).json({
    error:
      "The request could not be completed. Retry or check the server logs with this request ID.",
    code: "INTERNAL_ERROR",
    requestId,
  });
};
