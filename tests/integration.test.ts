import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createDatabase, type DB } from "../src/db/database";
import { createApp, errorHandler } from "../src/server/app";
import { workOne } from "../src/automation/engine";
import type {
  Account,
  Contact,
  Conversation,
  Dashboard,
  Message,
  Run,
  SessionUser,
} from "../src/shared/types";
import { get, list, put } from "../src/server/repository";
let db: DB,
  app: Express,
  cookie: string,
  user: SessionUser,
  dashboard: Dashboard;
const credentials = {
  email: "owner@example.test",
  password: "correct-horse-battery-staple",
  name: "Owner",
  workspaceName: "One",
};
async function signUp(email: string) {
  const r = await request(app)
    .post("/api/auth/register")
    .send({ ...credentials, email });
  expect(r.status).toBe(200);
  const c = r.headers["set-cookie"][0].split(";")[0];
  const s = await request(app).get("/api/session").set("Cookie", c);
  return { cookie: c, user: s.body as SessionUser };
}
const mutate = (url: string, body: object) =>
  request(app)
    .post(url)
    .set("Cookie", cookie)
    .set("X-CSRF-Token", user.csrf)
    .send(body);
beforeAll(async () => {
  db = await createDatabase("memory://");
  app = createApp(db);
  app.use(errorHandler);
  const r = await request(app).post("/api/auth/demo").send({});
  expect(r.status).toBe(200);
  cookie = r.headers["set-cookie"][0].split(";")[0];
  user = (await request(app).get("/api/session").set("Cookie", cookie)).body;
  dashboard = (await request(app).get("/api/dashboard").set("Cookie", cookie))
    .body;
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("authenticated tenant API", () => {
  it("seeds persisted relational storage", async () => {
    expect(dashboard.accounts).toHaveLength(3);
    expect(dashboard.resources).toHaveLength(8);
    expect(dashboard.rules).toHaveLength(5);
    expect(dashboard.metrics.contacts).toBe(25);
    expect(dashboard.metrics.messages + dashboard.metrics.comments).toBe(200);
  });
  it("rejects unauthenticated and cross-origin requests", async () => {
    expect((await request(app).get("/api/dashboard")).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/auth/demo")
          .set("Origin", "https://evil.example")
          .send({})
      ).status,
    ).toBe(403);
  });
  it("requires CSRF on authenticated writes", async () =>
    expect(
      (await request(app).post("/api/resources").set("Cookie", cookie).send({}))
        .status,
    ).toBe(403));
  it("stores passwords and supports login and logout", async () => {
    const a = await signUp("auth@example.test");
    const login = await request(app)
      .post("/api/auth/login")
      .send({ ...credentials, email: "auth@example.test" });
    expect(login.status).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/auth/logout")
          .set("Cookie", a.cookie)
          .set("X-CSRF-Token", a.user.csrf)
          .send({})
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get("/api/session").set("Cookie", a.cookie)).status,
    ).toBe(401);
  });
  it("does not leak another workspace or accept foreign IDs", async () => {
    const other = await signUp("other@example.test");
    const d = await request(app)
      .get("/api/dashboard")
      .set("Cookie", other.cookie);
    expect(d.body.metrics.contacts).toBe(0);
    const c = (
      await list<Conversation>(db, user.workspaceId, "conversations")
    )[0];
    expect(
      (
        await request(app)
          .get(`/api/conversations/${c.id}`)
          .set("Cookie", other.cookie)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .put(`/api/resources/${dashboard.resources[0].id}`)
          .set("Cookie", other.cookie)
          .set("X-CSRF-Token", other.user.csrf)
          .send(dashboard.resources[0])
      ).status,
    ).toBe(404);
  });
  it("enforces role on mutation even when the UI is bypassed", async () => {
    await db.query("UPDATE members SET role='viewer' WHERE user_id=$1", [
      user.id,
    ]);
    expect(
      (await mutate("/api/resources", dashboard.resources[0])).status,
    ).toBe(403);
    await db.query("UPDATE members SET role='owner' WHERE user_id=$1", [
      user.id,
    ]);
  });
  it("paginates inbox and never fetches the full message table", async () => {
    const r = await request(app)
      .get("/api/conversations?filter=archived")
      .set("Cookie", cookie);
    expect(r.body.items).toHaveLength(25);
    const detail = await request(app)
      .get(`/api/conversations/${r.body.items[0].id}`)
      .set("Cookie", cookie);
    expect(detail.body.messages).toHaveLength(4);
  });
});
const event = (
  account: Account,
  key = "e1",
  type = "comment",
  content = "PORTFOLIO please",
) => ({
  id: key,
  accountId: account.id,
  externalUserId: "acceptance-customer",
  name: "Taylor",
  username: "taylor",
  type,
  content,
  postId: "post-1",
  timestamp: new Date().toISOString(),
});
describe("comment-to-resource acceptance", () => {
  it("ingests, queues, normalizes, runs, persists delivery, and prevents duplicate sends", async () => {
    const a = dashboard.accounts.find((a) => a.platform === "instagram")!;
    expect((await mutate("/api/simulate", event(a))).status).toBe(202);
    expect(await workOne(db, "http://localhost:3000")).toBe(true);
    let runs = await list<Run>(db, user.workspaceId, "runs");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("completed");
    expect(runs[0].version).toBe(1);
    const contact = (
      await list<Contact>(db, user.workspaceId, "contacts")
    ).find((c) => c.externalId === "acceptance-customer")!;
    expect(contact.tags).toContain("Portfolio lead");
    const conv = (
      await list<Conversation>(db, user.workspaceId, "conversations")
    ).find((c) => c.contactId === contact.id)!;
    const messages = (
      await list<Message>(db, user.workspaceId, "messages", 500)
    ).filter((m) => m.conversationId === conv.id);
    expect(messages).toHaveLength(3);
    expect(messages.some((m) => m.text.includes("/r/"))).toBe(true);
    const duplicate = await mutate("/api/simulate", event(a));
    expect(duplicate.body.duplicate).toBe(true);
    expect(await workOne(db, "http://localhost:3000")).toBe(false);
    await mutate("/api/simulate", event(a, "e2"));
    await workOne(db, "http://localhost:3000");
    runs = await list<Run>(db, user.workspaceId, "runs");
    expect(runs.find((r) => r.eventId === "e2")?.steps).toContain(
      "COOLDOWN_ACTIVE",
    );
    const delivery = (
      await db.query<{ id: string }>(
        "SELECT id FROM deliveries WHERE workspace_id=$1",
        [user.workspaceId],
      )
    ).rows[0];
    const link = await request(app).get(`/r/${delivery.id}`);
    expect(link.status).toBe(302);
    expect(link.headers.location).toMatch(/^https:\/\/example.com/);
  });
  it("takes over atomically and blocks further automation", async () => {
    const a = dashboard.accounts.find((a) => a.platform === "instagram")!;
    const contact = (
      await list<Contact>(db, user.workspaceId, "contacts")
    ).find((c) => c.externalId === "acceptance-customer")!;
    const c = (
      await list<Conversation>(db, user.workspaceId, "conversations")
    ).find((c) => c.contactId === contact.id)!;
    expect(
      (
        await request(app)
          .patch(`/api/conversations/${c.id}`)
          .set("Cookie", cookie)
          .set("X-CSRF-Token", user.csrf)
          .send({ handling: "human" })
      ).status,
    ).toBe(200);
    await mutate("/api/simulate", event(a, "takeover-event"));
    await workOne(db, "http://localhost:3000");
    expect(
      (await list<Run>(db, user.workspaceId, "runs")).find(
        (r) => r.eventId === "takeover-event",
      )?.steps,
    ).toContain("HUMAN_TAKEOVER");
    const note = "Private pricing discussion";
    await mutate(`/api/conversations/${c.id}/messages`, {
      text: note,
      note: true,
    });
    const internal = (
      await list<Message>(db, user.workspaceId, "messages", 500)
    ).find((m) => m.text === note);
    expect(internal?.direction).toBe("internal");
  });
  it("logs unsupported private replies but continues permitted public replies", async () => {
    const rule = dashboard.rules.find((r) => r.status === "active")!;
    await put(db, user.workspaceId, "rules", {
      ...rule,
      platforms: ["youtube"],
    });
    const a = dashboard.accounts.find((a) => a.platform === "youtube")!;
    await mutate("/api/simulate", {
      ...event(a, "unsupported"),
      content: rule.keywords[0],
    });
    await workOne(db, "http://localhost:3000");
    const run = (await list<Run>(db, user.workspaceId, "runs")).find(
      (r) => r.eventId === "unsupported",
    )!;
    expect(run.status).toBe("partial");
    expect(run.steps).toContain("PRIVATE_REPLY_UNSUPPORTED");
    expect(run.steps).toContain("Public reply simulated");
  });
  it("suggests an exact manual FAQ and persists opt-out", async () => {
    const a = dashboard.accounts.find((a) => a.platform === "facebook")!;
    await mutate("/api/simulate", event(a, "faq", "dm", "what do you do"));
    await workOne(db, "http://localhost:3000");
    let contact = (await list<Contact>(db, user.workspaceId, "contacts")).find(
      (c) => c.accountId === a.id && c.externalId === "acceptance-customer",
    )!;
    const c = (
      await list<Conversation>(db, user.workspaceId, "conversations")
    ).find((c) => c.contactId === contact.id)!;
    expect(c.suggestion).toContain("brand strategy");
    await mutate("/api/simulate", event(a, "stop", "dm", "STOP"));
    await workOne(db, "http://localhost:3000");
    contact = (await get<Contact>(
      db,
      user.workspaceId,
      "contacts",
      contact.id,
    ))!;
    expect(contact.optedOut).toBe(true);
    expect(
      (await mutate(`/api/conversations/${c.id}/messages`, { text: "hello" }))
        .status,
    ).toBe(409);
  });
});

