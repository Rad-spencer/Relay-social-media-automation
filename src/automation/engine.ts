import type { DB } from "../db/database.js";
import type {
  Account,
  Contact,
  Conversation,
  FAQ,
  Message,
  Notification,
  Profile,
  Resource,
  Rule,
  Run,
  SocialEvent,
} from "../shared/types.js";
import { adapterFor } from "../platforms/registry.js";
import {
  audit,
  get,
  id,
  list,
  now,
  put,
  required,
} from "../server/repository.js";
import { matches, normalize, render, routeReply } from "./matching.js";
export async function ingest(db: DB, w: string, event: SocialEvent) {
  return db.transaction(async (tx) => {
    const inserted = await tx.query(
      "INSERT INTO events(workspace_id,account_id,id,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
      [w, event.accountId, event.id, JSON.stringify(event)],
    );
    if (!inserted.rows.length) return { duplicate: true };
    await tx.query(
      "INSERT INTO jobs(id,workspace_id,payload) VALUES($1,$2,$3)",
      [id(), w, JSON.stringify(event)],
    );
    return { duplicate: false };
  });
}
async function notify(db: DB, w: string, title: string, detail: string) {
  await put<Notification>(db, w, "notifications", {
    id: id(),
    title,
    detail,
    read: false,
    createdAt: now(),
  });
}
async function addMessage(
  db: DB,
  w: string,
  c: Conversation,
  text: string,
  sender: Message["sender"],
  direction: Message["direction"],
  kind: Message["kind"] = "message",
) {
  await put<Message>(db, w, "messages", {
    id: id(),
    conversationId: c.id,
    text,
    direction,
    sender,
    kind,
    status: direction === "inbound" ? "received" : "simulated",
    createdAt: now(),
  });
  if (direction !== "internal") {
    c.lastMessage = text;
    c.updatedAt = now();
  }
  await put(db, w, "conversations", c);
}
export async function processEvent(
  tx: DB,
  w: string,
  event: SocialEvent,
  appUrl: string,
) {
  const workspace = (
    await tx.query<{ profile: Profile }>(
      "SELECT profile FROM workspaces WHERE id=$1 FOR UPDATE",
      [w],
    )
  ).rows[0];
  const account = await required<Account>(tx, w, "accounts", event.accountId);
  const adapter = adapterFor(account);
  const cap = adapter.getCapabilities();
  if (!account.demo) throw new Error("LIVE_ADAPTER_UNCONFIGURED");
  if (event.externalUserId === account.externalId) {
    await audit(tx, w, "system", "Event ignored", "Own-account event");
    return;
  }
  if (event.type === "dm" && !cap.receiveDMs) {
    await notify(
      tx,
      w,
      "Action unavailable",
      `${account.platform} simulator does not support direct messages.`,
    );
    return;
  }
  const e = adapter.normalize(event);
  let contact = (
    await tx.query<{ data: Contact }>(
      "SELECT data FROM records WHERE workspace_id=$1 AND kind='contacts' AND data->>'accountId'=$2 AND data->>'externalId'=$3",
      [w, account.id, e.externalUserId],
    )
  ).rows[0]?.data;
  if (!contact)
    contact = {
      id: id(),
      accountId: account.id,
      externalId: e.externalUserId,
      name: e.name,
      username: e.username,
      platform: account.platform,
      status: "New",
      tags: [],
      score: 0,
      notes: "",
      optedOut: false,
      createdAt: now(),
    };
  let c = (
    await tx.query<{ data: Conversation }>(
      "SELECT data FROM records WHERE workspace_id=$1 AND kind='conversations' AND data->>'contactId'=$2 ORDER BY created_at DESC LIMIT 1",
      [w, contact.id],
    )
  ).rows[0]?.data;
  if (!c)
    c = {
      id: id(),
      contactId: contact.id,
      accountId: account.id,
      name: contact.name,
      username: contact.username,
      platform: account.platform,
      lastMessage: "",
      updatedAt: now(),
      unread: true,
      handling: "rules",
      status: "open",
      pinned: false,
      intent: "New interaction",
      assignedTo: "",
    };
  c.unread = true;
  c.status = "open";
  if (
    /^(stop|unsubscribe|opt out|cancel messages)$/.test(normalize(e.content))
  ) {
    contact.optedOut = true;
    c.handling = "human";
    c.reason = "Customer opted out of automation";
  }
  if (
    /\b(human|agent|person|refund|complaint|lawyer|fraud)\b/.test(
      normalize(e.content),
    )
  ) {
    c.handling = "human";
    c.reason = "Customer requested human attention";
  }
  await put(tx, w, "contacts", contact);
  await addMessage(
    tx,
    w,
    c,
    e.content,
    "customer",
    "inbound",
    e.type === "comment" ? "comment" : "message",
  );
  await audit(
    tx,
    w,
    contact.name,
    `${e.type === "comment" ? "Comment" : "Message"} received`,
    e.content.slice(0, 160),
  );
  if (e.type === "dm") {
    const route = routeReply(
      e.content,
      await list<FAQ>(tx, w, "faqs", 500),
      workspace.profile,
      c.handling === "human",
      contact.optedOut,
    );
    c.intent = route.intent;
    c.reason = route.reason;
    delete c.suggestion;
    if (route.intent === "Opt out") {
      contact.optedOut = true;
      await put(tx, w, "contacts", contact);
    }
    if (route.action === "human" || route.action === "off") {
      c.handling = "human";
      await notify(
        tx,
        w,
        "Conversation needs attention",
        `${contact.name}: ${route.reason}`,
      );
    }
    if (route.action === "suggest") c.suggestion = route.answer;
    if (route.action === "reply" && route.answer) {
      const result = await adapter.sendDM(contact.externalId, route.answer);
      if (result.status === "simulated")
        await addMessage(tx, w, c, route.answer, "rule", "outbound");
    }
    await put(tx, w, "conversations", c);
    return;
  }
  const rules = await list<Rule>(tx, w, "rules", 500);
  for (const rule of rules.filter(
    (r) =>
      r.status === "active" &&
      r.platforms.includes(account.platform) &&
      matches(e.content, r),
  )) {
    const run: Run = {
      id: id(),
      ruleId: rule.id,
      ruleName: rule.name,
      version: rule.version,
      eventId: e.id,
      contactId: contact.id,
      status: "completed",
      steps: ["Event normalized", "Keyword matched"],
      createdAt: now(),
    };
    const previous = await tx.query<{ data: Run }>(
      "SELECT data FROM records WHERE workspace_id=$1 AND kind='runs' AND data->>'ruleId'=$2 AND data->>'contactId'=$3 AND data->>'status' <> 'skipped' AND ($4::boolean=false OR data->>'postId'=$5) ORDER BY created_at DESC LIMIT 1",
      [w, rule.id, contact.id, rule.oncePerPost, e.postId],
    );
    const last = previous.rows[0]?.data;
    const blocked = contact.optedOut
      ? "OPTED_OUT"
      : c.handling === "human"
        ? "HUMAN_TAKEOVER"
        : last &&
            (rule.cooldownHours === -1 ||
              rule.oncePerPost ||
              Date.now() - new Date(last.createdAt).getTime() <
                rule.cooldownHours * 3600000)
          ? "COOLDOWN_ACTIVE"
          : undefined;
    if (blocked) {
      run.status = "skipped";
      run.steps.push(blocked);
      await put(tx, w, "runs", { ...run, postId: e.postId });
      continue;
    }
    let resource: Resource | undefined;
    if (rule.resourceId)
      resource = await get<Resource>(tx, w, "resources", rule.resourceId);
    if (rule.resourceId && (!resource || !resource.active)) {
      run.status = "skipped";
      run.steps.push("RESOURCE_UNAVAILABLE");
      await put(tx, w, "runs", run);
      continue;
    }
    // All rules use the same workspace lock: concurrent jobs cannot both pass
    // this check for one contact/resource, even when they match different rules.
    if (resource) {
      const alreadyDelivered = await tx.query(
        "SELECT id FROM deliveries WHERE workspace_id=$1 AND contact_id=$2 AND resource_id=$3 LIMIT 1",
        [w, contact.id, resource.id],
      );
      if (alreadyDelivered.rows.length) {
        run.status = "skipped";
        run.steps.push("RESOURCE_ALREADY_DELIVERED");
        await put(tx, w, "runs", { ...run, postId: e.postId });
        continue;
      }
    }
    const deliveryId = id();
    const link = resource
      ? resource.tracking
        ? `${appUrl}/r/${deliveryId}`
        : resource.url
      : "";
    const vars = {
      first_name: contact.name.split(" ")[0],
      username: contact.username,
      business_name: workspace.profile.businessName,
      resource_link: link,
      platform: account.platform,
    };
    let resourceDelivered = false;
    if (rule.privateReply) {
      if (!cap.sendPrivateReplyToCommenter) {
        run.status = "partial";
        run.steps.push("PRIVATE_REPLY_UNSUPPORTED");
        await notify(
          tx,
          w,
          "Private reply unavailable",
          `${rule.name}: ${account.platform} does not support this simulated action.`,
        );
      } else {
        const text = render(rule.privateReply, vars);
        await adapter.sendPrivateReply(e.id, text);
        await addMessage(tx, w, c, text, "rule", "outbound");
        run.steps.push("Private reply simulated");
        resourceDelivered = Boolean(resource && text.includes(link));
      }
    }
    if (rule.publicReply && cap.replyToComments) {
      const text = render(rule.publicReply, vars);
      await adapter.replyToComment(e.id, text);
      await addMessage(tx, w, c, text, "rule", "outbound", "comment");
      run.steps.push("Public reply simulated");
      resourceDelivered ||= Boolean(resource && text.includes(link));
    }
    if (resource && resourceDelivered)
      await tx.query(
        "INSERT INTO deliveries(id,workspace_id,resource_id,contact_id,rule_id,platform,url,tracking) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          deliveryId,
          w,
          resource.id,
          contact.id,
          rule.id,
          account.platform,
          resource.url,
          resource.tracking,
        ],
      );
    if (rule.tag) contact.tags = [...new Set([...contact.tags, rule.tag])];
    contact.status = "Lead";
    contact.score += 10;
    await put(tx, w, "contacts", contact);
    run.steps.push("Contact updated");
    await put(tx, w, "runs", { ...run, postId: e.postId });
    await audit(tx, w, "rules", `Automation ${run.status}`, rule.name);
  }
}
export async function workOne(db: DB, appUrl: string) {
  return db.transaction(async (tx) => {
    const job = (
      await tx.query<{
        id: string;
        workspace_id: string;
        payload: SocialEvent;
        attempts: number;
      }>(
        "SELECT id,workspace_id,payload,attempts FROM jobs WHERE status=$1 AND available_at<=now() ORDER BY available_at LIMIT 1 FOR UPDATE SKIP LOCKED",
        ["pending"],
      )
    ).rows[0];
    if (!job) return false;
    // Savepoint keeps a failed attempt from persisting half a conversation or delivery.
    await tx.query("SAVEPOINT job_work");
    try {
      await processEvent(tx, job.workspace_id, job.payload, appUrl);
      await tx.query("RELEASE SAVEPOINT job_work");
      await tx.query(
        "UPDATE jobs SET status='completed',attempts=attempts+1 WHERE id=$1",
        [job.id],
      );
    } catch {
      await tx.query("ROLLBACK TO SAVEPOINT job_work");
      await tx.query(
        "UPDATE jobs SET attempts=attempts+1,status=$2,error_code=$3,available_at=now()+($4::integer * interval '1 second') WHERE id=$1",
        [
          job.id,
          job.attempts >= 4 ? "dead" : "pending",
          "PROCESSING_FAILED",
          2 ** (job.attempts + 1),
        ],
      );
      await audit(
        tx,
        job.workspace_id,
        "system",
        "Event processing failed",
        job.attempts >= 4
          ? "Retry limit reached; dead letter retained"
          : "Retry scheduled",
      );
    }
    return true;
  });
}
