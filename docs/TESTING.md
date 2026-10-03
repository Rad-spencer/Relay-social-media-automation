# Verification

`npm run check`: ESLint, strict TypeScript, Vitest, Vite production build.

Unit tests cover Unicode keyword normalization, exact/contains/prefix behavior, safe variable rendering, approved-reply modes, ambiguous matches, escalation, capabilities, RBAC, URL rejection, webhook HMAC/timestamp verification and salted password verification.

API/database acceptance tests cover persisted seed counts, authentication and session invalidation, CSRF and cross-origin rejection, workspace isolation/foreign IDs, role bypass rejection, cursor-bounded inbox retrieval, comment → queue → rule → resource → contact → conversation → logs, duplicate events, customer cooldown, public/private action capability split, human takeover, private notes, exact FAQ suggestions and STOP opt-out. Additional regression tests cover cross-rule resource deduplication, public-only tracked delivery, accurate delivery counts, Unicode combining marks, and complete CSV exports beyond one page with formula escaping.

The test database is in-memory PGlite. No real social messages are sent, and no external providers are contacted. Production PostgreSQL, provider webhooks/OAuth, real delivery semantics, accessibility audit and load behavior require additional staging verification before live release.

Manual browser smoke checks use the locally served application: open demo, simulate PORTFOLIO, inspect stored replies and lead, toggle takeover, and inspect mobile navigation/inbox. Results are recorded in BUILD_PROGRESS.md.
