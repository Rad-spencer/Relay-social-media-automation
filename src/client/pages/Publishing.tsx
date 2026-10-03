import { useEffect, useState } from "react";
import { CalendarDays, Plus, FileText, Clock3 } from "lucide-react";
import { api, uploadMedia } from "../api";
import {
  Badge,
  Empty,
  Field,
  PageHeading,
  PlatformIcon,
} from "../components/ui";
import { platforms, type Platform } from "../../shared/types";
import {
  platformNames,
  postText,
  publishLimit,
  unsupportedPublish,
  type PostContent,
  type PublisherData,
  type ScheduledPost,
} from "../../shared/publishing";
interface Editor extends PostContent {
  id: string;
  revision: number;
  selected: Platform[];
  connections: Partial<Record<Platform, string>>;
  when: string;
}
function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function blank(): Editor {
  return {
    id: crypto.randomUUID(),
    revision: 0,
    title: "",
    text: "",
    articleUrl: "",
    imageUrl: "",
    selected: [...platforms],
    connections: {},
    when: localDate(new Date(Date.now() + 3600000)),
  };
}
function editable(p: ScheduledPost) {
  return !p.targets.some((t) =>
    ["publishing", "published", "simulated", "unknown"].includes(t.status),
  );
}
export function Publishing({
  tick,
  onAccounts,
}: {
  tick: number;
  onAccounts: () => void;
}) {
  const [data, setData] = useState<PublisherData>();
  const [editor, setEditor] = useState<Editor>(blank);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [filter, setFilter] = useState("all");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => {
    let active = true;
    api<PublisherData>("/posts")
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [tick, revision]);
  const text = postText(editor);
  const resolveConnection = (p: Platform) =>
    editor.connections[p] ??
    data?.options.find((o) => o.platform === p)?.accounts[0]?.id ??
    null;
  function reason(p: Platform) {
    if (data?.demo) return "Demo only · no public post";
    const o = data?.options.find((o) => o.platform === p),
      a = o?.accounts.find((a) => a.id === resolveConnection(p));
    return (
      unsupportedPublish[p] ||
      a?.reason ||
      (!a
        ? "Connect an account first"
        : "Publishing permission requested · provider checks at delivery")
    );
  }
  async function save(intent: "draft" | "schedule") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const date = new Date(editor.when);
      if (
        intent === "schedule" &&
        (!editor.when ||
          !Number.isFinite(date.getTime()) ||
          localDate(date) !== editor.when)
      )
        throw new Error(
          "Choose a valid local date and time. This time may not exist because of a daylight-saving change.",
        );
      const result = await api<ScheduledPost>(`/posts/${editor.id}`, "PUT", {
        title: editor.title,
        text: editor.text,
        articleUrl: editor.articleUrl,
        imageUrl: editor.imageUrl,
        hashtags: editor.hashtags || "",
        mediaId: editor.media?.id || null,
        targets: editor.selected.map((platform) => ({
          platform,
          connectionId: resolveConnection(platform),
        })),
        scheduledAt: intent === "schedule" ? date.toISOString() : null,
        timezone,
        intent,
        revision: editor.revision,
      });
      setEditor((e) => ({ ...e, revision: result.revision }));
      setRevision((v) => v + 1);
      const blocked = result.targets.filter(
        (t) => t.status === "blocked",
      ).length;
      setNotice(
        intent === "draft"
          ? "Draft saved."
          : blocked === result.targets.length
            ? "Plan saved, but every destination is blocked. Connect supported accounts or resolve the listed issues, then reschedule."
            : `${result.targets.length - blocked} destination(s) scheduled${data?.demo ? " for a demo delivery" : ""}.${blocked ? ` ${blocked} destination(s) blocked; see the queue for details.` : ""}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const posts =
    data?.posts.filter((p) => filter === "all" || p.status === filter) || [];
  return (
    <>
      <PageHeading
        eyebrow="WRITE ONCE. PLAN EVERY CHANNEL."
        title="Posts & scheduling"
        description="Create a post or share an article, choose your channels, and set one publishing time."
        action={
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setEditor(blank());
              setError("");
              setNotice("");
            }}
          >
            <Plus size={17} />
            New post
          </button>
        }
      />
      <div className="notice horizontal">
        <Clock3 size={20} />
        <span>
          {data?.demo
            ? "Demo scheduling is available for all seven platforms. No real posts are sent."
            : "Live publishing supports text and article links on X, LinkedIn and Threads, plus Threads JPEG images and MP4 videos, after connection and publishing approval. Other destinations can be saved in a plan but remain blocked."}{" "}
          Relay’s server must stay running to publish on time.
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {data && !data.canManage && (
        <p className="notice">
          An owner or administrator can create and schedule posts.
        </p>
      )}
      <div className="publishing-layout">
        <form
          className="panel publishing-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void save("schedule");
          }}
        >
          <fieldset disabled={busy || !data?.canManage}>
            <h2>
              <FileText size={19} />{" "}
              {editor.revision ? "Edit your post" : "Compose a post"}
            </h2>
            <Field
              label="Internal title"
              hint="For your calendar only; this title is not sent to social networks."
            >
              <input
                value={editor.title}
                maxLength={180}
                placeholder="A story worth sharing"
                onChange={(e) =>
                  setEditor({ ...editor, title: e.target.value })
                }
              />
            </Field>
            <Field
              label="Post text"
              hint="Your caption is sent with the post, followed by the article link and hashtags."
            >
              <textarea
                aria-label="Post text"
                rows={7}
                value={editor.text}
                maxLength={10000}
                placeholder="Write your update or article introduction…"
                onChange={(e) => setEditor({ ...editor, text: e.target.value })}
              />
            </Field>
            <Field
              label="Article link (optional)"
              hint="The link is appended to your text. This shares an article link; it does not create a native long-form article."
            >
              <input
                type="url"
                value={editor.articleUrl}
                placeholder="https://your-site.com/article"
                onChange={(e) =>
                  setEditor({ ...editor, articleUrl: e.target.value })
                }
              />
            </Field>
            <Field
              label="Image URL (optional)"
              hint="A public HTTPS image URL. Currently published as an image only on Threads; other live destinations are blocked when an image is attached."
            >
              <input
                type="url"
                value={editor.imageUrl}
                placeholder="https://your-site.com/image.jpg"
                onChange={(e) =>
                  setEditor({ ...editor, imageUrl: e.target.value })
                }
              />
            </Field>
            <Field
              label="Hashtags"
              hint="Separate tags with spaces or commas. The # is added automatically."
            >
              <input
                value={editor.hashtags || ""}
                maxLength={2000}
                placeholder="#launch #behindthescenes"
                onChange={(e) =>
                  setEditor({ ...editor, hashtags: e.target.value })
                }
              />
            </Field>
            <Field
              label="Upload image or video"
              hint="One JPEG, PNG, WebP or MP4, up to 25 MB. Live uploads: Threads JPEG/MP4 with public HTTPS hosting; other destinations are blocked. Videos retain their original audio. Workspace storage limit: 100 MB."
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  setError("");
                  try {
                    const media = await uploadMedia(file);
                    setEditor((current) => ({
                      ...current,
                      media,
                      imageUrl: "",
                    }));
                  } catch (error) {
                    setError((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </Field>
            {editor.media && (
              <div className="notice">
                <p>
                  {editor.media.mime.startsWith("video/") ? "Video" : "Image"}{" "}
                  attached · {(editor.media.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEditor({ ...editor, media: undefined })}
                >
                  Remove attachment
                </button>
              </div>
            )}
            <div className="notice">
              <strong>Music and original audio</strong>
              <p>
                Audio already in your video is preserved. Native song browsing
                and adding licensed platform tracks are not available in these
                integrations. To use a platform’s music catalog, finish the post
                in that platform’s editor; Relay cannot schedule that music
                selection.
              </p>
            </div>
            <div className="row-between">
              <h3>Publish to</h3>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setEditor({
                    ...editor,
                    selected:
                      editor.selected.length === platforms.length
                        ? []
                        : [...platforms],
                  })
                }
              >
                {editor.selected.length === platforms.length
                  ? "Clear selection"
                  : "Select all platforms"}
              </button>
            </div>
            <div className="publishing-targets">
              {platforms.map((p) => {
                const o = data?.options.find((o) => o.platform === p),
                  max = publishLimit[p];
                return (
                  <div
                    className={`publishing-target ${editor.selected.includes(p) ? "selected" : ""}`}
                    key={p}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={editor.selected.includes(p)}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            selected: e.target.checked
                              ? [...editor.selected, p]
                              : editor.selected.filter((v) => v !== p),
                          })
                        }
                      />
                      <PlatformIcon platform={p} />
                      <strong>{platformNames[p]}</strong>
                    </label>
                    {!!o?.accounts.length && (
                      <select
                        aria-label={`${platformNames[p]} account`}
                        value={resolveConnection(p) || ""}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            connections: {
                              ...editor.connections,
                              [p]: e.target.value,
                            },
                          })
                        }
                      >
                        {o.accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <small>{reason(p)}</small>
                    {max && (
                      <small
                        className={Array.from(text).length > max ? "error" : ""}
                      >
                        {Array.from(text).length} / {max} app character limit
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
            <Field
              label={`Publish date and time · ${timezone}`}
              hint="All selected destinations use this same time. Providers may complete at slightly different times."
            >
              <input
                type="datetime-local"
                required
                value={editor.when}
                onInput={(e) =>
                  setEditor({ ...editor, when: e.currentTarget.value })
                }
                onChange={(e) => setEditor({ ...editor, when: e.target.value })}
              />
            </Field>
            <div className="publishing-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => void save("draft")}
              >
                Save draft
              </button>
              <button className="primary" disabled={!editor.selected.length}>
                <CalendarDays size={17} />
                {busy
                  ? "Saving…"
                  : data?.demo
                    ? "Schedule demo for all selected"
                    : "Schedule all selected"}
              </button>
            </div>
          </fieldset>
        </form>
        <aside className="panel publishing-preview">
          <span className="eyebrow">POST PREVIEW</span>
          <h2>{editor.title || "Your next post"}</h2>
          <Badge>{editor.selected.length} platforms selected</Badge>
          <div className="post-preview-text">
            {text || "Your post text and article link will appear here."}
          </div>
          {editor.media && <MediaPreview media={editor.media} />}
          {editor.imageUrl && (
            <p className="notice">Image attached: {editor.imageUrl}</p>
          )}
          <p>
            <Clock3 size={15} />{" "}
            {editor.when && Number.isFinite(new Date(editor.when).getTime())
              ? new Date(editor.when).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "long",
                })
              : "Choose a time"}
          </p>
          <button type="button" className="text-link" onClick={onAccounts}>
            Manage social connections →
          </button>
          <p className="fine-print">
            Your text is sent as written. No AI generation or automatic
            rewriting.
          </p>
        </aside>
      </div>
      <section className="publishing-queue">
        <div className="row-between">
          <div>
            <h2>Publishing queue</h2>
            <p>Latest 100 posts · dates shown in {timezone}</p>
          </div>
          <select
            aria-label="Filter posts"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {[
              "all",
              "draft",
              "scheduled",
              "blocked",
              "published",
              "simulated",
              "failed",
              "unknown",
              "cancelled",
              "partial",
            ].map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All posts" : s}
              </option>
            ))}
          </select>
        </div>
        {!posts.length && (
          <Empty title="Your next post starts here">
            Save a draft or schedule your first update for all selected
            channels.
          </Empty>
        )}
        {posts.map((p) => (
          <article key={p.id} className="panel queued-post">
            <div className="row-between">
              <h3>{p.title}</h3>
              <Badge
                tone={
                  p.status === "published"
                    ? "green"
                    : ["blocked", "failed", "unknown"].includes(p.status)
                      ? "amber"
                      : "neutral"
                }
              >
                {p.status}
              </Badge>
            </div>
            <p>
              {p.scheduledAt
                ? new Date(p.scheduledAt).toLocaleString()
                : "Unscheduled draft"}{" "}
              · {p.timezone}
            </p>
            <div className="post-preview-text">{postText(p)}</div>
            {p.imageUrl && <p>Image: {p.imageUrl}</p>}
            {p.media && <MediaPreview media={p.media} />}
            <div className="queued-targets">
              {p.targets.map((t) => (
                <div key={t.id}>
                  <PlatformIcon platform={t.platform} />
                  <div>
                    <strong>{t.name}</strong>
                    <small>
                      {t.status} · {t.detail || "Awaiting scheduled time"}
                      {t.remoteId ? ` · Provider ID: ${t.remoteId}` : ""}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            <div className="publishing-actions">
              {editable(p) && (
                <button
                  disabled={busy || !data?.canManage}
                  className="secondary"
                  onClick={() => {
                    setEditor({
                      id: p.id,
                      revision: p.revision,
                      title: p.title,
                      text: p.text,
                      articleUrl: p.articleUrl,
                      imageUrl: p.imageUrl,
                      hashtags: p.hashtags || "",
                      media: p.media,
                      when: p.scheduledAt
                        ? localDate(new Date(p.scheduledAt))
                        : blank().when,
                      selected: p.targets.map((t) => t.platform),
                      connections: Object.fromEntries(
                        p.targets
                          .filter((t) => t.connectionId)
                          .map((t) => [t.platform, t.connectionId!]),
                      ),
                    });
                    setError("");
                    setNotice(
                      "Loaded into the composer above. Save to apply your changes.",
                    );
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Edit / reschedule
                </button>
              )}
              {p.targets.some((t) =>
                ["scheduled", "blocked", "draft", "failed"].includes(t.status),
              ) && (
                <button
                  disabled={busy || !data?.canManage}
                  className="text-button"
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api(`/posts/${p.id}/cancel`, "POST", {
                        revision: p.revision,
                      });
                      setRevision((v) => v + 1);
                      if (editor.id === p.id) setEditor(blank());
                      setNotice(
                        "Pending destinations cancelled. Deliveries already in progress or published cannot be recalled.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cancel pending destinations
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function MediaPreview({ media }: { media: NonNullable<PostContent["media"]> }) {
  const src = `/api/media/${media.id}`;
  return media.mime.startsWith("video/") ? (
    <video
      controls
      preload="metadata"
      src={src}
      style={{ width: "100%", maxHeight: 320 }}
    />
  ) : (
    <img
      src={src}
      alt="Attached post image"
      style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain" }}
    />
  );
}
