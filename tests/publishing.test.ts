import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { createDatabase, type DB } from "../src/db/database";
import { createApp, errorHandler } from "../src/server/app";
import { workPublishing } from "../src/publishing/service";
import { encrypt } from "../src/server/oauth/storage";
import { platforms } from "../src/shared/types";
import type { PublishResult } from "../src/publishing/providers";
let db: DB, app: Express;
interface Login {
  cookie: string;
  user: { id: string; workspaceId: string; csrf: string };
}
let demo: Login, owner: Login, other: Login;
async function login(demo = false): Promise<Login> {
  const response = demo
    ? await request(app).post("/api/auth/demo").send({})
    : await request(app)
        .post("/api/auth/register")
        .send({
          email: `${randomUUID()}@example.test`,
          password: "test-only-password",
          name: "Publisher",
          workspaceName: "Publishing",
        });
  const cookie = response.headers["set-cookie"][0].split(";")[0];
  const s = await request(app).get("/api/session").set("Cookie", cookie);
  return { cookie, user: s.body };
}
beforeAll(async () => {
  vi.stubEnv("OAUTH_ENCRYPTION_KEY", "ef".repeat(32));
  db = await createDatabase("memory://");
  app = createApp(db);
  app.use(errorHandler);
  demo = await login(true);
  owner = await login();
  other = await login();
}, 30000);
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await db.query("DELETE FROM scheduled_posts");
  await db.query("DELETE FROM social_connections");
});
function body(isDemo = true) {
  return {
    title: "Launch article",
    text: "Read our new story",
    articleUrl: "https://example.com/story",
    imageUrl: "",
    targets: platforms.map((platform) => ({
      platform,
      connectionId: isDemo ? `demo:${platform}` : null,
    })),
    intent: "schedule",
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    timezone: "Asia/Kathmandu",
    revision: 0,
  };
}
const save = (auth: Login, id: string, data: object) =>
  request(app)
    .put(`/api/posts/${id}`)
    .set("Cookie", auth.cookie)
    .set("X-CSRF-Token", auth.user.csrf)
    .send(data);
const getPosts = (auth: Login) =>
  request(app).get("/api/posts").set("Cookie", auth.cookie);