describe("delivery and data-integrity regressions", () => {
  it("sends a resource only once when two rules match the same contact", async () => {
    const a = dashboard.accounts.find((a) => a.platform === "instagram")!;
    const base = {
      ...dashboard.rules[0],
      platforms: ["instagram"] as Account["platform"][],
      keywords: ["dedup-test"],
      cooldownHours: 0,
      status: "active" as const,
      resourceId: dashboard.resources[0].id,
    };
    await put(db, user.workspaceId, "rules", { ...base, id: "dedup-rule-a" });
    await put(db, user.workspaceId, "rules", { ...base, id: "dedup-rule-b" });
    await mutate("/api/simulate", {
      ...event(a, "dedup-resource"),
      externalUserId: "dedup-person",
      content: "dedup-test",
    });
    await workOne(db, "http://localhost:3000");
    const runs = (await list<Run>(db, user.workspaceId, "runs")).filter(
      (r) => r.eventId === "dedup-resource",
    );
    expect(runs.filter((r) => r.status === "completed")).toHaveLength(1);
    expect(
      runs.filter((r) => r.steps.includes("RESOURCE_ALREADY_DELIVERED")),
    ).toHaveLength(1);
    const contact = (
      await list<Contact>(db, user.workspaceId, "contacts")
    ).find((c) => c.externalId === "dedup-person")!;
    expect(
      (
        await db.query(
          "SELECT id FROM deliveries WHERE workspace_id=$1 AND contact_id=$2",
          [user.workspaceId, contact.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("creates working tracked links for public-only resource delivery", async () => {
    const a = dashboard.accounts.find((a) => a.platform === "youtube")!;
    const rule = {
      ...dashboard.rules[0],
      id: "public-resource",
      platforms: ["youtube"],
      keywords: ["publiclink"],
      status: "active",
      privateReply: "",
      publicReply: "Download: {{resource_link}}",
      resourceId: dashboard.resources[1].id,
    };
    await put(db, user.workspaceId, "rules", rule);
    await mutate("/api/simulate", {
      ...event(a, "public-link-event"),
      externalUserId: "public-link-person",
      content: "publiclink",
    });
    await workOne(db, "http://localhost:3000");
    const delivery = (
      await db.query<{ id: string }>(
        "SELECT id FROM deliveries WHERE workspace_id=$1 AND rule_id=$2",
        [user.workspaceId, rule.id],
      )
    ).rows[0];
    expect(delivery).toBeDefined();
    expect((await request(app).get(`/r/${delivery.id}`)).status).toBe(302);
  });
  it("does not count a selected resource when neither reply contains its link", async () => {
    const a = dashboard.accounts.find((a) => a.platform === "instagram")!;
    const rule = {
      ...dashboard.rules[0],
      id: "no-link-rule",
      platforms: ["instagram"],
      keywords: ["nolink"],
      status: "active",
      privateReply: "Thanks for your comment.",
      publicReply: "",
      resourceId: dashboard.resources[2].id,
    };
    await put(db, user.workspaceId, "rules", rule);
    await mutate("/api/simulate", {
      ...event(a, "no-link-event"),
      externalUserId: "no-link-person",
      content: "nolink",
    });
    await workOne(db, "http://localhost:3000");
    expect(
      (
        await db.query(
          "SELECT id FROM deliveries WHERE workspace_id=$1 AND rule_id=$2",
          [user.workspaceId, rule.id],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("exports every contact beyond the 500-row page and escapes spreadsheet formulas", async () => {
    const c = (await list<Contact>(db, user.workspaceId, "contacts"))[0];
    await db.transaction(async (tx) => {
      for (let n = 0; n < 501; n++)
        await put(tx, user.workspaceId, "contacts", {
          ...c,
          id: `export-${n.toString().padStart(4, "0")}`,
          externalId: `export-${n}`,
          name: n === 500 ? '  =HYPERLINK("test")' : `Export ${n}`,
        });
    });
    const result = await request(app)
      .get("/api/export/contacts")
      .set("Cookie", cookie);
    expect(result.status).toBe(200);
    expect(result.text).toContain("Export 499");
    expect(result.text).toContain(`"'  =HYPERLINK(""test"")"`);
    const count = (
      await db.query<{ n: string }>(
        "SELECT count(*) n FROM records WHERE workspace_id=$1 AND kind='contacts'",
        [user.workspaceId],
      )
    ).rows[0];
    expect(result.text.trim().split("\r\n").length).toBe(Number(count.n) + 1);
    expect(result.headers["cache-control"]).toContain("no-store");
  });
});
