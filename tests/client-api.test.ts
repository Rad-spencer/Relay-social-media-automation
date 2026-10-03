import { afterEach, expect, it, vi } from "vitest";
import { api } from "../src/client/api";
afterEach(() => vi.unstubAllGlobals());
it("explains rate limits even when the server returns plain text", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response("Too many requests", { status: 429 })),
  );
  await expect(api("/auth/register", "POST", {})).rejects.toThrow(
    "Too many attempts",
  );
});
it("explains network failures without exposing a fetch exception", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );
  await expect(api("/auth/register", "POST", {})).rejects.toThrow(
    "Cannot reach Relay",
  );
});
