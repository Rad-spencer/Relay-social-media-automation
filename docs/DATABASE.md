# Database

`src/db/migration.sql` creates the schema idempotently and records versions 1 (foundation) and 2 (delivery lookup index). Startup applies it automatically. Migration execution is tested against PGlite; real PostgreSQL must be exercised in staging.

| Table      | Purpose                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| users      | Unique email and salted scrypt password hash                             |
| workspaces | Tenant, demo flag, manually supplied business profile                    |
| members    | User/workspace composite key and role                                    |
| sessions   | Hashed token, CSRF secret, membership context and expiry                 |
| records    | Tenant/kind/id composite key and typed JSONB entity                      |
| events     | Account-scoped event deduplication and normalized payload                |
| jobs       | Durable work, retry count, ready time and dead-letter status             |
| deliveries | Frozen approved resource URL, tenant/contact/rule attribution and clicks |

Record kinds: accounts, contacts, conversations, messages, resources, rules, versions, faqs, runs, notifications and audit. SQL expression indexes support tenant + kind + time, message conversation, contact account identity, and conversation status/time.

Tenant IDs never come from authenticated browser write bodies. Repositories require the authenticated workspace and reject foreign resource/conversation IDs. JSON document references are application-validated; they do not have database-level foreign keys. Workspace deletion cascades relational rows. No deletion endpoint is exposed.

Inbox pagination orders by timestamp plus ID, 30 items per page. Message history uses the same strategy, 50 messages per page. Contacts use ID cursor pagination. Administrative collections are bounded at 100 returned records, rules/FAQ evaluation at 500, and recent run analytics at 50. Expand these limits with explicit pagination before large deployments. CSV export streams all contacts in 500-row pages from a repeatable-read snapshot and respects client backpressure; it does not load the full table into application memory.

Local files live in `.data/postgres` and must not be committed. Production uses `pg.Pool`; back up and restore the database rather than copying a live embedded directory. Application timezone storage is UTC; the browser formats timestamps locally.

Migration 3 adds `oauth_attempts` (hashed one-use state and browser binding, ten-minute expiry, PKCE verifier, nonce and session context), `social_identities` (unique provider subject mapped to one Relay user), and `social_connections` (workspace-owned encrypted tokens and public connection metadata). Email equality never links identities automatically. Connection tokens use AES-256-GCM with workspace/provider/account authenticated context; no token columns are returned by the API.
