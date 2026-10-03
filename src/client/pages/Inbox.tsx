import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Archive,
  UserRound,
  Send,
  StickyNote,
  Pin,
  Search,
  ArrowUpRight,
  CheckCheck,
  Zap,
} from "lucide-react";
import type { Contact, Conversation, Message } from "../../shared/types";
import { api } from "../api";
import { Avatar, Badge, Empty, PlatformIcon, relative } from "../components/ui";
interface Detail {
  conversation: Conversation;
  contact: Contact;
  messages: Message[];
  nextCursor: string | null;
}
export function Inbox({
  tick,
  onChange,
}: {
  tick: number;
  onChange: () => void;
}) {
  const [items, setItems] = useState<Conversation[]>([]),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<Detail>(),
    [text, setText] = useState(""),
    [note, setNote] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [cursor, setCursor] = useState<string | null>(null),
    [mobileDetail, setMobileDetail] = useState(false);
  useEffect(() => {
    let cancel = false;
    api<{ items: Conversation[]; nextCursor: string | null }>(
      `/conversations?filter=${filter}&search=${encodeURIComponent(search)}`,
    )
      .then((r) => {
        if (!cancel) {
          setItems(r.items);
          setCursor(r.nextCursor);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      cancel = true;
    };
  }, [filter, search, tick]);
  useEffect(() => {
    if (!selected) return;
    let cancel = false;
    api<Detail>(`/conversations/${selected}`)
      .then((r) => {
        if (!cancel) setDetail(r);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancel = true;
    };
  }, [selected, tick]);
  async function update(value: object) {
    try {
      await api(`/conversations/${selected}`, "PATCH", value);
      setDetail(await api<Detail>(`/conversations/${selected}`));
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/conversations/${selected}/messages`, "POST", { text, note });
      setText("");
      setDetail(await api<Detail>(`/conversations/${selected}`));
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    try {
      const r = await api<{ items: Conversation[]; nextCursor: string | null }>(
        `/conversations?filter=${filter}&search=${encodeURIComponent(search)}&cursor=${encodeURIComponent(cursor || "")}`,
      );
      setItems([...items, ...r.items]);
      setCursor(r.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const c = detail?.conversation;
  return (
    <div className={`inbox-layout ${mobileDetail ? "show-detail" : ""}`}>
      <section className="conversation-list">
        <div className="inbox-heading">
          <h1>
            Inbox{" "}
            <span>
              {items.length}
              {cursor ? "+" : ""}
            </span>
          </h1>
          <p>Good conversations start here.</p>
        </div>
        <div className="inbox-search">
          <Search size={16} />
          <input
            aria-label="Search conversations"
            placeholder="Search conversations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter conversations"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setSelected("");
            setDetail(undefined);
          }}
        >
          <option value="all">All open conversations</option>
          <option value="unread">Unread</option>
          <option value="human">Human attention</option>
          <option value="approval">Reply approval</option>
          {["instagram", "facebook", "youtube"].map((p) => (
            <option key={p}>{p}</option>
          ))}
          <option value="archived">Archived</option>
        </select>
        <div className="conversation-scroll">
          {items.map((x) => (
            <button
              className={`conversation-item ${selected === x.id ? "selected" : ""}`}
              key={x.id}
              onClick={() => {
                setSelected(x.id);
                setMobileDetail(true);
                setText("");
                setError("");
              }}
            >
              <div className="avatar-wrap">
                <Avatar name={x.name} />
                <PlatformIcon platform={x.platform} />
              </div>
              <div className="conversation-preview">
                <div>
                  <strong>{x.name}</strong>
                  <small>{relative(x.updatedAt)}</small>
                </div>
                <p>{x.lastMessage}</p>
                <span>
                  {x.handling === "human" ? "Human attention" : "Rules enabled"}
                  {x.pinned ? " · Pinned" : ""}
                </span>
              </div>
              {x.unread && <i className="unread-dot" />}
            </button>
          ))}
          {!items.length && (
            <Empty title="All clear">No conversations match this filter.</Empty>
          )}
          {cursor && (
            <button className="text-button wide" onClick={more}>
              Load more conversations
            </button>
          )}
        </div>
      </section>
      <section className="conversation-detail">
        {c && detail ? (
          <>
            <header className="chat-header">
              <button
                className="icon-button mobile-back"
                aria-label="Back to conversations"
                onClick={() => setMobileDetail(false)}
              >
                <ArrowLeft size={20} />
              </button>
              <Avatar name={c.name} />
              <div>
                <strong>{c.name}</strong>
                <small>
                  <span className="capitalize">{c.platform}</span> · @
                  {c.username}
                </small>
              </div>
              <div className="chat-tools">
                <button
                  className="icon-button"
                  aria-label={c.pinned ? "Unpin" : "Pin"}
                  onClick={() => update({ pinned: !c.pinned })}
                >
                  <Pin size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Mark read"
                  onClick={() => update({ unread: false })}
                >
                  <CheckCheck size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label={c.status === "archived" ? "Unarchive" : "Archive"}
                  onClick={() =>
                    update({
                      status: c.status === "archived" ? "open" : "archived",
                    })
                  }
                >
                  <Archive size={18} />
                </button>
              </div>
            </header>
            <div
              className={`handling-banner ${c.handling === "human" ? "human" : ""}`}
            >
              <span>
                {c.handling === "human" ? (
                  <UserRound size={16} />
                ) : (
                  <Zap size={16} />
                )}{" "}
                {c.handling === "human"
                  ? "Human handling · automatic replies paused"
                  : "Rules enabled · approved responses only"}
              </span>
              <button
                onClick={() =>
                  update({
                    handling: c.handling === "human" ? "rules" : "human",
                  })
                }
              >
                {c.handling === "human" ? "Return to rules" : "Take over"}
              </button>
            </div>
            <div className="messages">
              <div className="chat-date">
                Simulated conversation · no messages leave this workspace
              </div>
              {detail.nextCursor && (
                <button
                  className="text-button wide"
                  onClick={async () => {
                    try {
                      const older = await api<Detail>(
                        `/conversations/${selected}?before=${encodeURIComponent(detail.nextCursor!)}`,
                      );
                      setDetail({
                        ...detail,
                        messages: [...older.messages, ...detail.messages],
                        nextCursor: older.nextCursor,
                      });
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Load older messages
                </button>
              )}
              {detail.messages.map((m) => (
                <div key={m.id} className={`message ${m.direction}`}>
                  <div>
                    {m.kind === "comment" && (
                      <small className="message-kind">Public comment</small>
                    )}
                    {m.kind === "note" && (
                      <small className="message-kind">
                        Internal note · only your team
                      </small>
                    )}
                    <p>{m.text}</p>
                  </div>
                  <small>
                    {m.sender === "rule"
                      ? "Approved rule · "
                      : m.sender === "human"
                        ? "You · "
                        : ""}
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {m.status === "simulated" ? " · Simulated" : ""}
                  </small>
                </div>
              ))}
            </div>
            {c.suggestion && (
              <div className="suggestion">
                <strong>Approved reply suggestion</strong>
                <p>{c.suggestion}</p>
                <button
                  className="text-link"
                  onClick={() => {
                    setText(c.suggestion!);
                    setNote(false);
                  }}
                >
                  Use this reply <ArrowUpRight size={14} />
                </button>
              </div>
            )}
            <div className="composer">
              <div className="composer-tabs">
                <button
                  className={!note ? "active" : ""}
                  onClick={() => setNote(false)}
                >
                  <Send size={14} />
                  Reply
                </button>
                <button
                  className={note ? "active" : ""}
                  onClick={() => setNote(true)}
                >
                  <StickyNote size={14} />
                  Internal note
                </button>
              </div>
              <textarea
                aria-label={note ? "Internal note" : "Reply message"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  note
                    ? "Leave a note for your team…"
                    : "Write a personal reply…"
                }
                maxLength={4000}
              />
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="composer-bottom">
                <small>
                  {note ? "Private to your workspace" : "Demo delivery only"}
                </small>
                <button
                  className="primary"
                  disabled={busy || !text.trim()}
                  onClick={send}
                >
                  {busy ? "Saving…" : note ? "Add note" : "Send reply"}
                  <Send size={15} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty title="Pick up a conversation">
            Select a message to view the customer’s journey and reply.
          </Empty>
        )}
      </section>
      <aside className="contact-panel">
        {detail && c ? (
          <>
            <Avatar name={c.name} />
            <h3>{c.name}</h3>
            <p>@{c.username}</p>
            <Badge
              tone={detail.contact.status.includes("Lead") ? "green" : "blue"}
            >
              {detail.contact.status}
            </Badge>
            <div className="contact-section">
              <h4>Conversation details</h4>
              <dl>
                <dt>Channel</dt>
                <dd>
                  <PlatformIcon platform={c.platform} />
                  <span className="capitalize">{c.platform}</span>
                </dd>
                <dt>Handling</dt>
                <dd>{c.handling === "human" ? "Human" : "Approved rules"}</dd>
                <dt>Intent / matched rule</dt>
                <dd>{c.intent}</dd>
                <dt>Lead score</dt>
                <dd>{detail.contact.score}</dd>
              </dl>
            </div>
            <div className="contact-section">
              <h4>Tags</h4>
              <div className="tags">
                {detail.contact.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            </div>
            <div className="contact-section">
              <h4>Notes</h4>
              <p>{detail.contact.notes || "No contact notes yet."}</p>
            </div>
            <div className="notice">
              Social profile links are unavailable for simulated identities.
            </div>
          </>
        ) : (
          <p className="muted">Contact details appear here.</p>
        )}
      </aside>
    </div>
  );
}
