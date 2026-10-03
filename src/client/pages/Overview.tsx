import {
  ArrowUpRight,
  ArrowRight,
  MessageSquare,
  Users,
  Zap,
  MousePointer2,
  Activity,
  Plus,
  Play,
  CircleHelp,
} from "lucide-react";
import type { Dashboard } from "../../shared/types";
import {
  Badge,
  Empty,
  PageHeading,
  PlatformIcon,
  relative,
} from "../components/ui";
export function Overview({
  data,
  onNavigate,
  onSimulate,
}: {
  data: Dashboard;
  onNavigate: (page: string) => void;
  onSimulate: () => void;
}) {
  const { metrics: m } = data;
  const max = Math.max(1, ...data.chart.map((d) => d.messages + d.comments));
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE AT A GLANCE"
        title="A little clarity. A lot of connection."
        description="Keep conversations moving and turn interest into relationships."
        action={
          <button className="primary" onClick={() => onNavigate("Automations")}>
            <Plus size={17} />
            Create automation
          </button>
        }
      />
      <section className="summary-strip">
        <div className="summary-icon">
          <Activity size={21} />
        </div>
        <div>
          <strong>
            {m.attention
              ? `${m.attention} conversations could use your attention`
              : "Your workspace is ready for the next conversation"}
          </strong>
          <p>
            {data.rules.filter((r) => r.status === "active").length} active
            rules · {data.accounts.length} simulated social accounts · Replies
            use your approved text
          </p>
        </div>
        <button className="text-link" onClick={() => onNavigate("Inbox")}>
          Open inbox <ArrowRight size={16} />
        </button>
      </section>
      <div className="metric-grid">
        {[
          {
            label: "Messages",
            n: m.messages,
            icon: MessageSquare,
            detail: "Across your workspace",
            tone: "blue",
          },
          {
            label: "Rule-based replies",
            n: m.automated,
            icon: Zap,
            detail: "From approved responses",
            tone: "violet",
          },
          {
            label: "Leads captured",
            n: m.leads,
            icon: Users,
            detail: "Lead, qualified & customer",
            tone: "green",
          },
          {
            label: "Resource clicks",
            n: m.clicks,
            icon: MousePointer2,
            detail: `${m.sent} resource deliveries`,
            tone: "orange",
          },
        ].map((item) => (
          <article className="metric-card" key={item.label}>
            <div className="metric-label">
              {item.label}
              <item.icon size={18} />
            </div>
            <strong>{item.n.toLocaleString()}</strong>
            <span>
              <span className={`tiny-mark ${item.tone}`} />
              {item.detail}
            </span>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Conversation activity</h2>
              <p>Every interaction is an opportunity.</p>
            </div>
            <Badge>Last 7 days</Badge>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-blue" />
              Messages
            </span>
            <span>
              <i className="legend-light" />
              Comments
            </span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={`Daily message and comment activity: ${data.chart.map((d) => `${d.day}: ${d.messages} messages, ${d.comments} comments`).join("; ")}`}
          >
            <div className="chart-grid">
              <span>{max}</span>
              <span>{Math.round(max * 0.75)}</span>
              <span>{Math.round(max * 0.5)}</span>
              <span>{Math.round(max * 0.25)}</span>
              <span>0</span>
            </div>
            <div className="chart-bars">
              {data.chart.map((d) => (
                <div className="bar-column" key={d.day}>
                  <div className="bar-pair">
                    <div
                      className="bar blue-bar"
                      title={`${d.messages} messages`}
                      style={{
                        height: `${Math.max(1, (d.messages / max) * 100)}%`,
                      }}
                    />
                    <div
                      className="bar light-bar"
                      title={`${d.comments} comments`}
                      style={{
                        height: `${Math.max(1, (d.comments / max) * 100)}%`,
                      }}
                    />
                  </div>
                  <span>
                    {new Date(d.day + "T12:00:00").toLocaleDateString("en", {
                      weekday: "short",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-footer">
            <span>
              <CircleHelp size={14} /> Counts are calculated from stored
              interactions.
            </span>
            <button
              className="text-link"
              onClick={() => onNavigate("Analytics")}
            >
              View analytics <ArrowUpRight size={15} />
            </button>
          </div>
        </section>
        <section className="panel channels">
          <div className="panel-heading">
            <div>
              <h2>Your channels</h2>
              <p>One place. Every conversation.</p>
            </div>
          </div>
          {data.accounts.length ? (
            data.accounts.map((a) => (
              <div className="channel-row" key={a.id}>
                <PlatformIcon platform={a.platform} />
                <div>
                  <strong className="capitalize">{a.platform}</strong>
                  <small>{a.name}</small>
                </div>
                <Badge tone="amber">Simulated</Badge>
              </div>
            ))
          ) : (
            <Empty title="No accounts connected">
              Live integrations require provider setup.
            </Empty>
          )}
          <button
            className="secondary wide"
            onClick={() => onNavigate("Social accounts")}
          >
            Manage social accounts <ArrowUpRight size={15} />
          </button>
          <div className="channel-note">
            <ShieldShape />
            <span>
              You're always in control.
              <br />
              Take over any conversation.
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Automations at work</h2>
              <p>Your best replies, on repeat.</p>
            </div>
            <button
              className="text-link"
              onClick={() => onNavigate("Automations")}
            >
              View all <ArrowRight size={15} />
            </button>
          </div>
          {data.rules.slice(0, 3).map((r) => (
            <div className="automation-row" key={r.id}>
              <span className="soft-icon">
                <Zap size={18} />
              </span>
              <div>
                <strong>{r.name}</strong>
                <small>
                  Comment contains <b>{r.keywords.join(", ")}</b>
                </small>
              </div>
              <Badge tone={r.status === "active" ? "green" : "neutral"}>
                {r.status}
              </Badge>
            </div>
          ))}
          {!data.rules.length && (
            <Empty title="Create your first rule">
              Choose a keyword and the response your customer should receive.
            </Empty>
          )}
          <button className="test-banner" onClick={onSimulate}>
            <Play size={18} />
            <span>
              <strong>Give your workflow a test run</strong>
              <small>Simulate a comment or message. See what happens.</small>
            </span>
            <ArrowRight size={18} />
          </button>
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Latest activity</h2>
              <p>The story behind the numbers.</p>
            </div>
            <span className="live-label">Auto-refresh</span>
          </div>
          {data.activity.slice(0, 4).map((a) => (
            <div className="activity-row" key={a.id}>
              <span className="activity-dot" />
              <div>
                <strong>{a.action}</strong>
                <p>{a.detail}</p>
                <small>
                  {a.actor} · {relative(a.createdAt)} ago
                </small>
              </div>
            </div>
          ))}
          <button className="text-link" onClick={() => onNavigate("Activity")}>
            See all activity <ArrowRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}
function ShieldShape() {
  return <CircleHelp size={20} />;
}
