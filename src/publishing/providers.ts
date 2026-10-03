import { mediaHostingReason } from "./media.js";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { Platform } from "../shared/types.js";
import {
  postText,
  publishLimit,
  unsupportedPublish,
  type PostContent,
} from "../shared/publishing.js";
import { decrypt } from "../server/oauth/storage.js";
export interface Connection {
  id: string;
  workspace_id: string;
  provider: string;
  external_id: string;
  name: string;
  encrypted_tokens: string;
  expires_at: string | null;
  publishing_requested: boolean;
}
export const providerPlatform = (p: string): Platform =>
  (p === "google" ? "youtube" : p) as Platform;
export function connectionReason(c: Connection, at = Date.now()) {
  const platform = providerPlatform(c.provider);
  if (unsupportedPublish[platform]) return unsupportedPublish[platform]!;
  if (!c.publishing_requested)
    return "Reconnect this account to request publishing permission.";
  if (c.expires_at && new Date(c.expires_at).getTime() <= at)
    return "Authorization expires before this publishing time. Reconnect before scheduling.";
  return "";
}
export function contentReason(platform: Platform, content: PostContent) {
  if (unsupportedPublish[platform]) return unsupportedPublish[platform]!;
  if (content.media) {
    if (platform !== "threads")
      return "Uploaded media publishing is currently supported only on Threads. This destination is blocked to preserve your attachment.";
    if (!["image/jpeg", "video/mp4"].includes(content.media.mime))
      return "Threads delivery accepts JPEG or MP4 here. Export this image as JPEG before scheduling.";
    const reason = mediaHostingReason();
    if (reason) return reason;
  }
  if (content.imageUrl && platform !== "threads")
    return "Image attachments are currently supported only for Threads. Remove the image or save a separate draft.";
  const max = publishLimit[platform];
  if (max && Array.from(postText(content)).length > max)
    return `Shorten the post and article link to the app's ${max}-character limit for this platform.`;
  return "";
}
export interface PublishResult {
  status: "published" | "blocked" | "failed" | "unknown";
  detail: string;
  remoteId?: string;
}
class PublishError extends Error {
  constructor(
    public status: PublishResult["status"],
    message: string,
  ) {
    super(message);
  }
}
async function send(
  url: string,
  token: string,
  body: object,
  headers: Record<string, string> = {},
) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
  } catch {
    throw new PublishError(
      "unknown",
      "The connection ended before delivery was confirmed. Check the platform before creating another post.",
    );
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new PublishError(
        "blocked",
        "The provider rejected the authorization or publishing permission. Reconnect and check app approval.",
      );
    if (res.status === 429)
      throw new PublishError(
        "failed",
        "The provider rate limit was reached. Schedule a new attempt later.",
      );
    if (res.status >= 500)
      throw new PublishError(
        "unknown",
        "The provider returned a server error. Check whether the post appeared before trying again.",
      );
    throw new PublishError(
      "failed",
      "The provider rejected this content. Review its format and account restrictions.",
    );
  }
  return res;
}
export async function publish(
  c: Connection,
  content: PostContent & { deliveryUrl?: string },
): Promise<PublishResult> {
  const reason =
    connectionReason(c) || contentReason(providerPlatform(c.provider), content);
  if (reason) return { status: "blocked", detail: reason };
  let access: string;
  try {
    access = z
      .object({ access_token: z.string().min(1) })
      .parse(
        decrypt(
          c.encrypted_tokens,
          `${c.workspace_id}:${c.provider}:${c.external_id}`,
        ),
      ).access_token;
  } catch {
    return {
      status: "blocked",
      detail: "Stored authorization cannot be read. Reconnect the account.",
    };
  }
  try {
    let remoteId: string;
    if (c.provider === "x") {
      const res = await send("https://api.x.com/2/tweets", access, {
        text: postText(content),
      });
      remoteId = z
        .object({ data: z.object({ id: z.string().min(1) }) })
        .parse(await res.json()).data.id;
    } else if (c.provider === "linkedin") {
      const version = process.env.LINKEDIN_API_VERSION || "202604";
      if (!/^\d{6}$/.test(version))
        return {
          status: "blocked",
          detail: "LinkedIn API version needs administrator configuration.",
        };
      const res = await send(
        "https://api.linkedin.com/rest/posts",
        access,
        {
          author: `urn:li:person:${c.external_id}`,
          commentary: postText(content),
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        },
        { "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0" },
      );
      remoteId = res.headers.get("x-restli-id") || "";
      if (!remoteId) throw new Error("Missing remote ID");
    } else if (c.provider === "threads") {
      // Text auto-publishing is one remote mutation. Image publishing uses a container.
      const path = `https://graph.threads.com/${encodeURIComponent(c.external_id)}`;
      if (content.media && !content.deliveryUrl)
        return {
          status: "blocked",
          detail: "The uploaded media delivery link is unavailable.",
        };
      const attachmentUrl = content.deliveryUrl || content.imageUrl;
      const video = content.media?.mime === "video/mp4";
      const res = await send(
        `${path}/threads`,
        access,
        attachmentUrl
          ? {
              media_type: video ? "VIDEO" : "IMAGE",
              ...(video
                ? { video_url: attachmentUrl }
                : { image_url: attachmentUrl }),
              text: postText(content),
            }
          : {
              media_type: "TEXT",
              text: postText(content),
              auto_publish_text: true,
            },
      );
      const created = z
        .object({ id: z.string().min(1) })
        .parse(await res.json()).id;
      if (attachmentUrl) {
        if (video) {
          let ready = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt) await delay(30000);
            const statusResponse = await fetch(
              `https://graph.threads.com/${encodeURIComponent(created)}?fields=status`,
              {
                headers: { Authorization: `Bearer ${access}` },
                signal: AbortSignal.timeout(10000),
                redirect: "error",
              },
            );
            if (!statusResponse.ok)
              throw new PublishError(
                "failed",
                "Could not check video processing. No publish request was sent.",
              );
            const status = z
              .object({ status: z.string() })
              .parse(await statusResponse.json()).status;
            if (status === "FINISHED") {
              ready = true;
              break;
            }
            if (["ERROR", "EXPIRED"].includes(status))
              throw new PublishError(
                "failed",
                "Threads could not process this video. Check its format before rescheduling.",
              );
            if (status !== "IN_PROGRESS")
              throw new PublishError(
                "unknown",
                "Unexpected video processing status. Check Threads before retrying.",
              );
          }
          if (!ready)
            throw new PublishError(
              "failed",
              "Video processing did not finish within one minute. No publish request was sent. Try a smaller video.",
            );
        }

        const result = await send(`${path}/threads_publish`, access, {
          creation_id: created,
        });
        remoteId = z
          .object({ id: z.string().min(1) })
          .parse(await result.json()).id;
      } else remoteId = created;
    } else
      return {
        status: "blocked",
        detail: "Publishing is not implemented for this platform.",
      };
    return {
      status: "published",
      detail: "Provider confirmed publication.",
      remoteId,
    };
  } catch (error) {
    if (error instanceof PublishError)
      return { status: error.status, detail: error.message };
    return {
      status: "unknown",
      detail:
        "The provider response could not confirm delivery. Check the platform before creating another post.",
    };
  }
}
