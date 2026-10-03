import type { Platform } from "./types";
export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "simulated"
  | "blocked"
  | "failed"
  | "unknown"
  | "cancelled"
  | "partial";
export interface PostContent {
  title: string;
  text: string;
  articleUrl: string;
  imageUrl: string;
  hashtags?: string;
  media?: { id: string; mime: string; size: number };
}
export interface PublishTarget {
  id: string;
  platform: Platform;
  connectionId: string | null;
  name: string;
  demo: boolean;
  status: PostStatus;
  detail: string;
  remoteId?: string;
}
export interface ScheduledPost extends PostContent {
  id: string;
  status: PostStatus;
  scheduledAt: string | null;
  timezone: string;
  revision: number;
  createdAt: string;
  targets: PublishTarget[];
}
export interface PublishOption {
  platform: Platform;
  accounts: { id: string; name: string; demo: boolean; reason: string }[];
  reason: string;
}
export interface PublisherData {
  posts: ScheduledPost[];
  options: PublishOption[];
  canManage: boolean;
  demo: boolean;
}
export const platformNames: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  linkedin: "LinkedIn",
  threads: "Threads",
};
export const publishLimit: Partial<Record<Platform, number>> = {
  x: 280,
  threads: 500,
  linkedin: 3000,
};
export function postText(post: PostContent) {
  return [
    post.text.trim(),
    post.articleUrl.trim(),
    normalizeHashtags(post.hashtags || ""),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export const unsupportedPublish: Partial<Record<Platform, string>> = {
  facebook:
    "Facebook Page publishing is not connected; personal-profile login cannot publish to a Page.",
  instagram:
    "Instagram image/video publishing is not implemented yet. Save your content as a draft.",
  youtube:
    "YouTube video uploads are not implemented; a text/article post cannot be sent through this publisher.",
  tiktok:
    "TikTok media publishing and its required approval flow are not implemented yet.",
};

export function normalizeHashtags(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((tag) => "#" + tag.replace(/^#+/, "")),
    ),
  ].join(" ");
}
