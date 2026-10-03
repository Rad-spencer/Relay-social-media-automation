import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import type { Contact } from "../../shared/types";
import { api } from "../api";
import {
  Avatar,
  Badge,
  Empty,
  Field,
  Modal,
  PageHeading,
  PlatformIcon,
} from "../components/ui";
export function Contacts({
  tick,
  onChange,
}: {
  tick: number;
  onChange: () => void;
}) {
  const [items, setItems] = useState<Contact[]>([]),
    [search, setSearch] = useState(""),
    [edit, setEdit] = useState<Contact | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ items: Contact[]; nextCursor: string | null }>(
      `/contacts?search=${encodeURIComponent(search)}`,
    )
      .then((r) => {
        setItems(r.items);
        setCursor(r.nextCursor);
      })
      .catch((e) => setError(e.message));
  }, [search, tick]);
  return (
    <>
      <PageHeading
        eyebrow="PEOPLE, NOT JUST PROFILES"
        title="Contacts"
        description="Follow the relationship from first comment to your next customer."
        action={
          <a className="secondary" href="/api/export/contacts">
            <Download size={17} />
            Export CSV
          </a>
        }
      />
      <div className="table-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search contacts"
            placeholder="Search name or username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="muted">
          {items.length}
          {cursor ? "+" : ""} contacts
        </span>
      </div>
      {error && !edit && <p className="error">{error}</p>}
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Platform</th>
              <th>Status</th>
              <th>Tags</th>
              <th>Lead score</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="person-cell">
                    <Avatar name={c.name} small />
                    <div>
                      <strong>{c.name}</strong>
                      <small>@{c.username}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="platform-cell">
                    <PlatformIcon platform={c.platform} />
                    <span className="capitalize">{c.platform}</span>
                  </div>
                </td>
                <td>
                  <Badge tone={c.status.includes("Lead") ? "green" : "neutral"}>
                    {c.status}
                  </Badge>
                </td>
                <td>
                  <div className="tags">
                    {c.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                </td>
                <td>
                  <span className="score">{c.score}</span>
                </td>
                <td>
                  <button
                    className="text-link"
                    onClick={() => {
                      setEdit(c);
                      setError("");
                    }}
                  >
                    View contact
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <Empty title="No contacts yet">
            Contacts are created when incoming events are processed.
          </Empty>
        )}
      </section>
      {cursor && (
        <button
          className="secondary"
          onClick={async () => {
            try {
              const r = await api<{
                items: Contact[];
                nextCursor: string | null;
              }>(
                `/contacts?search=${encodeURIComponent(search)}&cursor=${cursor}`,
              );
              setItems([...items, ...r.items]);
              setCursor(r.nextCursor);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Load more
        </button>
      )}
      {edit && (
        <Modal title={edit.name} onClose={() => setEdit(null)}>
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api(`/contacts/${edit.id}`, "PATCH", {
                  status: f.get("status"),
                  tags: String(f.get("tags"))
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  notes: f.get("notes"),
                  optedOut: f.get("optedOut") === "on",
                });
                setEdit(null);
                onChange();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field label="Status">
              <select name="status" defaultValue={edit.status}>
                {[
                  "New",
                  "Active",
                  "Lead",
                  "Qualified Lead",
                  "Customer",
                  "VIP",
                  "Collaboration",
                  "Support",
                  "Spam",
                  "Archived",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Tags" hint="Separate tags with commas.">
              <input name="tags" defaultValue={edit.tags.join(", ")} />
            </Field>
            <Field label="Workspace-private notes">
              <textarea name="notes" defaultValue={edit.notes} rows={5} />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                name="optedOut"
                defaultChecked={edit.optedOut}
              />
              Opted out of messaging
            </label>
            <p className="notice">
              Only remove an opt-out after the customer explicitly asks to
              receive messages again.
            </p>
            {error && <p className="error">{error}</p>}
            <button className="primary">Save contact</button>
          </form>
        </Modal>
      )}
    </>
  );
}
