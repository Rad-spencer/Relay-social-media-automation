# Deployment runbook

This build is a local MVP. Do not interpret a successful frontend build as proof of production readiness.

## Local

Node.js 22+, `npm ci`, `npm run dev`. Defaults to http://localhost:3000 with persistent embedded PostgreSQL under `.data/postgres`. No Redis or API keys are needed. The worker runs in-process. Use one process per embedded database directory.

## Staging / production-shaped setup

1. Provision PostgreSQL, restricted database credentials and tested backup/restore.
2. Install dependencies including the runtime TypeScript loader, then `npm run check`.
3. Supply DATABASE_URL, APP_URL with HTTPS origin, PORT and ALLOW_DEMO=false through a secret-aware service manager. No application code automatically provisions providers or infrastructure.
4. Run `npm start`. Startup applies the idempotent schema migration. The server binds to HOST (default 127.0.0.1). Use loopback with an HTTPS reverse proxy on the same host; use HOST=0.0.0.0 only when a managed host/container requires it and supplies HTTPS ingress. Do not expose the development server publicly.
5. Preserve streaming responses for `/api/events`, with at least a 65-second proxy timeout. Do not cache authenticated API responses.
6. Monitor `/health`, job dead letters, session/auth errors and database size. Migrate throttling to a shared store before multiple replicas. Support bounded retention and cleanup for expired sessions and demo workspaces.
7. Run integration tests against the actual PostgreSQL service. This environment only exercised embedded PostgreSQL, not an external server.
8. Complete the remaining security and live-integration requirements in SECURITY.md and SOCIAL_PLATFORM_INTEGRATIONS.md before onboarding customers.

## Redis

Not used by the current implementation. PostgreSQL supplies a durable transactional queue with SKIP LOCKED. If later scale requires BullMQ, retain a transactional event/outbox dispatcher, job idempotency and external-send reconciliation. Do not add a REDIS_URL that the application ignores.

## Assets and storage

Post attachments are stored in PostgreSQL: 25 MB per file and 100 MB per workspace. Database backups include these files. Provider delivery uses expiring capability URLs and requires the public HTTPS APP_URL. Keep the database persistent across deployments. See PUBLISHING.md for supported formats and destinations.

## OAuth and webhooks

OAuth routes are implemented; no live provider credentials are configured. Follow SOCIAL_LOGIN.md to configure developer apps, exact HTTPS callbacks and encryption. Validate one reviewed provider at a time; live capabilities remain disabled until tests and account grants confirm them. The internal HMAC endpoint is not a substitute for each provider's webhook signature protocol.


## Moving this local installation to a subdomain

Collect the exact subdomain, DNS provider and hosting destination before changing DNS.
The app needs an always-running Node.js process and PostgreSQL; uploading only `dist`
to static hosting will not run authentication, uploads or scheduled publishing.
The production runtime includes `tsx` as a runtime dependency; build dependencies are also needed, so install with
`npm ci --include=dev`, build with `npm run build`, then run `npm start`.

Configure `APP_URL=https://<actual-subdomain>`, `DATABASE_URL`, `ALLOW_DEMO=false`,
`PORT` supplied by the host, and `HOST` appropriate for that host. Copy the existing
`OAUTH_ENCRYPTION_KEY` securely into the host's secret settings; do not regenerate it
when migrating encrypted connections. Never upload `.env` into a public web root.
Use one always-running app instance initially; scheduled jobs execute inside it.

Local PGlite data does not automatically migrate to hosted PostgreSQL. Decide
whether to migrate existing workspaces, posts and media or start with an empty
database before launch; retain the local data until migration has been verified.
Do not copy the PGlite data directory directly into PostgreSQL's data directory.

After the host supplies its DNS target, configure the subdomain and verify TLS,
`/health`, sign-in, uploads and scheduling. Register each exact callback from Social
accounts with its provider, add server-side app credentials, and run
`npm run social:check`. Provider approval and user consent remain separate steps.
