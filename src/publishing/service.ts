import { deliveryUrl } from "./media.js";
import type { DB } from "../db/database.js";
import type {
  PostContent,
  PostStatus,
  ScheduledPost,
  PublishTarget,
  PublishOption,
} from "../shared/publishing.js";
import { platforms, type Platform } from "../shared/types.js";
import { platformNames, unsupportedPublish } from "../shared/publishing.js";
import {
  connectionReason,
  providerPlatform,
  publish,
  type Connection,
  type PublishResult,
} from "./providers.js";
interface PostRow {
  id: string;
  workspace_id: string;
  author_id: string;
  content: PostContent;
  status: PostStatus;
  scheduled_at: string | null;
  timezone: string;
  revision: number;
  created_at: string;
}
interface TargetRow {
  id: string;
  platform: Platform;
  connection_id: string | null;
  name: string;
  demo: boolean;
  status: PostStatus;
  detail: string;
  remote_id: string | null;
}
export async function connections(db: DB, w: string) {
  return (
    await db.query<Connection>(
      "SELECT * FROM social_connections WHERE workspace_id=$1",
      [w],
    )
  ).rows;
}
export async function options(
  db: DB,
  w: string,
  demo: boolean,
): Promise<PublishOption[]> {
  const rows = demo ? [] : await connections(db, w);
  return platforms.map((platform) => ({
    platform,
    reason: demo
      ? "Demo delivery only"
      : unsupportedPublish[platform] ||
        "Connect an account with publishing permission.",
    accounts: demo
      ? [
          {
            id: `demo:${platform}`,
            name: `${platformNames[platform]} demo`,
            demo: true,
            reason: "",
          },
        ]
      : rows
          .filter((c) => providerPlatform(c.provider) === platform)
          .map((c) => ({
            id: c.id,
            name: c.name,
            demo: false,
            reason: connectionReason(c),
          })),
  }));
}
export async function readPost(
  db: DB,
  w: string,
  id: string,
): Promise<ScheduledPost | undefined> {
  const row = (
    await db.query<PostRow>(
      "SELECT * FROM scheduled_posts WHERE workspace_id=$1 AND id=$2",
      [w, id],
    )
  ).rows[0];
  if (!row) return;
  const targets: PublishTarget[] = (
    await db.query<TargetRow>(
      "SELECT * FROM post_targets WHERE post_id=$1 ORDER BY platform",
      [id],
    )
  ).rows.map((t) => ({
    id: t.id,
    platform: t.platform,
    connectionId: t.connection_id,
    name: t.name,
    demo: t.demo,
    status: t.status,
    detail: t.detail,
    remoteId: t.remote_id || undefined,
  }));
  return {
    ...row.content,
    id: row.id,
    status: row.status,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone,
    revision: row.revision,
    createdAt: row.created_at,
    targets,
  };
}
export async function refreshStatus(db: DB, id: string) {
  // Serialize aggregate reads so concurrent destination completions cannot
  // overwrite the final post status with an older view of another target.
  await db.query("SELECT id FROM scheduled_posts WHERE id=$1 FOR UPDATE", [id]);
  const rows = (
    await db.query<{ status: PostStatus }>(
      "SELECT status FROM post_targets WHERE post_id=$1",
      [id],
    )
  ).rows;
  const states = rows.map((r) => r.status);
  let status: PostStatus = "draft";
  if (states.includes("publishing")) status = "publishing";
  else if (states.includes("scheduled")) status = "scheduled";
  else if (states.length && states.every((s) => s === states[0]))
    status = states[0];
  else if (states.length) status = "partial";
  await db.query(
    "UPDATE scheduled_posts SET status=$2,updated_at=now() WHERE id=$1",
    [id, status],
  );
}
// A crashed or timed-out attempt is never automatically retried: its remote outcome may be unknown.
export async function workPublishing(
  db: DB,
  deliver: (c: Connection, p: PostContent) => Promise<PublishResult> = publish,
) {
  await db.transaction(async (tx) => {
    const stale = (
      await tx.query<{ post_id: string }>(
        "UPDATE post_targets SET status='unknown',detail='Publishing was interrupted. Check the platform before creating another post.' WHERE status='publishing' AND claimed_at<now()-interval '5 minutes' RETURNING post_id",
      )
    ).rows;
    for (const row of stale) await refreshStatus(tx, row.post_id);
  });
  const claimed = await db.transaction(async (tx) => {
    const row = (
      await tx.query<
        PostRow & {
          target_id: string;
          connection_id: string | null;
          demo: boolean;
          platform: Platform;
          workspace_demo: boolean;
        }
      >(
        "SELECT p.*,t.id target_id,t.connection_id,t.demo,t.platform,w.demo workspace_demo FROM post_targets t JOIN scheduled_posts p ON p.id=t.post_id JOIN workspaces w ON w.id=p.workspace_id WHERE t.status='scheduled' AND p.scheduled_at<=now() ORDER BY p.scheduled_at,t.id FOR UPDATE OF t SKIP LOCKED LIMIT 1",
      )
    ).rows[0];
    if (!row) return;
    await tx.query(
      "UPDATE post_targets SET status='publishing',claimed_at=now() WHERE id=$1",
      [row.target_id],
    );
    await refreshStatus(tx, row.id);
    return row;
  });
  if (!claimed) return false;
  let result: PublishResult | { status: "simulated"; detail: string };
  try {
    const allowed = (
      await db.query(
        "SELECT 1 FROM members WHERE user_id=$1 AND workspace_id=$2 AND role IN ('owner','admin')",
        [claimed.author_id, claimed.workspace_id],
      )
    ).rows.length;
    if (!allowed)
      result = {
        status: "blocked",
        detail:
          "The scheduling user no longer has publishing permission in this workspace.",
      };
    else if (new Date(claimed.scheduled_at!).getTime() < Date.now() - 86400000)
      result = {
        status: "blocked",
        detail:
          "The scheduled time was missed by over 24 hours. Review and reschedule this post.",
      };
    else if (claimed.demo && claimed.workspace_demo)
      result = {
        status: "simulated",
        detail:
          "Demo delivery completed. Nothing was sent to a social network.",
      };
    else if (claimed.demo || claimed.workspace_demo)
      result = {
        status: "blocked",
        detail: "A demo target cannot publish in a real workspace.",
      };
    else {
      const c = (await connections(db, claimed.workspace_id)).find(
        (c) =>
          c.id === claimed.connection_id &&
          providerPlatform(c.provider) === claimed.platform,
      );
      result = c
        ? await deliver(c, {
            ...claimed.content,
            ...(claimed.content.media
              ? {
                  deliveryUrl: await deliveryUrl(
                    db,
                    claimed.workspace_id,
                    claimed.content.media.id,
                  ),
                }
              : {}),
          })
        : {
            status: "blocked",
            detail:
              "The selected connection was removed. Connect an account and reschedule.",
          };
    }
  } catch {
    result = {
      status: "unknown",
      detail:
        "Delivery could not be confirmed. Check the platform before creating another post.",
    };
  }
  await db.transaction(async (tx) => {
    await tx.query(
      "UPDATE post_targets SET status=$2,detail=$3,remote_id=$4 WHERE id=$1 AND status='publishing'",
      [
        claimed.target_id,
        result.status,
        result.detail,
        "remoteId" in result ? result.remoteId || null : null,
      ],
    );
    await refreshStatus(tx, claimed.id);
  });
  return true;
}
