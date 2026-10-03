import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { encrypt } from "../src/server/oauth/storage";
import { publish, type Connection } from "../src/publishing/providers";
import { authorizationUrl, provider } from "../src/server/oauth/providers";
const content = {
  title: "Internal only",
  text: "Our announcement",
  articleUrl: "https://example.com/article",
  imageUrl: "",
};
beforeEach(() => vi.stubEnv("OAUTH_ENCRYPTION_KEY", "ab".repeat(32)));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function connection(p: string): Connection {
  return {
    id: "connection",
    workspace_id: "workspace",
    provider: p,
    external_id: "external",
    name: "Account",
    encrypted_tokens: encrypt(
      { access_token: "private-token" },
      `workspace:${p}:external`,
    ),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    publishing_requested: true,
  };
}
it("publishes the written text and article link to X without the internal title", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ data: { id: "post-1" } }));
  vi.stubGlobal("fetch", fetcher);
  expect(await publish(connection("x"), content)).toMatchObject({
    status: "published",
    remoteId: "post-1",
  });
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.x.com/2/tweets");
  expect(JSON.parse(init.body)).toEqual({
    text: "Our announcement\n\nhttps://example.com/article",
  });
});
it("uses LinkedIn's member author, version and confirmed response ID", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(null, {
      status: 201,
      headers: { "x-restli-id": "urn:li:share:123" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await publish(connection("linkedin"), content)).toMatchObject({
    status: "published",
    remoteId: "urn:li:share:123",
  });
  const [, init] = fetcher.mock.calls[0];
  expect(init.headers["LinkedIn-Version"]).toBe("202604");
  expect(JSON.parse(init.body)).toMatchObject({
    author: "urn:li:person:external",
    lifecycleState: "PUBLISHED",
    visibility: "PUBLIC",
  });
});
it("uses Threads text auto-publishing and its returned post ID", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "thread-1" }));
  vi.stubGlobal("fetch", fetcher);
  expect(await publish(connection("threads"), content)).toMatchObject({
    status: "published",
    remoteId: "thread-1",
  });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    media_type: "TEXT",
    auto_publish_text: true,
  });
  expect(fetcher).toHaveBeenCalledOnce();
});
it("publishes a Threads image container only once", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ id: "container" }))
    .mockResolvedValueOnce(Response.json({ id: "published-image" }));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await publish(connection("threads"), {
      ...content,
      imageUrl: "https://example.com/photo.jpg",
    }),
  ).toMatchObject({ status: "published", remoteId: "published-image" });
  expect(fetcher.mock.calls[1][0]).toContain("threads_publish");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    creation_id: "container",
  });
});
it("blocks missing consent, expiry, unsupported formats and unreadable tokens before network I/O", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const c of [
    { ...connection("x"), publishing_requested: false },
    { ...connection("x"), expires_at: new Date(0).toISOString() },
    connection("instagram"),
    { ...connection("x"), encrypted_tokens: "broken" },
  ])
    expect((await publish(c, content)).status).toBe("blocked");
  expect(
    (
      await publish(connection("x"), {
        ...content,
        imageUrl: "https://example.com/photo.jpg",
      })
    ).status,
  ).toBe("blocked");
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  [403, "blocked"],
  [429, "failed"],
  [400, "failed"],
  [503, "unknown"],
] as const)(
  "handles provider status %i without exposing its response or retrying",
  async (status, result) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("sensitive provider response", { status }),
      );
    vi.stubGlobal("fetch", fetcher);
    const r = await publish(connection("x"), content);
    expect(r.status).toBe(result);
    expect(r.detail).not.toContain("sensitive");
    expect(fetcher).toHaveBeenCalledOnce();
  },
);
it("treats a timeout or missing success ID as unknown rather than retrying", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("Network failure"));
  vi.stubGlobal("fetch", fetcher);
  expect((await publish(connection("x"), content)).status).toBe("unknown");
  fetcher.mockResolvedValue(Response.json({}));
  expect((await publish(connection("x"), content)).status).toBe("unknown");
});
it.each([
  ["x", "tweet.write"],
  ["threads", "threads_content_publish"],
  ["linkedin", "w_member_social"],
] as const)(
  "requests publishing scope for %s connections, not sign-in",
  (p, scope) => {
    const url = (connect: boolean) =>
      new URL(
        authorizationUrl(
          provider(p),
          "https://relay.example",
          "state",
          "verifier",
          "nonce",
          connect,
        ),
      );
    expect(url(true).searchParams.get("scope")).toContain(scope);
    expect(url(false).searchParams.get("scope")).not.toContain(scope);
  },
);

it("publishes video with its caption and normalized hashtags after processing", async () => {
  vi.stubEnv("APP_URL", "https://relay.example.com");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ id: "container" }))
    .mockResolvedValueOnce(Response.json({ status: "FINISHED" }))
    .mockResolvedValueOnce(Response.json({ id: "post" }));
  vi.stubGlobal("fetch", fetcher);
  const result = await publish(connection("threads"), {
    ...content,
    hashtags: "launch, #news launch",
    media: { id: "media", mime: "video/mp4", size: 100 },
    deliveryUrl: "https://relay.example.com/media-delivery/token",
  });
  expect(result.status).toBe("published");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    media_type: "VIDEO",
    video_url: "https://relay.example.com/media-delivery/token",
    text: "Our announcement\n\nhttps://example.com/article\n\n#launch #news",
  });
  expect(fetcher.mock.calls[2][0]).toContain("threads_publish");
});
it("never drops an unsupported uploaded attachment", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(
    (
      await publish(connection("x"), {
        ...content,
        media: { id: "media", mime: "video/mp4", size: 100 },
      })
    ).status,
  ).toBe("blocked");
  expect(fetcher).not.toHaveBeenCalled();
});
