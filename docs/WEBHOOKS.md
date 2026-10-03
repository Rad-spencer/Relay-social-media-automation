# Event ingestion

`POST /api/simulate` is the authenticated demo endpoint. It requires owner/admin role, CSRF, a workspace-owned simulated account, and a normalized event.

`POST /ingest/:workspaceId` is an optional **internal HMAC event-ingestion contract**, not a Meta/YouTube-compatible webhook. It is disabled unless `INGESTION_SECRET` has at least 32 characters. Never configure a provider to call it directly. A future provider-specific endpoint must verify that provider's raw-body signature, identify the account server-side and normalize its payload before ingestion.

Internal headers:

- `Content-Type: application/json`
- `X-Timestamp`: Unix seconds, within five minutes
- `X-Signature`: hex HMAC-SHA256 of `${timestamp}.${rawBody}`, optionally prefixed with `sha256=`

Normalized fields: id, accountId, externalUserId, name, username, type (`comment` or `dm`), content, postId, timestamp (ISO). The account must belong to the supplied workspace; only demo accounts are accepted today.

The endpoint verifies before parsing, atomically saves the unique account/event and pending job, then returns 202 with `{duplicate: boolean}`. Replays do not enqueue another job. The worker retries with exponential delay, at most five attempts, then preserves a dead letter and an audit record.
