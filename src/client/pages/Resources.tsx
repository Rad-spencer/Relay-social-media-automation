import { useState } from "react";
import {
  FileText,
  Plus,
  ArrowUpRight,
  Pencil,
  Link,
  Archive,
} from "lucide-react";
import type { Dashboard, Resource } from "../../shared/types";
import { api } from "../api";
import { Badge, Empty, Field, Modal, PageHeading } from "../components/ui";
export function Resources({
  data,
  onChange,
}: {
  data: Dashboard;
  onChange: () => void;
}) {
  const [edit, setEdit] = useState<Partial<Resource> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="HELPFUL THINGS, READY TO SHARE"
        title="Resource library"
        description="Your guides, portfolios, and links. Ready for the right conversation."
        action={
          <button
            className="primary"
            onClick={() => {
              setError("");
              setEdit({ type: "PDF", tracking: true, active: true });
            }}
          >
            <Plus size={17} />
            Add resource
          </button>
        }
      />
      <div className="notice horizontal">
        <Link size={18} />
        Add a public HTTPS link from your website or file-storage provider.
        Tracking is optional.
      </div>
      <div className="resource-grid">
        {data.resources.map((r) => (
          <article className="panel resource-card" key={r.id}>
            <div
              className={`resource-preview ${r.type === "PDF" ? "pdf" : "link"}`}
            >
              <FileText size={42} />
              <span>{r.type}</span>
            </div>
            <div className="resource-body">
              <div className="row-between">
                <Badge>{r.type}</Badge>
                <Badge tone={r.active ? "green" : "neutral"}>
                  {r.active ? "Available" : "Archived"}
                </Badge>
              </div>
              <h2>{r.name}</h2>
              <p>{r.description || "No description added."}</p>
              <small>
                {data.rules.filter((x) => x.resourceId === r.id).length}{" "}
                associated automations ·{" "}
                {r.tracking ? "Tracking on" : "Tracking off"}
              </small>
              <footer>
                <a
                  className="text-link"
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open resource <ArrowUpRight size={15} />
                </a>
                <button
                  className="icon-button"
                  aria-label={`Edit ${r.name}`}
                  onClick={() => {
                    setEdit(r);
                    setError("");
                  }}
                >
                  <Pencil size={16} />
                </button>
              </footer>
            </div>
          </article>
        ))}
      </div>
      {!data.resources.length && (
        <Empty title="Add something worth sharing">
          Save a link to a guide, product page, portfolio, or booking calendar.
        </Empty>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Edit resource" : "Add a resource"}
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
                  edit.id ? `/resources/${edit.id}` : "/resources",
                  edit.id ? "PUT" : "POST",
                  {
                    name: f.get("name"),
                    description: f.get("description"),
                    type: f.get("type"),
                    url: f.get("url"),
                    tracking: f.get("tracking") === "on",
                    active: f.get("active") === "on",
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
            <Field label="Resource name">
              <input name="name" required defaultValue={edit.name} />
            </Field>
            <Field label="Description">
              <textarea name="description" defaultValue={edit.description} />
            </Field>
            <Field label="Type">
              <select name="type" defaultValue={edit.type}>
                {[
                  "PDF",
                  "Ebook",
                  "Website",
                  "Video",
                  "Booking link",
                  "Catalogue",
                  "Price list",
                  "Portfolio",
                  "Other link",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Public HTTPS URL">
              <input
                type="url"
                name="url"
                required
                defaultValue={edit.url}
                placeholder="https://yourwebsite.com/guide.pdf"
              />
            </Field>
            <label className="check">
              <input
                name="tracking"
                type="checkbox"
                defaultChecked={edit.tracking}
              />
              Track link clicks
            </label>
            <label className="check">
              <input
                name="active"
                type="checkbox"
                defaultChecked={edit.active}
              />
              <Archive size={15} />
              Available for delivery
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
                {busy ? "Saving…" : "Save resource"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
