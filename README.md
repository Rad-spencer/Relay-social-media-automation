# Relay — social engagement workspace

A working, locally runnable social engagement MVP. React + strict TypeScript + Express + PostgreSQL. It includes sign-in, isolated workspaces, a persisted inbox, contacts, keyword automation, resources, approved reply routing, human takeover, activity logs, and a simulator.

**No LLM, AI API, embeddings, external knowledge base, or generated answers are used.** Business information, customer phrases, and approved answers are entered by a user in the dashboard. Unmatched or ambiguous messages require a human.

**Real social networks are not connected.** Instagram, Facebook, and YouTube simulation adapters support end-to-end local testing. All live adapters fail closed. This is a tested MVP, not a certified production deployment or completion of every optional feature in the master prompt. See [BUILD_PROGRESS.md](BUILD_PROGRESS.md).

## Run locally

Requires Node.js 22+ and npm. No PostgreSQL server, Redis, Docker, or API key is needed for local use.

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. Choose **Explore a demo workspace** for realistic simulated data, or create an account for a blank workspace. Demo identities use disabled passwords and have no real social accounts. Each demo gets its own database workspace.

Local data is saved to `.data/postgres/` using PGlite, an embedded PostgreSQL runtime. Restarting the app preserves it. Do not run two local servers against the same embedded database directory.

## Try the full workflow

1. Open a demo workspace.
2. Open **Resources** to edit the sample portfolio URL (all seed links point to example.com).
3. Open **Automations**. Review “Portfolio delivery” and its approved text, then use its keyword test.
4. Open **Simulator**, select Instagram, and submit `PORTFOLIO please!`.
5. Open **Inbox** and select Taylor Reed. The original comment, simulated private resource reply, and simulated public reply are persisted.
6. Open **Contacts** to see the lead tag; open **Activity → Automation runs** for execution steps.
7. Submit the same event identifier twice to test deduplication. Submit another event for the same customer to test the cooldown.
8. Click **Take over** in the conversation. Rule replies are paused until **Return to rules**.
9. In **Business & replies**, write an approved reply and an exact customer phrase. Select suggest or automatic mode in **Reply settings**. Simulate that phrase as a direct message.
10. Simulate `STOP`; the contact is opted out, and outbound replies are blocked.

## Environment

Copy `.env.example` to `.env` if you need overrides; the server loads it at startup. Existing process environment variables take precedence. The default `npm run dev` works without it. Never commit real secrets.

| Variable           | Meaning                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `PORT`             | Server port, default 3000                                                                     |
| `APP_URL`          | Trusted public origin and tracked-link base; defaults to localhost + PORT                     |
| `DATABASE_URL`     | PostgreSQL URL; blank uses local PGlite; mandatory in production                              |
| `ALLOW_DEMO`       | `false` disables new demo creation                                                            |
| `INGESTION_SECRET` | 32+ character server-only HMAC secret for internal normalized events; empty disables endpoint |

Social sign-in and profile connections are implemented for seven providers. Configure credentials, HTTPS callbacks and the encryption key using [docs/SOCIAL_LOGIN.md](docs/SOCIAL_LOGIN.md). Missing configuration disables provider buttons. No live grant has been tested yet. Live messaging adapters remain disabled. No LLM credentials exist.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run check` runs all four. Tests use a fresh in-memory PostgreSQL-compatible runtime. They cover tenant isolation, sessions, roles, CSRF, signature validation, rule matching, duplicate delivery prevention, cooldowns, takeover, opt-out, unsupported actions, and the complete simulated comment-to-resource workflow. Real PostgreSQL and live social APIs need separate deployment integration tests.

## Architecture

- `src/client`: React dashboard, forms, inbox, responsive layout, dark mode.
- `src/shared`: application contracts.
- `src/server`: authentication, validated API, repositories, analytics, seed data.
- `src/db`: idempotent schema migration and PostgreSQL/PGlite database abstraction.
- `src/platforms`: capability contracts and demo/fail-closed adapters.
- `src/automation`: pure keyword/routing functions, transactional event processing, durable worker.
- `tests`: unit and API integration acceptance tests.

A durable PostgreSQL job table replaces Redis/BullMQ for the first version. Jobs use row locks, exponential retries, and dead-letter status. Database mutations and simulated sends are atomic. **Real external sends require a separate transactional outbox and delivery reconciliation before live adapters are enabled.**

## Production deployment

`npm run build` produces frontend assets. Run `npm start` with `NODE_ENV=production`, a real `DATABASE_URL`, `APP_URL=https://...`, and `ALLOW_DEMO=false`. The process defaults to loopback; put a trusted HTTPS reverse proxy on the same host in front of it. Managed container hosts can set `HOST=0.0.0.0` behind their HTTPS ingress. Secure session cookies require HTTPS.

Migrations run at startup. Back up PostgreSQL and test restoration. Configure shared rate limiting, centralized monitoring, retention, account recovery/verification, key rotation, provider token refresh/revocation and account deletion callbacks, external API retries/idempotency, and a deployment security review before accepting customer traffic. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

[Product](docs/PRODUCT.md) · [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [Integrations](docs/SOCIAL_PLATFORM_INTEGRATIONS.md) · [Automation](docs/AUTOMATION_ENGINE.md) · [Approved replies](docs/AI_AGENT.md) · [Security](docs/SECURITY.md) · [Webhooks](docs/WEBHOOKS.md) · [API](docs/API.md) · [Testing](docs/TESTING.md) · [Deployment](docs/DEPLOYMENT.md)

## Posts and scheduling

Use **Posts & scheduling** to write once, select all platforms, and save a draft or shared schedule. The demo delivers to all seven simulated destinations. Live text/link publishing is implemented for X, LinkedIn and Threads (Threads also supports image URLs), pending credentials and publishing grants; other destinations remain blocked. See [docs/PUBLISHING.md](docs/PUBLISHING.md) for queue behavior and limits.

## GitHub + Supabase deployment

Start with [the GitHub/Supabase guide](docs/GITHUB_SUPABASE.md). This repository
includes a Dockerfile, GitHub checks, private-schema PostgreSQL setup and
`npm run db:check` / `npm run db:setup`. Real Supabase credentials are supplied
only through local/hosting environment settings. The prepared package does not
include your existing local workspace data or claim a verified remote connection.
