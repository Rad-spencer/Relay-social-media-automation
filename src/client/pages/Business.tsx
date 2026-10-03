import { useState } from "react";
import { Plus, BookOpen, Pencil, ShieldCheck, Save } from "lucide-react";
import type { Dashboard, FAQ } from "../../shared/types";
import { api } from "../api";
import { Badge, Empty, Field, Modal, PageHeading } from "../components/ui";
export function Business({
  data,
  onChange,
}: {
  data: Dashboard;
  onChange: () => void;
}) {
  const [tab, setTab] = useState("replies"),
    [edit, setEdit] = useState<Partial<FAQ> | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="YOUR BUSINESS. YOUR WORDS."
        title="Business & replies"
        description="Enter the details yourself. Your rules only send text you have approved."
        action={
          <button
            className="primary"
            onClick={() => {
              setEdit({ enabled: true });
              setError("");
            }}
          >
            <Plus size={17} />
            Add approved reply
          </button>
        }
      />
      <div className="tabs">
        <button
          className={tab === "replies" ? "active" : ""}
          onClick={() => setTab("replies")}
        >
          Approved replies <span>{data.faqs.length}</span>
        </button>
        <button
          className={tab === "profile" ? "active" : ""}
          onClick={() => setTab("profile")}
        >
          Business information
        </button>
        <button
          className={tab === "routing" ? "active" : ""}
          onClick={() => setTab("routing")}
        >
          Reply settings
        </button>
      </div>
      <div className="notice horizontal">
        <ShieldCheck size={19} />
        No LLMs or generated answers. Messages without one exact approved match
        go to your team.
      </div>
      {tab === "replies" && (
        <div className="faq-list">
          {data.faqs.map((f) => (
            <article className="panel faq-card" key={f.id}>
              <div className="soft-icon">
                <BookOpen size={20} />
              </div>
              <div>
                <div className="row-between">
                  <h2>{f.question}</h2>
                  <Badge tone={f.enabled ? "green" : "neutral"}>
                    {f.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="tags">
                  {f.keywords.map((k) => (
                    <Badge key={k}>{k}</Badge>
                  ))}
                </div>
                <p>{f.answer}</p>
              </div>
              <button
                className="icon-button"
                aria-label={`Edit ${f.question}`}
                onClick={() => {
                  setEdit(f);
                  setError("");
                }}
              >
                <Pencil size={17} />
              </button>
            </article>
          ))}
          {!data.faqs.length && (
            <Empty title="Give your customers a helpful answer">
              Add the phrases customers use and the exact reply you want to
              send.
            </Empty>
          )}
        </div>
      )}
      {tab !== "replies" && (
        <form
          className="panel settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setSaved("");
            const f = new FormData(e.currentTarget);
            try {
              await api("/profile", "PUT", {
                ...data.profile,
                ...Object.fromEntries(f),
              });
              setSaved("Changes saved.");
              onChange();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tab === "profile" ? (
            <>
              <h2>Tell us about your business</h2>
              <p className="muted">
                Reference information for your team. These fields do not
                generate customer replies.
              </p>
              <Field label="Business name">
                <input
                  name="businessName"
                  defaultValue={data.profile.businessName}
                  required
                />
              </Field>
              <Field label="Business description">
                <textarea
                  name="description"
                  defaultValue={data.profile.description}
                  rows={4}
                />
              </Field>
              {(
                [
                  "products",
                  "services",
                  "pricing",
                  "delivery",
                  "returns",
                  "support",
                ] as const
              ).map((key) => (
                <Field
                  key={key}
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                >
                  <textarea
                    name={key}
                    defaultValue={data.profile[key] || ""}
                    rows={3}
                  />
                </Field>
              ))}
              <Field label="Website">
                <input
                  name="website"
                  type="url"
                  defaultValue={data.profile.website}
                />
              </Field>
              <Field label="Contact information">
                <textarea name="contact" defaultValue={data.profile.contact} />
              </Field>
              <Field
                label="Business hours"
                hint="Reference information only; scheduled routing is not enabled."
              >
                <input name="hours" defaultValue={data.profile.hours} />
              </Field>
              <Field label="Writing guidelines for your team">
                <input name="tone" defaultValue={data.profile.tone} />
              </Field>
            </>
          ) : (
            <>
              <h2>How should replies be handled?</h2>
              <p className="muted">
                The customer’s entire message must match one of your approved
                phrases, ignoring case and punctuation.
              </p>
              {[
                {
                  value: "off",
                  title: "Manual only",
                  text: "Every conversation goes to your team.",
                },
                {
                  value: "suggest",
                  title: "Suggest approved replies",
                  text: "Show an approved reply for a teammate to review and send.",
                },
                {
                  value: "hybrid",
                  title: "Hybrid",
                  text: "Send exact approved matches. Route all other messages to a human.",
                },
                {
                  value: "auto",
                  title: "Automatic approved replies",
                  text: "Send exact approved matches. Unmatched or sensitive requests still go to a human.",
                },
              ].map((m) => (
                <label className="radio-card" key={m.value}>
                  <input
                    name="mode"
                    type="radio"
                    value={m.value}
                    defaultChecked={data.profile.mode === m.value}
                  />
                  <div>
                    <strong>{m.title}</strong>
                    <p>{m.text}</p>
                  </div>
                </label>
              ))}
            </>
          )}
          {error && <p className="error">{error}</p>}
          {saved && (
            <p role="status" className="success">
              {saved}
            </p>
          )}
          <button className="primary" disabled={busy}>
            <Save size={16} />
            {busy ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Edit approved reply" : "Add approved reply"}
          onClose={() => setEdit(null)}
        >
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await api(
                  edit.id ? `/faqs/${edit.id}` : "/faqs",
                  edit.id ? "PUT" : "POST",
                  {
                    question: f.get("question"),
                    keywords: String(f.get("keywords"))
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    answer: f.get("answer"),
                    enabled: f.get("enabled") === "on",
                  },
                );
                setEdit(null);
                onChange();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Reply title">
              <input name="question" required defaultValue={edit.question} />
            </Field>
            <Field
              label="Customer phrases"
              hint="One phrase per line. Only an exact normalized phrase triggers this reply."
            >
              <textarea
                name="keywords"
                rows={4}
                defaultValue={edit.keywords?.join("\n")}
                required
              />
            </Field>
            <Field
              label="Your approved answer"
              hint="This exact text will be suggested or sent. Include only verified information."
            >
              <textarea
                name="answer"
                defaultValue={edit.answer}
                rows={5}
                required
              />
            </Field>
            <label className="check">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={edit.enabled}
              />
              Enable this reply
            </label>
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
                Save approved reply
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
