import { SocialConnections } from "../components/SocialConnections";
import { useEffect, useState } from "react";
import {
  Check,
  Minus,
  FlaskConical,
  ArrowRight,
  FileText,
  Bell,
} from "lucide-react";
import type { Dashboard, Account } from "../../shared/types";
import { platforms } from "../../shared/types";
import type { PlatformCapabilities } from "../../platforms/registry";
import { integrationDocs } from "../../platforms/registry";
import { api } from "../api";
import {
  Badge,
  Empty,
  External,
  Field,
  Modal,
  PageHeading,
  PlatformIcon,
  relative,
} from "../components/ui";
export function Simulator({
  data,
  onClose,
  onChange,
}: {
  data: Dashboard;
  onClose: () => void;
  onChange: () => void;
}) {
  const [result, setResult] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Test your conversation workflow" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setResult("");
          const f = new FormData(e.currentTarget);
          try {
            const r = await api<{ duplicate: boolean }>("/simulate", "POST", {
              ...Object.fromEntries(f),
              id: String(f.get("id")) || crypto.randomUUID(),
              username: String(f.get("externalUserId")),
              timestamp: new Date().toISOString(),
            });
            setResult(
              r.duplicate
                ? "Duplicate event detected. No new messages will be created."
                : "Event queued. The worker will process it shortly; open the inbox or activity log to see the result.",
            );
            onChange();
          } catch (e) {
            setResult((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="notice horizontal">
          <FlaskConical size={20} />A safe test. No real social messages are
          sent.
        </div>
        <Field label="Social account">
          <select name="accountId" required>
            {data.accounts
              .filter((a) => a.demo)
              .map((a) => (
                <option value={a.id} key={a.id}>
                  {a.platform} · {a.name} (simulated)
                </option>
              ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Event type">
            <select name="type">
              <option value="comment">Comment</option>
              <option value="dm">Direct message</option>
            </select>
          </Field>
          <Field label="Customer name">
            <input name="name" defaultValue="Taylor Reed" required />
          </Field>
        </div>
        <Field
          label="Customer identifier"
          hint="Reuse this value to continue the same customer’s conversation."
        >
          <input name="externalUserId" defaultValue="taylor.test" required />
        </Field>
        <Field label="Message">
          <textarea
            name="content"
            defaultValue="PORTFOLIO please!"
            required
            rows={3}
          />
        </Field>
        <div className="form-grid">
          <Field label="Post identifier">
            <input name="postId" defaultValue="test-post-1" />
          </Field>
          <Field
            label="Event identifier"
            hint="Reuse an ID to test duplicate prevention."
          >
            <input name="id" placeholder="Generated if empty" />
          </Field>
        </div>
        {result && (
          <div className="test-result" role="status">
            {result}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          <button className="primary" disabled={busy || !data.accounts.length}>
            {busy ? "Queuing…" : "Run simulation"}
            <ArrowRight size={16} />
          </button>
        </div>
        {!data.accounts.length && (
          <p className="notice">
            Sign out and open a demo workspace to test simulated accounts.
          </p>
        )}
      </form>
    </Modal>
  );
}
export function Accounts({ tick }: { tick: number }) {
  const [accounts, setAccounts] = useState<
      (Account & { capabilities: PlatformCapabilities })[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ accounts: typeof accounts }>("/integrations")
      .then((r) => setAccounts(r.accounts))
      .catch((e) => setError(e.message));
  }, [tick]);
  return (
    <>
      <PageHeading
        eyebrow="CONNECTED ON YOUR TERMS"
        title="Social accounts"
        description="See exactly what each account can do before enabling a workflow."
      />
      <SocialConnections tick={tick} />
      <details className="simulator-capabilities">
        <summary>Simulator capabilities</summary>
        {error && <p className="error">{error}</p>}
        <div className="account-grid">
          {platforms.map((p) => {
            const a = accounts.find((a) => a.platform === p);
            return (
              <section className="panel account-card" key={p}>
                <div className="row-between">
                  <PlatformIcon platform={p} />
                  <Badge tone={a ? "amber" : "neutral"}>
                    {a ? "Simulated" : "Not configured"}
                  </Badge>
                </div>
                <h2 className="capitalize">{p === "x" ? "X" : p}</h2>
                <p>{a?.name || "No account connected"}</p>
                <div className="capabilities">
                  {(
                    [
                      { key: "receiveComments", name: "Receive comments" },
                      { key: "receiveDMs", name: "Receive messages" },
                      { key: "replyToComments", name: "Public replies" },
                      {
                        key: "sendPrivateReplyToCommenter",
                        name: "Private comment replies",
                      },
                    ] as const
                  ).map((c) => (
                    <div key={c.key}>
                      <span>{c.name}</span>
                      {a?.capabilities[c.key] ? (
                        <Check size={17} className="green-text" />
                      ) : (
                        <Minus size={17} />
                      )}
                    </div>
                  ))}
                </div>
                {a && (
                  <small>Capabilities above apply to the simulator only.</small>
                )}
                <External href={integrationDocs[p]}>
                  Official integration docs
                </External>
              </section>
            );
          })}
        </div>
      </details>
    </>
  );
}
export function Activity({ data }: { data: Dashboard }) {
  const [tab, setTab] = useState("activity");
  return (
    <>
      <PageHeading
        eyebrow="A CLEAR RECORD OF EVERY ACTION"
        title="Activity & logs"
        description="Follow interactions, review rule execution, and understand what happened."
      />
      <div className="tabs">
        <button
          className={tab === "activity" ? "active" : ""}
          onClick={() => setTab("activity")}
        >
          Workspace activity
        </button>
        <button
          className={tab === "runs" ? "active" : ""}
          onClick={() => setTab("runs")}
        >
          Automation runs
        </button>
      </div>
      <section className="panel">
        {tab === "activity" ? (
          data.activity.map((a) => (
            <div className="log-row" key={a.id}>
              <span className="soft-icon">
                <FileText size={17} />
              </span>
              <div>
                <strong>{a.action}</strong>
                <p>{a.detail}</p>
                <small>
                  {a.actor} · {new Date(a.createdAt).toLocaleString()}
                </small>
              </div>
            </div>
          ))
        ) : data.runs.length ? (
          data.runs.map((r) => (
            <details className="run-detail" key={r.id}>
              <summary>
                <strong>{r.ruleName}</strong>
                <span>
                  v{r.version} · {relative(r.createdAt)} ago
                </span>
                <Badge
                  tone={
                    r.status === "completed"
                      ? "green"
                      : r.status === "partial"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {r.status}
                </Badge>
              </summary>
              <ol>
                {r.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <small>Event: {r.eventId}</small>
            </details>
          ))
        ) : (
          <Empty title="No automation runs yet">
            Use the simulator to trigger a rule and see its execution log.
          </Empty>
        )}
      </section>
    </>
  );
}
export function Notifications({
  data,
  onChange,
}: {
  data: Dashboard;
  onChange: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <>
      <PageHeading
        title="Notifications"
        description="The moments that need your attention."
      />
      {error && <p className="error">{error}</p>}
      <section className="panel">
        {data.notifications.map((n) => (
          <div className={`log-row ${n.read ? "read" : ""}`} key={n.id}>
            <span className="soft-icon">
              <Bell size={18} />
            </span>
            <div>
              <strong>{n.title}</strong>
              <p>{n.detail}</p>
              <small>{relative(n.createdAt)} ago</small>
            </div>
            {!n.read && (
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    await api(`/notifications/${n.id}/read`, "POST");
                    onChange();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Mark read
              </button>
            )}
          </div>
        ))}
        {!data.notifications.length && (
          <Empty title="You’re all caught up">
            New handovers and integration alerts will appear here.
          </Empty>
        )}
      </section>
    </>
  );
}
export function Analytics({ data }: { data: Dashboard }) {
  const m = data.metrics;
  const maximum = Math.max(1, ...data.platformStats.map((p) => p.count));
  return (
    <>
      <PageHeading
        eyebrow="KNOW WHAT’S WORKING"
        title="Analytics"
        description="Workspace totals calculated from your stored interactions."
      />
      <div className="metric-grid">
        {[
          ["Comments received", m.comments],
          ["Automations triggered", m.runs],
          ["Resources delivered", m.sent],
          [
            "Resource click rate",
            `${m.sent ? Math.round((m.clicks / m.sent) * 100) : 0}%`,
          ],
        ].map(([label, n]) => (
          <article className="metric-card" key={label}>
            <div className="metric-label">{label}</div>
            <strong>{n}</strong>
            <span>
              All time ·{" "}
              {label === "Resource click rate"
                ? "total clicks / deliveries"
                : "stored activity"}
            </span>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Conversations by platform</h2>
          </div>
          {data.platformStats.map((p) => (
            <div className="platform-stat" key={p.platform}>
              <div>
                <PlatformIcon platform={p.platform} />
                <strong className="capitalize">{p.platform}</strong>
                <span>{p.count}</span>
              </div>
              <div className="progress">
                <i style={{ width: `${(p.count / maximum) * 100}%` }} />
              </div>
            </div>
          ))}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Reply handling</h2>
          </div>
          <div className="handling-stat">
            <strong>{m.automated}</strong>
            <span>Approved automatic replies</span>
          </div>
          <div className="handling-stat">
            <strong>{m.human}</strong>
            <span>Human replies and notes</span>
          </div>
          <div className="handling-stat">
            <strong>{m.attention}</strong>
            <span>Open conversations needing a human</span>
          </div>
        </section>
      </div>
      <section className="panel table-wrap analytics-table">
        <div className="panel-heading">
          <h2>Recent automation performance</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Automation</th>
              <th>Keyword</th>
              <th>Recent runs</th>
              <th>Completed</th>
              <th>Skipped / partial</th>
            </tr>
          </thead>
          <tbody>
            {data.rules.map((r) => {
              const runs = data.runs.filter((x) => x.ruleId === r.id);
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td>{r.keywords.join(", ")}</td>
                  <td>{runs.length}</td>
                  <td>{runs.filter((x) => x.status === "completed").length}</td>
                  <td>{runs.filter((x) => x.status !== "completed").length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="table-note">
          Based on the latest 50 execution records. Clicks count visits, not
          unique visitors.
        </p>
      </section>
    </>
  );
}
