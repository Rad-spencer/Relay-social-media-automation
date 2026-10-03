# Shared posts and scheduling

Open **Posts & scheduling** in the sidebar. Write your post, optionally add an article link or an image URL, select platforms and accounts, and choose one date/time. The browser's timezone is shown next to the field; the API stores the instant in UTC and retains the timezone label. The internal title is not published. Articles are shared as links appended to the exact post text, not native long-form articles. There is no AI rewriting.

Save draft stores an unscheduled post. Schedule all selected creates one destination per selected platform at the same instant. Each destination has independent results. Provider calls run near the chosen time, not as an atomic cross-network transaction. The server must stay running; its existing worker processes the queue. Restarting preserves schedules. Posts missed by over 24 hours are blocked for review.

## Current platform support

| Platform  | Live publishing implementation                                     | Remaining requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X         | Text and article links through `POST /2/tweets`                    | Reconnect with `tweet.write`, valid unexpired token and provider API entitlement; app limit 280 Unicode characters, provider applies its own weighted validation |
| LinkedIn  | Public member text/link posts through `POST /rest/posts`           | Reconnect with `w_member_social`, approved product access and valid token; default API version `202604`, configurable via `LINKEDIN_API_VERSION`                 |
| Threads   | Text/link auto-publishing; image container followed by publication | Reconnect with `threads_content_publish`; public provider-fetchable image URL when attached; provider content/processing restrictions apply                      |
| Facebook  | Blocked                                                            | Page selection, Page tokens and Page publishing adapter are not implemented                                                                                      |
| Instagram | Blocked                                                            | Media publishing adapter is not implemented                                                                                                                      |
| YouTube   | Blocked                                                            | Video uploads are not implemented; the composer does not send text/article posts to YouTube                                                                      |
| TikTok    | Blocked                                                            | Media publishing and required consent/product approval flows are not implemented                                                                                 |

No live provider grant or publishing call has been tested with a real account. Tests mock provider responses. All seven platforms are available in the clearly labelled demo scheduler; demo delivery never calls provider APIs and is recorded as **simulated**, never published. An image attachment blocks X and LinkedIn rather than silently omitting it. This version uses public HTTPS image URLs and has no file upload, video upload or per-platform text overrides.

A connection made before publishing support was added must be reconnected. Additional write scopes are requested only during dashboard account connection, not anonymous social sign-in. The provider can deny them; final authorization is enforced at delivery. A requested scope is not claimed as a verified grant. Token refresh is not implemented; expiry before the chosen schedule blocks the destination. Use shorter schedules or reconnect before rescheduling.

## Queue behavior

Missing connections, unsupported formats and expired authorization are saved with an explicit **blocked** reason. Blocked destinations never silently activate when account configuration changes: review and reschedule explicitly. A mixed plan queues eligible destinations and records blocked ones separately. The queue displays each result and the confirmed provider ID when present.

Draft, scheduled, blocked, cancelled and definitively failed posts can be edited and rescheduled when none of their destinations has started or succeeded. Saving a draft from a scheduled post unschedules it. Cancellation cancels only pending destinations; it does not recall remote posts or interrupt an already-started request. Already-published, simulated, in-progress or uncertain deliveries cannot be overwritten by editing. Use a new post for any further intentional delivery after checking results.

Workers claim destination rows using PostgreSQL locks. A committed publishing claim survives a restart. Interrupted attempts older than five minutes become **unknown**, never automatically retried, because the provider may already have published them. Network timeouts, ambiguous server failures or missing success IDs also result in **unknown**. Check the network before creating a replacement post. Explicit rejections become **failed** or **blocked**. No automatic retries are used for remote post mutations.

The queue shows the latest 100 posts with filters. Owner/admin role and CSRF are required for changes. Connections are tenant-scoped and the scheduling user's current workspace authority is checked again by the worker. Demo targets cannot be used in real workspaces. Optimistic revisions prevent stale edits, and active delivery targets are locked against modification.

## Storage and API

Migration 4 adds `scheduled_posts`, `post_targets`, and `social_connections.publishing_requested`.

- `GET /api/posts`: recent posts, target options, demo mode and management permission.
- `PUT /api/posts/:uuid`: create/update with revision, content, target choices, `intent` (`draft` or `schedule`), ISO UTC `scheduledAt`, and timezone. Use revision 0 for a new post; later writes use the returned revision.
- `POST /api/posts/:uuid/cancel`: cancel pending destinations, passing the latest revision.

No tokens are returned in these responses. Provider destinations are fixed; the backend never downloads article or image URLs. URLs must be public HTTPS links; image URLs are passed to Threads only when the user schedules that destination.

## References

- [X official create-post sample](https://github.com/xdevplatform/samples/blob/main/python/posts/create_post.py)
- [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-04)
- [Meta's official Threads sample](https://github.com/fbsamples/threads_api)

## Uploaded media, captions and music

The composer accepts one JPEG, PNG, WebP or MP4 attachment (25 MB maximum).
Uploads are stored in the database, with a 100 MB workspace quota. Removing an
attachment from a composer does not delete its stored file. Media previews require
workspace membership; provider fetches use random one-hour capability URLs minted
at delivery time. The media endpoints support byte ranges for video playback.
Database backups now include uploaded media. This is small-workspace storage, not
a production object-storage service; there is no media library/cleanup UI yet.

Post text is the shared caption. Hashtags are appended after the article link,
with a leading # and duplicates removed. All provider text limits include tags.
Files and captions persist with drafts, edits and scheduled targets. Videos are
passed through unchanged, including any audio already embedded in them.

Live uploaded-media delivery is implemented for Threads JPEG images and MP4
videos. It requires a public HTTPS APP_URL, valid Threads credentials and publishing
permission. Localhost cannot be fetched by the provider. PNG/WebP remain usable
for drafts/previews, but require JPEG export for this live adapter. Other platform
media adapters remain blocked; an attachment is never silently discarded to send
text alone. Threads video containers are checked up to three times over one minute
before publishing; errors/timeouts leave a visible failed target. Codec, duration,
aspect ratio and other provider requirements are ultimately checked by Threads.
Delivery time may be later than the selected time while the provider processes it.
No live external publication has been verified without credentials.

There is no native music catalog picker. The current integrations cannot browse
and attach licensed tracks from each platform. TikTok's documented photo
`auto_add_music` chooses recommended music automatically; it is not a named-track
picker, and this app does not implement that TikTok publishing flow. Native music
selection must currently be completed in the platform's editor and cannot be
scheduled by Relay. Uploading a video with an existing soundtrack is supported;
Relay does not add or replace its audio.

References:
- https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post
- https://github.com/fbsamples/threads_api
- https://www.postman.com/meta/threads/request/m47wqlq/check-container-s-publishing-status
