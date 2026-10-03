import type { DB } from "../db/database.js";
import type {
  Account,
  Audit,
  Dashboard,
  FAQ,
  Notification,
  Profile,
  Resource,
  Rule,
  Run,
} from "../shared/types.js";
import { list } from "./repository.js";
export async function dashboard(db: DB, w: string): Promise<Dashboard> {
  const counts = (
    await db.query<{ kind: string; n: string }>(
      "SELECT kind,count(*) n FROM records WHERE workspace_id=$1 GROUP BY kind",
      [w],
    )
  ).rows;
  const count = (kind: string) =>
    Number(counts.find((r) => r.kind === kind)?.n || 0);
  const m = (
    await db.query<{
      messages: string;
      comments: string;
      automated: string;
      human: string;
    }>(
      `SELECT count(*) FILTER(WHERE data->>'kind'='message') messages,count(*) FILTER(WHERE data->>'kind'='comment') comments,count(*) FILTER(WHERE data->>'sender'='rule') automated,count(*) FILTER(WHERE data->>'sender'='human') human FROM records WHERE workspace_id=$1 AND kind='messages'`,
      [w],
    )
  ).rows[0];
  const leads = (
    await db.query<{ n: string }>(
      "SELECT count(*) n FROM records WHERE workspace_id=$1 AND kind='contacts' AND data->>'status' IN ('Lead','Qualified Lead','Customer')",
      [w],
    )
  ).rows[0];
  const attention = (
    await db.query<{ n: string }>(
      "SELECT count(*) n FROM records WHERE workspace_id=$1 AND kind='conversations' AND data->>'handling'='human' AND data->>'status'='open'",
      [w],
    )
  ).rows[0];
  const deliveries = (
    await db.query<{ sent: string; clicks: string }>(
      "SELECT count(*) sent,coalesce(sum(clicks),0) clicks FROM deliveries WHERE workspace_id=$1",
      [w],
    )
  ).rows[0];
  const chartRows = (
    await db.query<{ date_day: string; messages: string; comments: string }>(
      "SELECT to_char((data->>'createdAt')::timestamptz,'YYYY-MM-DD') AS date_day,count(*) FILTER(WHERE data->>'kind'='message') messages,count(*) FILTER(WHERE data->>'kind'='comment') comments FROM records WHERE workspace_id=$1 AND kind='messages' AND (data->>'createdAt')::timestamptz>now()-interval '7 days' GROUP BY date_day ORDER BY date_day",
      [w],
    )
  ).rows;
  const chart = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(Date.now() - (6 - i) * 86400000)
      .toISOString()
      .slice(0, 10);
    const r = chartRows.find((x) => x.date_day === day);
    return {
      day,
      messages: Number(r?.messages || 0),
      comments: Number(r?.comments || 0),
    };
  });
  const platformStats = (
    await db.query<{ platform: Account["platform"]; count: string }>(
      "SELECT data->>'platform' platform,count(*) count FROM records WHERE workspace_id=$1 AND kind='conversations' GROUP BY data->>'platform'",
      [w],
    )
  ).rows.map((r) => ({ ...r, count: Number(r.count) }));
  return {
    profile: (
      await db.query<{ profile: Profile }>(
        "SELECT profile FROM workspaces WHERE id=$1",
        [w],
      )
    ).rows[0].profile,
    accounts: await list(db, w, "accounts"),
    resources: await list<Resource>(db, w, "resources"),
    rules: await list<Rule>(db, w, "rules"),
    faqs: await list<FAQ>(db, w, "faqs"),
    activity: await list<Audit>(db, w, "audit", 40),
    notifications: await list<Notification>(db, w, "notifications", 50),
    runs: await list<Run>(db, w, "runs", 50),
    metrics: {
      messages: Number(m.messages),
      comments: Number(m.comments),
      automated: Number(m.automated),
      human: Number(m.human),
      leads: Number(leads.n),
      runs: count("runs"),
      sent: Number(deliveries.sent),
      clicks: Number(deliveries.clicks),
      attention: Number(attention.n),
      contacts: count("contacts"),
    },
    chart,
    platformStats,
  };
}
