# Relay build progress

Scope amendment: **no LLM, external AI provider, generated knowledge, or AI credentials**. Users enter their business details and approved answers manually. Deterministic routing replaces AI inference.

## Implemented MVP

[x] Empty-workspace inspection, architecture, dependencies and modular project
[x] Persistent PostgreSQL-compatible schema and startup migration
[x] Registration, login/logout, hashed passwords and persistent sessions
[x] Workspace isolation and server-enforced roles
[x] Adapter/capability boundary, simulated Instagram/Facebook/YouTube, disabled live networks
[x] Durable normalized event ingestion, signed internal endpoint and transactional jobs
[x] Contacts, conversations, chronological messages, bounded pagination
[x] Inbox filters/search, replies, internal notes, takeover/return, read/archive/pin state
[x] Draft keyword rules, edit/duplicate/activate/pause, version snapshots, run logs
[x] Event idempotency, own-account exclusion, cooldowns, opt-out and takeover gates
[x] Resource URLs, active/archive flag, optional tracked redirects
[x] Manual business profile and approved FAQ editor
[x] Exact-phrase suggestion/auto/manual/hybrid routing; unmatched messages escalate
[x] Stored analytics, alerts, activity, role-protected contact CSV export
[x] Responsive dashboard, mobile inbox drill-down, themes, command search
[x] Setup, API, security, database, integration, deployment and testing documentation
[x] ESLint, strict TypeScript, 30 automated tests and frontend production build passed
[x] Browser verified: demo login, simulated comment-to-resource delivery, dashboard update, persisted inbox and human takeover
[x] Browser verified: manual business-information save, mobile navigation and 390px conversation/composer layout
[x] Cross-rule resource deduplication, public tracked delivery and accurate delivery counts
[x] Complete paged CSV export with formula escaping
[x] Unicode combining marks preserved in keyword matching
[x] Authenticated responses marked private/no-store; graceful worker/SSE shutdown

## Live integrations / release gates

[x] Social login/profile connection OAuth flows, encrypted tokens, provider setup status and security regression tests.
[!] Live provider verification and actions: credentials, provider account grants and review are absent. Refresh, remote revocation, deletion callbacks and messaging/action adapters remain incomplete. Current adapters never send real messages.
[!] Meta official docs returned HTTP 429 during verification; current permissions/restrictions remain unverified.
[ ] External-send outbox, reconciliation, messaging-window checks and account-level provider rate limits
[ ] Token encryption/rotation, provider webhook parsers and live health metrics
[ ] Real PostgreSQL staging verification, shared rate limits, monitoring, retention, account recovery/email verification
[ ] Production deployment, load testing and independent security/accessibility assessment

## Remaining master-prompt features

[ ] Team invitation/role-management UI, multiple-workspace switcher
[ ] Binary uploads/object storage, document import
[ ] Selected-post rules, custom workflow actions/branches, operating-hour enforcement
[ ] Full global message search, bulk contact edits, XLSX exports, unlimited reporting pagination
[ ] Unique-click analytics, consent/retention controls
[ ] Snoozing, SLA timers, assignments UI, contact-journey aggregation, version restore

The local MVP is usable and tested. These pending items are not claimed as completed production functionality. AI generation, embeddings, model confidence, AI sentiment, and model summaries are intentionally excluded by the user, not missing dependencies to be installed.

[x] Shared post/article-link composer, all-platform selection, drafts, UTC scheduling, cancel/reschedule, persisted per-destination queue and seven-platform demo delivery.
[x] Live text/link publishing code for X, LinkedIn and Threads; Threads image URL support.
[!] Publishing requires provider configuration/consent and live verification. Facebook Page, Instagram media, YouTube video and TikTok publishers remain unimplemented; those live targets are explicitly blocked.
