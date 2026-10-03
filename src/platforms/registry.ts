import type { Account, Platform, SocialEvent } from "../shared/types.js";
export interface PlatformCapabilities {
  receiveComments: boolean;
  receiveDMs: boolean;
  sendDMs: boolean;
  replyToComments: boolean;
  sendPrivateReplyToCommenter: boolean;
  receiveMentions: boolean;
  fetchPosts: boolean;
  fetchUserProfile: boolean;
  supportsWebhooks: boolean;
  supportsAttachments: boolean;
}
const disabled: PlatformCapabilities = {
  receiveComments: false,
  receiveDMs: false,
  sendDMs: false,
  replyToComments: false,
  sendPrivateReplyToCommenter: false,
  receiveMentions: false,
  fetchPosts: false,
  fetchUserProfile: false,
  supportsWebhooks: false,
  supportsAttachments: false,
};
export interface ActionResult {
  status: "simulated" | "unavailable";
  code?: string;
}
export interface SocialPlatformAdapter {
  platform: Platform;
  getCapabilities(): PlatformCapabilities;
  normalize(event: SocialEvent): SocialEvent;
  sendDM(recipientId: string, text: string): Promise<ActionResult>;
  replyToComment(commentId: string, text: string): Promise<ActionResult>;
  sendPrivateReply(commentId: string, text: string): Promise<ActionResult>;
}
// The demo capability map describes only our simulator, never real API entitlement.
export function adapterFor(account: Account): SocialPlatformAdapter {
  const supported =
    account.demo &&
    ["instagram", "facebook", "youtube"].includes(account.platform);
  const privateMessaging = supported && account.platform !== "youtube";
  const cap = {
    ...disabled,
    receiveComments: supported,
    replyToComments: supported,
    receiveDMs: privateMessaging,
    sendDMs: privateMessaging,
    sendPrivateReplyToCommenter: privateMessaging,
  };
  const result = (allowed: boolean): Promise<ActionResult> =>
    Promise.resolve(
      allowed
        ? { status: "simulated" }
        : { status: "unavailable", code: "ACTION_UNAVAILABLE" },
    );
  return {
    platform: account.platform,
    getCapabilities: () => cap,
    normalize: (e) => ({ ...e, content: e.content.normalize("NFKC") }),
    sendDM: (_r, _t) => result(cap.sendDMs),
    replyToComment: (_c, _t) => result(cap.replyToComments),
    sendPrivateReply: (_c, _t) => result(cap.sendPrivateReplyToCommenter),
  };
}
export const integrationDocs: Record<Platform, string> = {
  instagram: "https://developers.facebook.com/docs/instagram-platform/",
  facebook: "https://developers.facebook.com/docs/messenger-platform/",
  youtube: "https://developers.google.com/youtube/v3",
  tiktok: "https://developers.tiktok.com/",
  x: "https://docs.x.com/",
  linkedin: "https://learn.microsoft.com/en-us/linkedin/",
  threads: "https://developers.facebook.com/docs/threads/",
};