async function due(id: string) {
  await db.query(
    "UPDATE scheduled_posts SET scheduled_at=now()-interval '1 minute' WHERE id=$1",
    [id],
  );
}
async function liveConnection() {
  const id = randomUUID();
  await db.query(
    "INSERT INTO social_connections(id,workspace_id,user_id,provider,subject,external_id,name,encrypted_tokens,expires_at,publishing_requested) VALUES($1,$2,$3,'x','publisher','publisher','My X',$4,now()+interval '2 days',true)",
    [
      id,
      owner.user.workspaceId,
      owner.user.id,
      encrypt(
        { access_token: "token" },
        `${owner.user.workspaceId}:x:publisher`,
      ),
    ],
  );
  return id;
}
describe("shared social post scheduler", () => {
  it("persists one schedule for all seven demo platforms and does not deliver early", async () => {
    const id = randomUUID(),
      r = await save(demo, id, body());
    expect(r.status).toBe(200);
    expect(r.body.targets).toHaveLength(7);
    expect(r.body.status).toBe("scheduled");
    expect((await getPosts(demo)).body.posts[0].timezone).toBe(
      "Asia/Kathmandu",
    );
    const deliver = vi.fn();
    expect(await workPublishing(db, deliver)).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
    await due(id);
    for (let i = 0; i < 7; i++)
      expect(await workPublishing(db, deliver)).toBe(true);
    const post = (await getPosts(demo)).body.posts[0];
    expect(post.status).toBe("simulated");
    expect(
      post.targets.every((t: { status: string }) => t.status === "simulated"),
    ).toBe(true);
    expect(await workPublishing(db, deliver)).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });
  it("saves unscheduled drafts and allows revision-checked rescheduling", async () => {
    const id = randomUUID(),
      draft = { ...body(), intent: "draft", scheduledAt: null };
    expect((await save(demo, id, draft)).body.status).toBe("draft");
    expect((await save(demo, id, { ...body(), revision: 1 })).body.status).toBe(
      "scheduled",
    );
    expect((await save(demo, id, { ...body(), revision: 1 })).status).toBe(409);
    expect((await getPosts(demo)).body.posts).toHaveLength(1);
  });
  it("blocks unconnected live destinations rather than falsely reporting publication", async () => {
    const id = randomUUID(),
      r = await save(owner, id, body(false));
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("blocked");
    expect(
      r.body.targets.every(
        (t: { status: string; detail: string }) =>
          t.status === "blocked" && t.detail,
      ),
    ).toBe(true);
    await due(id);
    const deliver = vi.fn();
    expect(await workPublishing(db, deliver)).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });
  it("cancels pending destinations and never sends them", async () => {
    const id = randomUUID();
    await save(demo, id, body());
    const r = await request(app)
      .post(`/api/posts/${id}/cancel`)
      .set("Cookie", demo.cookie)
      .set("X-CSRF-Token", demo.user.csrf)
      .send({ revision: 1 });
    expect(r.status).toBe(200);
    await due(id);
    expect(await workPublishing(db, vi.fn())).toBe(false);
    expect((await getPosts(demo)).body.posts[0].status).toBe("cancelled");
  });
  it("enforces tenant ownership, CSRF, roles, and no fake demo targets", async () => {
    const id = randomUUID();
    await save(demo, id, body());
    expect((await getPosts(other)).body.posts).toHaveLength(0);
    expect((await save(other, id, { ...body(), revision: 1 })).status).toBe(
      404,
    );
    expect(
      (
        await request(app)
          .put(`/api/posts/${randomUUID()}`)
          .set("Cookie", owner.cookie)
          .send(body(false))
      ).status,
    ).toBe(403);
    expect((await save(owner, randomUUID(), body())).status).toBe(422);
    await db.query("UPDATE members SET role='viewer' WHERE user_id=$1", [
      other.user.id,
    ]);
    expect((await save(other, randomUUID(), body(false))).status).toBe(403);
    await db.query("UPDATE members SET role='owner' WHERE user_id=$1", [
      other.user.id,
    ]);
  });
  it("rejects past or invalid schedules, duplicate platforms and private URLs", async () => {
    expect(
      (
        await save(demo, randomUUID(), {
          ...body(),
          scheduledAt: new Date(Date.now() - 1000).toISOString(),
        })
      ).status,
    ).toBe(422);
    expect(
      (await save(demo, randomUUID(), { ...body(), timezone: "Fake/Timezone" }))
        .status,
    ).toBe(400);
    expect(
      (
        await save(demo, randomUUID(), {
          ...body(),
          articleUrl: "http://127.0.0.1/private",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await save(demo, randomUUID(), {
          ...body(),
          targets: [body().targets[0], body().targets[0]],
        })
      ).status,
    ).toBe(400);
  });
  it("delivers a due live target once even with competing workers", async () => {
    const connectionId = await liveConnection(),
      id = randomUUID();
    expect(
      (
        await save(owner, id, {
          ...body(false),
          targets: [{ platform: "x", connectionId }],
        })
      ).body.status,
    ).toBe("scheduled");
    await due(id);
    const deliver = vi.fn().mockResolvedValue({
      status: "published",
      detail: "Confirmed",
      remoteId: "remote-post",
    });
    await Promise.all([
      workPublishing(db, deliver),
      workPublishing(db, deliver),
    ]);
    expect(deliver).toHaveBeenCalledTimes(1);
    const post = (await getPosts(owner)).body.posts[0];
    expect(post.status).toBe("published");
    expect(post.targets[0].remoteId).toBe("remote-post");
    expect(
      (await save(owner, id, { ...body(false), revision: 1 })).status,
    ).toBe(409);
  });
  it("keeps successful and blocked results separate", async () => {
    const connectionId = await liveConnection(),
      id = randomUUID();
    await save(owner, id, {
      ...body(false),
      targets: [
        { platform: "x", connectionId },
        { platform: "youtube", connectionId: null },
      ],
    });
    await due(id);
    await workPublishing(
      db,
      vi.fn().mockResolvedValue({
        status: "published",
        detail: "Confirmed",
        remoteId: "remote-post",
      }),
    );
    const post = (await getPosts(owner)).body.posts[0];
    expect(post.status).toBe("partial");
    expect(
      post.targets.map((t: { status: string }) => t.status).sort(),
    ).toEqual(["blocked", "published"]);
  });
  it("does not overwrite an in-progress delivery", async () => {
    const connectionId = await liveConnection(),
      id = randomUUID();
    await save(owner, id, {
      ...body(false),
      targets: [{ platform: "x", connectionId }],
    });
    await due(id);
    let release!: (r: PublishResult) => void, started!: () => void;
    const ready = new Promise<void>((r) => {
      started = r;
    });
    const pending = workPublishing(db, () => {
      started();
      return new Promise<PublishResult>((r) => {
        release = r;
      });
    });
    await ready;
    expect(
      (await save(owner, id, { ...body(false), revision: 1 })).status,
    ).toBe(409);
    release({ status: "published", detail: "Confirmed", remoteId: "one" });
    await pending;
  });
  it("marks interrupted attempts unknown without retrying", async () => {
    const id = randomUUID();
    await save(demo, id, { ...body(), targets: [body().targets[0]] });
    await db.query(
      "UPDATE post_targets SET status='publishing',claimed_at=now()-interval '6 minutes' WHERE post_id=$1",
      [id],
    );
    const deliver = vi.fn();
    expect(await workPublishing(db, deliver)).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
    expect((await getPosts(demo)).body.posts[0].status).toBe("unknown");
  });
  it("blocks removed connections and revoked scheduling authority", async () => {
    const connectionId = await liveConnection(),
      id = randomUUID();
    await save(owner, id, {
      ...body(false),
      targets: [{ platform: "x", connectionId }],
    });
    await due(id);
    await db.query("DELETE FROM social_connections WHERE id=$1", [
      connectionId,
    ]);
    const deliver = vi.fn();
    await workPublishing(db, deliver);
    expect(deliver).not.toHaveBeenCalled();
    expect((await getPosts(owner)).body.posts[0].status).toBe("blocked");
    const demoId = randomUUID();
    await save(demo, demoId, { ...body(), targets: [body().targets[0]] });
    await due(demoId);
    await db.query("UPDATE members SET role='viewer' WHERE user_id=$1", [
      demo.user.id,
    ]);
    await workPublishing(db, deliver);
    expect((await getPosts(demo)).body.posts[0].status).toBe("blocked");
    await db.query("UPDATE members SET role='owner' WHERE user_id=$1", [
      demo.user.id,
    ]);
  });
});

it("keeps uploaded media private and persists caption/hashtags with schedules", async () => {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=",
    "base64",
  );
  const upload = await request(app)
    .post("/api/media")
    .set("Cookie", demo.cookie)
    .set("X-CSRF-Token", demo.user.csrf)
    .set("Content-Type", "application/octet-stream")
    .send(bytes);
  expect(upload.status).toBe(201);
  expect(
    (
      await request(app)
        .get(`/api/media/${upload.body.id}`)
        .set("Cookie", other.cookie)
    ).status,
  ).toBe(404);
  const preview = await request(app)
    .get(`/api/media/${upload.body.id}`)
    .set("Cookie", demo.cookie);
  expect(preview.status).toBe(200);
  expect(preview.body).toEqual(bytes);
  const partial = await request(app)
    .get(`/api/media/${upload.body.id}`)
    .set("Cookie", demo.cookie)
    .set("Range", "bytes=0-7");
  expect(partial.status).toBe(206);
  expect(partial.body).toEqual(bytes.subarray(0, 8));
  expect(
    (
      await request(app)
        .get(`/api/media/${upload.body.id}`)
        .set("Cookie", demo.cookie)
        .set("Range", "bytes=9999-")
    ).status,
  ).toBe(416);
  const saved = await save(demo, randomUUID(), {
    ...body(),
    mediaId: upload.body.id,
    hashtags: "launch, #news",
  });
  expect(saved.status).toBe(200);
  expect(saved.body.media.id).toBe(upload.body.id);
  expect(saved.body.hashtags).toBe("launch, #news");
  expect(
    (
      await save(other, randomUUID(), {
        ...body(false),
        mediaId: upload.body.id,
      })
    ).status,
  ).toBe(422);
});
it("rejects active file types and uploads without CSRF", async () => {
  expect(
    (
      await request(app)
        .post("/api/media")
        .set("Cookie", owner.cookie)
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("<svg>unsafe image</svg>"))
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post("/api/media")
        .set("Cookie", owner.cookie)
        .set("X-CSRF-Token", owner.user.csrf)
        .set("Content-Type", "application/octet-stream")
        .send(Buffer.from("<svg>unsafe image</svg>"))
    ).status,
  ).toBe(422);
});
it("exposes only expiring delivery capabilities", async () => {
  const { deliveryUrl } = await import("../src/publishing/media");
  const mediaId = randomUUID();
  await db.query(
    "INSERT INTO post_media(id,workspace_id,mime,size,body) VALUES($1,$2,'image/jpeg',4,'aW1hZw==')",
    [mediaId, owner.user.workspaceId],
  );
  vi.stubEnv("APP_URL", "https://relay.example.com");
  expect(
    await deliveryUrl(db, other.user.workspaceId, mediaId),
  ).toBeUndefined();
  const url = await deliveryUrl(db, owner.user.workspaceId, mediaId);
  expect((await request(app).get(new URL(url!).pathname)).status).toBe(200);
  await db.query(
    "UPDATE media_delivery_tokens SET expires_at=now()-interval '1 second'",
  );
  expect((await request(app).get(new URL(url!).pathname)).status).toBe(404);
  vi.stubEnv("APP_URL", "");
});
