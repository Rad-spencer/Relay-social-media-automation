import { useState } from "react";
import {
  Plus,
  Zap,
  Copy,
  Play,
  Pause,
  Pencil,
  ArrowDown,
  MessageSquare,
  Gift,
  Tag,
  FlaskConical,
} from "lucide-react";
import type { Dashboard, Rule } from "../../shared/types";
import { platforms } from "../../shared/types";
import { api } from "../api";
import {
  Badge,
  Empty,
  Field,
  Modal,
  PageHeading,
  PlatformIcon,
} from "../components/ui";
const blank: Omit<Rule, "id" | "createdAt" | "version"> = {
  name: "",
  platforms: ["instagram"],
  keywords: [],
  match: "contains",
  ignorePunctuation: true,
  status: "draft",
  cooldownHours: 24,
  oncePerPost: false,
  resourceId: "",
  publicReply: "Thanks for your interest!",
  privateReply: "Hi {{first_name}}, here is your resource: {{resource_link}}",
  tag: "",
};
export function Automations({
  data,
  onChange,
  onSimulate,
}: {
  data: Dashboard;
  onChange: () => void;
  onSimulate: () => void;
}) {
  const [edit, setEdit] = useState<Partial<Rule> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [test, setTest] = useState<Rule | null>(null),
    [result, setResult] = useState("");
  async function status(r: Rule) {
    try {
      await api(`/rules/${r.id}`, "PUT", {
        ...r,
        status: r.status === "active" ? "paused" : "active",
      });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const input = {
      name: f.get("name"),
      keywords: String(f.get("keywords"))
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      platforms: f.getAll("platforms"),
      match: f.get("match"),
      ignorePunctuation: f.get("ignorePunctuation") === "on",
      status: edit?.status || "draft",
      cooldownHours: Number(f.get("cooldownHours")),
      oncePerPost: f.get("oncePerPost") === "on",
      resourceId: f.get("resourceId"),
      publicReply: f.get("publicReply"),
      privateReply: f.get("privateReply"),
      tag: f.get("tag"),
    };
    try {
      await api(
        edit?.id ? `/rules/${edit.id}` : "/rules",
        edit?.id ? "PUT" : "POST",
        input,
      );
      setEdit(null);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE EVERY INTERACTION COUNT"
        title="Automations"
        description="A comment becomes a conversation. You decide what happens next."
        action={
          <div className="button-row">
            <button className="secondary" onClick={onSimulate}>
              <FlaskConical size={17} />
              Simulator
            </button>
            <button
              className="primary"
              onClick={() => {
                setError("");
                setEdit(blank);
              }}
            >
              <Plus size={17} />
              New automation
            </button>
          </div>
        }
      />
      <div className="tabs">
        {["all", "active", "draft", "paused", "archived"].map((x) => (
          <button
            className={filter === x ? "active" : ""}
            key={x}
            onClick={() => setFilter(x)}
          >
            {x === "all" ? "All automations" : x}{" "}
            <span>
              {data.rules.filter((r) => x === "all" || r.status === x).length}
            </span>
          </button>
        ))}
      </div>
      {error && !edit && <p className="error">{error}</p>}
      <div className="rule-grid">
        {data.rules
          .filter((r) => filter === "all" || r.status === filter)
          .map((r) => (
            <article className="panel rule-card" key={r.id}>
              <div className="rule-card-top">
                <span className="soft-icon">
                  <Zap size={22} />
                </span>
                <Badge
                  tone={
                    r.status === "active"
                      ? "green"
                      : r.status === "draft"
                        ? "blue"
                        : "neutral"
                  }
                >
                  {r.status}
                </Badge>
              </div>
              <h2>{r.name}</h2>
              <div className="rule-platforms">
                {r.platforms.map((p) => (
                  <PlatformIcon key={p} platform={p} />
                ))}
                <span>Version {r.version}</span>
              </div>
              <div className="rule-trigger">
                <small>
                  WHEN A COMMENT{" "}
                  {r.match === "contains"
                    ? "CONTAINS"
                    : r.match === "exact"
                      ? "MATCHES"
                      : "STARTS WITH"}
                </small>
                <div>
                  {r.keywords.map((k) => (
                    <span key={k}>{k}</span>
                  ))}
                </div>
              </div>
              <div className="rule-actions">
                {r.privateReply && (
                  <span>
                    <MessageSquare size={15} />
                    Private reply
                  </span>
                )}
                {r.resourceId && (
                  <span>
                    <Gift size={15} />
                    Resource
                  </span>
                )}
                {r.tag && (
                  <span>
                    <Tag size={15} />
                    Tag lead
                  </span>
                )}
              </div>
              <footer>
                <button
                  className="text-button"
                  onClick={() => {
                    setError("");
                    setEdit(r);
                  }}
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  className="icon-button"
                  title="Duplicate as draft"
                  aria-label={`Duplicate ${r.name}`}
                  onClick={() => {
                    setEdit({
                      ...r,
                      id: undefined,
                      name: `${r.name} (copy)`,
                      status: "draft",
                    });
                    setError("");
                  }}
                >
                  <Copy size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Test ${r.name}`}
                  onClick={() => {
                    setTest(r);
                    setResult("");
                  }}
                >
                  <FlaskConical size={16} />
                </button>
                <button className="secondary compact" onClick={() => status(r)}>
                  {r.status === "active" ? (
                    <Pause size={14} />
                  ) : (
                    <Play size={14} />
                  )}{" "}
                  {r.status === "active" ? "Pause" : "Activate"}
                </button>
              </footer>
            </article>
          ))}
      </div>
      {!data.rules.length && (
        <Empty title="Your first workflow starts with a keyword">
          Add a resource, write a reply, and test it before activation.
        </Empty>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Edit automation" : "Create automation"}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save} className="modal-form">
            <Field label="Automation name">
              <input
                name="name"
                defaultValue={edit.name}
                required
                maxLength={120}
              />
            </Field>
            <div className="workflow-step">
              <span>1</span>
              <h3>When a comment arrives</h3>
            </div>
            <div className="check-grid">
              {platforms.map((p) => (
                <label key={p} className="check">
                  <input
                    type="checkbox"
                    name="platforms"
                    value={p}
                    defaultChecked={edit.platforms?.includes(p)}
                  />
                  <span className="capitalize">{p}</span>
                </label>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Keywords" hint="Separate keywords with commas.">
                <input
                  name="keywords"
                  defaultValue={edit.keywords?.join(", ")}
                  required
                  placeholder="GUIDE, PORTFOLIO"
                />
              </Field>
              <Field label="Match type">
                <select name="match" defaultValue={edit.match}>
                  <option value="contains">Contains</option>
                  <option value="exact">Exact match</option>
                  <option value="starts">Starts with</option>
                </select>
              </Field>
            </div>
            <label className="check">
              <input
                type="checkbox"
                name="ignorePunctuation"
                defaultChecked={edit.ignorePunctuation}
              />
              Ignore punctuation and emoji
            </label>
            <ArrowDown className="workflow-arrow" size={18} />
            <div className="workflow-step">
              <span>2</span>
              <h3>Send your approved response</h3>
            </div>
            <Field label="Resource">
              <select name="resourceId" defaultValue={edit.resourceId}>
                <option value="">No resource</option>
                {data.resources
                  .filter((r) => r.active)
                  .map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Private reply"
              hint="Variables: {{first_name}}, {{username}}, {{business_name}}, {{resource_link}}, {{platform}}"
            >
              <textarea
                name="privateReply"
                defaultValue={edit.privateReply}
                rows={3}
              />
            </Field>
            <Field
              label="Public comment reply"
              hint="Resource links are delivered only once per contact across all rules. Include {{resource_link}} in a reply to deliver the selected resource."
            >
              <input name="publicReply" defaultValue={edit.publicReply} />
            </Field>
            <Field label="Add contact tag">
              <input
                name="tag"
                defaultValue={edit.tag}
                placeholder="Portfolio lead"
              />
            </Field>
            <div className="workflow-step">
              <span>3</span>
              <h3>Keep it personal</h3>
            </div>
            <Field label="Cooldown">
              <select name="cooldownHours" defaultValue={edit.cooldownHours}>
                <option value={24}>Once every 24 hours</option>
                <option value={168}>Once every week</option>
                <option value={-1}>Once ever</option>
                <option value={0}>No time cooldown</option>
              </select>
            </Field>
            <label className="check">
              <input
                type="checkbox"
                name="oncePerPost"
                defaultChecked={edit.oncePerPost}
              />
              Only once per customer per post
            </label>
            <p className="notice">
              New automations are saved as drafts. Test them before activation.
              Unsupported actions are skipped and logged.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : edit.id ? "Save changes" : "Save draft"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {test && (
        <Modal title={`Test ${test.name}`} onClose={() => setTest(null)}>
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const text = new FormData(e.currentTarget).get("text");
              try {
                const r = await api<{
                  matched: boolean;
                  reply: string;
                  note: string;
                }>(`/rules/${test.id}/test`, "POST", { text });
                setResult(
                  `${r.matched ? "Matched" : "No match"}${r.matched ? " — " + r.reply : ""}\n${r.note}`,
                );
              } catch (e) {
                setResult((e as Error).message);
              }
            }}
          >
            <Field label="Sample comment">
              <input
                name="text"
                required
                defaultValue={test.keywords[0] + " please"}
              />
            </Field>
            <button className="primary">Test keyword</button>
            {result && <p className="test-result">{result}</p>}
          </form>
        </Modal>
      )}
    </>
  );
}
